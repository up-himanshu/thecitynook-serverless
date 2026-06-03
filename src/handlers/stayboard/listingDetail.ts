import { APIGatewayProxyEvent } from 'aws-lambda';
import { getStayboardModels } from '../../data/stayboard';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';
import { withSignedGuestIdPhotoUrls } from '../../utils/stayboard/s3';

const {
  Listing: StayboardListing,
  Booking: StayboardBooking,
  HousekeepingTask: StayboardHousekeepingTask,
  User: StayboardUser,
} = getStayboardModels();

const normalizeTaskStatus = (status: string) =>
  status === 'finished' ? 'completed' : status;

export const handler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const id = event.pathParameters?.id;
  const listing = await StayboardListing.findOne({ _id: id, ownerId, isActive: { $ne: false } });
  if (!listing) return appResponse(404, {}, 'Listing not found');

  const [bookings, completedTasks] = await Promise.all([
    StayboardBooking.find({ listingId: id, ownerId }).sort({ checkInDate: 1 }),
    StayboardHousekeepingTask.find({
      listingId: id,
      ownerId,
      isActive: { $ne: false },
      status: { $in: ['completed', 'finished', 'skipped'] },
    }).sort({ taskCompletedAt: -1 }).limit(30),
  ]);

  const staffIds = completedTasks.map((t) => String(t.completedById || '')).filter(Boolean);
  const staffUsers = await StayboardUser.find({ _id: { $in: staffIds } });
  const staffMap = new Map(staffUsers.map((u) => [String(u._id), u.displayName || u.fullName]));

  const housekeepingSubmissions = completedTasks.map((task) => ({
    _id: task._id,
    status: normalizeTaskStatus(task.status),
    durationMinutes: task.durationMinutes || null,
    submittedAt: task.taskCompletedAt || null,
    submittedBy: task.completedById ? staffMap.get(String(task.completedById)) || 'Housekeeping' : 'Housekeeping',
  }));

  const safeBookings =
    token.role === 'housekeeping'
      ? []
      : await Promise.all(
          bookings.map((booking: any) =>
            withSignedGuestIdPhotoUrls(booking.toObject()),
          ),
        );
  return appResponse(200, { listing, bookings: safeBookings, housekeepingSubmissions });
};

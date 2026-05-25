import { APIGatewayProxyEvent } from 'aws-lambda';
import StayboardListing from '../../models/stayboard/Listing';
import StayboardBooking from '../../models/stayboard/Booking';
import StayboardHousekeepingTask from '../../models/stayboard/HousekeepingTask';
import StayboardUser from '../../models/stayboard/User';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';

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
      status: { $in: ['completed', 'skipped'] },
    }).sort({ taskCompletedAt: -1 }).limit(30),
  ]);

  const staffIds = completedTasks.map((t) => String(t.completedById || '')).filter(Boolean);
  const staffUsers = await StayboardUser.find({ _id: { $in: staffIds } });
  const staffMap = new Map(staffUsers.map((u) => [String(u._id), u.displayName || u.fullName]));

  const housekeepingSubmissions = completedTasks.map((task) => ({
    _id: task._id,
    status: task.status,
    durationMinutes: task.durationMinutes || null,
    submittedAt: task.taskCompletedAt || null,
    submittedBy: task.completedById ? staffMap.get(String(task.completedById)) || 'Housekeeping' : 'Housekeeping',
  }));

  const safeBookings = token.role === 'housekeeping' ? [] : bookings;
  return appResponse(200, { listing, bookings: safeBookings, housekeepingSubmissions });
};

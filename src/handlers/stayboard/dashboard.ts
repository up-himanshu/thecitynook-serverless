import { APIGatewayProxyEvent } from 'aws-lambda';
import moment from 'moment';
import { getStayboardModels } from '../../data/stayboard';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';

const {
  Booking: StayboardBooking,
  HousekeepingTask: StayboardHousekeepingTask,
  Listing: StayboardListing,
} = getStayboardModels();

const normalizeTaskStatus = (status: string) =>
  status === 'finished' ? 'completed' : status;

export const handler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const today = moment().format('YYYY-MM-DD');
  const in7Days = moment().add(7, 'days').format('YYYY-MM-DD');

  const [bookings, tasks, listings] = await Promise.all([
    StayboardBooking.find({ ownerId }),
    StayboardHousekeepingTask.find({ ownerId, dueDate: today, isActive: { $ne: false } }).sort({ createdAt: 1 }),
    StayboardListing.find({ ownerId, isActive: { $ne: false } }),
  ]);

  const occupied = bookings.filter((b) => b.checkInDate <= today && b.checkOutDate > today);
  const checkinsToday = bookings.filter((b) => b.checkInDate === today);
  const checkoutsToday = bookings.filter((b) => b.checkOutDate === today);
  const upcoming = bookings.filter((b) => b.checkInDate > today && b.checkInDate <= in7Days);

  const allowedStatuses = token.role === 'housekeeping'
    ? ['pending', 'in_progress', 'completed', 'finished']
    : ['pending', 'in_progress', 'completed', 'finished', 'skipped'];

  const taskRows = tasks
    .filter((t) => allowedStatuses.includes(t.status))
    .map((t) => ({
      _id: t._id,
      taskId: t._id,
      roomName: t.roomName,
      checkoutDate: t.dueDate,
      listingName: listings.find((l) => String(l._id) === String(t.listingId))?.name || 'Listing',
      status: normalizeTaskStatus(t.status),
      checklist: t.checklist,
    }));

  if (token.role === 'housekeeping') {
    return appResponse(200, { tasks: taskRows });
  }

  const now = moment();
  const currentMonthStart = now.clone().startOf('month');
  const currentMonthEnd = now.clone().startOf('day');
  const previousMonthStart = now.clone().subtract(1, 'month').startOf('month');
  const previousMonthComparableEnd = previousMonthStart
    .clone()
    .add(Math.min(now.date(), previousMonthStart.daysInMonth()) - 1, 'days')
    .startOf('day');

  const isBookingInRangeByCheckIn = (checkInDate: string, start: moment.Moment, end: moment.Moment) => {
    const checkIn = moment(checkInDate, 'YYYY-MM-DD');
    return checkIn.isValid() && checkIn.isBetween(start, end, 'day', '[]');
  };

  const countRoomNightsInRange = (checkInDate: string, checkOutDate: string, start: moment.Moment, end: moment.Moment) => {
    const stayStart = moment(checkInDate, 'YYYY-MM-DD').startOf('day');
    const stayEndExclusive = moment(checkOutDate, 'YYYY-MM-DD').startOf('day');
    if (!stayStart.isValid() || !stayEndExclusive.isValid() || !stayEndExclusive.isAfter(stayStart)) return 0;

    const overlapStart = moment.max(stayStart, start);
    const overlapEndExclusive = moment.min(stayEndExclusive, end.clone().add(1, 'day'));
    if (!overlapEndExclusive.isAfter(overlapStart)) return 0;
    return overlapEndExclusive.diff(overlapStart, 'days');
  };

  const currentMonthBookings = bookings.filter((b) =>
    isBookingInRangeByCheckIn(b.checkInDate, currentMonthStart, currentMonthEnd),
  );
  const previousMonthBookings = bookings.filter((b) =>
    isBookingInRangeByCheckIn(b.checkInDate, previousMonthStart, previousMonthComparableEnd),
  );

  const currentMonthRevenue = currentMonthBookings.reduce((sum, b) => sum + b.amount, 0);
  const previousMonthRevenue = previousMonthBookings.reduce((sum, b) => sum + b.amount, 0);
  const currentMonthRoomNights = bookings.reduce(
    (sum, b) => sum + countRoomNightsInRange(b.checkInDate, b.checkOutDate, currentMonthStart, currentMonthEnd),
    0,
  );
  const revenueDiff = currentMonthRevenue - previousMonthRevenue;
  const revenueDiffPct = previousMonthRevenue === 0
    ? (currentMonthRevenue > 0 ? 100 : 0)
    : (revenueDiff / previousMonthRevenue) * 100;

  const occupancy = listings.map((listing) => {
    const listingBookings = bookings.filter((b) => String(b.listingId) === String(listing._id));
    const hasOcc = listingBookings.some((b) => b.checkInDate <= today && b.checkOutDate > today);
    const hasCheckout = listingBookings.some((b) => b.checkOutDate === today);
    const hasCheckin = listingBookings.some((b) => b.checkInDate === today);
    const status = hasOcc ? 'occupied' : hasCheckout ? 'checkout' : hasCheckin ? 'checkin' : 'vacant';
    return { roomId: String(listing._id), roomName: listing.name, status };
  });

  return appResponse(200, {
    summary: {
      occupiedNow: occupied.length,
      checkInsToday: checkinsToday.length,
      checkOutsToday: checkoutsToday.length,
      needCleaning: taskRows.filter((t) => t.status === 'pending' || t.status === 'in_progress').length,
      upcoming: upcoming.length,
    },
    tasks: taskRows,
    occupancy,
    month: {
      bookings: currentMonthBookings.length,
      roomNights: currentMonthRoomNights,
      revenue: currentMonthRevenue,
    },
    changePastMonth: {
      currentRevenue: currentMonthRevenue,
      previousRevenue: previousMonthRevenue,
      diff: revenueDiff,
      diffPct: Number(revenueDiffPct.toFixed(2)),
      currentRange: {
        from: currentMonthStart.format('YYYY-MM-DD'),
        to: currentMonthEnd.format('YYYY-MM-DD'),
      },
      previousRange: {
        from: previousMonthStart.format('YYYY-MM-DD'),
        to: previousMonthComparableEnd.format('YYYY-MM-DD'),
      },
    },
  });
};

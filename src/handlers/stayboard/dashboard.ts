import { APIGatewayProxyEvent } from 'aws-lambda';
import moment from 'moment';
import StayboardBooking from '../../models/stayboard/Booking';
import StayboardHousekeepingTask from '../../models/stayboard/HousekeepingTask';
import StayboardListing from '../../models/stayboard/Listing';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';

export const handler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  const ownerId = token.role === 'owner' ? token.userId : token.ownerId;
  const today = moment().format('YYYY-MM-DD');
  const in7Days = moment().add(7, 'days').format('YYYY-MM-DD');

  const [bookings, tasks, listings] = await Promise.all([
    StayboardBooking.find({ ownerId }),
    StayboardHousekeepingTask.find({ ownerId, status: { $in: ['pending', 'in_progress'] } }),
    StayboardListing.find({ ownerId }),
  ]);

  const occupied = bookings.filter((b) => b.checkInDate <= today && b.checkOutDate > today);
  const checkinsToday = bookings.filter((b) => b.checkInDate === today);
  const checkoutsToday = bookings.filter((b) => b.checkOutDate === today);
  const upcoming = bookings.filter((b) => b.checkInDate > today && b.checkInDate <= in7Days);

  if (token.role === 'housekeeping') {
    const taskRows = tasks.filter((t) => {
      const booking = bookings.find((b) => String(b._id) === String(t.bookingId));
      return booking?.checkOutDate === today;
    }).map((t) => ({
      _id: t._id,
      taskId: t._id,
      roomName: t.roomName,
      checkoutDate: today,
      listingName: listings.find((l) => String(l._id) === String(t.listingId))?.name || 'Listing',
      status: t.status,
    }));
    return appResponse(200, { tasks: taskRows });
  }

  const revenue = bookings.reduce((sum, b) => sum + b.amount, 0);
  const roomNights = bookings.reduce((sum, b) => sum + Math.max(1, moment(b.checkOutDate).diff(moment(b.checkInDate), 'days')), 0);

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
      needCleaning: tasks.length,
      upcoming: upcoming.length,
    },
    occupancy,
    revenue: { bookings: bookings.length, roomNights, amount: revenue },
  });
};

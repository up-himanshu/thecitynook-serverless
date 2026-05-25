import { APIGatewayProxyEvent } from 'aws-lambda';
import moment from 'moment';
import multipart from 'lambda-multipart-parser';
import StayboardBooking from '../../models/stayboard/Booking';
import StayboardHousekeepingTask from '../../models/stayboard/HousekeepingTask';
import StayboardDevice from '../../models/stayboard/Device';
import StayboardListing from '../../models/stayboard/Listing';
import { parseToken } from '../../utils/stayboard/auth';
import { appResponse } from '../../utils/stayboard/response';
import { uploadGuestIdPhoto } from '../../utils/stayboard/s3';
import { sendPushNotifications } from '../../utils/stayboard/push';

const defaultChecklist = ['Bed changed', 'Bathroom cleaned', 'Towels replaced', 'Dusting done', 'Water bottles refilled', 'TV checked'];
const shouldCreateTaskForDueDate = (dueDate: string) => dueDate >= moment().format('YYYY-MM-DD');
const calculateNights = (checkInDate: string, checkOutDate: string) =>
  Math.max(1, moment(checkOutDate).diff(moment(checkInDate), 'days'));
const shiftNextDayCheckoutTaskToToday = async ({
  ownerId,
  listingId,
  newBookingId,
  newCheckInDate,
}: {
  ownerId: string;
  listingId: string;
  newBookingId: string;
  newCheckInDate: string;
}) => {
  const targetCheckout = moment(newCheckInDate).add(1, 'day').format('YYYY-MM-DD');
  const existingBooking = await StayboardBooking.findOne({
    ownerId,
    listingId,
    checkOutDate: targetCheckout,
    _id: { $ne: newBookingId },
  }).sort({ createdAt: 1 });

  if (!existingBooking) return;

  const existingTask = await StayboardHousekeepingTask.findOne({
    bookingId: existingBooking._id,
    isActive: { $ne: false },
    status: 'pending',
  });
  if (!existingTask) return;

  const shiftedDueDate = moment(existingTask.dueDate).subtract(1, 'day').format('YYYY-MM-DD');
  await StayboardHousekeepingTask.updateOne(
    { _id: existingTask._id, status: 'pending' },
    { $set: { dueDate: shiftedDueDate } },
  );
};

const createTaskForBooking = async ({
  ownerId,
  listing,
  bookingId,
  dueDate,
}: {
  ownerId: string;
  listing: any;
  bookingId: string;
  dueDate: string;
}) => {
  const checklistTemplate = (listing.checklist?.length ? listing.checklist : defaultChecklist)
    .map((item: string) => ({ item, answer: null }));

  return StayboardHousekeepingTask.findOneAndUpdate(
    { bookingId, dueDate, status: 'pending', isActive: { $ne: false } },
    {
      ownerId,
      listingId: listing._id,
      bookingId,
      roomName: listing.name,
      dueDate,
      checklist: checklistTemplate,
      status: 'pending',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

const createManualTaskForBooking = async ({
  ownerId,
  listing,
  bookingId,
  dueDate,
}: {
  ownerId: string;
  listing: any;
  bookingId: string;
  dueDate: string;
}) => {
  const checklistTemplate = (listing.checklist?.length ? listing.checklist : defaultChecklist)
    .map((item: string) => ({ item, answer: null }));

  return StayboardHousekeepingTask.create({
    ownerId,
    listingId: listing._id,
    bookingId,
    roomName: listing.name,
    dueDate,
    checklist: checklistTemplate,
    status: 'pending',
  });
};

export const postHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');

  const parsed = await multipart.parse(event);
  const guestName = String(parsed.guestName || '').trim();
  const checkInDate = String(parsed.checkInDate || '').trim();
  const checkOutDate = String(parsed.checkOutDate || '').trim();
  const listingId = String(parsed.listingId || '').trim();
  const phone = String(parsed.phone || '').replace(/\D/g, '');

  if (!guestName || !checkInDate || !checkOutDate) {
    return appResponse(400, {}, 'guestName, checkInDate and checkOutDate are required');
  }
  if (checkInDate === checkOutDate) {
    return appResponse(400, {}, 'checkInDate and checkOutDate cannot be the same');
  }
  if (!listingId) {
    return appResponse(400, {}, 'listingId is required');
  }
  if (phone && phone.length !== 10) {
    return appResponse(400, {}, 'phone must be a 10 digit number');
  }

  const listing = await StayboardListing.findOne({ _id: listingId, ownerId: token.userId, isActive: { $ne: false } });
  if (!listing) return appResponse(404, {}, 'Listing not found');

  const file = parsed.files?.find((f: any) => f.fieldname === 'idPhoto');
  let idPhotoUrl: string | undefined;
  if (file?.content) {
    idPhotoUrl = await uploadGuestIdPhoto(file.content, token.userId);
  } else {
    const idPhotoBase64 = String(parsed.idPhotoBase64 || '').trim();
    if (idPhotoBase64) {
      const sanitized = idPhotoBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      const decoded = Buffer.from(sanitized, 'base64');
      if (decoded.length > 0) {
        idPhotoUrl = await uploadGuestIdPhoto(decoded, token.userId);
      }
    }
  }

  const booking = await StayboardBooking.create({
    ownerId: token.userId,
    listingId,
    guestName,
    phone: phone || undefined,
    checkInDate,
    checkOutDate,
    nights: calculateNights(checkInDate, checkOutDate),
    amount: Number(parsed.amount || 0),
    notes: parsed.notes,
    idPhotoUrl,
  });

  const task = shouldCreateTaskForDueDate(checkOutDate)
    ? await createTaskForBooking({
      ownerId: token.userId,
      listing,
      bookingId: String(booking._id),
      dueDate: checkOutDate,
    })
    : null;

  await shiftNextDayCheckoutTaskToToday({
    ownerId: token.userId,
    listingId,
    newBookingId: String(booking._id),
    newCheckInDate: checkInDate,
  });

  const staffDevices = await StayboardDevice.find({});
  try {
    await sendPushNotifications(
      staffDevices.map((d) => d.pushToken),
      'New checkout task',
      `${listing.name} scheduled for housekeeping`,
    );
  } catch (error) {
    console.error('Unable to send housekeeping push notifications:', error);
  }

  return appResponse(201, { booking, housekeepingTask: task }, 'Booking created');
};

export const extendBookingHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');
  if (!event.body) return appResponse(400, {}, 'Missing request body');

  const bookingId = event.pathParameters?.bookingId;
  if (!bookingId) return appResponse(400, {}, 'bookingId is required');

  const { newCheckoutDate, amount, skipHousekeeping } = JSON.parse(event.body);
  if (!newCheckoutDate || Number.isNaN(Number(amount))) {
    return appResponse(400, {}, 'newCheckoutDate and amount are required');
  }

  const oldBooking = await StayboardBooking.findOne({ _id: bookingId, ownerId: token.userId });
  if (!oldBooking) return appResponse(404, {}, 'Booking not found');

  const oldCheckout = new Date(oldBooking.checkOutDate).getTime();
  const newCheckout = new Date(String(newCheckoutDate)).getTime();
  if (!oldCheckout || !newCheckout || newCheckout <= oldCheckout) {
    return appResponse(400, {}, 'newCheckoutDate must be greater than current checkout date');
  }

  const listing = await StayboardListing.findOne({ _id: oldBooking.listingId, ownerId: token.userId, isActive: { $ne: false } });
  if (!listing) return appResponse(404, {}, 'Listing not found');

  const newBooking = await StayboardBooking.create({
    ownerId: token.userId,
    listingId: oldBooking.listingId,
    guestName: oldBooking.guestName,
    phone: oldBooking.phone,
    checkInDate: oldBooking.checkOutDate,
    checkOutDate: String(newCheckoutDate),
    nights: calculateNights(oldBooking.checkOutDate, String(newCheckoutDate)),
    amount: Number(amount),
    notes: oldBooking.notes,
  });

  if (skipHousekeeping) {
    await StayboardHousekeepingTask.findOneAndUpdate(
      { bookingId: oldBooking._id, isActive: { $ne: false } },
      { status: 'skipped' },
    );
  }

  const newTask = shouldCreateTaskForDueDate(String(newCheckoutDate))
    ? await createTaskForBooking({
      ownerId: token.userId,
      listing,
      bookingId: String(newBooking._id),
      dueDate: String(newCheckoutDate),
    })
    : null;

  return appResponse(201, { oldBooking, newBooking, newTask }, 'Booking extended');
};

export const lookupByPhoneHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');

  const ownerId = token.userId;
  const phone = String(event.queryStringParameters?.phone || '').replace(/\D/g, '');
  if (!phone || phone.length !== 10) return appResponse(400, {}, 'Valid 10 digit phone is required');

  const booking = await StayboardBooking.findOne({ ownerId, phone }).sort({ createdAt: -1 });
  if (!booking) return appResponse(200, { found: false, guestName: null });
  return appResponse(200, { found: true, guestName: booking.guestName });
};

export const createHousekeepingTaskHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, 'Unauthorized');
  if (token.role !== 'owner') return appResponse(403, {}, 'Forbidden');
  if (!event.body) return appResponse(400, {}, 'Missing request body');

  const bookingId = String(event.pathParameters?.bookingId || '').trim();
  if (!bookingId) return appResponse(400, {}, 'bookingId is required');

  const { dueDate } = JSON.parse(event.body);
  const dueDateStr = String(dueDate || '').trim();
  if (!dueDateStr || !moment(dueDateStr, 'YYYY-MM-DD', true).isValid()) {
    return appResponse(400, {}, 'Valid dueDate (YYYY-MM-DD) is required');
  }

  const booking = await StayboardBooking.findOne({ _id: bookingId, ownerId: token.userId });
  if (!booking) return appResponse(404, {}, 'Booking not found');

  if (!(booking.checkOutDate > moment().format('YYYY-MM-DD'))) {
    return appResponse(400, {}, 'Manual housekeeping task allowed only when booking checkout date is in future');
  }

  const listing = await StayboardListing.findOne({ _id: booking.listingId, ownerId: token.userId, isActive: { $ne: false } });
  if (!listing) return appResponse(404, {}, 'Listing not found');

  const housekeepingTask = await createManualTaskForBooking({
    ownerId: token.userId,
    listing,
    bookingId: String(booking._id),
    dueDate: dueDateStr,
  });

  return appResponse(201, { housekeepingTask }, 'Housekeeping task created');
};

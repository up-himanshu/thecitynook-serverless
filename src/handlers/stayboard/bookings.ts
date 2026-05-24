import { APIGatewayProxyEvent } from 'aws-lambda';
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
  if (!listingId) {
    return appResponse(400, {}, 'listingId is required');
  }
  if (phone && phone.length !== 10) {
    return appResponse(400, {}, 'phone must be a 10 digit number');
  }

  const listing = await StayboardListing.findOne({ _id: listingId, ownerId: token.userId });
  if (!listing) return appResponse(404, {}, 'Listing not found');

  const file = parsed.files?.find((f: any) => f.fieldname === 'idPhoto');
  let idPhotoUrl: string | undefined;
  if (file?.content) {
    idPhotoUrl = await uploadGuestIdPhoto(file.content, token.userId);
  }

  const booking = await StayboardBooking.create({
    ownerId: token.userId,
    listingId,
    guestName,
    phone: phone || undefined,
    checkInDate,
    checkOutDate,
    amount: Number(parsed.amount || 0),
    notes: parsed.notes,
    idPhotoUrl,
  });

  const checklistTemplate = (listing.checklist?.length ? listing.checklist : defaultChecklist)
    .map((item) => ({ item, answer: null }));

  const task = await StayboardHousekeepingTask.create({
    ownerId: token.userId,
    listingId,
    bookingId: booking._id,
    roomName: listing.name,
    checklist: checklistTemplate,
    status: 'pending',
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

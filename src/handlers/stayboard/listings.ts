import { APIGatewayProxyEvent } from "aws-lambda";
import moment from "moment";
import { getStayboardModels } from "../../data/stayboard";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";

const {
  Booking: StayboardBooking,
  HousekeepingTask: StayboardHousekeepingTask,
  Listing: StayboardListing,
} = getStayboardModels();

const defaultChecklist = [
  "Bed changed",
  "Bathroom cleaned",
  "Towels replaced",
  "Dusting done",
  "Water bottles refilled",
  "TV checked",
];

export const getHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  const ownerId = token.role === "owner" ? token.userId : token.ownerId;
  const today = moment().format("YYYY-MM-DD");
  const [listings, bookings] = await Promise.all([
    StayboardListing.find({ ownerId, isActive: { $ne: false } }),
    StayboardBooking.find({ ownerId, checkOutDate: { $gte: today } }).sort({ checkInDate: -1 }),
  ]);

  const bookingsByListing = new Map<string, any[]>();
  bookings.forEach((booking) => {
    const key = String(booking.listingId);
    if (!bookingsByListing.has(key)) bookingsByListing.set(key, []);
    bookingsByListing.get(key)!.push(booking);
  });

  const listingRows = listings.map((listing) => ({
    ...listing.toObject(),
    checkInTime: listing.checkInTime || "13:00",
    checkOutTime: listing.checkOutTime || "10:00",
    bookings: bookingsByListing.get(String(listing._id)) || [],
  }));
  return appResponse(200, { listings: listingRows });
};

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value) && moment(value, "HH:mm", true).isValid();

export const postHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");
  const { name, capacity, checkInTime, checkOutTime } = JSON.parse(event.body);
  const safeCheckInTime = String(checkInTime || "13:00").trim();
  const safeCheckOutTime = String(checkOutTime || "10:00").trim();
  if (!isValidTime(safeCheckInTime) || !isValidTime(safeCheckOutTime)) {
    return appResponse(400, {}, "checkInTime and checkOutTime must be in HH:mm format");
  }
  if (!(safeCheckInTime > safeCheckOutTime)) {
    return appResponse(400, {}, "checkInTime must be greater than checkOutTime");
  }

  const listing = await StayboardListing.create({
    ownerId: token.userId,
    name,
    capacity,
    checkInTime: safeCheckInTime,
    checkOutTime: safeCheckOutTime,
    checklist: defaultChecklist,
  });
  return appResponse(201, { listing }, "Listing created");
};

export const updateHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const listingId = event.pathParameters?.id;
  if (!listingId) return appResponse(400, {}, "listingId is required");

  const { name, capacity, checkInTime, checkOutTime } = JSON.parse(event.body);
  const listing = await StayboardListing.findOne({
    _id: listingId,
    ownerId: token.userId,
    isActive: { $ne: false },
  });
  if (!listing) return appResponse(404, {}, "Listing not found");

  const safeName = String(name ?? listing.name ?? "").trim();
  const parsedCapacity =
    capacity !== undefined && capacity !== null
      ? Number(capacity)
      : Number(listing.capacity);
  const safeCheckInTime = String(checkInTime ?? listing.checkInTime ?? "13:00").trim();
  const safeCheckOutTime = String(checkOutTime ?? listing.checkOutTime ?? "10:00").trim();

  if (!safeName) return appResponse(400, {}, "name is required");
  if (Number.isNaN(parsedCapacity) || parsedCapacity <= 0) {
    return appResponse(400, {}, "capacity must be a positive number");
  }
  if (!isValidTime(safeCheckInTime) || !isValidTime(safeCheckOutTime)) {
    return appResponse(400, {}, "checkInTime and checkOutTime must be in HH:mm format");
  }
  if (!(safeCheckInTime > safeCheckOutTime)) {
    return appResponse(400, {}, "checkInTime must be greater than checkOutTime");
  }

  listing.name = safeName;
  listing.capacity = parsedCapacity;
  listing.checkInTime = safeCheckInTime;
  listing.checkOutTime = safeCheckOutTime;
  await listing.save();

  return appResponse(200, { listing }, "Listing updated");
};

export const updateChecklistHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const listingId = event.pathParameters?.id;
  const { checklist } = JSON.parse(event.body);
  if (!listingId) return appResponse(400, {}, "listingId is required");
  if (!Array.isArray(checklist))
    return appResponse(400, {}, "checklist must be an array");

  const cleaned = checklist.map((v) => String(v).trim()).filter(Boolean);
  const listing = await StayboardListing.findOneAndUpdate(
    { _id: listingId, ownerId: token.userId, isActive: { $ne: false } },
    { checklist: cleaned },
    { new: true },
  );
  if (!listing) return appResponse(404, {}, "Listing not found");
  return appResponse(200, { listing }, "Checklist updated");
};

export const copyChecklistHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const sourceListingId = event.pathParameters?.id;
  const { targetListingIds } = JSON.parse(event.body);
  if (!sourceListingId)
    return appResponse(400, {}, "source listing id is required");
  if (!Array.isArray(targetListingIds) || !targetListingIds.length) {
    return appResponse(400, {}, "targetListingIds must be a non-empty array");
  }

  const source = await StayboardListing.findOne({
    _id: sourceListingId,
    ownerId: token.userId,
    isActive: { $ne: false },
  });
  if (!source) return appResponse(404, {}, "Source listing not found");

  const result = await StayboardListing.updateMany(
    { _id: { $in: targetListingIds }, ownerId: token.userId, isActive: { $ne: false } },
    { $set: { checklist: source.checklist || [] } },
  );

  return appResponse(
    200,
    { modifiedCount: result.modifiedCount },
    "Checklist copied",
  );
};

export const deleteHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");

  const listingId = event.pathParameters?.id;
  if (!listingId) return appResponse(400, {}, "listingId is required");

  const listing = await StayboardListing.findOne({
    _id: listingId,
    ownerId: token.userId,
  });
  if (!listing) return appResponse(404, {}, "Listing not found");

  const bookingsCount = await StayboardBooking.countDocuments({
    listingId,
    ownerId: token.userId,
  });

  if (bookingsCount === 0) {
    await Promise.all([
      StayboardHousekeepingTask.deleteMany({ listingId, ownerId: token.userId }),
      StayboardListing.deleteOne({ _id: listingId, ownerId: token.userId }),
    ]);
    return appResponse(200, { listingId, deletionType: "hard" }, "Listing deleted");
  }

  await Promise.all([
    StayboardHousekeepingTask.updateMany(
      { listingId, ownerId: token.userId },
      { $set: { isActive: false } },
    ),
    StayboardListing.updateOne(
      { _id: listingId, ownerId: token.userId },
      { $set: { isActive: false } },
    ),
  ]);

  return appResponse(200, { listingId, deletionType: "soft" }, "Listing deactivated");
};

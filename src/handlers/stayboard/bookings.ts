import { APIGatewayProxyEvent } from "aws-lambda";
import moment from "moment";
import multipart from "lambda-multipart-parser";
import { getStayboardModels } from "../../data/stayboard";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";
import {
  uploadGuestIdPhoto,
  withSignedGuestIdPhotoUrls,
} from "../../utils/stayboard/s3";
import { sendPushNotifications } from "../../utils/stayboard/push";

const {
  Booking: StayboardBooking,
  HousekeepingTask: StayboardHousekeepingTask,
  Device: StayboardDevice,
  Listing: StayboardListing,
  User: StayboardUser,
} = getStayboardModels();

type IdPhotoPayloadItem = {
  base64: string;
  mimeType?: string;
};

const parseCreateBookingPayload = async (event: APIGatewayProxyEvent) => {
  const contentType = String(
    event.headers?.["content-type"] || event.headers?.["Content-Type"] || "",
  ).toLowerCase();

  if (contentType.includes("application/json")) {
    const body = event.body ? JSON.parse(event.body) : {};
    return { ...body, files: [] as any[] };
  }

  return multipart.parse(event);
};

const defaultChecklist = [
  "Bed changed",
  "Bathroom cleaned",
  "Towels replaced",
  "Dusting done",
  "Water bottles refilled",
  "TV checked",
];
const shouldCreateTaskForDueDate = (dueDate: string) =>
  dueDate >= moment().format("YYYY-MM-DD");
const calculateNights = (checkInDate: string, checkOutDate: string) =>
  Math.max(1, moment(checkOutDate).diff(moment(checkInDate), "days"));
const notifyHousekeepingUsersForOwner = async ({
  ownerId,
  title,
  body,
}: {
  ownerId: string;
  title: string;
  body: string;
}) => {
  const staffUsers = await StayboardUser.find({
    ownerId,
    role: "housekeeping",
  }).select("_id");
  const staffIds = staffUsers.map((user: any) => String(user._id));
  if (!staffIds.length) return;

  const staffDevices = await StayboardDevice.find({ userId: { $in: staffIds } });
  await sendPushNotifications(
    staffDevices.map((d: any) => d.pushToken),
    title,
    body,
  );
};
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
  const targetCheckout = moment(newCheckInDate)
    .add(1, "day")
    .format("YYYY-MM-DD");
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
    status: "pending",
  });
  if (!existingTask) return;

  const shiftedDueDate = moment(existingTask.dueDate)
    .subtract(1, "day")
    .format("YYYY-MM-DD");
  await StayboardHousekeepingTask.updateOne(
    { _id: existingTask._id, status: "pending" },
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
  const checklistTemplate = (
    listing.checklist?.length ? listing.checklist : defaultChecklist
  ).map((item: string) => ({ item, answer: null }));

  return StayboardHousekeepingTask.findOneAndUpdate(
    { bookingId, dueDate, status: "pending", isActive: { $ne: false } },
    {
      ownerId,
      listingId: listing._id,
      bookingId,
      roomName: listing.name,
      dueDate,
      checklist: checklistTemplate,
      status: "pending",
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
  const checklistTemplate = (
    listing.checklist?.length ? listing.checklist : defaultChecklist
  ).map((item: string) => ({ item, answer: null }));

  return StayboardHousekeepingTask.create({
    ownerId,
    listingId: listing._id,
    bookingId,
    roomName: listing.name,
    dueDate,
    checklist: checklistTemplate,
    status: "pending",
  });
};

export const postHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");

  const parsed = await parseCreateBookingPayload(event);
  const guestName = String(parsed.guestName || "").trim();
  const checkInDate = String(parsed.checkInDate || "").trim();
  const checkOutDate = String(parsed.checkOutDate || "").trim();
  const listingId = String(parsed.listingId || "").trim();
  const phone = String(parsed.phone || "").replace(/\D/g, "");

  if (!guestName || !checkInDate || !checkOutDate) {
    return appResponse(
      400,
      {},
      "guestName, checkInDate and checkOutDate are required",
    );
  }
  if (checkInDate === checkOutDate) {
    return appResponse(
      400,
      {},
      "checkInDate and checkOutDate cannot be the same",
    );
  }
  if (!listingId) {
    return appResponse(400, {}, "listingId is required");
  }
  if (phone && phone.length !== 10) {
    return appResponse(400, {}, "phone must be a 10 digit number");
  }

  const listing = await StayboardListing.findOne({
    _id: listingId,
    ownerId: token.userId,
    isActive: { $ne: false },
  });
  if (!listing) return appResponse(404, {}, "Listing not found");

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
  });

  const file = parsed.files?.find((f: any) => f.fieldname === "idPhoto");
  const idPhotoUrls: string[] = [];
  if (file?.content) {
    idPhotoUrls.push(
      await uploadGuestIdPhoto(
        file.content,
        token.userId,
        String(booking._id),
        1,
      ),
    );
  } else {
    const idPhotoPayloadRaw = String(parsed.idPhotoPayload || "").trim();
    if (idPhotoPayloadRaw) {
      try {
        const idPhotoPayload = JSON.parse(
          idPhotoPayloadRaw,
        ) as IdPhotoPayloadItem[];
        const uptoTwelve = idPhotoPayload.slice(0, 12);
        for (const [index, photo] of uptoTwelve.entries()) {
          const sanitized = String(photo.base64 || "").replace(
            /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
            "",
          );
          const decoded = Buffer.from(sanitized, "base64");
          if (decoded.length > 0) {
            idPhotoUrls.push(
              await uploadGuestIdPhoto(
                decoded,
                token.userId,
                String(booking._id),
                index + 1,
              ),
            );
          }
        }
      } catch (error) {
        console.error("Invalid idPhotoPayload", {
          ownerId: token.userId,
          listingId,
          payloadLength: idPhotoPayloadRaw.length,
          error,
        });
        return appResponse(400, {}, "Invalid idPhotoPayload");
      }
    }

    const idPhotoBase64 = String(parsed.idPhotoBase64 || "").trim();
    if (idPhotoUrls.length === 0 && idPhotoBase64) {
      const sanitized = idPhotoBase64.replace(
        /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
        "",
      );
      const decoded = Buffer.from(sanitized, "base64");
      if (decoded.length > 0) {
        idPhotoUrls.push(
          await uploadGuestIdPhoto(
            decoded,
            token.userId,
            String(booking._id),
            1,
          ),
        );
      }
    }
  }

  if (idPhotoUrls.length) {
    booking.idPhotoUrl = idPhotoUrls[0];
    booking.idPhotoUrls = idPhotoUrls;
    await booking.save();
  }

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

  try {
    await notifyHousekeepingUsersForOwner({
      ownerId: token.userId,
      title: "New checkout task",
      body: `${listing.name} scheduled for housekeeping`,
    });
  } catch (error) {
    console.error("Unable to send housekeeping push notifications:", error);
  }

  const responseBooking = await withSignedGuestIdPhotoUrls(booking.toObject());

  return appResponse(
    201,
    { booking: responseBooking, housekeepingTask: task },
    "Booking created",
  );
};

export const updateBookingHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const bookingId = String(event.pathParameters?.bookingId || "").trim();
  if (!bookingId) return appResponse(400, {}, "bookingId is required");

  const parsed = JSON.parse(event.body);
  const guestName = String(parsed.guestName || "").trim();
  const checkInDate = String(parsed.checkInDate || "").trim();
  const checkOutDate = String(parsed.checkOutDate || "").trim();
  const phone = String(parsed.phone || "").replace(/\D/g, "");
  const amount = Number(parsed.amount || 0);

  if (!guestName || !checkInDate || !checkOutDate) {
    return appResponse(
      400,
      {},
      "guestName, checkInDate and checkOutDate are required",
    );
  }
  if (checkInDate === checkOutDate) {
    return appResponse(
      400,
      {},
      "checkInDate and checkOutDate cannot be the same",
    );
  }
  if (phone && phone.length !== 10) {
    return appResponse(400, {}, "phone must be a 10 digit number");
  }
  if (Number.isNaN(amount) || amount < 0) {
    return appResponse(400, {}, "amount must be a valid non-negative number");
  }

  const booking = await StayboardBooking.findOne({
    _id: bookingId,
    ownerId: token.userId,
  });
  if (!booking) return appResponse(404, {}, "Booking not found");

  booking.guestName = guestName;
  booking.phone = phone || undefined;
  booking.checkInDate = checkInDate;
  booking.checkOutDate = checkOutDate;
  booking.nights = calculateNights(checkInDate, checkOutDate);
  booking.amount = amount;

  await booking.save();

  const responseBooking = await withSignedGuestIdPhotoUrls(booking.toObject());

  return appResponse(200, { booking: responseBooking }, "Booking updated");
};

export const uploadBookingPhotoHandler = async (
  event: APIGatewayProxyEvent,
) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const bookingId = String(event.pathParameters?.bookingId || "").trim();
  if (!bookingId) return appResponse(400, {}, "bookingId is required");

  const { idPhotoBase64 } = JSON.parse(event.body);
  const base64 = String(idPhotoBase64 || "").trim();
  if (!base64) return appResponse(400, {}, "idPhotoBase64 is required");

  const booking = await StayboardBooking.findOne({
    _id: bookingId,
    ownerId: token.userId,
  });
  if (!booking) return appResponse(404, {}, "Booking not found");

  const existing =
    booking.idPhotoUrls || (booking.idPhotoUrl ? [booking.idPhotoUrl] : []);
  if (existing.length >= 12) {
    return appResponse(400, {}, "Maximum 12 photos allowed");
  }

  const sanitized = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
  const decoded = Buffer.from(sanitized, "base64");
  if (!decoded.length) return appResponse(400, {}, "Invalid idPhotoBase64");

  const suffix = existing.length + 1;
  const url = await uploadGuestIdPhoto(
    decoded,
    token.userId,
    String(booking._id),
    suffix,
  );
  const nextUrls = [...existing, url].slice(0, 12);

  booking.idPhotoUrls = nextUrls;
  booking.idPhotoUrl = nextUrls[0];
  await booking.save();

  const signedBooking = await withSignedGuestIdPhotoUrls(booking.toObject());

  return appResponse(
    201,
    {
      photoUrl: signedBooking.idPhotoUrl,
      idPhotoUrls: signedBooking.idPhotoUrls,
    },
    "Photo uploaded",
  );
};

export const extendBookingHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const bookingId = event.pathParameters?.bookingId;
  if (!bookingId) return appResponse(400, {}, "bookingId is required");

  const { newCheckoutDate, amount, skipHousekeeping } = JSON.parse(event.body);
  if (!newCheckoutDate || Number.isNaN(Number(amount))) {
    return appResponse(400, {}, "newCheckoutDate and amount are required");
  }

  const oldBooking = await StayboardBooking.findOne({
    _id: bookingId,
    ownerId: token.userId,
  });
  if (!oldBooking) return appResponse(404, {}, "Booking not found");

  const oldCheckout = new Date(oldBooking.checkOutDate).getTime();
  const newCheckout = new Date(String(newCheckoutDate)).getTime();
  if (!oldCheckout || !newCheckout || newCheckout <= oldCheckout) {
    return appResponse(
      400,
      {},
      "newCheckoutDate must be greater than current checkout date",
    );
  }

  const listing = await StayboardListing.findOne({
    _id: oldBooking.listingId,
    ownerId: token.userId,
    isActive: { $ne: false },
  });
  if (!listing) return appResponse(404, {}, "Listing not found");

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
      { status: "skipped" },
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

  return appResponse(
    201,
    { oldBooking, newBooking, newTask },
    "Booking extended",
  );
};

export const lookupByPhoneHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");

  const ownerId = token.userId;
  const phone = String(event.queryStringParameters?.phone || "").replace(
    /\D/g,
    "",
  );
  if (!phone || phone.length !== 10)
    return appResponse(400, {}, "Valid 10 digit phone is required");

  const booking = await StayboardBooking.findOne({ ownerId, phone }).sort({
    createdAt: -1,
  });
  if (!booking) return appResponse(200, { found: false, guestName: null });
  return appResponse(200, { found: true, guestName: booking.guestName });
};

export const createHousekeepingTaskHandler = async (
  event: APIGatewayProxyEvent,
) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const bookingId = String(event.pathParameters?.bookingId || "").trim();
  if (!bookingId) return appResponse(400, {}, "bookingId is required");

  const { dueDate } = JSON.parse(event.body);
  const dueDateStr = String(dueDate || "").trim();
  if (!dueDateStr || !moment(dueDateStr, "YYYY-MM-DD", true).isValid()) {
    return appResponse(400, {}, "Valid dueDate (YYYY-MM-DD) is required");
  }

  const booking = await StayboardBooking.findOne({
    _id: bookingId,
    ownerId: token.userId,
  });
  if (!booking) return appResponse(404, {}, "Booking not found");

  if (!(booking.checkOutDate > moment().format("YYYY-MM-DD"))) {
    return appResponse(
      400,
      {},
      "Manual housekeeping task allowed only when booking checkout date is in future",
    );
  }

  const listing = await StayboardListing.findOne({
    _id: booking.listingId,
    ownerId: token.userId,
    isActive: { $ne: false },
  });
  if (!listing) return appResponse(404, {}, "Listing not found");

  const existingTask = await StayboardHousekeepingTask.findOne({
    bookingId: String(booking._id),
    isActive: { $ne: false },
  }).select("_id");

  if (existingTask) {
    return appResponse(
      409,
      { taskId: String(existingTask._id) },
      "Housekeeping task already exists for this booking",
    );
  }

  const housekeepingTask = await createManualTaskForBooking({
    ownerId: token.userId,
    listing,
    bookingId: String(booking._id),
    dueDate: dueDateStr,
  });

  try {
    await notifyHousekeepingUsersForOwner({
      ownerId: token.userId,
      title: "New checkout task",
      body: `${listing.name} scheduled for housekeeping`,
    });
  } catch (error) {
    console.error("Unable to send housekeeping push notifications:", error);
  }

  return appResponse(201, { housekeepingTask }, "Housekeeping task created");
};

export const deleteBookingHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");

  const bookingId = String(event.pathParameters?.bookingId || "").trim();
  if (!bookingId) return appResponse(400, {}, "bookingId is required");

  const booking = await StayboardBooking.findOne({
    _id: bookingId,
    ownerId: token.userId,
  });
  if (!booking) return appResponse(404, {}, "Booking not found");

  await Promise.all([
    StayboardHousekeepingTask.deleteMany({
      bookingId: booking._id,
      ownerId: token.userId,
    }),
    StayboardBooking.deleteOne({
      _id: booking._id,
      ownerId: token.userId,
    }),
  ]);

  return appResponse(
    200,
    { bookingId: String(booking._id) },
    "Booking and associated housekeeping tasks deleted",
  );
};

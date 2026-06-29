import moment from "moment";

type DashboardBooking = {
  _id?: string;
  listingId: string;
  checkInDate: string;
  checkOutDate: string;
  nights?: number;
  amount: number;
};

type DashboardListing = {
  _id: string;
  name: string;
  checkInTime?: string;
  checkOutTime?: string;
};

type DashboardTask = {
  _id: string;
  taskId?: string;
  roomName: string;
  dueDate: string;
  listingId?: string;
  listingName?: string;
  status: string;
  checklist?: any;
};

type DashboardOptions = {
  bookings: DashboardBooking[];
  tasks: DashboardTask[];
  listings: DashboardListing[];
  allowedListingIds?: Set<string> | string[];
  now?: moment.Moment;
};

const normalizeTaskStatus = (status: string) =>
  status === "finished" ? "completed" : status;

const parseYmd = (value: string) => moment(value, "YYYY-MM-DD", true);

const normalizeToYmd = (value: string) => {
  if (!value) return null;

  const exact = moment(value, ["YYYY-MM-DD", moment.ISO_8601], true);
  if (exact.isValid()) return exact.format("YYYY-MM-DD");

  const fallback = moment(value);
  return fallback.isValid() ? fallback.format("YYYY-MM-DD") : null;
};

const isBookingInRangeByCheckIn = (
  checkInDate: string,
  start: moment.Moment,
  end: moment.Moment,
) => {
  const normalized = normalizeToYmd(checkInDate);
  if (!normalized) return false;
  const checkIn = parseYmd(normalized);
  return checkIn.isValid() && checkIn.isBetween(start, end, "day", "[]");
};

const getBookingNights = (booking: DashboardBooking) => {
  if (typeof booking.nights === "number" && !Number.isNaN(booking.nights)) {
    return booking.nights;
  }

  const normalizedCheckIn = normalizeToYmd(booking.checkInDate);
  const normalizedCheckOut = normalizeToYmd(booking.checkOutDate);
  if (!normalizedCheckIn || !normalizedCheckOut) return 0;

  const stayStart = parseYmd(normalizedCheckIn);
  const stayEnd = parseYmd(normalizedCheckOut);
  if (!stayStart.isValid() || !stayEnd.isValid() || !stayEnd.isAfter(stayStart)) {
    return 0;
  }
  return stayEnd.diff(stayStart, "days");
};

export const buildDashboardPayload = ({
  bookings,
  tasks,
  listings,
  allowedListingIds,
  now = moment(),
}: DashboardOptions) => {
  const today = now.clone().startOf("day");
  const todayYmd = today.format("YYYY-MM-DD");
  const in7Days = today.clone().add(7, "days").format("YYYY-MM-DD");
  const currentMonthStart = today.clone().startOf("month");
  const currentMonthEnd = today.clone();
  const previousMonthStart = today.clone().subtract(1, "month").startOf("month");
  const previousMonthComparableEnd = previousMonthStart
    .clone()
    .add(Math.min(today.date(), previousMonthStart.daysInMonth()) - 1, "days")
    .startOf("day");

  const allowedListingIdSet = allowedListingIds
    ? new Set(Array.isArray(allowedListingIds) ? allowedListingIds.map(String) : Array.from(allowedListingIds).map(String))
    : null;
  const scopedBookings = allowedListingIdSet
    ? bookings.filter((booking) => allowedListingIdSet.has(String(booking.listingId)))
    : bookings;

  const currentMonthBookings = scopedBookings.filter((booking) =>
    isBookingInRangeByCheckIn(
      booking.checkInDate,
      currentMonthStart,
      currentMonthEnd,
    ),
  );
  const previousMonthBookings = scopedBookings.filter((booking) =>
    isBookingInRangeByCheckIn(
      booking.checkInDate,
      previousMonthStart,
      previousMonthComparableEnd,
    ),
  );

  const currentMonthRevenue = currentMonthBookings.reduce(
    (sum, booking) => sum + Number(booking.amount || 0),
    0,
  );
  const previousMonthRevenue = previousMonthBookings.reduce(
    (sum, booking) => sum + Number(booking.amount || 0),
    0,
  );
  const currentMonthRoomNights = currentMonthBookings.reduce(
    (sum, booking) => sum + getBookingNights(booking),
    0,
  );
  const revenueDiff = currentMonthRevenue - previousMonthRevenue;
  const revenueDiffPct =
    previousMonthRevenue === 0
      ? currentMonthRevenue > 0
        ? 100
        : 0
      : (revenueDiff / previousMonthRevenue) * 100;

  const taskRows = tasks.map((task) => ({
    _id: task._id,
    taskId: task.taskId || task._id,
    roomName: task.roomName,
    checkoutDate: task.dueDate,
    listingName:
      task.listingName ||
      listings.find((listing) => String(listing._id) === String(task.listingId))
        ?.name ||
      "Listing",
    status: normalizeTaskStatus(task.status),
    checklist: task.checklist,
  }));

  const occupiedNow = scopedBookings.filter((booking) =>
    (normalizeToYmd(booking.checkInDate) || "") <= todayYmd &&
    (normalizeToYmd(booking.checkOutDate) || "") > todayYmd,
  );
  const checkinsToday = scopedBookings.filter(
    (booking) => normalizeToYmd(booking.checkInDate) === todayYmd,
  );
  const checkoutsToday = scopedBookings.filter(
    (booking) => normalizeToYmd(booking.checkOutDate) === todayYmd,
  );
  const upcoming = scopedBookings.filter(
    (booking) =>
      (normalizeToYmd(booking.checkInDate) || "") > todayYmd &&
      (normalizeToYmd(booking.checkInDate) || "") <= in7Days,
  );

  const occupancy = listings.map((listing) => {
    const listingBookings = scopedBookings.filter(
      (booking) => String(booking.listingId) === String(listing._id),
    );
    const hasOcc = listingBookings.some(
      (booking) =>
        (normalizeToYmd(booking.checkInDate) || "") <= todayYmd &&
        (normalizeToYmd(booking.checkOutDate) || "") > todayYmd,
    );
    const hasCheckout = listingBookings.some(
      (booking) => normalizeToYmd(booking.checkOutDate) === todayYmd,
    );
    const hasCheckin = listingBookings.some(
      (booking) => normalizeToYmd(booking.checkInDate) === todayYmd,
    );
    const status = hasOcc ? "occupied" : hasCheckout ? "checkout" : hasCheckin ? "checkin" : "vacant";
    return { roomId: String(listing._id), roomName: listing.name, status };
  });

  return {
    summary: {
      occupiedNow: occupiedNow.length,
      checkInsToday: checkinsToday.length,
      checkOutsToday: checkoutsToday.length,
      needCleaning: taskRows.filter(
        (task) => task.status === "pending" || task.status === "in_progress",
      ).length,
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
        from: currentMonthStart.format("YYYY-MM-DD"),
        to: currentMonthEnd.format("YYYY-MM-DD"),
      },
      previousRange: {
        from: previousMonthStart.format("YYYY-MM-DD"),
        to: previousMonthComparableEnd.format("YYYY-MM-DD"),
      },
    },
  };
};

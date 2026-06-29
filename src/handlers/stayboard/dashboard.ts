import { APIGatewayProxyEvent } from "aws-lambda";
import moment from "moment";
import { getStayboardModels } from "../../data/stayboard";
import {
  getDashboardDateWindow,
  loadActiveListingsForOwner,
  loadDashboardBookings,
} from "../../data/stayboard/dashboardQueries";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";
import { buildDashboardPayload } from "./dashboardMetrics";

const { HousekeepingTask: StayboardHousekeepingTask } = getStayboardModels();

const normalizeTaskStatus = (status: string) =>
  status === "finished" ? "completed" : status;

export const handler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  const ownerId = token.role === "owner" ? token.userId : token.ownerId;
  const { fromDate, toDate, today } = getDashboardDateWindow(moment());

  const listings = await loadActiveListingsForOwner(ownerId);
  const activeListingIdSet = new Set(listings.map((listing) => String(listing._id)));
  const [bookings, tasks] = await Promise.all([
    loadDashboardBookings({ ownerId, fromDate, toDate }),
    StayboardHousekeepingTask.find({
      ownerId,
      dueDate: today.format("YYYY-MM-DD"),
      isActive: { $ne: false },
    }).sort({ createdAt: -1 }),
  ]);

  const allowedStatuses =
    token.role === "housekeeping"
      ? ["pending", "in_progress", "completed", "finished"]
      : ["pending", "in_progress", "completed", "finished", "skipped"];
  const taskRows = tasks
    .filter(
      (t) =>
        !t.listingId || activeListingIdSet.has(String(t.listingId)),
    )
    .filter((t) => allowedStatuses.includes(t.status))
    .map((t) => ({
      _id: t._id,
      taskId: t._id,
      roomName: t.roomName,
      checkoutDate: t.dueDate,
      listingName:
        listings.find((l) => String(l._id) === String(t.listingId))?.name ||
        "Listing",
      status: normalizeTaskStatus(t.status),
      checklist: t.checklist,
    }));

  if (token.role === "housekeeping") {
    return appResponse(200, { tasks: taskRows });
  }
  const dashboard = buildDashboardPayload({
    bookings,
    tasks: taskRows,
    listings,
    allowedListingIds: activeListingIdSet,
    now: today,
  });

  return appResponse(200, {
    summary: dashboard.summary,
    tasks: dashboard.tasks,
    occupancy: dashboard.occupancy,
    month: dashboard.month,
    changePastMonth: dashboard.changePastMonth,
  });
};

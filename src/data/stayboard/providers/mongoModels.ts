import StayboardUser from "../../../models/stayboard/User";
import StayboardListing from "../../../models/stayboard/Listing";
import StayboardBooking from "../../../models/stayboard/Booking";
import StayboardHousekeepingTask from "../../../models/stayboard/HousekeepingTask";
import StayboardDevice from "../../../models/stayboard/Device";
import { StayboardDataModels } from "../repositories/types";

export const mongoStayboardModels: StayboardDataModels = {
  User: StayboardUser,
  Listing: StayboardListing,
  Booking: StayboardBooking,
  HousekeepingTask: StayboardHousekeepingTask,
  Device: StayboardDevice,
};

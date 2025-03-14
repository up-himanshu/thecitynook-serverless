import { Schema } from "mongoose";
import mongoose from "../utils/mongooseConnection";
import { IEnquiry } from "../interfaces/ReservationEnquiry";

const EnquirySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: false },
    dateFrom: { type: String, required: true },
    dateTo: { type: String, required: true },
    guestCount: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IEnquiry>("Enquiry", EnquirySchema);

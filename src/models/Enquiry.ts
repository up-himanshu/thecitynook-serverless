import { Schema, Document } from 'mongoose';
import mongoose from '../utils/mongooseConnection';

export interface IEnquiry extends Document {
  name: string;
  phone: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const EnquirySchema: Schema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: false },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  guestCount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model<IEnquiry>('Enquiry', EnquirySchema);
import { Schema, Document } from 'mongoose';
import mongoose from '../../utils/mongooseConnection';

export interface IStayboardBooking extends Document {
  ownerId: string;
  listingId: string;
  guestName: string;
  phone?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  amount: number;
  notes?: string;
  idPhotoUrl?: string;
  status: 'upcoming' | 'occupied' | 'checked_out' | 'cleaning_required' | 'completed';
}

const schema = new Schema<IStayboardBooking>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'StayboardUser', required: true },
  listingId: { type: Schema.Types.ObjectId, ref: 'StayboardListing', required: true },
  guestName: { type: String, required: true },
  phone: { type: String },
  checkInDate: { type: String, required: true },
  checkOutDate: { type: String, required: true },
  nights: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true },
  notes: { type: String },
  idPhotoUrl: { type: String },
  status: { type: String, enum: ['upcoming', 'occupied', 'checked_out', 'cleaning_required', 'completed'], default: 'upcoming' },
}, { timestamps: true, collection: 'stayboard_bookings' });

export default mongoose.model<IStayboardBooking>('StayboardBooking', schema);

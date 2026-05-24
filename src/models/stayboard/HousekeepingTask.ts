import { Schema, Document } from 'mongoose';
import mongoose from '../../utils/mongooseConnection';

export interface IStayboardHousekeepingTask extends Document {
  ownerId: string;
  listingId: string;
  bookingId: string;
  roomName: string;
  checklist: { item: string; answer: 'yes' | 'no' | null }[];
  remarks?: string;
  assignedTo?: string;
  status: 'pending' | 'in_progress' | 'completed';
  startedBy?: string;
  startedAt?: Date;
  completedBy?: string;
  completedAt?: Date;
  durationMinutes?: number;
}

const schema = new Schema<IStayboardHousekeepingTask>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'StayboardUser', required: true },
  listingId: { type: Schema.Types.ObjectId, ref: 'StayboardListing', required: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'StayboardBooking', required: true },
  roomName: { type: String, required: true },
  checklist: [{ item: { type: String, required: true }, answer: { type: String, enum: ['yes', 'no', null], default: null } }],
  remarks: { type: String },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
  status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
  startedBy: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
  startedAt: { type: Date },
  completedBy: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
  completedAt: { type: Date },
  durationMinutes: { type: Number },
}, { timestamps: true, collection: 'stayboard_housekeeping_tasks' });

export default mongoose.model<IStayboardHousekeepingTask>('StayboardHousekeepingTask', schema);

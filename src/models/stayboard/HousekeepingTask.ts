import { Schema, Document } from 'mongoose';
import mongoose from '../../utils/mongooseConnection';

export interface IStayboardHousekeepingTask extends Document {
  ownerId: string;
  listingId: string;
  bookingId: string;
  roomName: string;
  dueDate: string;
  checklist: { item: string; answer: 'yes' | 'no' | null }[];
  remarks?: string;
  status: 'pending' | 'skipped' | 'in_progress' | 'completed';
  startedById?: string;
  taskStartedAt?: Date;
  completedById?: string;
  taskCompletedAt?: Date;
  durationMinutes?: number;
  isActive: boolean;
}

const schema = new Schema<IStayboardHousekeepingTask>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'StayboardUser', required: true },
  listingId: { type: Schema.Types.ObjectId, ref: 'StayboardListing', required: true },
  bookingId: { type: Schema.Types.ObjectId, ref: 'StayboardBooking', required: true },
  roomName: { type: String, required: true },
  dueDate: { type: String, required: true },
  checklist: [{ item: { type: String, required: true }, answer: { type: String, enum: ['yes', 'no', null], default: null } }],
  remarks: { type: String },
  status: { type: String, enum: ['pending', 'skipped', 'in_progress', 'completed'], default: 'pending' },
  startedById: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
  taskStartedAt: { type: Date },
  completedById: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
  taskCompletedAt: { type: Date },
  durationMinutes: { type: Number },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: 'stayboard_housekeeping_tasks' });

export default mongoose.model<IStayboardHousekeepingTask>('StayboardHousekeepingTask', schema);

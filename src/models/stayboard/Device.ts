import { Schema, Document } from 'mongoose';
import mongoose from '../../utils/mongooseConnection';

export interface IStayboardDevice extends Document {
  userId: string;
  pushToken: string;
  platform?: string;
}

const schema = new Schema<IStayboardDevice>({
  userId: { type: Schema.Types.ObjectId, ref: 'StayboardUser', required: true },
  pushToken: { type: String, required: true },
  platform: { type: String },
}, { timestamps: true, collection: 'stayboard_devices' });

schema.index({ userId: 1, pushToken: 1 }, { unique: true });

export default mongoose.model<IStayboardDevice>('StayboardDevice', schema);

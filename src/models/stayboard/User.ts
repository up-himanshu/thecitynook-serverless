import { Schema, Document } from 'mongoose';
import mongoose from '../../utils/mongooseConnection';
import bcrypt from 'bcryptjs';

export interface IStayboardUser extends Document {
  fullName: string;
  displayName?: string;
  email?: string | null;
  phone: string;
  countryCode: string;
  password: string;
  role: 'owner' | 'housekeeping';
  ownerId?: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const schema = new Schema<IStayboardUser>({
  fullName: { type: String, required: true },
  displayName: { type: String },
  email: { type: String, lowercase: true, default: null, sparse: true },
  phone: { type: String, required: true },
  countryCode: { type: String, required: true, default: '91', minlength: 1, maxlength: 3 },
  password: { type: String, required: true },
  role: { type: String, enum: ['owner', 'housekeeping'], required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'StayboardUser' },
}, { timestamps: true, collection: 'stayboard_users' });

schema.index({ countryCode: 1, phone: 1 }, { unique: true });
schema.index({ email: 1 }, { unique: true, sparse: true });

schema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

schema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IStayboardUser>('StayboardUser', schema);

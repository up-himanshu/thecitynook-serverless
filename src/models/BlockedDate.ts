import { Schema, Document } from "mongoose";
import mongoose from "../utils/mongooseConnection";

export interface IBlockedDate extends Document {
  blockedDate: string;
}

const BlockedDateSchema: Schema = new Schema<IBlockedDate>(
  {
    blockedDate: {
      type: String,
      required: true,
      unique: true,
    },
  },
  { collection: 'blockedDates' }
);

export default mongoose.model<IBlockedDate>("BlockedDate", BlockedDateSchema);

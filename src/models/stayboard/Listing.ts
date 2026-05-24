import { Schema, Document } from "mongoose";
import mongoose from "../../utils/mongooseConnection";

export interface IStayboardListing extends Document {
  ownerId: string;
  name: string;
  capacity: number;
  checklist: string[];
}

const schema = new Schema<IStayboardListing>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "StayboardUser",
      required: true,
    },
    name: { type: String, required: true },
    capacity: { type: Number, required: true },
    checklist: [{ type: String }],
  },
  { timestamps: true, collection: "stayboard_listings" },
);

export default mongoose.model<IStayboardListing>("StayboardListing", schema);

import { Document } from "mongoose";

export interface ReservationEnquiry {
  property: string;
  name: string;
  phone: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount?: number;
}

export interface ReservationEnquiryRequest extends ReservationEnquiry {
  recaptchaToken: string;
}

export interface IEnquiry extends Document {
  property: string;
  name: string;
  phone: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

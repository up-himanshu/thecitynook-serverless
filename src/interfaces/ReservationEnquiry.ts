import { Document } from "mongoose";

export interface ReservationEnquiryRequest {
  name: string;
  phone: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount: number;
  recaptchaToken: string;
}

export interface ReservationEnquiry {
  name: string;
  phone: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount: number;
}

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

import { APIGatewayProxyHandler } from "aws-lambda";
import {
  getEmailBody,
  getEmailSubject,
  sendEmail,
  sendResponse,
  verifyRecaptcha,
} from "../utils/utils";
import { validateApiKey } from "../utils/middleware";
import { FROM_EMAIL, TO_EMAILS } from "../utils/constants";

interface ReservationEnquiry {
  name: string;
  phone?: string;
  email?: string;
  dateFrom: string;
  dateTo: string;
  guestCount: number;
  recaptchaToken: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const validationError = validateApiKey(event);
    if (validationError) return validationError;

    if (!event.body) return sendResponse(400, "Request body is required");

    const body: ReservationEnquiry = JSON.parse(event.body);

    console.log("Reservation Enquiry:", body);

    if (!body.recaptchaToken)
      return sendResponse(400, "reCAPTCHA token is required");

    const isRecaptchaValid = await verifyRecaptcha(body.recaptchaToken);
    if (!isRecaptchaValid)
      return sendResponse(400, "reCAPTCHA verification failed");

    if (!body.name) return sendResponse(400, "Name is required");

    if (!body.phone && !body.email)
      return sendResponse(400, "Either phone or email is required");

    if (!body.dateFrom) return sendResponse(400, "Date from is required");

    if (!body.dateTo) return sendResponse(400, "Date to is required");

    if (!body.guestCount) return sendResponse(400, "Guest count is required");

    const emailSent = await sendEmail({
      to: TO_EMAILS,
      subject: getEmailSubject(body),
      body: getEmailBody(body),
      from: FROM_EMAIL,
    });

    console.log("emailSent", emailSent);

    return sendResponse(201, "Reservation enquiry received");
  } catch (error) {
    return sendResponse(400, "Invalid request body");
  }
};

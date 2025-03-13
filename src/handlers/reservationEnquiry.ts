import { APIGatewayProxyHandler } from "aws-lambda";
import {
  getEmailBody,
  getEmailSubject,
  sendEmail,
  sendResponse,
  verifyRecaptcha,
  createEnquiry,
  correctEmailExtension,
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

    if (!body.phone) return sendResponse(400, "Phone is required");

    if (!body.dateFrom) return sendResponse(400, "Date from is required");

    if (!body.dateTo) return sendResponse(400, "Date to is required");

    if (!body.guestCount) return sendResponse(400, "Guest count is required");

    const email = correctEmailExtension(body.email || "");

    const enquiryCreated = await createEnquiry({
      name: body.name,
      phone: body.phone,
      email,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      guestCount: body.guestCount,
    });

    console.log("enquiryCreated", enquiryCreated);

    if (!enquiryCreated) return sendResponse(500, "Failed to create enquiry");

    const emailSent = await sendEmail({
      to: TO_EMAILS,
      subject: getEmailSubject(body),
      body: getEmailBody({...body, email}),
      from: FROM_EMAIL,
    });

    console.log("emailSent", emailSent);

    return sendResponse(201, "Reservation enquiry received", enquiryCreated);
  } catch (error) {
    return sendResponse(400, "Invalid request body");
  }
};

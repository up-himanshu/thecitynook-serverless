import { APIGatewayProxyHandler } from "aws-lambda";
import {
  getEmailBody,
  getEmailSubject,
  sendEmail,
  sendResponse,
  createEnquiry,
  correctEmailExtension,
  validateReservationEnquiry,
  getGuestEmailSubject,
  getGuestEmailBody,
  findEnquiry,
} from "../utils/utils";
import { validateApiKey } from "../utils/middleware";
import { FROM_EMAIL, TO_EMAILS } from "../utils/constants";
import {
  ReservationEnquiry,
  ReservationEnquiryRequest,
} from "../interfaces/ReservationEnquiry";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const validationError = validateApiKey(event);
    if (validationError) return validationError;

    if (!event.body) return sendResponse(400, "Request body is required");

    const body: ReservationEnquiryRequest = JSON.parse(event.body);
    console.log("Reservation Enquiry:", body);

    const errorMessage = await validateReservationEnquiry(body);
    if (errorMessage) return sendResponse(400, errorMessage);

    const email = correctEmailExtension(body.email || "");

    const enquiry: ReservationEnquiry = {
      name: body.name,
      phone: body.phone,
      email,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      guestCount: body.guestCount,
    };

    const existingEnquiry = await findEnquiry(enquiry);
    if (existingEnquiry) {
      return sendResponse(
        200,
        "Reservation enquiry already exists",
        existingEnquiry
      );
    }

    const enquiryCreated = await createEnquiry(enquiry);
    console.log("enquiryCreated", enquiryCreated);
    if (!enquiryCreated) return sendResponse(500, "Failed to create enquiry");

    const emailSent = await sendEmail({
      to: TO_EMAILS,
      subject: getEmailSubject(enquiry),
      body: getEmailBody(enquiry),
      from: FROM_EMAIL,
    });
    console.log("emailSent", emailSent);

    if (body.email) {
      const adminEmailSent = await sendEmail({
        to: [email],
        subject: getGuestEmailSubject(),
        body: getGuestEmailBody(enquiry),
        from: FROM_EMAIL,
      });
      console.log("adminEmailSent", adminEmailSent);
    }

    return sendResponse(201, "Reservation enquiry received", enquiryCreated);
  } catch (error) {
    return sendResponse(400, "Invalid request body");
  }
};

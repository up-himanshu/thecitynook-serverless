import { APIGatewayProxyHandler } from "aws-lambda";
import { sendEmail, sendResponse, verifyRecaptcha } from "../utils/utils";
import { validateApiKey } from "../utils/middleware";
import moment from "moment";

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

    const nights = moment(body.dateTo).diff(body.dateFrom, "days");
    const emailSent = await sendEmail({
      to: ["er.astha2008@gmail.com", "up.himanshu@gmail.com"],
      subject: `Website Reservation Enquiry - ${body.dateFrom} to ${body.dateTo}`,
      body: `<h1>New Reservation Enquiry</h1>
               <p>Name: ${body.name}</p>
               <p>Phone: ${body.phone}</p>
               <p>Email: ${body.email}</p>
               <p>Guest Count: ${body.guestCount}</p>
               <p>Nights: ${nights}</p>`,
      from: "Team Hoistin <no-reply@hoistin.com>",
    });

    console.log("emailSent", emailSent);

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Reservation enquiry received" }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }
};

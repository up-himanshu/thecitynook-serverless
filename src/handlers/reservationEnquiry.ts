import { APIGatewayProxyHandler } from "aws-lambda";
import { sendEmail, verifyRecaptcha } from "../utils/utils";
import { validateApiKey } from "../utils/middleware";

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

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    const body: ReservationEnquiry = JSON.parse(event.body);

    console.log("Reservation Enquiry:", body);

    if (!body.recaptchaToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "reCAPTCHA token is required" }),
      };
    }

    const isRecaptchaValid = await verifyRecaptcha(body.recaptchaToken);
    if (!isRecaptchaValid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "reCAPTCHA verification failed" }),
      };
    }

    if (!body.name) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Name is required" }),
      };
    }

    if (!body.phone && !body.email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Either phone or email is required" }),
      };
    }

    if (!body.dateFrom) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Date from is required" }),
      };
    }

    if (!body.dateTo) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Date to is required" }),
      };
    }

    if (!body.guestCount) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Guest count is required" }),
      };
    }

    // const emailSent = await sendEmail({
    //     to: ['er.astha2008@gmail.com', 'up.himanshu@gmail.com'],
    //     subject: `New Reservation Enquiry - ${body.dateFrom} to ${body.dateTo}`,
    //     body: `<h1>New Reservation Enquiry</h1>
    //            <p>Name: ${body.name}</p>
    //            <p>Phone: ${body.phone}</p>
    //            <p>Email: ${body.email}</p>
    //            <p>Guest Count: ${body.guestCount}</p>`,
    //     from: 'Team Hoistin <no-reply@hoistin.com>'
    //   });

    //   console.log("emailSent", emailSent)

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Reservation enquiry received" }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }
};

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import dotenv from "dotenv";
import axios from "axios";
import moment from "moment";
import EnquiryModel from "../models/Enquiry";
import BlockedDateModel from "../models/BlockedDate";
import {
  IEnquiry,
  ReservationEnquiry,
  ReservationEnquiryRequest,
} from "../interfaces/ReservationEnquiry";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const ses = new SESClient({
  credentials: {
    accessKeyId: process.env.SES_KEY || "",
    secretAccessKey: process.env.SES_ACCESS_KEY || "",
  },
  region: process.env.SES_REGION || "ap-south-1",
});

interface EmailParams {
  to: string[];
  subject: string;
  body: string;
  from: string;
}

export const sendEmail = async ({
  to,
  subject,
  body,
  from,
}: EmailParams): Promise<boolean> => {
  try {
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: to,
      },
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: body,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: subject,
        },
      },
      Source: from,
    });
    if (process.env.NODE_ENV !== "local") await ses.send(command);
    else console.log(`Email sent with subject - ${subject}`, body);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

export const verifyRecaptcha = async (token: string): Promise<boolean> => {
  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token,
        },
      }
    );

    return response.data.success;
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return false;
  }
};

export const sendResponse = async (
  status: number,
  message: string,
  data: any = {}
): Promise<any> => {
  console.log("sendResponse params", status, message, data);
  return {
    statusCode: status,
    headers: {
      "Access-Control-Allow-Origin": "https://www.thecitynook.com",
      "Access-Control-Allow-Credentials": "true",
    },
    body: [200, 201, 204].includes(status)
      ? JSON.stringify({ message, data })
      : JSON.stringify({ error: message }),
  };
};

export const getEmailBody = (body: any, heading: string = "") => {
  const nights = moment(body.dateTo).diff(body.dateFrom, "days");
  return `<h1>${heading || "New Reservation Enquiry"} - ${body.property}</h1>
          <p>Duration: ${body.dateFrom} to ${body.dateTo}</p>
          <p>Name: ${body.name}</p>
          <p>Phone: ${body.phone}</p>
          <p>Email: ${body.email}</p>
          <p>Guest Count: ${body.guestCount || "NOT PROVIDED"}</p>
          <p>Nights: ${nights}</p>`;
};

export const getSendMessageBody = (body: any) => {
  return `<h1>Message sent from Website - ${body.subject} - ${
    body.property
  }</h1>
          <p>Message: ${body.message}</p><br /><br />
          <p>From:</p>
          <p>Name: ${body.name || "NOT PROVIDED"}</p>
          <p>Email: ${body.email || "NOT PROVIDED"}</p>
          <p>Phone: ${body.phone || "NOT PROVIDED"}</p>`;
};

export const getEmailSubject = (body: any) => {
  return `Website Reservation Enquiry - ${moment(body.dateFrom).format(
    "D MMM"
  )} to ${moment(body.dateTo).format("D MMM")}`;
};

export const getGuestEmailBody = (body: any) => {
  const nights = moment(body.dateTo).diff(body.dateFrom, "days");
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #2c3e50;">Thank You for Your Reservation Enquiry</h1>
      
      <p style="color: #34495e;">Dear ${body.name},</p>
      
      <p style="color: #34495e;">Thank you for choosing The City Nook. We have received your reservation enquiry with the following details:</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Check-in:</strong> ${moment(
          body.dateFrom
        ).format("DD MMM YYYY")}</p>
        <p style="margin: 5px 0;"><strong>Check-out:</strong> ${moment(
          body.dateTo
        ).format("DD MMM YYYY")}</p>
        <p style="margin: 5px 0;"><strong>Number of Nights:</strong> ${nights}</p>
        <p style="margin: 5px 0;"><strong>Number of Guests:</strong> ${
          body.guestCount || "NOT PROVIDED"
        }</p>
        <p style="margin: 5px 0;"><strong>Special Offer:</strong> <span style="text-decoration: line-through;">₹2,500</span> <span style="color: #e74c3c;">₹2,000</span> per night</p>
      </div>

      <p style="color: #34495e;">What happens next?</p>
      <ul style="color: #34495e;">
        <li>Our team will review your enquiry</li>
        <li>We will contact you shortly via phone call or WhatsApp with further instructions</li>
        <li>We'll assist you with the booking process and answer any questions you may have</li>
      </ul>

      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="color: #34495e; margin: 10px 0;"><strong>Additional Information:</strong></p>
        <ul style="color: #34495e;">
          <li><a href="https://maps.app.goo.gl/F3tgJiuMf3b5wADo7" style="color: #3498db;">Click here to view our property location</a></li>
          <li>Book with us on <a href="https://airbnb.co.in/h/thecitynook" style="color: #3498db;">Airbnb</a> or <a href="https://www.makemytrip.com/hotels/hotel-details?hotelId=202412201436016964&checkin=date_3&checkout=date_4&country=IN&city=CTJAI&roomStayQualifier=2e0e&openDetail=true&currency=ENG&region=IN&checkAvailability=true&locusId=CTJAI&locusType=city&homestay=true&zcp=8b5f5d1bc3ed" style="color: #3498db;">MakeMyTrip</a></li>
          <li>Secure your booking with just 20% down payment - remaining balance due at check-in</li>
          <li>Call <a href="tel:+919782001181"><strong>+91 97820 01181</strong></a> to book or for more details</li>
        </ul>
      </div>

      <p style="color: #34495e;">If you have any immediate questions, feel free to reach out to us.</p>
      
      <p style="color: #34495e;">Best Regards,<br>The City Nook Team</p>
    </div>
  `;
};

export const getGuestEmailSubject = () => {
  return `Thank You for Your Reservation Enquiry - The City Nook`;
};

export const correctEmailExtension = (email: string): string => {
  return email.replace(/(@[\w.-]+)\.con$/, "$1.com");
};

export const validateReservationEnquiry = async (
  body: ReservationEnquiryRequest
): Promise<string> => {
  let result = "";

  if (process.env.NODE_ENV !== "local" && !body.recaptchaToken)
    result = "reCAPTCHA token is required";

  const isRecaptchaValid = await verifyRecaptcha(body.recaptchaToken);
  if (process.env.NODE_ENV !== "local" && !isRecaptchaValid)
    result = "reCAPTCHA verification failed";

  if (!body.name) result = "Name is required";

  if (!body.phone) result = "Phone is required";

  if (!body.dateFrom) result = "Date from is required";

  if (!body.dateTo) result = "Date to is required";

  return result;
};

export const getBlockedDates = async (): Promise<string[]> => {
  try {
    const dates = await BlockedDateModel.find({});
    return dates.map((date) => date.blockedDate);
  } catch (error) {
    console.error("MongoDB Error:", error);
    return [];
  }
};

const parseBlockedDates = (icalString: any) => {
  const now = moment().startOf("day");
  const endOfNextMonth = moment(now).add(1, "months").endOf("month");

  const events = icalString.split("BEGIN:VEVENT").slice(1);
  const blockedDates = [];

  for (const event of events) {
    const startMatch = event.match(/DTSTART;VALUE=DATE:(\d{8})/);
    const endMatch = event.match(/DTEND;VALUE=DATE:(\d{8})/);

    if (startMatch && endMatch) {
      const start = moment(startMatch[1], "YYYYMMDD");
      const end = moment(endMatch[1], "YYYYMMDD");

      for (let date = moment(start); date.isBefore(end); date.add(1, "day")) {
        if (date.isSameOrAfter(now) && date.isSameOrBefore(endOfNextMonth)) {
          blockedDates.push({ blockedDate: date.format("YYYY-MM-DD") });
        }
      }
    }
  }

  return blockedDates;
};

const getBlockedDatesFromUrl = async (url: string): Promise<any> => {
  try {
    const response = await axios.get(url);
    return parseBlockedDates(response.data);
  } catch (error) {
    throw error;
  }
};

const getCommonBlockedDates = (arr1, arr2) => {
  return arr1.filter((item1) =>
    arr2.some((item2) =>
      moment(item1.blockedDate).isSame(moment(item2.blockedDate), "day")
    )
  );
};

export const syncBlockedDatesFromCalendar = async (): Promise<boolean> => {
  console.log("syncBlockedDatesFromCalendar start");
  try {
    const list1 = await getBlockedDatesFromUrl(
      "https://www.airbnb.co.in/calendar/ical/1396443376139173537.ics?s=750921c96b6ebdd00c3901ee65f91429"
    );

    const list2 = await getBlockedDatesFromUrl(
      "https://www.airbnb.co.in/calendar/ical/1312107705366987232.ics?s=d5e484c5e15ae0041756a9bae29f8558"
    );

    const result = getCommonBlockedDates(list1, list2);

    if (result.length > 0) {
      await BlockedDateModel.deleteMany({});
      await BlockedDateModel.insertMany(result);
    }
    console.log(`Synced ${result.length} blocked dates`);
    return true;
  } catch (error) {
    console.error("Error syncing blocked dates:", error);
    return false;
  }
};

export const syncBlockedDatesFromCalendar2 = async (): Promise<boolean> => {
  console.log("syncBlockedDatesFromCalendar start");
  try {
    const response = await axios.get(
      "https://in.goibibo.com/api/v2/ingoibibo/calendar/45001442482/?bid=f91b9a9c30e5380acb1d7089b335a3fa"
    );

    if (response.data) {
      // Clear existing dates
      await BlockedDateModel.deleteMany({});

      // Extract and format blocked dates
      const lines: string[] = response.data.split("\n");
      const currentDate = moment().startOf("day");
      const blockedDates = lines
        .filter((line) => line.startsWith("DTSTART;VALUE=DATE:"))
        .map((line) => {
          const dateStr = line.slice(-9);
          const formattedDate = moment(dateStr, "YYYYMMDD").format(
            "YYYY-MM-DD"
          );
          return {
            blockedDate: formattedDate,
          };
        })
        .filter((date) => moment(date.blockedDate).isSameOrAfter(currentDate));

      if (blockedDates.length > 0) {
        await BlockedDateModel.insertMany(blockedDates);
      }

      console.log(`Synced ${blockedDates.length} blocked dates`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error syncing blocked dates:", error);
    return false;
  }
};

export const findEnquiry = async (
  enquiry: ReservationEnquiry
): Promise<IEnquiry | false> => {
  try {
    const existingEnquiry = await EnquiryModel.findOne({
      phone: enquiry.phone,
      dateFrom: enquiry.dateFrom,
      dateTo: enquiry.dateTo,
    });

    if (existingEnquiry) {
      return existingEnquiry;
    }

    return false;
  } catch (error) {
    console.error("Error finding enquiry:", error);
    return false;
  }
};

export const createEnquiry = async (
  enquiry: ReservationEnquiry
): Promise<IEnquiry | false> => {
  try {
    const newEnquiry = await EnquiryModel.create(enquiry);
    if (!newEnquiry) {
      return false;
    }
    return newEnquiry;
  } catch (error) {
    console.error("Error creating enquiry:", error);
    return false;
  }
};

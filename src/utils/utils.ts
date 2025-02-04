import AWS from "aws-sdk";
import dotenv from "dotenv";
import axios from "axios";
import moment from "moment";
import { getDatabase } from "./database";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const ses = new AWS.SES({
  accessKeyId: process.env.SES_KEY,
  secretAccessKey: process.env.SES_ACCESS_KEY,
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
    const params = {
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
    };

    await ses.sendEmail(params).promise();
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

export const getEmailBody = (body: any) => {
  const nights = moment(body.dateTo).diff(body.dateFrom, "days");
  return `<h1>New Reservation Enquiry</h1>
          <p>Name: ${body.name}</p>
          <p>Phone: ${body.phone}</p>
          <p>Email: ${body.email}</p>
          <p>Guest Count: ${body.guestCount}</p>
          <p>Nights: ${nights}</p>`;
};

export const getEmailSubject = (body: any) => {
  return `Website Reservation Enquiry - ${body.from} to ${body.to}`;
};

export const getBlockedDates = async (): Promise<string[]> => {
  try {
    const database = await getDatabase();
    const collection = database.collection("blockedDates");

    const dates = await collection.find({}).toArray();
    return dates.map((date) => date.blockedDate);
  } catch (error) {
    console.error("MongoDB Error:", error);
    return [];
  }
};

export const syncBlockedDatesFromCalendar = async (): Promise<boolean> => {
  console.log("syncBlockedDatesFromCalendar start");
  try {
    const response = await axios.get(
      "https://in.goibibo.com/api/v2/ingoibibo/calendar/45001442482/?bid=f91b9a9c30e5380acb1d7089b335a3fa"
    );

    if (response.data) {
      const database = await getDatabase();
      const collection = database.collection("blockedDates");

      // Clear existing dates
      await collection.deleteMany({});

      // Extract and format blocked dates
      const lines = response.data.split("\n");
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
        await collection.insertMany(blockedDates);
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

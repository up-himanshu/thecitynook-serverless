import AWS from "aws-sdk";
import dotenv from "dotenv";
import axios from "axios";

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
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: token
        }
      }
    );

    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification failed:', error);
    return false;
  }
};

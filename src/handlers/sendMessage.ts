import { APIGatewayProxyEvent } from "aws-lambda";
import { getSendMessageBody, sendEmail, sendResponse } from "../utils/utils";
import { FROM_EMAIL, TO_EMAILS } from "../utils/constants";

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    if (!event.body) {
      return sendResponse(400, "Missing request body");
    }

    const requestBody = JSON.parse(event.body);

    await sendEmail({
      from: FROM_EMAIL,
      to: TO_EMAILS,
      subject: `New Message from Website - ${requestBody.subject}`,
      body: getSendMessageBody(requestBody),
    });

    return sendResponse(200, "Message sent");
  } catch (error) {
    console.error(error);
    return sendResponse(500, "Internal server error");
  }
};

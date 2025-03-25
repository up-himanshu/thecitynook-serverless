import { APIGatewayProxyHandler } from "aws-lambda";
import { sendEmail, sendResponse, getEmailBody } from "../utils/utils";
import { validateApiKey } from "../utils/middleware";
import { FROM_EMAIL, TO_EMAILS } from "../utils/constants";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const validationError = validateApiKey(event);
    if (validationError) return validationError;

    console.log("serious event", event);

    const body: any = JSON.parse(event.body);

    console.log("serious body", body);

    if (body.email) {
      const emailBody = getEmailBody(body, "Guest is Serious");

      const emailSent = await sendEmail({
        to: TO_EMAILS,
        subject: `Serious Enquiry - ${body.name}`,
        body: emailBody,
        from: FROM_EMAIL,
      });

      if (!emailSent)
        return sendResponse(500, "Failed to send email notification");

      return sendResponse(200, "Email notification sent successfully");
    }
  } catch (error) {
    console.error("Error processing serious enquiry:", error);
    return sendResponse(500, "Internal server error");
  }
};

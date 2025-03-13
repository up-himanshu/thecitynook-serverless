import { APIGatewayProxyHandler } from "aws-lambda";
import { validateApiKey } from "../utils/middleware";
import { getBlockedDates, sendResponse } from "../utils/utils";

export const handler: APIGatewayProxyHandler = async (event) => {
  const validationError = validateApiKey(event);
  if (validationError) return validationError;

  try {
    const blockedDates: string[] = await getBlockedDates();
    return sendResponse(200, "Success", { blockedDates });
  } catch (error) {
    console.error("Error fetching blocked dates:", error);
    return sendResponse(500, "Failed to fetch blocked dates");
  }
};

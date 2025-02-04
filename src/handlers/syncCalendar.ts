import { APIGatewayProxyHandler } from "aws-lambda";
import { syncBlockedDatesFromCalendar, sendResponse } from "../utils/utils";

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    console.log("sync calendar started");
    const success = await syncBlockedDatesFromCalendar();
    if (success) {
      return sendResponse(200, "Calendar sync completed successfully");
    }
    return sendResponse(500, "Calendar sync failed");
  } catch (error) {
    console.error("Error in sync handler:", error);
    return sendResponse(500, "Calendar sync failed error");
  }
};

import { APIGatewayProxyHandler } from "aws-lambda";
import { validateApiKey } from "../utils/middleware";
import { sendResponse } from "../utils/utils";

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log("available dates query");
  const validationError = validateApiKey(event);
  if (validationError) return validationError;

  const data = {
    blockedDates: ["2025-02-01", "2025-02-02", "2025-02-05", "2025-02-15"],
  };

  return sendResponse(200, "List of blocked dates", data);
};

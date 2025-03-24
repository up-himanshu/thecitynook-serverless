import { APIGatewayProxyEvent } from "aws-lambda";
import Enquiry from "../models/Enquiry";
import { sendResponse } from "../utils/utils";
import { validateJwtToken } from "../utils/middleware";

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const validationResult = validateJwtToken(event);
    if ('statusCode' in validationResult) return validationResult;

    const enquiries = await Enquiry.find().sort({ createdAt: -1 });
    return sendResponse(200, "Enquiries retrieved successfully", enquiries);
  } catch (error) {
    console.error("Error fetching enquiries:", error);
    return sendResponse(500, "Internal server error");
  }
};

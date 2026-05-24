import { APIGatewayProxyEvent } from "aws-lambda";
import { sendResponse } from "../utils/utils";
import { validateJwtToken } from "../utils/middleware";
import User from "../models/User";

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const validationResult = validateJwtToken(event);
    if ("statusCode" in validationResult) return validationResult;

    const decoded = validationResult;
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return sendResponse(404, "User not found");
    }

    return sendResponse(200, "User details retrieved successfully", user);
  } catch (error: any) {
    console.error("Error in user handler:", error);
    return sendResponse(500, "Internal server error");
  }
};

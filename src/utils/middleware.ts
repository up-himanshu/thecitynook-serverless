import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import jwt from "jsonwebtoken";

export interface JWTPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export const validateApiKey = (
  event: APIGatewayProxyEvent
): APIGatewayProxyResult | null => {
  const apiKey = event.headers["key"];

  if (!apiKey || apiKey !== "abc123") {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Invalid API key" }),
    };
  }

  return null;
};

export const validateJwtToken = (
  event: APIGatewayProxyEvent
): APIGatewayProxyResult | JWTPayload => {
  const authHeader = event.headers.Authorization || event.headers.authorization;

  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No authorization token provided" }),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    ) as JWTPayload;

    return decoded;
  } catch (error) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "Invalid or expired token" }),
    };
  }
};

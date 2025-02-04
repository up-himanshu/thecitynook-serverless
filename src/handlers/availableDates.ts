import { APIGatewayProxyHandler } from "aws-lambda";
import { validateApiKey } from "../utils/middleware";

export const handler: APIGatewayProxyHandler = async (event) => {
  const validationError = validateApiKey(event);
  if (validationError) return validationError;

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "https://www.thecitynook.com",
      "Access-Control-Allow-Credentials": "true",
    },
    body: JSON.stringify({
      blockedDates: ["2025-02-01", "2025-02-02", "2025-02-05", "2025-02-15"],
    }),
  };
};

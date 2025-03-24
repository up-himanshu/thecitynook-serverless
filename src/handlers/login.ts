import { APIGatewayProxyEvent } from "aws-lambda";
import User from "../models/User";
import { sendResponse } from "../utils/utils";
import jwt from "jsonwebtoken";

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    if (!event.body) {
      return sendResponse(400, "Missing request body");
    }

    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return sendResponse(400, "Email and password are required");
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return sendResponse(401, "Invalid credentials");
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return sendResponse(401, "Invalid credentials");
    }

    if (!user.isAdmin) {
      return sendResponse(403, "Access denied. Admin privileges required");
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdmin: user.isAdmin },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    return sendResponse(200, "Login successful", { token });
  } catch (error) {
    console.error("Login error:", error);
    return sendResponse(500, "Internal server error");
  }
};
import crypto from "crypto";
import { APIGatewayProxyEvent } from "aws-lambda";
import jwt from "jsonwebtoken";
import { appResponse } from "../stayboard/response";
import User from "../../models/User";

export interface AdminToken {
  userId: string;
  email: string;
  isAdmin: boolean;
}

export const ADMIN_JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export const normalizeEmail = (email: unknown): string => {
  return String(email ?? "").trim().toLowerCase();
};

export const parseAdminToken = (event: APIGatewayProxyEvent): AdminToken | null => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as AdminToken;
    if (!decoded?.isAdmin) return null;
    return decoded;
  } catch {
    return null;
  }
};

export const requireAdminToken = (event: APIGatewayProxyEvent) => {
  const token = parseAdminToken(event);
  if (!token) {
    return { token: null, response: appResponse(401, {}, "Unauthorized") };
  }

  return { token, response: null };
};

export const signAdminToken = (user: any) =>
  jwt.sign(
    { userId: String(user._id), email: user.email, isAdmin: true },
    ADMIN_JWT_SECRET,
    { expiresIn: "24h" },
  );

export const createResetToken = () => crypto.randomBytes(32).toString("hex");

export const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

export const getAdminResetUrl = (token: string, email: string) => {
  const baseUrl = process.env.STAYBOARD_ADMIN_APP_URL || "http://localhost:5173";
  const url = new URL(baseUrl);
  url.pathname = "/reset-password";
  url.searchParams.set("token", token);
  url.searchParams.set("email", email);
  return url.toString();
};

export const sendResetPasswordEmail = async (email: string, token: string) => {
  const resetUrl = getAdminResetUrl(token, email);
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Reset your Stayboard admin password</h2>
      <p>Use the button below to complete your password reset.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a></p>
      <p>If the button does not work, paste this URL into your browser:</p>
      <p>${resetUrl}</p>
    </div>
  `;

  const { sendEmail } = await import("../utils");
  await sendEmail({
    to: [email],
    subject: "Reset your Stayboard admin password",
    body: html,
    from: "The City Nook <no-reply@thecitynook.com>",
  });

  return resetUrl;
};

export const findAdminByEmail = async (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return User.findOne({ email: normalized, isAdmin: true });
};

export const formatAdminUser = (user: any) => ({
  id: String(user._id),
  email: user.email,
  isAdmin: Boolean(user.isAdmin),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

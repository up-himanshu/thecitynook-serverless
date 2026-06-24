import { APIGatewayProxyEvent } from "aws-lambda";
import User from "../../models/User";
import { appResponse } from "../../utils/stayboard/response";
import {
  createResetToken,
  findAdminByEmail,
  formatAdminUser,
  getAdminResetUrl,
  hashResetToken,
  normalizeEmail,
  requireAdminToken,
  sendResetPasswordEmail,
  signAdminToken,
} from "../../utils/admin/auth";

const parseBody = (event: APIGatewayProxyEvent) => {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
};

const validatePassword = (password: unknown) =>
  String(password ?? "").trim().length >= 8;

export const meHandler = async (event: APIGatewayProxyEvent) => {
  const { token, response } = requireAdminToken(event);
  if (response) return response;

  const admin = await User.findById(token!.userId).select("-password -passwordResetTokenHash -passwordResetExpiresAt");
  if (!admin || !admin.isAdmin) return appResponse(404, {}, "Admin not found");

  return appResponse(200, { admin: formatAdminUser(admin) });
};

export const loginHandler = async (event: APIGatewayProxyEvent) => {
  const body = parseBody(event);
  if (!body) return appResponse(400, {}, "Missing request body");

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email || !password) {
    return appResponse(400, {}, "Email and password are required");
  }

  const admin = await User.findOne({ email, isAdmin: true });
  if (!admin) return appResponse(401, {}, "Invalid credentials");

  const valid = await admin.comparePassword(password);
  if (!valid) return appResponse(401, {}, "Invalid credentials");

  const token = signAdminToken(admin);

  return appResponse(200, {
    token,
    admin: formatAdminUser(admin),
  }, "Login successful");
};

export const registerAdminHandler = async (event: APIGatewayProxyEvent) => {
  const body = parseBody(event);
  if (!body) return appResponse(400, {}, "Missing request body");

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  if (!email || !validatePassword(password)) {
    return appResponse(400, {}, "A valid email and password of at least 8 characters are required");
  }

  const adminCount = await User.countDocuments({ isAdmin: true });
  if (adminCount > 0) {
    const { token, response } = requireAdminToken(event);
    if (response) return response;

    const requester = await User.findById(token!.userId);
    if (!requester || !requester.isAdmin) return appResponse(403, {}, "Forbidden");
  }

  const existing = await User.findOne({ email });
  if (existing) return appResponse(409, {}, "Email already in use");

  const admin = await User.create({
    email,
    password,
    isAdmin: true,
  });

  return appResponse(201, { admin: formatAdminUser(admin) }, "Admin created");
};

export const forgotPasswordHandler = async (event: APIGatewayProxyEvent) => {
  const body = parseBody(event);
  if (!body) return appResponse(400, {}, "Missing request body");

  const email = normalizeEmail(body.email);
  if (!email) return appResponse(400, {}, "Email is required");

  const admin = await User.findOne({ email, isAdmin: true });
  if (!admin) {
    return appResponse(200, {}, "If the email exists, a reset link has been sent");
  }

  const resetToken = createResetToken();
  admin.passwordResetTokenHash = hashResetToken(resetToken);
  admin.passwordResetExpiresAt = new Date(Date.now() + 1000 * 60 * 30);
  await admin.save();

  const resetUrl = await sendResetPasswordEmail(admin.email, resetToken);

  return appResponse(200, {
    resetUrl: process.env.NODE_ENV === "local" ? resetUrl : undefined,
  }, "If the email exists, a reset link has been sent");
};

export const resetPasswordHandler = async (event: APIGatewayProxyEvent) => {
  const body = parseBody(event);
  if (!body) return appResponse(400, {}, "Missing request body");

  const token = String(body.token ?? "").trim();
  const newPassword = String(body.newPassword ?? "");

  if (!token || !validatePassword(newPassword)) {
    return appResponse(400, {}, "Reset token and a valid new password are required");
  }

  const hashedToken = hashResetToken(token);
  const admin = await User.findOne({
    isAdmin: true,
    passwordResetTokenHash: hashedToken,
    passwordResetExpiresAt: { $gt: new Date() },
  });

  if (!admin) return appResponse(400, {}, "Invalid or expired reset token");

  admin.password = newPassword;
  admin.passwordResetTokenHash = null;
  admin.passwordResetExpiresAt = null;
  await admin.save();

  return appResponse(200, { admin: formatAdminUser(admin) }, "Password updated");
};

export const seedAdminHandler = async (event: APIGatewayProxyEvent) => {
  const body = parseBody(event) || {};

  const email = normalizeEmail(
    body.email || process.env.STAYBOARD_ADMIN_SEED_EMAIL,
  );
  const password = String(body.password || process.env.STAYBOARD_ADMIN_SEED_PASSWORD || "");

  if (!email || !validatePassword(password)) {
    return appResponse(
      400,
      {},
      "Admin email and a password of at least 8 characters are required",
    );
  }

  const adminCount = await User.countDocuments({ isAdmin: true });
  const existing = await User.findOne({ email, isAdmin: true });
  if (existing) {
    return appResponse(200, { admin: formatAdminUser(existing) }, "Admin already exists");
  }

  if (adminCount > 0) {
    return appResponse(
      409,
      {},
      "An admin already exists. Use the create admin form after logging in.",
    );
  }

  const admin = await User.create({
    email,
    password,
    isAdmin: true,
  });

  return appResponse(201, { admin: formatAdminUser(admin) }, "Seed admin created");
};

export const createAdminResetUrl = getAdminResetUrl;

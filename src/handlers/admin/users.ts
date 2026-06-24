import { APIGatewayProxyEvent } from "aws-lambda";
import { getStayboardModels } from "../../data/stayboard";
import { appResponse } from "../../utils/stayboard/response";
import { requireAdminToken } from "../../utils/admin/auth";

const { User: StayboardUser } = getStayboardModels();

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

const serializeStayboardUser = (user: any, ownerName?: string | null) => ({
  id: String(user._id),
  fullName: user.fullName,
  displayName: user.displayName || user.fullName,
  email: user.email || null,
  phone: user.phone,
  countryCode: user.countryCode,
  role: user.role,
  ownerId: user.ownerId ? String(user.ownerId) : null,
  ownerName: ownerName || null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const listStayboardUsersHandler = async (event: APIGatewayProxyEvent) => {
  const { response } = requireAdminToken(event);
  if (response) return response;

  const users = await StayboardUser.find({
    role: { $in: ["owner", "housekeeping"] },
  })
    .select("-password")
    .sort({ role: 1, createdAt: -1 });

  const ownerMap = new Map<string, any>();
  users
    .filter((user: any) => user.role === "owner")
    .forEach((user: any) => ownerMap.set(String(user._id), user));

  const owners = users
    .filter((user: any) => user.role === "owner")
    .map((user: any) => serializeStayboardUser(user));

  const housekeeping = users
    .filter((user: any) => user.role === "housekeeping")
    .map((user: any) =>
      serializeStayboardUser(
        user,
        user.ownerId ? ownerMap.get(String(user.ownerId))?.displayName || ownerMap.get(String(user.ownerId))?.fullName : null,
      ),
    );

  return appResponse(200, {
    owners,
    housekeeping,
    total: users.length,
  });
};

export const resetStayboardUserPasswordHandler = async (
  event: APIGatewayProxyEvent,
) => {
  const { response } = requireAdminToken(event);
  if (response) return response;

  const body = parseBody(event);
  if (!body) return appResponse(400, {}, "Missing request body");

  const userId = event.pathParameters?.id || event.pathParameters?.userId;
  const newPassword = String(body.newPassword ?? "");
  if (!userId) return appResponse(400, {}, "User id is required");
  if (!validatePassword(newPassword)) {
    return appResponse(400, {}, "A password of at least 8 characters is required");
  }

  const user = await StayboardUser.findOne({
    _id: userId,
    role: { $in: ["owner", "housekeeping"] },
  });
  if (!user) return appResponse(404, {}, "User not found");

  user.password = newPassword;
  await user.save();

  return appResponse(200, {
    user: serializeStayboardUser(user),
  }, "Password reset");
};

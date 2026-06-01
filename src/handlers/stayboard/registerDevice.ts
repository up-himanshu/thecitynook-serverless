import { APIGatewayProxyEvent } from "aws-lambda";
import { getStayboardModels } from "../../data/stayboard";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";

const { Device: StayboardDevice } = getStayboardModels();

export const handler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (!event.body) return appResponse(400, {}, "Missing request body");
  const { pushToken, platform, provider } = JSON.parse(event.body);
  console.log("Registering device for user", token.userId, {
    pushToken,
    platform,
    provider,
  });
  await StayboardDevice.updateOne(
    { userId: token.userId, pushToken },
    { $set: { platform, provider: provider || "fcm" } },
    { upsert: true },
  );
  return appResponse(200, { registered: true }, "Device registered");
};

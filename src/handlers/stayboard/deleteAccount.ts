import { APIGatewayProxyEvent } from "aws-lambda";
import { getStayboardModels } from "../../data/stayboard";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";
import { FROM_EMAIL } from "../../utils/constants";
import { sendEmail } from "../../utils/utils";

const { User: StayboardUser } = getStayboardModels();
const DELETE_REQUEST_EMAIL = "up.himanshu@gmail.com";

export const requestDeleteHandler = async (event: APIGatewayProxyEvent) => {
  try {
    const token = parseToken(event);
    if (!token) return appResponse(401, {}, "Unauthorized");

    const user = await StayboardUser.findById(token.userId).select("-password");
    if (!user) return appResponse(404, {}, "User not found");

    const body = event.body ? JSON.parse(event.body) : {};

    const requestorName =
      String(body.fullName || user.fullName || user.displayName || "")
        .trim() || "Unknown";
    const requestorEmail =
      String(body.email || user.email || "").trim() || "Not provided";
    const requestorPhone =
      String(body.phone || user.phone || "").trim() || "Not provided";
    const requestedAt = new Date().toISOString();

    const emailBody = `
      <h2>Stayboard App - Delete Account Request</h2>
      <p>A user requested account deletion from the app.</p>
      <p><strong>User ID:</strong> ${String(user._id)}</p>
      <p><strong>Name:</strong> ${requestorName}</p>
      <p><strong>Email:</strong> ${requestorEmail}</p>
      <p><strong>Phone:</strong> ${requestorPhone}</p>
      <p><strong>Role:</strong> ${user.role}</p>
      <p><strong>Requested At:</strong> ${requestedAt}</p>
      <p><strong>Note:</strong> Account should be deleted after 15 days if user does not log in again.</p>
    `;

    const sent = await sendEmail({
      from: FROM_EMAIL,
      to: [DELETE_REQUEST_EMAIL],
      subject: "Stayboard App - Delete Account Request",
      body: emailBody,
    });

    if (!sent) {
      return appResponse(500, {}, "Failed to send delete account request email");
    }

    return appResponse(200, { requestedAt }, "Delete account request submitted");
  } catch (error) {
    console.error("Delete account request failed", error);
    return appResponse(500, {}, "Internal error");
  }
};

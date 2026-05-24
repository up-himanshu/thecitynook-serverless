import { APIGatewayProxyEvent } from "aws-lambda";
import StayboardListing from "../../models/stayboard/Listing";
import { parseToken } from "../../utils/stayboard/auth";
import { appResponse } from "../../utils/stayboard/response";

const defaultChecklist = [
  "Bed changed",
  "Bathroom cleaned",
  "Towels replaced",
  "Dusting done",
  "Water bottles refilled",
  "TV checked",
];

export const getHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  const ownerId = token.role === "owner" ? token.userId : token.ownerId;
  const listings = await StayboardListing.find({ ownerId });
  return appResponse(200, { listings });
};

export const postHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");
  const { name, capacity } = JSON.parse(event.body);
  const listing = await StayboardListing.create({
    ownerId: token.userId,
    name,
    capacity,
    checklist: defaultChecklist,
  });
  return appResponse(201, { listing }, "Listing created");
};

export const updateChecklistHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const listingId = event.pathParameters?.id;
  const { checklist } = JSON.parse(event.body);
  if (!listingId) return appResponse(400, {}, "listingId is required");
  if (!Array.isArray(checklist))
    return appResponse(400, {}, "checklist must be an array");

  const cleaned = checklist.map((v) => String(v).trim()).filter(Boolean);
  const listing = await StayboardListing.findOneAndUpdate(
    { _id: listingId, ownerId: token.userId },
    { checklist: cleaned },
    { new: true },
  );
  if (!listing) return appResponse(404, {}, "Listing not found");
  return appResponse(200, { listing }, "Checklist updated");
};

export const copyChecklistHandler = async (event: APIGatewayProxyEvent) => {
  const token = parseToken(event);
  if (!token) return appResponse(401, {}, "Unauthorized");
  if (token.role !== "owner") return appResponse(403, {}, "Forbidden");
  if (!event.body) return appResponse(400, {}, "Missing request body");

  const sourceListingId = event.pathParameters?.id;
  const { targetListingIds } = JSON.parse(event.body);
  if (!sourceListingId)
    return appResponse(400, {}, "source listing id is required");
  if (!Array.isArray(targetListingIds) || !targetListingIds.length) {
    return appResponse(400, {}, "targetListingIds must be a non-empty array");
  }

  const source = await StayboardListing.findOne({
    _id: sourceListingId,
    ownerId: token.userId,
  });
  if (!source) return appResponse(404, {}, "Source listing not found");

  const result = await StayboardListing.updateMany(
    { _id: { $in: targetListingIds }, ownerId: token.userId },
    { $set: { checklist: source.checklist || [] } },
  );

  return appResponse(
    200,
    { modifiedCount: result.modifiedCount },
    "Checklist copied",
  );
};

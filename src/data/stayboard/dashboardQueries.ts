import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import moment from "moment";
import { STAYBOARD_DB_PROVIDER } from "../../config/stayboardDbProvider";
import { getStayboardModels } from "./getStayboardModels";

type DashboardBooking = {
  _id: string;
  listingId: string;
  ownerId: string;
  checkInDate: string;
  checkOutDate: string;
  nights?: number;
  amount: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

type DashboardListing = {
  _id: string;
  ownerId: string;
  name: string;
  isActive?: boolean;
  [key: string]: any;
};

const TABLE_NAME = process.env.STAYBOARD_DYNAMO_TABLE;
const DYNAMO_ENDPOINT = process.env.STAYBOARD_DYNAMO_ENDPOINT?.trim();
const DYNAMO_REGION = DYNAMO_ENDPOINT
  ? "ap-south-1"
  : process.env.STAYBOARD_AWS_REGION || process.env.AWS_REGION || "ap-south-1";
const BOOKING_INDEX_NAME = "StayboardBookingOwnerCheckInDateIndex";

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: DYNAMO_REGION,
    endpoint: DYNAMO_ENDPOINT || undefined,
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  },
);

const { Listing: StayboardListing, Booking: StayboardBooking } =
  getStayboardModels();

export const loadActiveListingsForOwner = async (
  ownerId: string,
): Promise<DashboardListing[]> => {
  if (STAYBOARD_DB_PROVIDER === "mongo") {
    return (await StayboardListing.find({
      ownerId,
      isActive: { $ne: false },
    })) as DashboardListing[];
  }

  const rows = (await StayboardListing.find({
    ownerId,
    isActive: { $ne: false },
  })) as DashboardListing[];
  return rows;
};

const queryBookingsFromDynamo = async (
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<DashboardBooking[]> => {
  if (!TABLE_NAME) {
    throw new Error("STAYBOARD_DYNAMO_TABLE is not configured");
  }

  const resp = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: BOOKING_INDEX_NAME,
      KeyConditionExpression: "ownerId = :ownerId AND checkInDate BETWEEN :fromDate AND :toDate",
      ExpressionAttributeValues: {
        ":ownerId": ownerId,
        ":fromDate": fromDate,
        ":toDate": toDate,
      },
    }),
  );

  return (resp.Items || []) as DashboardBooking[];
};

const queryBookingsFromFallback = async (
  ownerId: string,
  fromDate: string,
  toDate: string,
): Promise<DashboardBooking[]> => {
  const rows = (await StayboardBooking.find({
    ownerId,
    checkInDate: { $gte: fromDate, $lte: toDate },
  })) as DashboardBooking[];
  return rows;
};

export const loadDashboardBookings = async ({
  ownerId,
  fromDate,
  toDate,
}: {
  ownerId: string;
  fromDate: string;
  toDate: string;
}): Promise<DashboardBooking[]> => {
  if (STAYBOARD_DB_PROVIDER === "mongo") {
    return queryBookingsFromFallback(ownerId, fromDate, toDate);
  }

  try {
    return await queryBookingsFromDynamo(ownerId, fromDate, toDate);
  } catch (error) {
    console.warn("Falling back to legacy booking scan for dashboard", {
      ownerId,
      fromDate,
      toDate,
      error: error instanceof Error ? error.message : String(error),
    });
    return queryBookingsFromFallback(ownerId, fromDate, toDate);
  }
};

export const getDashboardDateWindow = (now = moment()) => {
  const today = now.clone().startOf("day");
  return {
    fromDate: today.clone().subtract(1, "month").startOf("month").format("YYYY-MM-DD"),
    toDate: today.clone().endOf("month").format("YYYY-MM-DD"),
    today,
  };
};

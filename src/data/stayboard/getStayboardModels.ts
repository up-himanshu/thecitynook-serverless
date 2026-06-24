import {
  STAYBOARD_DB_PROVIDER,
} from "../../config/stayboardDbProvider";
import { StayboardDataModels } from "./repositories/types";

export const getStayboardModels = (): StayboardDataModels => {
  const provider = STAYBOARD_DB_PROVIDER as "mongo" | "dynamo";
  if (provider === "mongo") {
    const { mongoStayboardModels } = require("./providers/mongoModels");
    return mongoStayboardModels;
  }

  const { dynamoStayboardModels } = require("./providers/dynamoModels");
  return dynamoStayboardModels;
};

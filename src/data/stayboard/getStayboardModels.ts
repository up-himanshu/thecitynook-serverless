import {
  STAYBOARD_DB_PROVIDER,
} from "../../config/stayboardDbProvider";
import { StayboardDataModels } from "./repositories/types";

export const getStayboardModels = (): StayboardDataModels => {
  if (STAYBOARD_DB_PROVIDER === "mongo") {
    const { mongoStayboardModels } = require("./providers/mongoModels");
    return mongoStayboardModels;
  }

  const { dynamoStayboardModels } = require("./providers/dynamoModels");
  return dynamoStayboardModels;
};

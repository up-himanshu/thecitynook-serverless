import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const password = encodeURIComponent("oHo1E4u3dM9NaNrE");

const mongoUri = `mongodb+srv://erastha2008:${password}@clustertcn.ttydv.mongodb.net/?retryWrites=true&w=majority&appName=ClusterTCN`;
let mongoClient: MongoClient | null = null;

export const connectToMongo = async () => {
  if (!mongoClient) {
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  }
  return mongoClient;
};

export const getDatabase = async () => {
  const client = await connectToMongo();
  return client.db("thecitynook");
};

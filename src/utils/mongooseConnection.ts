import mongoose from "mongoose";

const mongoUri = process.env.DB_CONNECTION_STRING || "";

// Connect to MongoDB
mongoose.connect(mongoUri);

// Handle connection events
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("Connected to MongoDB");
});

export default mongoose;

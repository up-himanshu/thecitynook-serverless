import mongoose from "mongoose";

const password = encodeURIComponent("oHo1E4u3dM9NaNrE");
const mongoUri =
  process.env.DB_CONNECTION_STRING ??
  `mongodb+srv://erastha2008:${password}@clustertcn.ttydv.mongodb.net/thecitynook?retryWrites=true&w=majority&appName=ClusterTCN`;

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

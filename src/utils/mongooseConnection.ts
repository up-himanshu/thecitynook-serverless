import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: ".env.local" });

const password = encodeURIComponent("oHo1E4u3dM9NaNrE");
const mongoUri = `mongodb+srv://erastha2008:${password}@clustertcn.ttydv.mongodb.net/?retryWrites=true&w=majority&appName=ClusterTCN`;

// Connect to MongoDB
mongoose.connect(mongoUri);

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.once('open', () => {
  console.log('Connected to MongoDB');
});

export default mongoose;
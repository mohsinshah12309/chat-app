const mongoose = require("mongoose");

let isConnecting = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set in environment");
    return;
  }
  if (mongoose.connection.readyState === 1 || isConnecting) return;

  try {
    isConnecting = true;
    await mongoose.connect(uri);
    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    // Retry in background after 5s so the server stays alive during Atlas wakeups
    setTimeout(connectDB, 5000);
  } finally {
    isConnecting = false;
  }
}

module.exports = connectDB;
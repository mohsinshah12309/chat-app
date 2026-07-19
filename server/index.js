require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const connectDB = require("./db");
const registerChatHandlers = require("./socket/chatHandlers");
const { registerDmHandlers } = require("./socket/dmHandlers");
const { ROOMS } = require("./rooms");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const dmRoutes = require("./routes/dms");
const adminRoutes = require("./routes/admin");
const uploadRoutes = require("./routes/upload");

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok" })); // simple health check for Render

app.get("/api/rooms", (req, res) => res.json(ROOMS));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dms", dmRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

const io = new Server(server, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"] },
});

app.set("io", io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required."));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: payload.id, username: payload.username, isAdmin: payload.isAdmin };
    next();
  } catch (err) {
    next(new Error("Invalid or expired token."));
  }
});

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.user.username})`);
  registerChatHandlers(io, socket);
  registerDmHandlers(io, socket);
});

async function start() {
  await connectDB();
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start();
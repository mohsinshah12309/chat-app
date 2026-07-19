const express = require("express");
const requireAuth = require("../middleware/auth");
const requireAdmin = require("../middleware/admin");
const {
  ROOMS,
  getUsersInRoom,
  getRoomMessages,
  clearRoomMessages,
  roomExists,
  addRoom,
  deleteRoom,
} = require("../rooms");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/rooms", async (req, res) => {
  const data = await Promise.all(
    ROOMS.map(async (room) => ({
      room,
      onlineCount: getUsersInRoom(room).length,
      messageCount: (await getRoomMessages(room)).length,
    }))
  );
  res.json(data);
});

router.delete("/rooms/:room/messages", async (req, res) => {
  const { room } = req.params;
  if (!roomExists(room)) return res.status(404).json({ message: "Room not found." });

  await clearRoomMessages(room);

  const io = req.app.get("io");
  io.to(room).emit("room_cleared", { room, timestamp: new Date().toISOString() });

  res.json({ success: true });
});

// POST /api/admin/rooms  { name: "New Room" }
router.post("/rooms", (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "A room name is required." });
  }

  try {
    const created = addRoom(name);

    const io = req.app.get("io");
    io.emit("rooms_updated", ROOMS);

    res.status(201).json({ room: created });
  } catch (err) {
    res.status(409).json({ message: err.message });
  }
});

// DELETE /api/admin/rooms/:room  -> removes the room entirely (not just its messages)
router.delete("/rooms/:room", async (req, res) => {
  const { room } = req.params;

  try {
    await deleteRoom(room);

    const io = req.app.get("io");
    io.to(room).emit("room_deleted", { room });
    io.emit("rooms_updated", ROOMS);
    io.socketsLeave(room);

    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
});

module.exports = router;
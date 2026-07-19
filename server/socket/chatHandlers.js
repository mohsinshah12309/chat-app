const {
  ROOMS,
  addUserToRoom,
  removeUserFromRoom,
  getUsersInRoom,
  addMessageToRoom,
  getRoomMessages,
  toggleRoomMessageReaction,
} = require("../rooms");
const { isRateLimited } = require("../utils/rateLimiter");

const socketInfo = new Map();

// Max 5 messages per 3 seconds per user, across all rooms. Generous enough
// for normal typing/sending speed, but stops a script (or an over-eager
// paste-and-spam) from flooding a room.
const MESSAGE_LIMIT = 5;
const MESSAGE_WINDOW_MS = 3000;

function registerChatHandlers(io, socket) {
  const username = socket.user.username;

  socket.on("join_room", async ({ room }, callback) => {
    if (!ROOMS.includes(room)) {
      return callback?.({ success: false, message: "Invalid room." });
    }

    socket.join(room);
    addUserToRoom(room, socket.id, username);
    socketInfo.set(socket.id, { username, room });

    io.to(room).emit("room_users", getUsersInRoom(room));
    socket.to(room).emit("user_joined", {
      message: `${username} joined the room`,
      timestamp: new Date().toISOString(),
    });

    try {
      socket.emit("room_history", await getRoomMessages(room));
    } catch (err) {
      console.error("Failed to load room history:", err.message);
      socket.emit("room_history", []);
    }

    callback?.({ success: true, rooms: ROOMS });
  });

  socket.on("switch_room", async ({ newRoom }, callback) => {
    const info = socketInfo.get(socket.id);
    if (!info) return callback?.({ success: false, message: "Join a room first." });
    if (!ROOMS.includes(newRoom)) return callback?.({ success: false, message: "Invalid room." });

    const { room: oldRoom } = info;
    if (newRoom === oldRoom) return callback?.({ success: true });

    socket.leave(oldRoom);
    removeUserFromRoom(oldRoom, socket.id);
    io.to(oldRoom).emit("room_users", getUsersInRoom(oldRoom));
    socket.to(oldRoom).emit("user_left", {
      message: `${username} left the room`,
      timestamp: new Date().toISOString(),
    });

    socket.join(newRoom);
    addUserToRoom(newRoom, socket.id, username);
    socketInfo.set(socket.id, { username, room: newRoom });

    io.to(newRoom).emit("room_users", getUsersInRoom(newRoom));
    socket.to(newRoom).emit("user_joined", {
      message: `${username} joined the room`,
      timestamp: new Date().toISOString(),
    });

    try {
      socket.emit("room_history", await getRoomMessages(newRoom));
    } catch (err) {
      console.error("Failed to load room history:", err.message);
      socket.emit("room_history", []);
    }

    callback?.({ success: true });
  });

  socket.on("send_message", async ({ text, type = "text", audioUrl, duration, replyTo, tempId }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    if (type === "voice" && !audioUrl) return;
    if (type === "text" && !text?.trim()) return;

    if (isRateLimited(username, MESSAGE_LIMIT, MESSAGE_WINDOW_MS)) {
      socket.emit("rate_limited", {
        context: "message",
        message: "You're sending messages too fast. Please slow down.",
      });
      return;
    }

    try {
      const message = await addMessageToRoom(info.room, {
        username,
        type,
        text: type === "text" ? text.trim() : "",
        audioUrl: type === "voice" ? audioUrl : null,
        duration: type === "voice" ? duration : null,
        replyTo: replyTo || null,
      });
      io.to(info.room).emit("receive_message", { ...message, tempId: tempId || null });
    } catch (err) {
      console.error("Failed to save room message:", err.message);
    }
  });

  socket.on("message:react", async ({ messageId, emoji }) => {
    const info = socketInfo.get(socket.id);
    if (!info || !messageId || !emoji) return;

    try {
      const result = await toggleRoomMessageReaction(messageId, username, emoji);
      if (result) {
        io.to(info.room).emit("message:reaction_update", result);
      }
    } catch (err) {
      console.error("Failed to toggle reaction:", err.message);
    }
  });

  socket.on("typing", () => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    socket.to(info.room).emit("typing", { username });
  });

  socket.on("stop_typing", () => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    socket.to(info.room).emit("stop_typing", { username });
  });

  socket.on("disconnect", () => {
    const info = socketInfo.get(socket.id);
    if (!info) return;

    removeUserFromRoom(info.room, socket.id);
    socketInfo.delete(socket.id);

    io.to(info.room).emit("room_users", getUsersInRoom(info.room));
    socket.to(info.room).emit("user_left", {
      message: `${username} left the room`,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = registerChatHandlers;
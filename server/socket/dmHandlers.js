const DirectMessage = require("../models/DirectMessage");
const { isRateLimited } = require("../utils/rateLimiter");

const onlineUsers = new Map();

const MESSAGE_LIMIT = 5;
const MESSAGE_WINDOW_MS = 3000;

function registerUserSocket(username, socketId) {
  if (!onlineUsers.has(username)) onlineUsers.set(username, new Set());
  onlineUsers.get(username).add(socketId);
}

function unregisterUserSocket(username, socketId) {
  const set = onlineUsers.get(username);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlineUsers.delete(username);
}

function emitToBothParticipants(io, userA, userB, event, payload) {
  const targets = new Set([...(onlineUsers.get(userA) || []), ...(onlineUsers.get(userB) || [])]);
  targets.forEach((sid) => io.to(sid).emit(event, payload));
}

function registerDmHandlers(io, socket) {
  const { username } = socket.user;
  registerUserSocket(username, socket.id);

  // For text messages: { to, text, iv, replyTo }
  //   `text` is CIPHERTEXT (base64) — encrypted client-side before this ever
  //   arrives. The server stores and relays it opaquely; it cannot decrypt it.
  // For voice notes: { to, type: "voice", audioUrl, duration, replyTo }
  //   (voice notes are NOT encrypted — documented limitation)
  socket.on("dm:send", async ({ to, text, iv, type = "text", audioUrl, duration, replyTo, tempId }, callback) => {
    if (!to) return callback?.({ success: false, message: "Recipient is required." });
    if (to === username) return callback?.({ success: false, message: "You can't message yourself." });

    if (type === "text" && (!text || !iv)) {
      return callback?.({ success: false, message: "Encrypted message content is required." });
    }
    if (type === "voice" && !audioUrl) {
      return callback?.({ success: false, message: "Voice note audio is required." });
    }

    if (isRateLimited(username, MESSAGE_LIMIT, MESSAGE_WINDOW_MS)) {
      socket.emit("rate_limited", {
        context: "message",
        message: "You're sending messages too fast. Please slow down.",
      });
      return callback?.({ success: false, message: "Rate limited — slow down." });
    }

    try {
      const saved = await DirectMessage.create({
        from: username,
        to,
        type,
        text: type === "text" ? text : "",
        iv: type === "text" ? iv : null,
        audioUrl: type === "voice" ? audioUrl : null,
        duration: type === "voice" ? duration : null,
        replyTo: replyTo || null,
      });

      const payload = {
        id: saved._id,
        from: username,
        to,
        type: saved.type,
        text: saved.text,
        iv: saved.iv,
        audioUrl: saved.audioUrl || null,
        duration: saved.duration || null,
        replyTo: saved.replyTo || null,
        reactions: saved.reactions || [],
        delivered: saved.delivered,
        read: saved.read,
        timestamp: saved.createdAt,
        tempId: tempId || null,
      };

      emitToBothParticipants(io, username, to, "dm:receive", payload);

      callback?.({ success: true, message: payload });
    } catch (err) {
      console.error(err);
      callback?.({ success: false, message: "Could not send message." });
    }
  });

  socket.on("dm:react", async ({ messageId, emoji, to }, callback) => {
    if (!messageId || !emoji || !to) return callback?.({ success: false });

    try {
      const existing = await DirectMessage.findOne(
        { _id: messageId, "reactions.username": username },
        { "reactions.$": 1, from: 1, to: 1 }
      );

      let updated;
      if (!existing) {
        updated = await DirectMessage.findByIdAndUpdate(
          messageId,
          { $push: { reactions: { username, emoji } } },
          { new: true }
        );
      } else if (existing.reactions[0].emoji === emoji) {
        updated = await DirectMessage.findByIdAndUpdate(
          messageId,
          { $pull: { reactions: { username } } },
          { new: true }
        );
      } else {
        updated = await DirectMessage.findOneAndUpdate(
          { _id: messageId, "reactions.username": username },
          { $set: { "reactions.$.emoji": emoji } },
          { new: true }
        );
      }

      if (!updated) return callback?.({ success: false, message: "Message not found." });

      const result = { messageId: updated._id.toString(), reactions: updated.reactions };
      emitToBothParticipants(io, updated.from, updated.to, "dm:reaction_update", result);

      callback?.({ success: true });
    } catch (err) {
      console.error("Failed to toggle DM reaction:", err.message);
      callback?.({ success: false, message: "Could not update reaction." });
    }
  });

  socket.on("dm:ack_delivered", async ({ messageId }) => {
    if (!messageId) return;

    try {
      const updated = await DirectMessage.findOneAndUpdate(
        { _id: messageId, delivered: false },
        { delivered: true },
        { new: true }
      );
      if (!updated) return;

      emitToBothParticipants(io, updated.from, updated.to, "dm:status_update", {
        messageIds: [updated._id.toString()],
        delivered: true,
      });
    } catch (err) {
      console.error("Failed to ack delivery:", err.message);
    }
  });

  socket.on("dm:mark_read", async ({ partner }) => {
    if (!partner) return;

    try {
      const unread = await DirectMessage.find({
        from: partner,
        to: username,
        read: false,
      }).select("_id");

      if (unread.length === 0) return;

      const ids = unread.map((m) => m._id);
      await DirectMessage.updateMany(
        { _id: { $in: ids } },
        { read: true, delivered: true }
      );

      emitToBothParticipants(io, username, partner, "dm:status_update", {
        messageIds: ids.map((id) => id.toString()),
        delivered: true,
        read: true,
      });
    } catch (err) {
      console.error("Failed to mark messages read:", err.message);
    }
  });

  socket.on("disconnect", () => {
    unregisterUserSocket(username, socket.id);
  });
}

module.exports = { registerDmHandlers, onlineUsers };
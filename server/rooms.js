const RoomMessage = require("./models/RoomMessage");

const ROOMS = ["General", "Random", "Tech Talk"];

const roomUsers = {};

ROOMS.forEach((room) => {
  roomUsers[room] = new Map();
});

function addUserToRoom(room, socketId, username) {
  if (!roomUsers[room]) roomUsers[room] = new Map();
  roomUsers[room].set(socketId, username);
}

function removeUserFromRoom(room, socketId) {
  if (roomUsers[room]) roomUsers[room].delete(socketId);
}

function getUsersInRoom(room) {
  if (!roomUsers[room]) return [];
  return Array.from(roomUsers[room].values());
}

// No longer used to block joins (see chatHandlers.js — multi-session per
// account is now allowed since usernames are authenticated). Kept here in
// case you want it for something else later (e.g. a "this account is
// already active elsewhere" indicator).
function isUsernameTakenInRoom(room, username) {
  if (!roomUsers[room]) return false;
  return Array.from(roomUsers[room].values()).some(
    (u) => u.toLowerCase() === username.toLowerCase()
  );
}

function serializeRoomMessage(doc) {
  return {
    id: doc._id.toString(),
    room: doc.room,
    username: doc.username,
    type: doc.type,
    text: doc.text,
    audioUrl: doc.audioUrl || null,
    duration: doc.duration || null,
    replyTo: doc.replyTo || null,
    reactions: doc.reactions || [],
    timestamp: doc.createdAt,
  };
}

async function addMessageToRoom(room, { username, type = "text", text = "", audioUrl = null, duration = null, replyTo }) {
  const doc = await RoomMessage.create({
    room,
    username,
    type,
    text,
    audioUrl,
    duration,
    replyTo: replyTo || null,
  });
  return serializeRoomMessage(doc);
}

async function getRoomMessages(room) {
  const docs = await RoomMessage.find({ room }).sort({ createdAt: 1 }).limit(200);
  return docs.map(serializeRoomMessage);
}

async function clearRoomMessages(room) {
  await RoomMessage.deleteMany({ room });
}

// Toggle a user's reaction on a room message using a single atomic
// operation instead of findById() + mutate + save() (which was two
// round-trips to MongoDB and a possible race if two reactions landed at
// once). We figure out which of the three cases we're in with one cheap
// read, then issue exactly one write.
async function toggleRoomMessageReaction(messageId, username, emoji) {
  const existing = await RoomMessage.findOne(
    { _id: messageId, "reactions.username": username },
    { "reactions.$": 1 }
  );

  let updated;
  if (!existing) {
    // No reaction from this user yet — add it.
    updated = await RoomMessage.findByIdAndUpdate(
      messageId,
      { $push: { reactions: { username, emoji } } },
      { new: true }
    );
  } else if (existing.reactions[0].emoji === emoji) {
    // Same emoji again — remove it (un-react).
    updated = await RoomMessage.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { username } } },
      { new: true }
    );
  } else {
    // Different emoji — replace it in place.
    updated = await RoomMessage.findOneAndUpdate(
      { _id: messageId, "reactions.username": username },
      { $set: { "reactions.$.emoji": emoji } },
      { new: true }
    );
  }

  if (!updated) return null;
  return {
    room: updated.room,
    messageId: updated._id.toString(),
    reactions: updated.reactions,
  };
}

function roomExists(room) {
  return ROOMS.includes(room);
}

function addRoom(room) {
  const trimmed = room.trim();
  if (!trimmed) {
    throw new Error("Room name cannot be empty.");
  }
  if (roomExists(trimmed)) {
    throw new Error("A room with that name already exists.");
  }
  ROOMS.push(trimmed);
  roomUsers[trimmed] = new Map();
  return trimmed;
}

async function deleteRoom(room) {
  if (!roomExists(room)) {
    throw new Error("Room not found.");
  }
  const idx = ROOMS.indexOf(room);
  ROOMS.splice(idx, 1);
  delete roomUsers[room];
  await RoomMessage.deleteMany({ room });
}

module.exports = {
  ROOMS,
  addUserToRoom,
  removeUserFromRoom,
  getUsersInRoom,
  isUsernameTakenInRoom,
  addMessageToRoom,
  getRoomMessages,
  clearRoomMessages,
  toggleRoomMessageReaction,
  roomExists,
  addRoom,
  deleteRoom,
};
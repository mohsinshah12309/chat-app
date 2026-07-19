const mongoose = require("mongoose");

const replySnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

const roomMessageSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, index: true },
    username: { type: String, required: true },
    // "text" messages use `text`; "voice" messages use `audioUrl` + `duration`
    // instead, and `text` is left empty for them.
    type: { type: String, enum: ["text", "voice"], default: "text" },
    text: { type: String, default: "" },
    audioUrl: { type: String, default: null },
    duration: { type: Number, default: null }, // seconds
    replyTo: { type: replySnapshotSchema, default: null },
    reactions: { type: [reactionSchema], default: [] },
  },
  { timestamps: true }
);

roomMessageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model("RoomMessage", roomMessageSchema);
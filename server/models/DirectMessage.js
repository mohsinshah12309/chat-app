const mongoose = require("mongoose");

const replySnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true }, // ciphertext, base64
    iv: { type: String, required: true },
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

const dmSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    type: { type: String, enum: ["text", "voice"], default: "text" },
    // For type "text": ciphertext (base64) + iv — encrypted client-side via
    // Web Crypto AES-GCM before ever reaching the server. The server cannot
    // decrypt this even with full database access; it only has ciphertext.
    // For type "voice": left empty — voice notes are NOT encrypted (see
    // project README for this documented limitation).
    text: { type: String, default: "" },
    iv: { type: String, default: null },
    audioUrl: { type: String, default: null },
    duration: { type: Number, default: null },
    replyTo: { type: replySnapshotSchema, default: null },
    reactions: { type: [reactionSchema], default: [] },
    delivered: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    deletedFor: { type: [String], default: [] },
  },
  { timestamps: true }
);

dmSchema.index({ from: 1, to: 1, createdAt: 1 });

module.exports = mongoose.model("DirectMessage", dmSchema);
const express = require("express");
const DirectMessage = require("../models/DirectMessage");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const me = req.user.username;

  const messages = await DirectMessage.find({
    $or: [{ from: me }, { to: me }],
    deletedFor: { $ne: me },
  }).sort({ createdAt: -1 });

  const seen = new Map();
  for (const m of messages) {
    const partner = m.from === me ? m.to : m.from;
    if (!seen.has(partner)) {
      seen.set(partner, {
        partner,
        lastText: m.text,
        lastFrom: m.from,
        lastTimestamp: m.createdAt,
      });
    }
  }

  res.json(Array.from(seen.values()));
});

router.get("/:username", requireAuth, async (req, res) => {
  const me = req.user.username;
  const other = req.params.username;

  const messages = await DirectMessage.find({
    $or: [
      { from: me, to: other },
      { from: other, to: me },
    ],
    deletedFor: { $ne: me },
  }).sort({ createdAt: 1 });

  res.json(
    messages.map((m) => ({
      id: m._id,
      from: m.from,
      to: m.to,
      type: m.type,
      text: m.text,
      iv: m.iv,
      audioUrl: m.audioUrl || null,
      duration: m.duration || null,
      replyTo: m.replyTo || null,
      reactions: m.reactions || [],
      delivered: m.delivered,
      read: m.read,
      timestamp: m.createdAt,
    }))
  );
});

router.delete("/:username", requireAuth, async (req, res) => {
  const me = req.user.username;
  const other = req.params.username;

  const filter = {
    $or: [
      { from: me, to: other },
      { from: other, to: me },
    ],
  };

  await DirectMessage.updateMany(filter, { $addToSet: { deletedFor: me } });

  await DirectMessage.deleteMany({
    ...filter,
    deletedFor: { $all: [me, other] },
  });

  res.json({ success: true });
});

module.exports = router;
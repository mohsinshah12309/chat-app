const express = require("express");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();

router.get("/search", requireAuth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const users = await User.find({ username: { $regex: q, $options: "i" } })
    .limit(15)
    .select("username -_id");

  const results = users
    .map((u) => u.username)
    .filter((u) => u.toLowerCase() !== req.user.username.toLowerCase())
    .slice(0, 10);

  res.json(results);
});

module.exports = router;
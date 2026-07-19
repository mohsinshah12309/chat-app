const express = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Brute-force protection: after 5 failed/attempted logins from the same IP
// within 15 minutes, block further attempts and return 429 until the window
// resets. This is the standard defense against credential-stuffing/guessing
// attacks — without it, an attacker (or a script) can try unlimited password
// guesses against a known username with no friction at all.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true, // adds RateLimit-* response headers
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  // Skip counting successful logins toward the limit — only failed attempts
  // (and the request itself, since express-rate-limit counts pre-emptively)
  // count against you. We use skipSuccessfulRequests so a correct password
  // on attempt 3 doesn't itself get treated as "1 of your 5 attempts used."
  skipSuccessfulRequests: true,
});

// A looser limit on registration — mainly to stop mass automated account
// creation, not brute-forcing (there's no "correct answer" to guess here).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many accounts created from this location. Please try again later." },
});

function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json({ message: "Username and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(409).json({ message: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: username.trim(), passwordHash });

    res.status(201).json({ token: signToken(user), user: { username: user.username, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong." });
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.trim() });
    if (!user) return res.status(401).json({ message: "Invalid username or password." });

    const match = await bcrypt.compare(password || "", user.passwordHash);
    if (!match) return res.status(401).json({ message: "Invalid username or password." });

    res.json({ token: signToken(user), user: { username: user.username, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong." });
  }
});

// --- E2E encryption: public key exchange ---
// The server only ever stores/serves PUBLIC keys here — it never sees a
// private key, and therefore never has the ability to decrypt any message.

// PATCH /api/auth/public-key — upload/update this account's public key.
// Called once per browser (see client/src/hooks/useE2EEKeys.js), the first
// time that browser generates a keypair for this account.
router.patch("/public-key", requireAuth, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== "string") {
      return res.status(400).json({ message: "A public key is required." });
    }

    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not save public key." });
  }
});

// GET /api/auth/public-key/:username — fetch someone's public key so you can
// derive a shared encryption key before messaging them.
router.get("/public-key/:username", requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select("publicKey");
    if (!user || !user.publicKey) {
      return res.status(404).json({ message: "No public key found for this user." });
    }
    res.json({ publicKey: user.publicKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not fetch public key." });
  }
});

module.exports = router;
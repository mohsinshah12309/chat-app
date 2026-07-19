const express = require("express");
const multer = require("multer");
const cloudinary = require("../config/Cloudinary"); // adjust path if yours lives elsewhere
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Memory storage — the file never touches disk, we stream the buffer
// straight to Cloudinary. Fine for voice notes since they're small (a few
// hundred KB to a couple MB for a short recording).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap, plenty for a voice note
});

// POST /api/upload/voice — multipart/form-data, field name "audio"
router.post("/voice", requireAuth, upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No audio file provided." });
  }

  // Cloudinary treats audio-only files under resource_type "video" — there's
  // no separate "audio" resource type. The response still includes a real
  // `duration` field in seconds, which we use directly instead of computing
  // it client-side.
  const uploadStream = cloudinary.uploader.upload_stream(
    { resource_type: "video", folder: "chat-app/voice-notes" },
    (err, result) => {
      if (err) {
        console.error("Cloudinary voice upload failed:", err.message);
        return res.status(500).json({ message: "Upload failed." });
      }
      res.json({ url: result.secure_url, duration: result.duration });
    }
  );

  uploadStream.end(req.file.buffer);
});

module.exports = router;
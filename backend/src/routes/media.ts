// backend/src/routes/media.ts
import express from 'express';

const router = express.Router();

/**
 * Cloudinary-Era Media Route
 * Since we now use Cloudinary, we don't serve local files from C:/Users anymore.
 * This route can remain as a placeholder or be used to redirect to Cloudinary 
 * if you want to mask the actual Cloudinary URLs.
 */
router.get('/info', (req, res) => {
  res.json({
    status: "active",
    provider: "Cloudinary",
    message: "Media is now handled via Cloudinary integration."
  });
});

/**
 * If you still have code pointing to /api/media/video/:id, 
 * this redirect ensures they don't 404 but go to the cloud instead.
 * (Optional: only if you have a database lookup for the cloud URL here)
 */
router.get('/video/:id', (req, res) => {
  // In a full implementation, you'd find the video in the DB and redirect
  // res.redirect(video.videoUrl);
  res.status(410).json({ 
    error: "Local file serving is deprecated. Please use the videoUrl provided by the Video API." 
  });
});

export default router;
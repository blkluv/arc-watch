// backend/src/routes/media.ts
import express from 'express';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Serve local video files from a media directory
router.get('/video/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Set the path to your videos folder
  const videosPath = process.env.VIDEOS_PATH || 'C:/Users/worko/Videos';
  const videoPath = path.join(videosPath, filename);
  
  console.log(`📁 Serving video: ${videoPath}`);
  
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video not found: ${videoPath}`);
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;
  
  // Get file extension for content type
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.mp4' ? 'video/mp4' : 
                      ext === '.webm' ? 'video/webm' : 
                      ext === '.mov' ? 'video/quicktime' : 
                      'application/octet-stream';
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(videoPath).pipe(res);
  }
});

export default router;
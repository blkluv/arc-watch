// backend/src/routes/videos.ts

import express, { Request, Response, NextFunction } from 'express';
import { getAddress } from 'viem';
import { createVideo, getAllVideos, getVideoById } from '../services/videoService';
import { createX402Middleware, type X402Options } from '../middleware/x402';
import { generateDemoTransactions } from '../services/nanopaymentsService';
import { getTransactionStats } from '../utils/transactionLogger';
import { prisma } from '../lib/prisma';
import { Readable } from 'stream';
import { signPaymentWithCircle } from '../services/nanopaymentsService';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// 🔒 Production-safe parameter extractor
const getRouteParam = (param: string | string[] | undefined): string | undefined => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param) && param.length > 0) return param[0];
  return undefined;
};

// 🔐 Auth middleware helper
const getAuthenticatedUser = (req: Request) => {
  const sessionUser = (req as any).session?.user;
  if (sessionUser?.eoaAddress) return sessionUser;
  
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const eoaAddress = authHeader.slice(7);
    return { eoaAddress };
  }
  
  return null;
};

// POST /api/videos - Create new video


// router.post('/', async (req: Request, res: Response) => {
//   try {
//     const authenticatedUser = getAuthenticatedUser(req);
//     if (!authenticatedUser?.eoaAddress) {
//       return res.status(401).json({ error: 'Authentication required. Please connect your wallet first.' });
//     }
    
//     const { title, description, durationSeconds, chunkDuration, pricePerChunk, videoUrl } = req.body;
    
//     if (!title || !durationSeconds || !videoUrl) {
//       return res.status(400).json({ error: 'Missing required fields: title, durationSeconds, videoUrl' });
//     }
    
//     // Validate chunk duration
//     const chunkDur = parseInt(chunkDuration) || 5;
//     if (chunkDur < 5) {
//       return res.status(400).json({ error: 'Chunk duration must be at least 5 minutes' });
//     }
//     if (chunkDur > 60) {
//       return res.status(400).json({ error: 'Chunk duration cannot exceed 60 minutes' });
//     }
    
//     if (pricePerChunk && (pricePerChunk > 0.01 || pricePerChunk <= 0)) {
//       return res.status(400).json({ error: 'pricePerChunk must be > 0 and ≤ 0.01' });
//     }
    
//     const creator = await prisma.user.findUnique({
//       where: { eoaAddress: authenticatedUser.eoaAddress }
//     });
    
//     if (!creator) {
//       return res.status(401).json({ error: 'User not found. Please reconnect your wallet.' });
//     }
    
//     const video = await createVideo({ 
//       title, 
//       description, 
//       durationSeconds: parseInt(durationSeconds, 10),
//       chunkDuration: chunkDur,
//       pricePerChunk: parseFloat(pricePerChunk) || 0.001, 
//       creatorWallet: creator.eoaAddress,
//       creatorDcw: creator.dcwAddress,
//       videoUrl 
//     });
    
//     res.status(201).json({ success: true, data: video });
//   } catch (err: any) {
//     console.error('Create video error:', err);
//     res.status(500).json({ error: err.message || 'Failed to create video' });
//   }
// });

// backend/src/routes/videos.ts - Update POST endpoint

// POST /api/videos - Create new video
router.post('/', async (req: Request, res: Response) => {
  try {
    const authenticatedUser = getAuthenticatedUser(req);
    if (!authenticatedUser?.eoaAddress) {
      return res.status(401).json({ error: 'Authentication required. Please connect your wallet first.' });
    }
    
    const { 
      title, 
      description, 
      durationSeconds, 
      chunkUnit,        // ✅ 'seconds' or 'minutes'
      chunkValue,       // ✅ number
      pricePerChunk, 
      videoUrl 
    } = req.body;
    
    if (!title || !durationSeconds || !videoUrl) {
      return res.status(400).json({ error: 'Missing required fields: title, durationSeconds, videoUrl' });
    }
    
    // Calculate chunk duration in seconds
    let chunkDurationSeconds: number;
    const value = parseFloat(chunkValue) || 5;
    
    if (chunkUnit === 'minutes') {
      chunkDurationSeconds = Math.round(value * 60);
    } else {
      chunkDurationSeconds = Math.round(value);
    }
    
    // Validate
    if (chunkDurationSeconds < 5) {
      return res.status(400).json({ error: 'Chunk duration must be at least 5 seconds' });
    }
    if (chunkDurationSeconds > 3600) {
      return res.status(400).json({ error: 'Chunk duration cannot exceed 60 minutes (3600 seconds)' });
    }
    if (chunkDurationSeconds > durationSeconds) {
      return res.status(400).json({ error: 'Chunk duration cannot exceed video duration' });
    }
    
    if (pricePerChunk && (pricePerChunk > 0.01 || pricePerChunk <= 0)) {
      return res.status(400).json({ error: 'pricePerChunk must be > 0 and ≤ 0.01' });
    }
    
    const creator = await prisma.user.findUnique({
      where: { eoaAddress: authenticatedUser.eoaAddress }
    });
    
    if (!creator) {
      return res.status(401).json({ error: 'User not found. Please reconnect your wallet.' });
    }
    
    const video = await createVideo({ 
      title, 
      description, 
      durationSeconds: parseInt(durationSeconds, 10),
      chunkDurationSeconds,
      pricePerChunk: parseFloat(pricePerChunk) || 0.001, 
      creatorWallet: creator.eoaAddress,
      creatorDcw: creator.dcwAddress,
      videoUrl 
    });
    
    res.status(201).json({ success: true, data: video });
  } catch (err: any) {
    console.error('Create video error:', err);
    res.status(500).json({ error: err.message || 'Failed to create video' });
  }
});


// DELETE /api/videos/:id - Delete a video (only by creator)
router.delete('/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  // Get authenticated user
  const authenticatedUser = getAuthenticatedUser(req);
  if (!authenticatedUser?.eoaAddress) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    // Find the video
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { payments: true }
    });
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Check if the authenticated user is the creator
    if (video.creatorAddress.toLowerCase() !== authenticatedUser.eoaAddress.toLowerCase()) {
      return res.status(403).json({ error: 'You are not the creator of this video' });
    }
    
    // Delete all payments associated with this video
    const deletedPayments = await prisma.payment.deleteMany({
      where: { videoId: videoId }
    });
    
    console.log(`🗑️ Deleted ${deletedPayments.count} payments for video ${videoId}`);
    
    // Delete the video record
    await prisma.video.delete({
      where: { id: videoId }
    });
    
    // Optional: Delete the local video file if it exists
    const videoUrl = video.hlsManifestUrl;
    const isLocalFile = videoUrl.includes(':\\') || 
                        videoUrl.includes('\\\\') || 
                        videoUrl.startsWith('/') ||
                        (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://'));
    
    if (isLocalFile) {
      try {
        let normalizedPath = videoUrl.replace(/\\/g, '/');
        if (fs.existsSync(normalizedPath)) {
          fs.unlinkSync(normalizedPath);
          console.log(`🗑️ Deleted local video file: ${normalizedPath}`);
        }
      } catch (fileErr) {
        console.warn('Could not delete local file:', fileErr);
      }
    }
    
    res.json({
      success: true,
      data: {
        videoId,
        paymentsDeleted: deletedPayments.count,
        message: 'Video deleted successfully'
      }
    });
    
  } catch (err: any) {
    console.error('Delete video error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete video' });
  }
});



// GET /api/videos - Feed
router.get('/', async (req: Request, res: Response) => {
  let videos = await getAllVideos();
  const { q } = req.query;
  
  if (q && typeof q === 'string') {
    const search = q.toLowerCase();
    videos = videos.filter(v => 
      v.title.toLowerCase().includes(search) || 
      v.id.toLowerCase().includes(search) ||
      v.description?.toLowerCase().includes(search)
    );
  }
  
  res.json({ success: true, data: videos, count: videos.length });
});

// GET /api/videos/:id - Single video
router.get('/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const video = await getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  res.json({ success: true, data: video });
});

// GET /api/videos/:id/stream - Stream video with range support
router.get('/:id/stream', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) {
    console.error('❌ Missing video ID');
    return res.status(400).json({ error: 'Missing video ID' });
  }
  
  const video = await getVideoById(videoId);
  if (!video) {
    console.error(`❌ Video not found: ${videoId}`);
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const videoUrl = video.videoUrl;
  
  console.log(`📹 [STREAM] Video ID: ${videoId}`);
  console.log(`📹 [STREAM] Video URL: ${videoUrl}`);
  
  const getContentType = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.m3u8': 'application/vnd.apple.mpegurl',
      '.ts': 'video/MP2T',
    };
    return mimeTypes[ext] || 'video/mp4';
  };
  
  const isLocalFile = videoUrl.includes(':\\') || 
                      videoUrl.includes('\\\\') || 
                      videoUrl.startsWith('/') ||
                      (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://'));
  
  console.log(`📹 [STREAM] Is local file: ${isLocalFile}`);
  
  if (isLocalFile) {
    try {
      let normalizedPath = videoUrl.replace(/\\/g, '/');
      
      console.log(`📹 [STREAM] Normalized path: ${normalizedPath}`);
      console.log(`📹 [STREAM] File exists: ${fs.existsSync(normalizedPath)}`);
      
      if (!fs.existsSync(normalizedPath)) {
        console.error(`❌ File not found: ${normalizedPath}`);
        
        const alternatives = [
          normalizedPath,
          `C:/Users/${process.env.USERNAME || 'worko'}/Videos/${path.basename(normalizedPath)}`,
          `./${path.basename(normalizedPath)}`,
          path.join(process.cwd(), path.basename(normalizedPath)),
        ];
        
        let foundPath: string | null = null;
        for (const alt of alternatives) {
          if (fs.existsSync(alt)) {
            foundPath = alt;
            console.log(`✅ Found at alternative path: ${alt}`);
            break;
          }
        }
        
        if (!foundPath) {
          return res.status(404).json({ 
            error: 'Video file not found', 
            path: normalizedPath,
            alternatives: alternatives.filter(a => a !== normalizedPath),
            exists: false 
          });
        }
        
        normalizedPath = foundPath;
      }
      
      const stat = fs.statSync(normalizedPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const contentType = getContentType(normalizedPath);
      
      console.log(`📹 [STREAM] File size: ${fileSize}, Type: ${contentType}`);
      console.log(`📹 [STREAM] Range header: ${range || 'none'}`);
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        console.log(`📹 [STREAM] Range: ${start}-${end}/${fileSize}`);
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        });
        
        const stream = fs.createReadStream(normalizedPath, { start, end });
        stream.on('error', (err) => {
          console.error('❌ Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          }
        });
        stream.on('open', () => console.log(`📹 [STREAM] Stream opened for range`));
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        });
        const stream = fs.createReadStream(normalizedPath);
        stream.on('error', (err) => {
          console.error('❌ Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          }
        });
        stream.on('open', () => console.log(`📹 [STREAM] Full stream opened`));
        stream.pipe(res);
      }
    } catch (err: any) {
      console.error('❌ Local file stream error:', err);
      res.status(500).json({ error: 'Failed to stream local file', details: err.message });
    }
  } else {
    try {
      console.log(`🌐 [STREAM] Proxying remote URL: ${videoUrl}`);
      
      const fetchOptions: RequestInit = {};
      if (req.headers.range) {
        fetchOptions.headers = { Range: req.headers.range };
      }
      
      const response = await fetch(videoUrl, fetchOptions);
      
      console.log(`🌐 [STREAM] Remote response: ${response.status}`);
      
      if (response.status === 206 || response.status === 200) {
        res.status(response.status);
        
        response.headers.forEach((value, key) => {
          const lowerKey = key.toLowerCase();
          if (!lowerKey.startsWith('content-encoding') && 
              !lowerKey.startsWith('transfer-encoding')) {
            res.setHeader(key, value);
          }
        });
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        if (response.body) {
          Readable.from(response.body as any).pipe(res);
        } else {
          res.end();
        }
      } else {
        res.status(response.status).json({ error: 'Failed to fetch remote video' });
      }
    } catch (err: any) {
      console.error('❌ Remote proxy error:', err);
      res.status(502).json({ error: 'Failed to proxy remote video', details: err.message });
    }
  }
});

// GET /api/videos/debug/:id - Debug endpoint
router.get('/debug/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const video = await getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  const videoUrl = video.videoUrl;
  
  const isLocalFile = videoUrl.includes(':\\') || 
                      videoUrl.includes('\\\\') || 
                      videoUrl.startsWith('/') ||
                      (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://'));
  
  const debugInfo: any = {
    videoId,
    videoUrl,
    isLocalFile,
    title: video.title,
    durationSeconds: video.durationSeconds,
  };
  
  if (isLocalFile) {
    let normalizedPath = videoUrl.replace(/\\/g, '/');
    
    debugInfo.normalizedPath = normalizedPath;
    debugInfo.exists = fs.existsSync(normalizedPath);
    debugInfo.cwd = process.cwd();
    
    const alternatives = [
      normalizedPath,
      `C:/Users/${process.env.USERNAME || 'worko'}/Videos/${path.basename(normalizedPath)}`,
      path.join(process.cwd(), path.basename(normalizedPath)),
    ];
    
    debugInfo.alternatives = [];
    for (const alt of alternatives) {
      if (alt !== normalizedPath) {
        debugInfo.alternatives.push({
          path: alt,
          exists: fs.existsSync(alt)
        });
      }
    }
    
    if (debugInfo.exists) {
      const stat = fs.statSync(normalizedPath);
      debugInfo.fileSize = stat.size;
      debugInfo.fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);
      debugInfo.isFile = stat.isFile();
      debugInfo.dirname = path.dirname(normalizedPath);
      debugInfo.basename = path.basename(normalizedPath);
      debugInfo.extname = path.extname(normalizedPath);
      debugInfo.streamUrl = `http://localhost:3001/api/videos/${videoId}/stream`;
    }
  } else {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(videoUrl, { 
        method: 'HEAD',
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      debugInfo.remoteStatus = response.status;
      debugInfo.remoteOk = response.ok;
      debugInfo.contentType = response.headers.get('content-type');
      debugInfo.contentLength = response.headers.get('content-length');
    } catch (err: any) {
      debugInfo.remoteError = err.message;
    }
  }
  
  res.json({ success: true, data: debugInfo });
});

// POST /api/videos/:id/sign/:chunk
router.post('/:id/sign/:chunk', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  const chunkStr = getRouteParam(req.params.chunk);
  
  if (!videoId || !chunkStr) {
    return res.status(400).json({ error: 'Missing video ID or chunk index' });
  }
  
  const chunkIndex = parseInt(chunkStr, 10);
  if (isNaN(chunkIndex)) {
    return res.status(400).json({ error: 'Invalid chunk index' });
  }
  
  const authenticatedUser = getAuthenticatedUser(req);
  if (!authenticatedUser?.eoaAddress) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const video = await getVideoById(videoId);
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }
  
  const user = await prisma.user.findUnique({
    where: { eoaAddress: authenticatedUser.eoaAddress }
  });
  
  if (!user?.circleWalletId) {
    return res.status(400).json({ error: 'Circle wallet not found' });
  }
  
  try {
    const { signature, nonce, message } = await signPaymentWithCircle({
      walletId: user.circleWalletId,
      videoId,
      chunkIndex,
      priceUSD: video.pricePerChunk.toFixed(6)
    });
    
    res.json({
      success: true,
      data: { signature, nonce, message, dcwAddress: user.dcwAddress, price: video.pricePerChunk.toFixed(6) }
    });
  } catch (err: any) {
    console.error('Sign payment error:', err);
    res.status(500).json({ error: 'Failed to sign payment', details: err.message });
  }
});

// GET /api/videos/:id/paid-chunks - Get chunks user has already paid for
router.get('/:id/paid-chunks', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const eoaAddress = authHeader.slice(7);
  
  try {
    const user = await prisma.user.findUnique({
      where: { eoaAddress: getAddress(eoaAddress) }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const payments = await prisma.payment.findMany({
      where: {
        userId: user.id,
        videoId: videoId,
        status: 'VERIFIED',
      },
      select: {
        sessionIndex: true,
        amount: true,
        timestamp: true,
      },
      orderBy: {
        sessionIndex: 'asc',
      }
    });
    
    const paidChunks = payments.map(p => p.sessionIndex);
    
    res.json({
      success: true,
      data: {
        videoId,
        userId: user.id,
        eoaAddress: user.eoaAddress,
        paidChunks,
        payments: payments.map(p => ({
          chunk: p.sessionIndex,
          amount: p.amount.toString(),
          paidAt: p.timestamp,
        })),
        totalPaid: payments.reduce((sum, p) => sum + Number(p.amount), 0),
      }
    });
  } catch (err: any) {
    console.error('Get paid chunks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/videos/:id/stream/:chunk - Protected endpoint
router.post('/:id/stream/:chunk', 
  async (req: Request, res: Response, next: NextFunction) => {
    const videoId = getRouteParam(req.params.id);
    const chunkStr = getRouteParam(req.params.chunk);
    
    if (!videoId || !chunkStr) return res.status(400).json({ error: 'Missing video ID or chunk index' });
    const chunkIndex = parseInt(chunkStr, 10);
    if (isNaN(chunkIndex)) return res.status(400).json({ error: 'Invalid chunk index' });
    
    const video = await getVideoById(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    const middlewareOptions: X402Options = {
      videoId,
      chunkIndex,
      priceUSD: video.pricePerChunk.toFixed(6),
      creatorDcw: video.creatorDcw,
      creatorAddress: video.creatorWallet,
    };
    
    return createX402Middleware(middlewareOptions)(req, res, next);
  },
  async (req: Request, res: Response) => {
    const videoId = getRouteParam(req.params.id) || '';
    const chunkStr = getRouteParam(req.params.chunk) || '';
    const chunkIndex = parseInt(chunkStr, 10);
    
    const video = await getVideoById(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    res.json({
      success: true,
      data: {
        videoId,
        chunk: chunkIndex,
        unlocked: true,
        streamUrl: `/api/videos/${videoId}/stream`,
        payment: (req as any).x402Payment
      },
      message: 'Chunk unlocked'
    });
  }
);

// POST /api/videos/:id/demo-payments
router.post('/:id/demo-payments', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const { count = 50 } = req.body;
  const video = await getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  const result = await generateDemoTransactions(videoId, video.creatorDcw, parseInt(count, 10));
  res.json({ success: true, data: result });
});

// GET /api/videos/stats - Transaction analytics
router.get('/stats', (req: Request, res: Response) => {
  const stats = getTransactionStats();
  
  res.json({
    success: true,
    data: {
      ...stats,
      hackathonRequirement: {
        minTransactions: 50,
        met: stats.totalTransactions >= 50,
        progress: `${Math.min(100, Math.round(stats.totalTransactions / 50 * 100))}%`
      }
    }
  });
});

module.exports = router;
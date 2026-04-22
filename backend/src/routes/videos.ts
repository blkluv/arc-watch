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
import { put, del } from '@vercel/blob';
import multer from 'multer';
import { handleUpload } from '@vercel/blob/client';
import type { HandleUploadBody } from '@vercel/blob/client';

const router = express.Router();

// --- Vercel Blob Configuration ---
console.log('🔧 Configuring Vercel Blob...');
console.log('   BLOB_READ_WRITE_TOKEN:', process.env.BLOB_READ_WRITE_TOKEN ? 'SET' : 'MISSING');

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn('⚠️ BLOB_READ_WRITE_TOKEN missing - uploads will fail');
} else {
  console.log('✅ Vercel Blob configured successfully');
}

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB limit with Vercel Blob!
});

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

// --- ROUTES ---
// ✅ Client upload handler endpoint for Vercel Blob
router.post('/upload-token', async (req: Request, res: Response) => {
  console.log('📤 Upload token request received');
  
  try {
    const body = req.body as HandleUploadBody;
    
    // Extract clientPayload for authentication
    let eoaAddress: string | null = null;
    
    try {
      const payload = (body as any).payload?.clientPayload 
        ? JSON.parse((body as any).payload.clientPayload) 
        : null;
      eoaAddress = payload?.eoaAddress;
      console.log('📝 EOA from clientPayload:', eoaAddress);
    } catch (e) {
      console.error('Failed to parse clientPayload:', e);
    }

    if (!eoaAddress) {
      console.error('❌ No EOA address found');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { eoaAddress: getAddress(eoaAddress) }
    });

    if (!user) {
      console.error('❌ User not found:', eoaAddress);
      return res.status(401).json({ error: 'User not found.' });
    }
    console.log('✅ User authenticated:', user.eoaAddress);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({ error: 'Blob storage not configured' });
    }

    // ✅ Use environment variable or fallback
    const callbackUrl = process.env.VERCEL_BLOB_CALLBACK_URL || 
                       `${process.env.FRONTEND_URL || 'https://arcstream-backend.onrender.com'}/api/videos/upload-complete`;

    console.log('📤 Calling handleUpload...');
    console.log('   Callback URL:', callbackUrl);
    
    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const timestamp = Date.now();
        const safePath = `videos/${timestamp}-${pathname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        return {
          pathname: safePath,
          callbackUrl: callbackUrl,  // ✅ REQUIRED
          access: 'public',          // ✅ Matches your public store
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5GB
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('✅ Upload completed callback:', blob.url);
      },
    });

    console.log('✅ Upload token generated successfully');
    return res.status(200).json(jsonResponse);
  } catch (err: any) {
    console.error('❌ Upload token error:', err);
    return res.status(400).json({ error: err.message });
  }
});

// Callback endpoint
router.post('/upload-complete', async (req: Request, res: Response) => {
  console.log('📥 Upload complete callback received');
  res.status(200).json({ received: true });
});




// Confirm upload and create video record
router.post('/confirm-upload', async (req: Request, res: Response) => {
  try {
    const authenticatedUser = getAuthenticatedUser(req);
    if (!authenticatedUser?.eoaAddress) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { videoUrl, title, description, durationSeconds, chunkUnit, chunkValue, pricePerChunk } = req.body;

    // Calculate chunk duration
    let chunkDurationSeconds: number;
    const value = parseFloat(chunkValue) || 5;
    if (chunkUnit === 'minutes') {
      chunkDurationSeconds = Math.round(value * 60);
    } else {
      chunkDurationSeconds = Math.round(value);
    }

    // Validate chunk duration
    if (chunkDurationSeconds < 5) {
      return res.status(400).json({ error: 'Chunk duration must be at least 5 seconds' });
    }
    if (chunkDurationSeconds > 3600) {
      return res.status(400).json({ error: 'Chunk duration cannot exceed 60 minutes' });
    }

    // Find User in DB
    const creator = await prisma.user.findUnique({
      where: { eoaAddress: authenticatedUser.eoaAddress }
    });

    if (!creator) {
      return res.status(401).json({ error: 'User not found in database.' });
    }

    // Save to database
    const video = await createVideo({ 
      title, 
      description: description || '', 
      durationSeconds: parseInt(durationSeconds, 10),
      chunkDurationSeconds,
      pricePerChunk: parseFloat(pricePerChunk) || 0.001, 
      creatorWallet: creator.eoaAddress,
      creatorDcw: creator.dcwAddress,
      videoUrl 
    });

    res.status(201).json({ success: true, data: video });
  } catch (err: any) {
    console.error('Confirm upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. POST /api/videos - Create new video with Vercel Blob Upload (Server-side fallback)
router.post('/', upload.single('video'), async (req: Request, res: Response) => {
  console.log('\n📤 ====== UPLOAD REQUEST RECEIVED ======');
  console.log('File object:', req.file ? {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    sizeMB: (req.file.size / (1024 * 1024)).toFixed(2) + ' MB'
  } : 'MISSING');
  console.log('Body keys:', Object.keys(req.body));
  console.log('==========================================\n');

  try {
    const authenticatedUser = getAuthenticatedUser(req);
    if (!authenticatedUser?.eoaAddress) {
      console.error('❌ Authentication failed');
      return res.status(401).json({ error: 'Authentication required.' });
    }
    console.log('✅ User authenticated:', authenticatedUser.eoaAddress);

    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({ error: 'No video file uploaded. Make sure you are sending as multipart/form-data.' });
    }

    if (!req.file.buffer) {
      console.error('❌ File buffer is empty');
      return res.status(400).json({ error: 'File buffer is empty' });
    }

    const { title, description, durationSeconds, chunkUnit, chunkValue, pricePerChunk } = req.body;
    console.log('📝 Form data:', { title, description, durationSeconds, chunkUnit, chunkValue, pricePerChunk });

    // Check Vercel Blob token
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error('❌ BLOB_READ_WRITE_TOKEN missing');
      return res.status(500).json({ 
        error: 'Server configuration error: Blob storage not set up. Please set BLOB_READ_WRITE_TOKEN environment variable.' 
      });
    }

    // Upload to Vercel Blob
    const timestamp = Date.now();
    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobPath = `videos/${timestamp}-${safeFilename}`;
    
    console.log('☁️ Uploading to Vercel Blob...');
    console.log('   Path:', blobPath);
    console.log('   Size:', (req.file.size / (1024 * 1024)).toFixed(2), 'MB');
    
    const blob = await put(blobPath, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const videoUrl = blob.url;
    console.log('✅ Vercel Blob upload success:', videoUrl);

    // Calculate chunk duration
    let chunkDurationSeconds: number;
    const value = parseFloat(chunkValue) || 5;
    if (chunkUnit === 'minutes') {
      chunkDurationSeconds = Math.round(value * 60);
    } else {
      chunkDurationSeconds = Math.round(value);
    }

    // Validate chunk duration
    if (chunkDurationSeconds < 5) {
      return res.status(400).json({ error: 'Chunk duration must be at least 5 seconds' });
    }
    if (chunkDurationSeconds > 3600) {
      return res.status(400).json({ error: 'Chunk duration cannot exceed 60 minutes' });
    }

    // Find User in DB
    const creator = await prisma.user.findUnique({
      where: { eoaAddress: authenticatedUser.eoaAddress }
    });

    if (!creator) {
      console.error('❌ Creator not found in database');
      return res.status(401).json({ error: 'User not found in database.' });
    }

    // Save to database
    console.log('💾 Saving to database...');
    const video = await createVideo({ 
      title, 
      description: description || '', 
      durationSeconds: parseInt(durationSeconds, 10),
      chunkDurationSeconds,
      pricePerChunk: parseFloat(pricePerChunk) || 0.001, 
      creatorWallet: creator.eoaAddress,
      creatorDcw: creator.dcwAddress,
      videoUrl 
    });

    console.log('✅ Video saved successfully:', video.id);
    res.status(201).json({ success: true, data: video });
    
  } catch (err: any) {
    console.error('❌ Upload error:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      error: err.message || 'Failed to upload and create video',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Test endpoint for Vercel Blob
router.get('/test-blob', async (req: Request, res: Response) => {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    res.json({ 
      success: true, 
      message: 'Vercel Blob check',
      config: {
        token: token ? 'SET (starts with ' + token.substring(0, 15) + '...)' : 'MISSING',
      }
    });
  } catch (err: any) {
    res.status(500).json({ 
      success: false, 
      error: err.message,
      config: {
        token: process.env.BLOB_READ_WRITE_TOKEN ? 'SET' : 'MISSING',
      }
    });
  }
});

// 2. GET /api/videos - Feed with Search
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

// 3. GET /api/videos/:id - Single video metadata
router.get('/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const video = await getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  res.json({ success: true, data: video });
});

// 4. GET /api/videos/:id/stream - Stream video (Vercel Blob Proxy)
router.get('/:id/stream', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  const video = await getVideoById(videoId!);
  if (!video) return res.status(404).json({ error: 'Video not found' });

  try {
    const fetchOptions: any = {};
    if (req.headers.range) {
      fetchOptions.headers = { Range: req.headers.range };
    }

    const response = await fetch(video.videoUrl, fetchOptions);
    
    if (response.status === 206 || response.status === 200) {
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
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
      res.status(response.status).json({ error: 'Failed to fetch video' });
    }
  } catch (err: any) {
    res.status(502).json({ error: 'Stream proxy failed', details: err.message });
  }
});

// 5. DELETE /api/videos/:id - Delete video record
router.delete('/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  const authenticatedUser = getAuthenticatedUser(req);
  if (!authenticatedUser?.eoaAddress) return res.status(401).json({ error: 'Auth required' });

  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    if (video.creatorAddress.toLowerCase() !== authenticatedUser.eoaAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Optional: Delete from Vercel Blob
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        await del(video.hlsManifestUrl, { token: process.env.BLOB_READ_WRITE_TOKEN });
        console.log('🗑️ Deleted from Vercel Blob:', video.hlsManifestUrl);
      }
    } catch (blobErr) {
      console.warn('⚠️ Could not delete from Vercel Blob:', blobErr);
    }

    await prisma.payment.deleteMany({ where: { videoId: videoId } });
    await prisma.video.delete({ where: { id: videoId } });
    
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/videos/debug/:id - Debug endpoint
router.get('/debug/:id', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  if (!videoId) return res.status(400).json({ error: 'Missing video ID' });
  
  const video = await getVideoById(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  
  res.json({ success: true, data: video });
});

// 7. POST /api/videos/:id/sign/:chunk - Circle Payment Signing
router.post('/:id/sign/:chunk', async (req: Request, res: Response) => {
  const videoId = getRouteParam(req.params.id);
  const chunkIndex = parseInt(getRouteParam(req.params.chunk) || '0', 10);
  const authenticatedUser = getAuthenticatedUser(req);

  if (!authenticatedUser?.eoaAddress) return res.status(401).json({ error: 'Auth required' });

  try {
    const video = await getVideoById(videoId!);
    const user = await prisma.user.findUnique({ where: { eoaAddress: authenticatedUser.eoaAddress } });
    
    if (!user?.circleWalletId || !video) return res.status(404).json({ error: 'Context missing' });

    const signatureData = await signPaymentWithCircle({
      walletId: user.circleWalletId,
      videoId: video.id,
      chunkIndex,
      priceUSD: video.pricePerChunk.toFixed(6)
    });
    
    res.json({ success: true, data: { ...signatureData, dcwAddress: user.dcwAddress } });
  } catch (err: any) {
    res.status(500).json({ error: 'Signing failed' });
  }
});

// 8. GET /api/videos/:id/paid-chunks - Get paid chunks
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
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const payments = await prisma.payment.findMany({
      where: { userId: user.id, videoId, status: 'VERIFIED' },
      select: { sessionIndex: true, amount: true, timestamp: true },
      orderBy: { sessionIndex: 'asc' }
    });
    
    res.json({
      success: true,
      data: {
        videoId,
        paidChunks: payments.map(p => p.sessionIndex),
        payments: payments.map(p => ({ chunk: p.sessionIndex, amount: p.amount.toString(), paidAt: p.timestamp })),
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST /api/videos/:id/stream/:chunk - Protected x402 Chunk Access
router.post('/:id/stream/:chunk', 
  async (req: Request, res: Response, next: NextFunction) => {
    const videoId = getRouteParam(req.params.id) || '';
    const chunkIndex = parseInt(getRouteParam(req.params.chunk) || '0', 10);
    const video = await getVideoById(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    return createX402Middleware({
      videoId,
      chunkIndex,
      priceUSD: video.pricePerChunk.toFixed(6),
      creatorDcw: video.creatorDcw,
      creatorAddress: video.creatorWallet,
    })(req, res, next);
  },
  (req: Request, res: Response) => {
    res.json({ success: true, unlocked: true, message: 'Chunk unlocked' });
  }
);

// 10. GET /api/videos/stats - Analytics
router.get('/stats', (req: Request, res: Response) => {
  res.json({ success: true, data: getTransactionStats() });
});

module.exports = router;

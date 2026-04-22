// backend/src/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { logTransaction, getTransactionStats } from './utils/transactionLogger';
import { getEnv } from './config/environment';

// Load and validate environment variables FIRST
dotenv.config();
const env = getEnv();

const app = express();
const PORT = env.PORT;

// Middleware
app.use(helmet({ 
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false 
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001', 
    'https://arcstream-frontend.onrender.com',
    'https://arcstream.vercel.app',
    process.env.FRONTEND_URL || ''
  ].filter(Boolean),
  credentials: true,
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
}));

// Add this middleware to set proper headers for video
app.use('/api/videos/:id/stream', (req, res, next) => {
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// ✅ INCREASE limit for Vercel Blob client upload requests
app.use('/api/videos/upload-token', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (production-ready)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'arcstream-backend',
    version: '1.0.0',
    chain: 'ARC-TESTNET',
    timestamp: new Date().toISOString(),
    nodeEnv: env.NODE_ENV
  });
});

// Routes with CommonJS interop (.default for ESM exports)
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/podcasts', require('./routes/podcasts'));
app.use('/api/media', require('./routes/media').default);
app.use('/api/auth', require('./routes/auth').default);

// Payment logging middleware wrapper
app.use((req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  
  res.json = (data: any) => {
    if ((req as any).x402Payment) {
      logTransaction({
        resource: (req as any).x402Payment.resource || req.url,
        segment: (req as any).x402Payment.chunk || 0,
        amount: (req as any).x402Payment.amount || '0',
        payer: (req as any).x402Payment.payer,
        recipient: (req as any).x402Payment.recipient,
        nonce: (req as any).x402Payment.nonce,
        chain: 'ARC-TESTNET'
      });
    }
    return originalJson(data);
  };
  
  next();
});

// Stats endpoint
app.get('/api/stats', (req: Request, res: Response) => {
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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Global error handler (MUST be last)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  const isProduction = env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { 
      stack: err.stack,
      path: req.path,
      method: req.method
    })
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 ArcStream Backend`);
  console.log(`   📡 Listening on http://0.0.0.0:${PORT}`);
  console.log(`   🔗 API Base: /api`);
  console.log(`   ⛓️  Chain: ARC-TESTNET`);
  console.log(`   🌐 Frontend: ${env.FRONTEND_URL}`);
  console.log(`   🔐 Env: ${env.NODE_ENV}`);
});

export default app;
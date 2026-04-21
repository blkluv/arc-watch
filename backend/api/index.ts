// backend/api/index.ts

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { getEnv } from '../src/config/environment';
import { logTransaction, getTransactionStats } from '../src/utils/transactionLogger';

// Load environment
dotenv.config();
const env = getEnv();

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL, 
  process.env.FRONTEND_PREVIEW_PATTERN
].filter(Boolean) as (string | RegExp)[];

if (process.env.FRONTEND_PREVIEW_PATTERN) {
  const index = allowedOrigins.indexOf(process.env.FRONTEND_PREVIEW_PATTERN);
  if (index !== -1) {
    // This turns the string into a secure Regex: ^https://arcstream-frontend-.*\.onrender\.com$
    allowedOrigins[index] = new RegExp(process.env.FRONTEND_PREVIEW_PATTERN);
  }
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'],
}));
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false 
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Video stream headers
app.use('/api/videos/:id/stream', (req, res, next) => {
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'arcstream-backend',
    version: '1.0.0',
    chain: 'ARC-TESTNET',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/wallets', require('../src/routes/wallets'));
app.use('/api/videos', require('../src/routes/videos'));
app.use('/api/auth', require('../src/routes/auth').default);

// Payment logging middleware
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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

export default app;
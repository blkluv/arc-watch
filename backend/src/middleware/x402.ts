// backend/src/middleware/x402.ts

import { Request, Response, NextFunction } from 'express';
import { parseUnits, getAddress } from 'viem';
import { generatePaymentHeaders, verifyPaymentSignature, processPayment } from '../services/nanopaymentsService';
import { getUSDCBalance } from '../services/walletService';
import { prisma } from '../lib/prisma';

export interface X402Options {
  videoId: string;
  chunkIndex: number;
  priceUSD: string;
  creatorDcw: string;
  creatorAddress?: string;
  resource?: string;
}

export function createX402Middleware(options: X402Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['x-payment-authorization'] as string | undefined;
    
    // First, check if user has already paid for this chunk
    const authUserHeader = req.headers['authorization'];
    if (authUserHeader?.startsWith('Bearer ')) {
      const eoaAddress = authUserHeader.slice(7);
      try {
        const user = await prisma.user.findUnique({
          where: { eoaAddress: getAddress(eoaAddress) }
        });
        
        if (user) {
          const existingPayment = await prisma.payment.findUnique({
            where: {
              userId_videoId_sessionIndex: {
                userId: user.id,
                videoId: options.videoId,
                sessionIndex: options.chunkIndex,
              }
            }
          });
          
          if (existingPayment && existingPayment.status === 'VERIFIED') {
            console.log(`✅ Chunk ${options.chunkIndex} already paid by ${eoaAddress}`);
            (req as any).x402Payment = {
              videoId: options.videoId,
              chunk: options.chunkIndex,
              amount: existingPayment.amount.toString(),
              recipient: options.creatorDcw,
              payer: eoaAddress,
              alreadyPaid: true,
            };
            return next();
          }
        }
      } catch (err) {
        console.error('Error checking existing payment:', err);
      }
    }
    
    // 1. If no auth header, return 402 Challenge
    if (!authHeader) {
      const headers = generatePaymentHeaders({
        videoId: options.videoId,
        chunkIndex: options.chunkIndex,
        priceUSD: options.priceUSD,
        creatorWallet: options.creatorDcw,
        resource: options.resource,
      });
      
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      
      return res.status(402).json({
        status: 402,
        error: 'Payment Required',
        message: 'Sign payment authorization and retry with X-Payment-Authorization header',
        paymentDetails: {
          resource: headers['X-Payment-Resource'],
          price: options.priceUSD,
          currency: 'USDC',
          chain: 'ARC-TESTNET',
          nonce: headers['X-Payment-Nonce'],
          maxAmountRequired: options.priceUSD,
          recipient: options.creatorDcw,
          facilitator: headers['X-Payment-Facilitator'],
        },
      });
    }

    // 2. Extract nonce from header
    const nonce = (req.headers['x-payment-nonce'] as string) || 
                  `${options.videoId}-${options.chunkIndex}-${Date.now()}`;

    // 3. Verify signature
    const verification = await verifyPaymentSignature(
      authHeader, 
      nonce, 
      options.priceUSD,
      { videoId: options.videoId, chunkIndex: options.chunkIndex }
    );
    
    if (!verification.valid) {
      return res.status(402).json({
        status: 402,
        error: 'Payment Verification Failed',
        message: verification.error,
      });
    }

    // 4. Balance check
    if (!verification.dcwAddress) {
      return res.status(500).json({ error: 'Viewer DCW not found in records' });
    }

    try {
      const balanceRes = await getUSDCBalance(verification.dcwAddress);
      
      if (!balanceRes.success || !balanceRes.balanceUSDC) {
        return res.status(500).json({ error: 'Failed to fetch viewer DCW balance' });
      }
      
      const required = parseUnits(options.priceUSD as `${number}`, 6);
      const available = parseUnits(balanceRes.balanceUSDC as `${number}`, 6);
      
      if (available < required) {
        return res.status(402).json({
          status: 402,
          error: 'Insufficient Balance',
          message: `Your DCW has ${balanceRes.balanceUSDC} USDC. Required: ${options.priceUSD} USDC.`,
          currentBalance: balanceRes.balanceUSDC,
          required: options.priceUSD,
          faucetUrl: 'https://faucet.circle.com'
        });
      }
    } catch (err: any) {
      console.error('Balance check error:', err);
      return res.status(500).json({ error: 'Balance verification failed' });
    }

    // 5. Process payment
    try {
      await processPayment({
        videoId: options.videoId,
        chunkIndex: options.chunkIndex,
        priceUSD: options.priceUSD,
        creatorWallet: options.creatorDcw,
        payerAddress: verification.payerAddress!,
        signature: verification.signature!,
        dcwWalletId: verification.dcwWalletId!,
        nonce,
      });

      (req as any).x402Payment = {
        videoId: options.videoId,
        chunk: options.chunkIndex,
        amount: options.priceUSD,
        recipient: options.creatorDcw,
        recipientIdentity: options.creatorAddress,
        payer: verification.payerAddress,
        payerDcw: verification.dcwAddress,
        nonce,
        timestamp: new Date().toISOString(),
      };

      next();
    } catch (error: any) {
      console.error('Payment processing error:', error);
      return res.status(502).json({
        status: 502,
        error: 'Payment Processing Failed',
        message: error.message || 'Gateway error during settlement',
      });
    }
  };
}

export default { createX402Middleware };
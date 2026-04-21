// backend/src/services/sessionService.ts

import prisma from '../lib/prisma';

export interface SessionCheckResult {
  hasAccess: boolean;
  sessionIndex: number;
  nextSessionIndex?: number;
  pricePerSession?: string;
  message?: string;
}

export async function hasAccessToSession(
  userId: string,
  videoId: string,
  segmentTimeSeconds: number
): Promise<SessionCheckResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { sessionDuration: true, pricePerSession: true }
  });
  
  if (!video) {
    throw new Error('Video not found');
  }

  // sessionDuration is now in seconds
  const chunkSeconds = video.sessionDuration;
  const sessionIndex = Math.floor(segmentTimeSeconds / chunkSeconds);

  const payment = await prisma.payment.findUnique({
    where: {
      userId_videoId_sessionIndex: { userId, videoId, sessionIndex },
    },
  });

  if (payment && payment.status === 'VERIFIED') {
    return {
      hasAccess: true,
      sessionIndex,
      message: `Chunk ${sessionIndex + 1} already purchased`,
    };
  }

  // Format duration for display
  const durationDisplay = chunkSeconds >= 60 
    ? `${chunkSeconds / 60} minute${chunkSeconds >= 120 ? 's' : ''}`
    : `${chunkSeconds} second${chunkSeconds !== 1 ? 's' : ''}`;

  return {
    hasAccess: false,
    sessionIndex,
    nextSessionIndex: sessionIndex,
    pricePerSession: video.pricePerSession.toString(),
    message: `Payment required for chunk ${sessionIndex + 1} (${durationDisplay})`,
  };
}

export async function recordPayment({
  userId, videoId, sessionIndex, txHash, amount, nonce,
}: {
  userId: string;
  videoId: string;
  sessionIndex: number;
  txHash?: string;
  amount: string;
  nonce?: string;
}) {
  try {
    const payment = await prisma.payment.create({
      data: {
        userId, videoId, sessionIndex, txHash,
        amount: parseFloat(amount), nonce,
        status: 'VERIFIED',
      },
    });
    return { success: true, payment };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { 
        success: true, 
        message: 'Chunk already paid',
        existing: await prisma.payment.findUnique({
          where: { userId_videoId_sessionIndex: { userId, videoId, sessionIndex } }
        })
      };
    }
    console.error('Failed to record payment:', error);
    return { success: false, error: error.message };
  }
}

export async function getUserPaidSessions(userId: string, videoId: string) {
  const payments = await prisma.payment.findMany({
    where: { userId, videoId, status: 'VERIFIED' },
    select: { sessionIndex: true, amount: true, timestamp: true },
    orderBy: { sessionIndex: 'asc' },
  });
  
  return payments.map(p => ({
    sessionIndex: p.sessionIndex,
    amount: p.amount.toString(),
    paidAt: p.timestamp,
  }));
}
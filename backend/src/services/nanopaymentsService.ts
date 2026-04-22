// backend/src/services/nanopaymentsService.ts

import { getAddress, recoverMessageAddress } from 'viem';
import { prisma } from '../lib/prisma.js';
import { circleConfig } from '../config/circle.js';
import { getWalletsClient } from './walletService.js';

const ARC_CHAIN_ID = '5042002';

export interface NanopaymentRequest {
  videoId: string;
  chunkIndex: number;
  priceUSD: string;
  creatorWallet: string;
  payerAddress: string;
  signature: string;
  dcwWalletId: string;
  nonce: string;
}

export interface PaymentVerificationResult {
  valid: boolean;
  error?: string;
  payerAddress?: string;
  dcwAddress?: string;
  dcwWalletId?: string | null;
  signature?: string;
}

function usdcToMicroUnits(amountUSD: string): string {
  const amount = parseFloat(amountUSD);
  if (isNaN(amount)) throw new Error(`Invalid USDC amount: ${amountUSD}`);
  return Math.round(amount * 1_000_000).toString();
}

export function generatePaymentHeaders(options: {
  videoId: string;
  chunkIndex: number;
  priceUSD: string;
  creatorWallet: string;
  resource?: string;
}) {
  const resource = options.resource || `video:${options.videoId}:chunk:${options.chunkIndex}`;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  
  return {
    'X-Payment-Required': 'true',
    'X-Payment-Resource': resource,
    'X-Payment-Price': options.priceUSD,
    'X-Payment-Nonce': nonce,
    'X-Payment-Max-Amount': options.priceUSD,
    'X-Creator-Wallet': options.creatorWallet,
    'X-Payment-Facilitator': 'https://facilitator.x402.org',
    'X-Payment-Chain-Id': ARC_CHAIN_ID,
  };
}

export async function signPaymentWithCircle(options: {
  walletId: string;
  videoId: string;
  chunkIndex: number;
  priceUSD: string;
}) {
  const resource = `video:${options.videoId}:chunk:${options.chunkIndex}`;
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const message = `x402:${ARC_CHAIN_ID}:${resource}:${options.priceUSD}:${nonce}`;

  const client = getWalletsClient();
  
  const response = await client.signMessage({
    walletId: options.walletId,
    message,
  });

  if (!response.data?.signature) {
    throw new Error('SDK signMessage returned no signature');
  }

  return {
    signature: response.data.signature,
    nonce,
    message
  };
}

export async function verifyPaymentSignature(
  authHeader: string,
  nonce: string,
  expectedPrice: string,
  context?: { videoId: string; chunkIndex: number }
): Promise<PaymentVerificationResult> {
  try {
    const parts = authHeader.split(':');
    if (parts.length < 2) return { valid: false, error: 'Invalid Header Format' };
    const [signature, providedAddress] = parts; // ✅ Extract provided address
    
    const resource = context 
      ? `video:${context.videoId}:chunk:${context.chunkIndex}`
      : `video:unknown:chunk:0`;
    
    const message = `x402:${ARC_CHAIN_ID}:${resource}:${expectedPrice}:${nonce}`;
    
    // Recover signer from signature
    const recoveredSigner = getAddress(await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    }));

    console.log('🔐 Signature Verification:');
    console.log('   Message:', message);
    console.log('   Signature:', signature.slice(0, 20) + '...');
    console.log('   Provided address:', providedAddress);
    console.log('   Recovered signer:', recoveredSigner);

    // ✅ Try multiple ways to find the user
    let user = await prisma.user.findFirst({
      where: { 
        OR: [
          { dcwAddress: { equals: recoveredSigner, mode: 'insensitive' } },
          { dcwAddress: { equals: providedAddress, mode: 'insensitive' } },
          { eoaAddress: { equals: recoveredSigner, mode: 'insensitive' } },
        ]
      }
    });

    // If still not found, try case-insensitive search
    if (!user) {
      console.log('⚠️ Direct match failed, trying case-insensitive search...');
      const allUsers = await prisma.user.findMany();
      user = allUsers.find(u => 
        u.dcwAddress.toLowerCase() === recoveredSigner.toLowerCase() ||
        u.dcwAddress.toLowerCase() === providedAddress?.toLowerCase() ||
        u.eoaAddress.toLowerCase() === recoveredSigner.toLowerCase()
      ) || null;
    }

    if (!user) {
      console.error(`❌ Signer not recognized. Recovered: ${recoveredSigner}, Provided: ${providedAddress}`);
      const allUsers = await prisma.user.findMany();
      console.error('   Available DCWs in DB:', allUsers.map(u => u.dcwAddress));
      return { valid: false, error: `Signer not recognized. Please reconnect your wallet.` };
    }

    console.log('✅ User found:', user.eoaAddress, 'DCW:', user.dcwAddress);

    return {
      valid: true,
      payerAddress: user.eoaAddress,
      dcwAddress: user.dcwAddress,
      dcwWalletId: user.circleWalletId ?? undefined,
      signature,
    };
  } catch (err: any) {
    console.error('Signature recovery failed:', err.message);
    return { valid: false, error: err.message };
  }
}

export async function processPayment(request: NanopaymentRequest) {
  try {
    const payer = await prisma.user.findUnique({
      where: { eoaAddress: getAddress(request.payerAddress) }
    });

    if (!payer) {
      throw new Error(`Payer not found: ${request.payerAddress}`);
    }

    const existingPayment = await prisma.payment.findUnique({
      where: {
        userId_videoId_sessionIndex: {
          userId: payer.id,
          videoId: request.videoId,
          sessionIndex: request.chunkIndex,
        }
      }
    });

    if (existingPayment && existingPayment.status === 'VERIFIED') {
      console.log(`✅ Payment already exists for chunk ${request.chunkIndex}, skipping transfer`);
      return { 
        success: true, 
        alreadyPaid: true,
        message: 'Chunk already paid for'
      };
    }

    const client = getWalletsClient();
    
    const amountInMicroUnits = usdcToMicroUnits(request.priceUSD);
    
    console.log(`💰 Processing payment: ${request.priceUSD} USDC (${amountInMicroUnits} micro-units)`);
    console.log(`   From: ${request.dcwWalletId}`);
    console.log(`   To: ${request.creatorWallet}`);
    
    // Use type assertion for blockchain parameter
    const response = await client.createContractExecutionTransaction({
      walletId: request.dcwWalletId,
      blockchain: 'ARC-TESTNET',
      contractAddress: circleConfig.usdcContractAddress,
      abiFunctionSignature: 'transfer(address,uint256)',
      abiParameters: [request.creatorWallet, amountInMicroUnits],
      fee: {
        type: 'level',
        config: {
          feeLevel: 'MEDIUM'
        }
      },
    } as any);

    const transferId = response.data?.id;
    if (!transferId) {
      throw new Error('No transaction ID returned');
    }
    
    console.log(`   Transfer ID: ${transferId}`);
    
    let txHash: string | null = null;
    let txComplete = false;
    
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        const txStatus = await client.getTransaction({ id: transferId });
        const state = txStatus.data?.transaction?.state;
        txHash = txStatus.data?.transaction?.txHash || txHash;
        
        if (i % 5 === 0) {
          console.log(`   Payment state: ${state} (${i * 3}s)`);
        }
        
        if (state === 'COMPLETE' || state === 'CONFIRMED') {
          txComplete = true;
          console.log(`✅ Payment confirmed! TX: ${txHash}`);
          break;
        }
        
        if (state === 'FAILED') {
          const errorReason = txStatus.data?.transaction?.errorReason || 'Unknown error';
          throw new Error(`Payment failed: ${errorReason}`);
        }
      } catch (pollErr: any) {
        console.error('Poll error:', pollErr.message);
      }
    }

    if (!txComplete) {
      console.warn(`⚠️ Payment confirmation timed out, but transaction may still complete`);
    }

    if (existingPayment) {
      await prisma.payment.update({
        where: {
          userId_videoId_sessionIndex: {
            userId: payer.id,
            videoId: request.videoId,
            sessionIndex: request.chunkIndex,
          }
        },
        data: {
          txHash: txHash || transferId,
          amount: parseFloat(request.priceUSD),
          nonce: request.nonce,
          status: txComplete ? 'VERIFIED' : 'PENDING',
          timestamp: new Date(),
        }
      });
    } else {
      await prisma.payment.create({
        data: {
          userId: payer.id,
          videoId: request.videoId,
          sessionIndex: request.chunkIndex,
          amount: parseFloat(request.priceUSD),
          txHash: txHash || transferId,
          nonce: request.nonce,
          status: txComplete ? 'VERIFIED' : 'PENDING',
        }
      });
    }

    console.log(`💰 [x402] Success: ${request.priceUSD} USDC moved to ${request.creatorWallet}`);
    return { success: true, transferId, txHash };
    
  } catch (err: any) {
    console.error('Payment Processing Error:', err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

export async function generateDemoTransactions(videoId: string, creatorDcw: string, count: number) {
  console.log(`📝 Note: generateDemoTransactions creates DB records only for testing.`);
  console.log(`   Real payments use processPayment() which does actual on-chain transfers.`);
  
  let createdCount = 0;
  
  const testUser = await prisma.user.findFirst();
  
  for (let i = 0; i < count; i++) {
    if (testUser) {
      await prisma.payment.create({
        data: {
          userId: testUser.id,
          videoId: videoId,
          sessionIndex: i,
          amount: 0.001,
          status: 'VERIFIED',
        }
      });
    } else {
      await prisma.payment.create({
        data: {
          userId: 'demo-user',
          videoId: videoId,
          sessionIndex: i,
          amount: 0.001,
          status: 'VERIFIED',
        }
      });
    }
    createdCount++;
  }
  return { success: true, generated: createdCount };
}
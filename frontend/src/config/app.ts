// frontend/src/config/app.ts

export type AppConfig = {
  apiUrl: string;
  appUrl: string;
  circle: {
    chain: 'ARC-TESTNET' | 'ARC-MAINNET';
    chainId: number;
    usdcContract: string;
    rpcUrl: string;
    facilitatorUrl: string;
  };
  pricing: {
    minChunkSeconds: number;
    maxChunkSeconds: number;
    defaultChunkSeconds: number;
    maxPricePerChunk: number;
  };
  ui: {
    balanceRefreshInterval: number;
    paymentRetryDelay: number;
  };
};

export const appConfig: AppConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  circle: {
    chain: 'ARC-TESTNET',
    chainId: 5042002,
    usdcContract: process.env.NEXT_PUBLIC_USDC_CONTRACT || '0x3600000000000000000000000000000000000000',
    rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network',
    facilitatorUrl: process.env.NEXT_PUBLIC_X402_FACILITATOR || 'https://facilitator.x402.org'
  },
  pricing: {
    minChunkSeconds: 5,
    maxChunkSeconds: 3600,
    defaultChunkSeconds: 300, // 5 minutes default
    maxPricePerChunk: 0.01
  },
  ui: {
    balanceRefreshInterval: 15000,
    paymentRetryDelay: 2000
  }
} as const;

export const formatUSDC = (amount: number | string): string => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toFixed(6);
};

export const formatDuration = (seconds: number): string => {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (secs === 0) {
      return `${mins} min${mins !== 1 ? 's' : ''}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${seconds} sec${seconds !== 1 ? 's' : ''}`;
};

export const calculateVideoChunks = (
  durationSeconds: number, 
  chunkDurationSeconds: number
): { chunkSeconds: number; totalChunks: number } => {
  const totalChunks = Math.ceil(durationSeconds / chunkDurationSeconds);
  return { chunkSeconds: chunkDurationSeconds, totalChunks };
};

export default appConfig;
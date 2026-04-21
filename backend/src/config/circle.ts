// backend/src/config/circle.ts

import { getEnv } from './environment';
import { defineChain } from 'viem';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: [getEnv().ARC_RPC_URL] },
    public: { http: [getEnv().ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
});

const apiKey = getEnv().CIRCLE_API_KEY;
const entitySecret = getEnv().CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  throw new Error('Circle API configuration missing: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set');
}

export const circleConfig = {
  apiKey,
  entitySecret,
  // ✅ CORRECT TOKEN ID FOR ARC TESTNET USDC
  usdcTokenId: '3c90c3cc-0d44-4b50-8888-8dd25736052a',
  rpcUrl: getEnv().ARC_RPC_URL,
  usdcContractAddress: getEnv().USDC_CONTRACT_ADDRESS as `0x${string}`,
  facilitatorUrl: getEnv().X402_FACILITATOR_URL,
  frontendUrl: getEnv().FRONTEND_URL,
} as const;

export default circleConfig;
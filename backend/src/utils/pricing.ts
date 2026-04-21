export interface PricingConfig {
  chunkSeconds: number;
  pricePerChunk: number;
  currency: string;
  chain: string;
}

export function calculateChunks(durationSeconds: number, pricingModel: 'per_5s' | 'per_minute', price: number) {
  const chunkSec = pricingModel === 'per_5s' ? 5 : 60;
  const chunks = Math.ceil(durationSeconds / chunkSec);
  const totalCost = (chunks * price).toFixed(6);
  return { chunkSec, chunks, pricePerChunk: price.toFixed(6), totalCost };
}

export function generatePaymentRequest(videoId: string, chunkIndex: number, pricePerChunk: number) {
  return {
    resource: `video:${videoId}:chunk:${chunkIndex}`,
    price: pricePerChunk.toFixed(6),
    currency: 'USDC',
    chain: 'ARC-TESTNET',
    nonce: `${videoId}-${chunkIndex}-${Date.now()}`,
    maxAmountRequired: pricePerChunk.toFixed(6)
  };
}

export function validateBalanceForSession(balanceUSDC: string, totalCost: string) {
  return parseFloat(balanceUSDC) >= parseFloat(totalCost);
}

module.exports = { calculateChunks, generatePaymentRequest, validateBalanceForSession };

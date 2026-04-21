// frontend/src/lib/api.ts
import axios, { AxiosInstance } from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const ARC_CHAIN_ID = '5042002'; 

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export interface PaymentDetails {
  resource: string;
  price: string;
  currency: 'USDC';
  chain: 'ARC-TESTNET';
  nonce: string;
  maxAmountRequired: string;
  recipient: string;
  facilitator?: string;
}

export interface SignedPayment {
  signature: string;
  paymentDetails: PaymentDetails;
  payerAddress: string;
}

export const authAPI = {
  getNonce: (address: string) => api.get(`/auth/nonce?address=${address}`),
  linkWallet: (data: any) => api.post('/auth/link', data),
};

export const walletAPI = {
  getState: (address: string) => api.get(`/wallets/${address}/state`),
  deploy: (address: string) => api.post('/wallets/deploy', { address }),
};


// export const videoAPI = {
//   list: (q?: string) => api.get(`/videos${q ? `?q=${q}` : ''}`),
//   getVideo: (id: string) => api.get(`/videos/${id}`),
  
//   create: (payload: any, eoaAddress: string) => 
//     api.post('/videos', payload, {
//       headers: { Authorization: `Bearer ${eoaAddress}` }
//     }),
  
//   signChunk: (videoId: string, chunkIndex: number, eoaAddress: string) => 
//     api.post(`/videos/${videoId}/sign/${chunkIndex}`, {}, {
//       headers: { Authorization: `Bearer ${eoaAddress}` }
//     }),
  
//   requestChunkAccess: (videoId: string, chunkIndex: number, signedPayment?: SignedPayment) => {
//     const headers: Record<string, string> = {};
//     if (signedPayment) {
//       headers['X-Payment-Authorization'] = `${signedPayment.signature}:${signedPayment.payerAddress}`;
//       headers['X-Payment-Nonce'] = signedPayment.paymentDetails.nonce;
//       headers['X-Payment-Price'] = signedPayment.paymentDetails.price;
//       headers['X-Creator-Wallet'] = signedPayment.paymentDetails.recipient;
//     }
//     return api.post(`/videos/${videoId}/stream/${chunkIndex}`, {}, { headers });
//   },
  
//   // ✅ NEW: Get paid chunks for a video
//   getPaidChunks: (videoId: string, eoaAddress: string) =>
//     api.get(`/videos/${videoId}/paid-chunks`, {
//       headers: { Authorization: `Bearer ${eoaAddress}` }
//     }),
// };


// frontend/src/lib/api.ts

export const videoAPI = {
  list: (q?: string) => api.get(`/videos${q ? `?q=${q}` : ''}`),
  
  getVideo: (id: string) => api.get(`/videos/${id}`),
  
  create: (payload: any, eoaAddress: string) => 
    api.post('/videos', payload, {
      headers: { Authorization: `Bearer ${eoaAddress}` }
    }),
  
  // ✅ NEW: Delete video
  delete: (videoId: string, eoaAddress: string) =>
    api.delete(`/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${eoaAddress}` }
    }),
  
  signChunk: (videoId: string, chunkIndex: number, eoaAddress: string) => 
    api.post(`/videos/${videoId}/sign/${chunkIndex}`, {}, {
      headers: { Authorization: `Bearer ${eoaAddress}` }
    }),
  
  requestChunkAccess: (videoId: string, chunkIndex: number, signedPayment?: SignedPayment) => {
    const headers: Record<string, string> = {};
    if (signedPayment) {
      headers['X-Payment-Authorization'] = `${signedPayment.signature}:${signedPayment.payerAddress}`;
      headers['X-Payment-Nonce'] = signedPayment.paymentDetails.nonce;
      headers['X-Payment-Price'] = signedPayment.paymentDetails.price;
      headers['X-Creator-Wallet'] = signedPayment.paymentDetails.recipient;
    }
    return api.post(`/videos/${videoId}/stream/${chunkIndex}`, {}, { headers });
  },
  
  getPaidChunks: (videoId: string, eoaAddress: string) =>
    api.get(`/videos/${videoId}/paid-chunks`, {
      headers: { Authorization: `Bearer ${eoaAddress}` }
    }),
};

export const x402Utils = {
  parsePaymentDetails: (response: any): PaymentDetails | null => {
    const headers = response?.headers || {};
    const body = response?.data || {};
    const details = body.paymentDetails || body || {};
    
    if (headers['x-payment-required'] !== 'true' && response?.status !== 402) return null;
    
    return {
      resource: headers['x-payment-resource'] || details.resource || '',
      price: headers['x-payment-price'] || details.price || '0.001',
      currency: 'USDC',
      chain: 'ARC-TESTNET',
      nonce: headers['x-payment-nonce'] || details.nonce || '',
      maxAmountRequired: headers['x-payment-max-amount'] || details.maxAmountRequired || headers['x-payment-price'] || '0.001',
      recipient: headers['x-creator-wallet'] || details.recipient || '',
      facilitator: headers['x-payment-facilitator'] || details.facilitator || 'https://facilitator.x402.org',
    };
  },
};

export default api;
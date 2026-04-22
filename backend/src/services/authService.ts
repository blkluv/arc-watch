// backend/src/services/authService.ts

import { SiweMessage } from 'siwe';
import { getAddress, verifyMessage } from 'viem';
import { getWalletsClient } from './walletService';
import { prisma } from '../lib/prisma';

const NONCE_CACHE = new Map<string, { nonce: string; expires: number }>();

export function generateAuthNonce(eoa: string): string {
  const normalized = eoa.toLowerCase();
  const nonce = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  NONCE_CACHE.set(normalized, { nonce, expires: Date.now() + 5 * 60 * 1000 });
  return nonce;
}

export async function authenticateAndLink(
  eoa: string,
  signature: string,
  nonce: string,
  message: string
): Promise<{ eoa: string; dcwAddress: string; isNew: boolean }> {
  
  console.log('🔐 authenticateAndLink called for:', eoa);
  
  const checksummed = getAddress(eoa);

  // 1. Verify Nonce
  const cached = NONCE_CACHE.get(eoa.toLowerCase());
  if (!cached || cached.nonce !== nonce) {
    console.error('❌ Invalid nonce');
    throw new Error('Invalid nonce');
  }

  // 2. Verify SIWE
  try {
    const siweMessage = new SiweMessage(message);
    const isValid = await verifyMessage({
      address: checksummed as `0x${string}`,
      message: message,
      signature: signature as `0x${string}`
    });

    if (!isValid) {
      console.error('❌ Signature verification failed');
      throw new Error('Signature failed');
    }
    console.log('✅ Signature verified');
  } catch (err: any) {
    console.error('❌ SIWE verification error:', err.message);
    throw new Error('Signature verification failed: ' + err.message);
  }

  // 3. DB Lookup / Create
  let user = await prisma.user.findUnique({ where: { eoaAddress: checksummed } });
  
  if (!user) {
    console.log('🆕 Creating new user with Circle DCW...');
    
    try {
      const client = getWalletsClient();
      
      // Create wallet set
      console.log('   Creating wallet set...');
      const walletSet = await client.createWalletSet({ 
        name: `ArcStream-${checksummed.slice(0, 8)}` 
      });
      console.log('   Wallet set created:', walletSet.data?.walletSet?.id);
      
      // Create wallet
      console.log('   Creating SCA wallet...');
      const wallets = await client.createWallets({
        blockchains: ['ARC-TESTNET'],
        count: 1,
        walletSetId: walletSet.data!.walletSet!.id,
        accountType: 'SCA',
      });
      
      const dcw = wallets.data!.wallets![0];
      console.log('   ✅ Wallet created:', dcw.address);

      // Save to database
      user = await prisma.user.create({
        data: {
          eoaAddress: checksummed,
          dcwAddress: dcw.address!,
          circleWalletId: dcw.id!,
        },
      });
      
      console.log(`✅ User saved to database: ${user.id}`);
      return { eoa: checksummed, dcwAddress: user.dcwAddress, isNew: true };
      
    } catch (err: any) {
      console.error('❌ Circle wallet creation failed:', err.message);
      console.error('Full error:', err);
      throw new Error('Failed to create Circle wallet: ' + err.message);
    }
  }

  console.log('✅ Existing user found:', user.id);
  return { eoa: user.eoaAddress, dcwAddress: user.dcwAddress, isNew: false };
}
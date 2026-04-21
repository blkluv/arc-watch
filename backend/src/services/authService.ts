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
  
  const checksummed = getAddress(eoa);

  // 1. Verify Nonce
  const cached = NONCE_CACHE.get(eoa.toLowerCase());
  if (!cached || cached.nonce !== nonce) throw new Error('Invalid nonce');

  // 2. Verify SIWE
  const siweMessage = new SiweMessage(message);
  const isValid = await verifyMessage({
    address: checksummed as `0x${string}`,
    message: message,
    signature: signature as `0x${string}`
  });

  if (!isValid) throw new Error('Signature failed');

  // 3. DB Lookup / Create
  let user = await prisma.user.findUnique({ where: { eoaAddress: checksummed } });
  
  if (!user) {
    // Create Circle DCW with SCA account type
    const client = getWalletsClient();
    const walletSet = await client.createWalletSet({ name: `ArcStream-${checksummed.slice(0, 8)}` });
    const wallets = await client.createWallets({
      blockchains: ['ARC-TESTNET'],
      count: 1,
      walletSetId: walletSet.data!.walletSet!.id,
      accountType: 'SCA', // ✅ Use SCA for Arc Testnet
    });

    const dcw = wallets.data!.wallets![0];

    user = await prisma.user.create({
      data: {
        eoaAddress: checksummed,
        dcwAddress: dcw.address!,
        circleWalletId: dcw.id!,
      },
    });
    
    console.log(`✅ Created new SCA wallet for ${checksummed}: ${dcw.address}`);
    return { eoa: checksummed, dcwAddress: user.dcwAddress, isNew: true };
  }

  return { eoa: user.eoaAddress, dcwAddress: user.dcwAddress, isNew: false };
}
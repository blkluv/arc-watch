// backend/test-siwe.ts
import { SiweMessage } from 'siwe';
import { getAddress } from 'viem';

// Replace these with values from your browser console/network tab
const TEST = {
  address: '0x644429776367A1bDd8350D99897726B295D8fBcc',
  nonce: '3vyi3z5y2kmo4asla5',
  signature: '0x3c08dc6f4dbf672b72a0468caaa18c10792b886de366e59426f7acb0952172b6214dcb0b4ac7ec9d1e43f1cb5dd46629c1572c057a5f52c0ceb5cfe81175b76f1c',
  frontendUrl: 'http://localhost:3000',
  chainId: 5042002,
};

async function test() {
  const checksummed = getAddress(TEST.address);
  
  const siweMessage = new SiweMessage({
    domain: new URL(TEST.frontendUrl).host,
    address: checksummed,
    statement: 'Sign in with Ethereum to access ArcStream',
    uri: TEST.frontendUrl,
    version: '1',
    chainId: TEST.chainId,
    nonce: TEST.nonce,
  });
  
  console.log('Prepared message:', siweMessage.toMessage());
  
  try {
    await siweMessage.verify({ signature: TEST.signature as `0x${string}` });
    console.log('✅ Verification succeeded!');
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
  }
}

test();
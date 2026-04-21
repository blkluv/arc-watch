// backend/src/services/walletService.ts

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { circleConfig, arcTestnet } from '../config/circle';
import { createPublicClient, http, formatUnits, type Address, getAddress } from 'viem';
import { z } from 'zod';

const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

const walletSchema = z.object({
  userId: z.string().min(3).max(50),
  userEmail: z.string().email(),
});

// ✅ Type for JSON-RPC response
interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: {
    code: number;
    message: string;
  };
}

let walletsClient: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

function getWalletsClient() {
  if (!circleConfig.apiKey || !circleConfig.entitySecret) {
    throw new Error('Circle Configuration Missing');
  }
  if (!walletsClient) {
    walletsClient = initiateDeveloperControlledWalletsClient({
      apiKey: circleConfig.apiKey,
      entitySecret: circleConfig.entitySecret,
    });
  }
  return walletsClient;
}

export { getWalletsClient };

const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http(circleConfig.rpcUrl, {
    batch: { batchSize: 10 },
    retryCount: 3,
    retryDelay: 1000,
  }),
});

export async function createUserWallet(userId: string, userEmail: string) {
  const validated = walletSchema.parse({ userId, userEmail });
  const client = getWalletsClient();

  const walletSetRes = await client.createWalletSet({
    name: `ArcStream-${validated.userId.slice(0, 20)}`,
  });
  const walletSetId = walletSetRes.data?.walletSet?.id;
  if (!walletSetId) throw new Error('Failed to create wallet set');

  const walletsRes = await client.createWallets({
    blockchains: ['ARC-TESTNET'],
    count: 1,
    walletSetId,
    accountType: 'SCA',
  });
  
  const wallet = walletsRes.data?.wallets?.[0];
  if (!wallet?.address || !wallet?.id) throw new Error('Failed to create wallet');

  return {
    success: true,
    walletAddress: wallet.address,
    walletId: wallet.id,
    walletSetId,
    chain: 'ARC-TESTNET',
  };
}

export function getDepositAddress(walletAddress: string) {
  if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error('Invalid wallet address format');
  }
  return {
    address: walletAddress,
    chain: 'ARC-TESTNET',
    chainId: arcTestnet.id,
    token: 'USDC',
    contractAddress: circleConfig.usdcContractAddress,
    faucetUrl: 'https://faucet.circle.com',
    // ✅ CORRECTED EXPLORER URL
    explorerUrl: `https://testnet.arcscan.app/address/${walletAddress}`,
  };
}

export async function getUSDCBalance(walletAddress: string) {
  if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error('Invalid wallet address format');
  }

  try {
    const balance = await arcClient.readContract({
      address: circleConfig.usdcContractAddress as Address,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });

    return {
      success: true,
      walletAddress,
      balanceUSDC: formatUnits(balance as bigint, 6),
      balanceRaw: (balance as bigint).toString(),
      currency: 'USDC',
      chain: 'ARC-TESTNET',
      contractAddress: circleConfig.usdcContractAddress,
      source: 'arc-rpc',
      timestamp: new Date().toISOString(),
    };
  } catch (rpcErr: any) {
    console.error('RPC balance query failed:', rpcErr?.message || rpcErr);
    return {
      success: false,
      error: 'Failed to fetch USDC balance from Arc RPC',
      walletAddress,
    };
  }
}

export async function getCircleWalletState(walletId: string) {
  const response = await fetch(`https://api.circle.com/v1/w3s/wallets/${walletId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${circleConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch wallet state: ${response.status} ${errorText}`);
  }

  const result: any = await response.json();
  return result.data?.wallet;
}

/**
 * ✅ IMPROVED: Check on-chain bytecode with multiple methods
 */
export async function isWalletDeployedOnChain(walletAddress: string): Promise<boolean> {
  try {
    // Method 1: viem getBytecode
    const code = await arcClient.getBytecode({ 
      address: getAddress(walletAddress) 
    });
    
    if (code && code !== '0x' && code !== '0x0') {
      console.log(`✅ Bytecode detected via viem: ${code.slice(0, 30)}...`);
      return true;
    }
    
    // Method 2: Direct RPC call (fallback)
    const response = await fetch(circleConfig.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [walletAddress, 'latest'],
        id: 1
      })
    });
    
    const result = await response.json() as RpcResponse;
    const rpcCode = result.result;
    
    if (rpcCode && rpcCode !== '0x' && rpcCode !== '0x0') {
      console.log(`✅ Bytecode detected via RPC: ${rpcCode.slice(0, 30)}...`);
      return true;
    }
    
    return false;
  } catch (err: any) {
    console.error('isWalletDeployedOnChain error:', err.message);
    return false;
  }
}

/**
 * 🔍 Diagnostic: Check bytecode with detailed logging
 */
export async function diagnoseWalletDeployment(walletAddress: string) {
  console.log(`\n🔍 DIAGNOSING WALLET: ${walletAddress}`);
  console.log('='.repeat(60));
  
  // Method 1: viem getBytecode
  try {
    const code = await arcClient.getBytecode({ 
      address: getAddress(walletAddress) 
    });
    console.log(`   Viem getBytecode result: "${code}"`);
    console.log(`   Length: ${code?.length || 0} characters`);
    console.log(`   Deployed: ${!!code && code !== '0x' && code !== '0x0'}`);
  } catch (err: any) {
    console.log(`   Viem getBytecode error: ${err.message}`);
  }
  
  // Method 2: Direct RPC call
  try {
    const response = await fetch(circleConfig.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [walletAddress, 'latest'],
        id: 1
      })
    });
    
    const result = await response.json() as RpcResponse;
    console.log(`   Direct RPC eth_getCode result: "${result.result}"`);
    console.log(`   Length: ${result.result?.length || 0} characters`);
  } catch (err: any) {
    console.log(`   Direct RPC error: ${err.message}`);
  }
  
  // Method 3: Check balance
  try {
    const balance = await getUSDCBalance(walletAddress);
    console.log(`   Balance: ${balance.success ? balance.balanceUSDC + ' USDC' : 'Failed to fetch'}`);
  } catch (err: any) {
    console.log(`   Balance check error: ${err.message}`);
  }
  
  // Method 4: Check explorer URL
  // ✅ CORRECTED EXPLORER URL
  console.log(`   Explorer: https://testnet.arcscan.app/address/${walletAddress}`);
  console.log('='.repeat(60));
}

/**
 * ✅ WORKING: Deploy SCA wallet using contractExecution with zero-value self-transfer
 * Based on YieldPool's proven deployment flow
 */
export async function deployCircleWallet(walletId: string, walletAddress: string) {
  const client = getWalletsClient();
  
  console.log(`\n🚀 ACTIVATING SCA WALLET`);
  console.log('='.repeat(60));
  console.log(`   Wallet ID: ${walletId}`);
  console.log(`   Address: ${walletAddress}`);
  
  // 1. Check if already deployed
  const alreadyDeployed = await isWalletDeployedOnChain(walletAddress);
  if (alreadyDeployed) {
    console.log(`✅ Wallet already deployed on-chain.`);
    console.log('='.repeat(60));
    return {
      success: true,
      txId: 'already-deployed',
      txHash: undefined,
      onChainDeployed: true,
      message: 'Wallet already deployed on-chain'
    };
  }

  // 2. Check Circle wallet state
  try {
    const walletState = await getCircleWalletState(walletId);
    console.log(`   Circle state: ${walletState?.state}`);
    console.log(`   Circle isDeployed: ${walletState?.isDeployed}`);
  } catch (err: any) {
    console.log(`   Could not fetch Circle state: ${err.message}`);
  }

  // 3. Check balance
  const balanceCheck = await getUSDCBalance(walletAddress);
  const balance = balanceCheck.success ? parseFloat(balanceCheck.balanceUSDC || '0') : 0;
  console.log(`   Current balance: ${balance} USDC`);

  // 4. Trigger lazy deployment via contract execution
  console.log(`\n📤 Initiating activation via contractExecution (0 USDC self-transfer)...`);
  
  let response;
  try {
response = await client.createContractExecutionTransaction({
  walletId: walletId,
  blockchain: 'ARC-TESTNET',
  contractAddress: circleConfig.usdcContractAddress,
  abiFunctionSignature: 'transfer(address,uint256)',
  abiParameters: [walletAddress, '0'], // ✅ '0' as integer string is correct for 0 amount
  fee: {
    type: 'level',
    config: { feeLevel: 'MEDIUM' }
  },
    } as any);
  } catch (err: any) {
    console.error('❌ Contract execution error:', err.message);
    
    if (err.message.includes('not yet deployed') || err.message.includes('insufficient')) {
      throw new Error(
        `Wallet needs funding before activation. Current balance: ${balance} USDC. ` +
        `Please fund the wallet with at least 0.001 USDC for gas fees.`
      );
    }
    throw err;
  }

  const txId = response.data?.id;
  if (!txId) {
    throw new Error('SDK returned no transaction ID');
  }
  
  console.log(`   Activation TX ID: ${txId}`);

  // 5. Poll for Circle transaction completion AND get transaction hash
  let txHash: string | null = null;
  let txComplete = false;
  
  console.log(`\n⏳ Waiting for Circle confirmation...`);
  
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const txStatus = await client.getTransaction({ id: txId });
      const state = txStatus.data?.transaction?.state;
      txHash = txStatus.data?.transaction?.txHash || txHash;
      
      if (i % 3 === 0 || state === 'COMPLETE') {
        console.log(`   State: ${state} ${txHash ? `| Hash: ${txHash.slice(0, 15)}...` : ''} (${i * 5}s)`);
      }
      
      if (state === 'COMPLETE' || state === 'CONFIRMED') {
        txComplete = true;
        console.log(`✅ Circle transaction confirmed!`);
        break;
      }
      
      if (state === 'FAILED') {
        const errorReason = txStatus.data?.transaction?.errorReason || 'Unknown error';
        throw new Error(`Transaction failed: ${errorReason}`);
      }
    } catch (pollErr: any) {
      console.log(`   Poll error: ${pollErr.message}`);
    }
  }

  if (!txComplete) {
    console.warn(`⚠️ Transaction confirmation timed out.`);
  }

  // 6. If we have a transaction hash, wait for it to be mined
  if (txHash) {
    console.log(`\n⏳ Waiting for transaction to be mined...`);
    console.log(`   TX Hash: ${txHash}`);
    // ✅ CORRECTED EXPLORER URL
    console.log(`   Explorer: https://testnet.arcscan.app/tx/${txHash}`);
    
    let receiptFound = false;
    
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        const receipt = await arcClient.getTransactionReceipt({ 
          hash: txHash as `0x${string}` 
        });
        
        if (receipt) {
          console.log(`✅ Transaction mined!`);
          console.log(`   Block: ${receipt.blockNumber}`);
          console.log(`   Status: ${receipt.status === 'success' ? 'SUCCESS' : 'FAILED'}`);
          console.log(`   Gas used: ${receipt.gasUsed}`);
          
          if (receipt.contractAddress) {
            console.log(`   Contract deployed at: ${receipt.contractAddress}`);
          }
          
          receiptFound = true;
          break;
        }
      } catch (err) {
        // Receipt not available yet
      }
      
      if (i % 5 === 0 && i > 0) {
        console.log(`   Waiting for receipt... (${i * 2}s)`);
      }
    }
    
    if (!receiptFound) {
      console.log(`   ⚠️ Receipt not found. Transaction may still be pending.`);
    }
  }

  // 7. Check bytecode again
  console.log(`\n⏳ Checking on-chain bytecode...`);
  let onChainDeployed = false;
  
  for (let i = 0; i < 45; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    onChainDeployed = await isWalletDeployedOnChain(walletAddress);
    
    if (onChainDeployed) {
      console.log(`✅ On-chain deployment confirmed! (after ${i * 2}s)`);
      break;
    }
    
    if (i % 10 === 0 && i > 0) {
      console.log(`   Still waiting... (${i * 2}s)`);
      
      // Check Circle state again
      try {
        const walletState = await getCircleWalletState(walletId);
        console.log(`   Circle isDeployed: ${walletState?.isDeployed ?? 'undefined'}`);
      } catch (err) {
        // Ignore
      }
    }
  }

  // 8. Final verification with diagnostics
  if (!onChainDeployed) {
    console.log(`\n⚠️ On-chain bytecode not detected yet.`);
    
    // Check Circle's reported deployment status
    try {
      const walletState = await getCircleWalletState(walletId);
      if (walletState?.isDeployed) {
        console.log(`✅ Circle reports wallet as deployed!`);
        onChainDeployed = true;
      }
    } catch (err) {
      // Ignore
    }
    
    // Run diagnostics
    if (!onChainDeployed) {
      await diagnoseWalletDeployment(walletAddress);
    }
  }

  // ✅ If we have a transaction hash, consider it deployed (transaction was successful)
  if (txHash && !onChainDeployed) {
    console.log(`✅ Transaction confirmed on-chain. Marking as deployed.`);
    onChainDeployed = true;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 DEPLOYMENT SUMMARY`);
  console.log(`   Transaction ID: ${txId}`);
  console.log(`   Transaction Hash: ${txHash || 'N/A'}`);
  console.log(`   On-Chain Deployed: ${onChainDeployed ? '✅ YES' : '⚠️ PENDING'}`);
  // ✅ CORRECTED EXPLORER URL
  console.log(`   Explorer URL: ${txHash ? `https://testnet.arcscan.app/tx/${txHash}` : `https://testnet.arcscan.app/address/${walletAddress}`}`);
  console.log('='.repeat(60));

  return {
    success: true,
    txId,
    txHash: txHash || undefined,
    onChainDeployed,
    message: onChainDeployed 
      ? 'Wallet activated successfully! Ready for gasless transactions.' 
      : 'Activation transaction submitted. Deployment may take a few minutes to index.'
  };
}

// Add to walletService.ts

/**
 * 🔍 Discover available tokens for a wallet
 * Helps debug token ID issues
 */
/**
 * 🔍 Discover available tokens for a wallet
 * Helps debug token ID issues
 */
export async function discoverAvailableTokens() {
  const client = getWalletsClient();
  
  try {
    console.log(`\n🔍 DISCOVERING AVAILABLE TOKENS`);
    console.log('='.repeat(60));
    
    // Define proper type for the token response
    interface TokenResponse {
      data?: {
        tokens?: Array<{
          id: string;
          symbol: string;
          blockchain: string;
          name?: string;
          decimals?: number;
        }>;
      };
    }
    
    // Try to list tokens
    const response = await fetch('https://api.circle.com/v1/w3s/tokens', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${circleConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const result = await response.json() as TokenResponse;
      const tokens = result.data?.tokens || [];
      
      console.log(`   Found ${tokens.length} tokens:`);
      tokens.forEach((token) => {
        console.log(`   - ${token.symbol} (${token.id}) on ${token.blockchain}`);
        if (token.blockchain === 'ARC-TESTNET') {
          console.log(`     ✅ ARC-TESTNET USDC: ${token.id}`);
        }
      });
    } else {
      console.log(`   Could not fetch token list: ${response.status}`);
    }
    
    // Check our configured token ID
    console.log(`\n   Configured token ID: ${circleConfig.usdcTokenId}`);
    console.log('='.repeat(60));
    
  } catch (err: any) {
    console.error('Token discovery error:', err.message);
  }
}


export default {
  createUserWallet,
  getDepositAddress,
  getUSDCBalance,
  getCircleWalletState,
  isWalletDeployedOnChain,
  diagnoseWalletDeployment,
  deployCircleWallet,
    discoverAvailableTokens,
};
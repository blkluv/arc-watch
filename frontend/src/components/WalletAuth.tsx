// frontend/src/components/WalletAuth.tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SiweMessage } from 'siwe';
import { getAddress } from 'viem';
import { Wallet, Loader2, LogOut, Rocket, AlertCircle, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI, walletAPI } from '@/lib/api';

type DeployState = 'checking' | 'not_deployed' | 'deploying' | 'deployed' | 'error' | 'needs_funding';

interface WalletState {
  isDeployed: boolean;
  balance: string;
  needsFunding: boolean;
  explorerUrl?: string;
}

export function useWallet() {
  const [eoa, setEoa] = useState<string | null>(null);
  const [dcwAddress, setDcwAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>('checking');
  const [balance, setBalance] = useState<string>('0');
  const [explorerUrl, setExplorerUrl] = useState<string>('');
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  const checkDeployment = useCallback(async (dcw: string) => {
    setDeployState('checking');
    try {
      const res = await walletAPI.getState(dcw);
      const data = res.data.data;
      const isDeployed = data?.isDeployed;
      const currentBalance = data?.balance || '0';
      const url = data?.explorerUrl || `https://testnet.arcscan.app/address/${dcw}`;
      
      setBalance(currentBalance);
      setExplorerUrl(url);
      
      // Determine state based on deployment and balance
      if (isDeployed === true) {
        setDeployState('deployed');
      } else {
        const balanceNum = parseFloat(currentBalance);
        if (balanceNum < 0.001) {
          setDeployState('needs_funding');
        } else {
          setDeployState('not_deployed');
        }
      }
    } catch (err: any) {
      console.error('Check deployment error:', err);
      setDeployState('error');
    }
  }, []);

  const startPolling = useCallback((dcw: string) => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }
    
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds total
    
    pollingInterval.current = setInterval(async () => {
      attempts++;
      
      try {
        const res = await walletAPI.getState(dcw);
        const data = res.data.data;
        const isDeployed = data?.isDeployed;
        const currentBalance = data?.balance || '0';
        const url = data?.explorerUrl || `https://testnet.arcscan.app/address/${dcw}`;
        
        setBalance(currentBalance);
        setExplorerUrl(url);
        
        if (isDeployed === true) {
          setDeployState('deployed');
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
          toast.success('✅ Wallet deployed successfully!');
          return;
        }
        
        if (attempts >= maxAttempts) {
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
          const balanceNum = parseFloat(currentBalance);
          if (balanceNum < 0.001) {
            setDeployState('needs_funding');
          } else {
            setDeployState('not_deployed');
          }
          toast.error('Deployment taking longer than expected. Please check status.');
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
    
    // Cleanup after 70 seconds
    setTimeout(() => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    }, 70000);
  }, []);

  useEffect(() => {
    const savedEoa = localStorage.getItem('arcstream_eoa');
    const savedDcw = localStorage.getItem('arcstream_dcw');
    if (savedEoa && savedDcw) { 
      setEoa(savedEoa); 
      setDcwAddress(savedDcw);
      checkDeployment(savedDcw);
    } else {
      setDeployState('checking');
    }
    
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [checkDeployment]);

  const connectAndLink = useCallback(async () => {
    setLoading(true);
    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('Install MetaMask');

      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const mainEoa = getAddress(accounts[0]);

      const nonceRes = await authAPI.getNonce(mainEoa);
      const { nonce } = nonceRes.data.data;
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: mainEoa,
        statement: 'Enable One-Click Viewing for ArcStream',
        uri: window.location.origin,
        version: '1',
        chainId: 5042002,
        nonce: nonce,
      });

      const messageText = siweMessage.prepareMessage();
      const signature = await provider.request({ 
        method: 'personal_sign', 
        params: [messageText, mainEoa] 
      });

      const linkRes = await authAPI.linkWallet({ 
        address: mainEoa, signature, nonce, message: messageText 
      });

      const { dcwAddress: linkedDcw } = linkRes.data.data;
      setEoa(mainEoa);
      setDcwAddress(linkedDcw);
      
      localStorage.setItem('arcstream_eoa', mainEoa);
      localStorage.setItem('arcstream_dcw', linkedDcw);
      
      await checkDeployment(linkedDcw);
      toast.success('Wallet connected!');
    } catch (err: any) {
      toast.error(err.message || 'Auth failed');
    } finally {
      setLoading(false);
    }
  }, [checkDeployment]);

  const deployWallet = useCallback(async () => {
    if (!dcwAddress) return;
    setLoading(true);
    setDeployState('deploying');
    try {
      const res = await walletAPI.deploy(dcwAddress);
      const { onChainDeployed, txHash, explorerUrl: txExplorerUrl } = res.data.data || {};
      
      if (txExplorerUrl) {
        setExplorerUrl(txExplorerUrl);
      }
      
      if (onChainDeployed) {
        setDeployState('deployed');
        toast.success('✅ Wallet deployed successfully!');
      } else {
        toast.success('Deployment submitted. Waiting for confirmation...');
        startPolling(dcwAddress);
      }
    } catch (err: any) {
      const errorCode = err.response?.data?.error;
      const errorMessage = err.response?.data?.message || err.message;
      
      if (errorCode === 'INSUFFICIENT_FUNDS' || errorCode === 'NEEDS_FUNDING') {
        setDeployState('needs_funding');
        toast.error('Wallet needs funding before deployment');
      } else {
        setDeployState('not_deployed');
        toast.error(errorMessage || 'Deploy failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [dcwAddress, startPolling]);

  const refreshState = useCallback(() => {
    if (dcwAddress) {
      checkDeployment(dcwAddress);
    }
  }, [dcwAddress, checkDeployment]);

  const disconnect = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    localStorage.removeItem('arcstream_eoa');
    localStorage.removeItem('arcstream_dcw');
    setEoa(null);
    setDcwAddress(null);
    setDeployState('checking');
    setBalance('0');
    setExplorerUrl('');
    window.location.reload();
  };

  return { 
    eoa, 
    dcwAddress, 
    loading, 
    deployState, 
    balance,
    explorerUrl,
    connectAndLink, 
    deployWallet, 
    refreshState,
    disconnect 
  };
}

export default function WalletAuth() {
  const { 
    eoa, 
    dcwAddress, 
    loading, 
    deployState, 
    balance,
    explorerUrl,
    connectAndLink, 
    deployWallet, 
    refreshState,
    disconnect 
  } = useWallet();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {eoa ? (
          <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border p-2 px-4 rounded-xl shadow-sm">
            <div className="flex flex-col">
               <span className="text-[10px] font-bold text-blue-500">WALLET CONNECTED</span>
               <span className="text-xs font-mono">{dcwAddress?.slice(0,6)}...{dcwAddress?.slice(-4)}</span>
            </div>
            <button onClick={disconnect} className="p-1 hover:text-red-500 transition-colors">
              <LogOut size={16}/>
            </button>
          </div>
        ) : (
          <button 
            onClick={connectAndLink} 
            disabled={loading} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <Wallet size={18}/>}
            Connect Wallet
          </button>
        )}
      </div>

      {/* Show deployment banner for various states */}
      {eoa && dcwAddress && deployState !== 'deployed' && deployState !== 'checking' && (
        <div className={`p-4 rounded-xl border ${
          deployState === 'needs_funding' 
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            : deployState === 'deploying'
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            : deployState === 'error'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-start gap-3">
            {deployState === 'deploying' ? (
              <Loader2 className="text-blue-600 dark:text-blue-400 mt-0.5 animate-spin" size={20} />
            ) : deployState === 'error' ? (
              <AlertCircle className="text-red-600 dark:text-red-400 mt-0.5" size={20} />
            ) : (
              <AlertCircle className="text-amber-600 dark:text-amber-400 mt-0.5" size={20} />
            )}
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                {deployState === 'needs_funding' && '💰 Fund Your Wallet'}
                {deployState === 'not_deployed' && '🚀 Deploy Your Wallet'}
                {deployState === 'deploying' && '⏳ Deploying Wallet...'}
                {deployState === 'error' && '❌ Deployment Error'}
              </h4>
              
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                {deployState === 'needs_funding' && (
                  <>Your Circle wallet needs testnet USDC before it can be deployed. Current balance: {parseFloat(balance).toFixed(6)} USDC</>
                )}
                {deployState === 'not_deployed' && (
                  <>Your wallet has {parseFloat(balance).toFixed(6)} USDC and is ready to be deployed on-chain.</>
                )}
                {deployState === 'deploying' && (
                  <>Deployment transaction in progress. This usually takes 30-60 seconds.</>
                )}
                {deployState === 'error' && (
                  <>Failed to check deployment status. Click refresh to retry.</>
                )}
              </p>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Your DCW Address:</p>
                  <button
                    onClick={refreshState}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Refresh status"
                  >
                    <RefreshCw size={12} className="text-gray-500" />
                  </button>
                </div>
                <code className="text-xs font-mono text-gray-900 dark:text-gray-100 break-all block mb-2">
                  {dcwAddress}
                </code>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Balance:</span>
                  <span className="text-xs font-mono font-medium">
                    {parseFloat(balance).toFixed(6)} USDC
                  </span>
                </div>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    View on ArcScan <ExternalLink size={10} />
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                {deployState === 'needs_funding' && (
                  <>
                    <a 
                      href="https://faucet.circle.com" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1"
                    >
                      Get Testnet USDC
                      <ExternalLink size={12} />
                    </a>
                    <button
                      onClick={refreshState}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium transition"
                    >
                      Check Balance
                    </button>
                  </>
                )}
                
                {deployState === 'not_deployed' && (
                  <button
                    onClick={deployWallet}
                    disabled={loading}
                    className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={12} />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <Rocket size={12} />
                        Deploy Wallet
                      </>
                    )}
                  </button>
                )}
                
                {deployState === 'deploying' && (
                  <div className="flex-1 text-center px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium">
                    Deployment in progress...
                  </div>
                )}
                
                {deployState === 'error' && (
                  <button
                    onClick={refreshState}
                    className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1"
                  >
                    <RefreshCw size={12} />
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {eoa && deployState === 'deployed' && (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded-lg">
          <CheckCircle size={14} />
          <span className="flex-1">Wallet deployed & ready for seamless payments</span>
          <span className="font-mono">{parseFloat(balance).toFixed(4)} USDC</span>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
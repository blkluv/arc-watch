// frontend/src/components/VideoPlayer.tsx

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle, RotateCcw, Lock, Zap, ZapOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { videoAPI, x402Utils, type SignedPayment, type PaymentDetails } from '@/lib/api';
import { formatUSDC, calculateVideoChunks, formatDuration } from '@/config/app';

interface VideoPlayerProps {
  videoId: string;
  videoUrl: string;
  durationSeconds: number;
  chunkDurationSeconds: number;
  pricePerChunk: number;
  creatorWallet: string;
  creatorDcw: string;
  viewerWallet: string | null;
  viewerDcw: string | null;
  onPaymentSuccess?: (chunkIndex: number, amount: string) => void;
  onPaymentError?: (error: string) => void;
}

export default function VideoPlayer({
  videoId,
  videoUrl,
  durationSeconds,
  chunkDurationSeconds,
  pricePerChunk,
  creatorWallet,
  creatorDcw,
  viewerWallet,
  viewerDcw,
  onPaymentSuccess,
  onPaymentError
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [unlockedChunks, setUnlockedChunks] = useState<Set<number>>(new Set([0]));
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [needsPayment, setNeedsPayment] = useState(false);
  const [lastPaidChunk, setLastPaidChunk] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  
  // Auto-pay feature
  const [autoPayEnabled, setAutoPayEnabled] = useState(false);
  const [isAutoPaying, setIsAutoPaying] = useState(false);
  const [autoPayProcessedForChunk, setAutoPayProcessedForChunk] = useState<Set<number>>(new Set());

  const { chunkSeconds, totalChunks } = calculateVideoChunks(durationSeconds, chunkDurationSeconds);
const streamUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001'}/api/videos/${videoId}/stream`;
  
  const isCurrentChunkPaid = unlockedChunks.has(currentChunk);
  const currentChunkEndTime = Math.min((currentChunk + 1) * chunkSeconds, durationSeconds);
  
  const nextChunk = currentChunk + 1;
  const isNextChunkLocked = nextChunk < totalChunks && !unlockedChunks.has(nextChunk);

  console.log('🎬 VideoPlayer:', { 
    videoId, durationSeconds, totalChunks, chunkSeconds,
    currentChunk, nextChunk, isNextChunkLocked, autoPayEnabled,
    unlockedChunks: Array.from(unlockedChunks)
  });

  // Load previously paid chunks on mount
  useEffect(() => {
    const loadPaidChunks = async () => {
      if (!viewerWallet || !videoId) return;
      
      try {
        console.log('📥 Loading paid chunks for user...');
        const res = await videoAPI.getPaidChunks(videoId, viewerWallet);
        
        if (res.data.success) {
          const paidChunks = res.data.data.paidChunks;
          console.log('✅ Previously paid chunks:', paidChunks);
          
          const unlocked = new Set<number>([0]);
          paidChunks.forEach((chunk: number) => unlocked.add(chunk));
          setUnlockedChunks(unlocked);
          
          if (paidChunks.length > 0) {
            setLastPaidChunk(Math.max(...paidChunks));
          }
        }
      } catch (err) {
        console.error('Failed to load paid chunks:', err);
      }
    };
    
    if (viewerWallet) {
      loadPaidChunks();
    }
  }, [videoId, viewerWallet]);

  // ✅ Auto-pay immediately when entering a chunk with locked next chunk
  useEffect(() => {
    if (!autoPayEnabled) return;
    if (!playing || !ready || !mounted) return;
    if (currentChunk >= totalChunks - 1) return;
    if (!viewerWallet || !viewerDcw) return;
    if (paymentStatus === 'pending' || isAutoPaying) return;
    
    const nextChunkIdx = currentChunk + 1;
    
    // Don't auto-pay if already paid or already processed
    if (unlockedChunks.has(nextChunkIdx)) return;
    if (autoPayProcessedForChunk.has(nextChunkIdx)) return;
    
    // ✅ Auto-pay immediately (no countdown)
    console.log(`⚡ Auto-paying for chunk ${nextChunkIdx} immediately`);
    handleAutoPayNext();
  }, [autoPayEnabled, playing, ready, currentChunk, totalChunks, unlockedChunks, 
      autoPayProcessedForChunk, viewerWallet, viewerDcw, paymentStatus, isAutoPaying, mounted]);

  // Reset auto-pay processed flag when chunk changes
  useEffect(() => {
    // Clear processed flag for the new chunk so auto-pay can work
    setAutoPayProcessedForChunk(prev => {
      const next = new Set(prev);
      return next;
    });
  }, [currentChunk]);

  // ✅ Auto-pay for next chunk
  const handleAutoPayNext = useCallback(async () => {
    const nextChunkIdx = currentChunk + 1;
    if (nextChunkIdx >= totalChunks) return;
    if (unlockedChunks.has(nextChunkIdx)) return;
    
    setIsAutoPaying(true);
    setAutoPayProcessedForChunk(prev => new Set(prev).add(nextChunkIdx));
    
    try {
      const success = await payForChunk(nextChunkIdx, true);
      
      if (success) {
        toast.success(`⚡ Auto-paid chunk ${nextChunkIdx + 1}`, {
          duration: 1500,
          position: 'bottom-left',
          icon: '⚡',
        });
      }
    } catch (err) {
      console.error('Auto-pay error:', err);
    } finally {
      setIsAutoPaying(false);
    }
  }, [currentChunk, totalChunks, unlockedChunks]);

  // ✅ Toggle auto-pay
  const toggleAutoPay = useCallback(() => {
    setAutoPayEnabled(prev => {
      const newState = !prev;
      if (newState) {
        toast.success('⚡ Auto-pay enabled - next chunks will be paid automatically', {
          duration: 2000,
          position: 'bottom-left',
          icon: '⚡',
        });
        // Clear processed flags when enabling
        setAutoPayProcessedForChunk(new Set());
      } else {
        toast('Auto-pay disabled', {
          duration: 1500,
          position: 'bottom-left',
          icon: '🔕',
        });
      }
      return newState;
    });
  }, []);

  // Ensure all chunks between last paid and current are paid
  const ensureChunksPaid = useCallback(async (targetChunk: number): Promise<boolean> => {
    if (targetChunk === 0) return true;
    if (unlockedChunks.has(targetChunk)) return true;
    
    let highestContiguous = 0;
    for (let i = 0; i <= targetChunk; i++) {
      if (unlockedChunks.has(i)) {
        highestContiguous = i;
      } else {
        break;
      }
    }
    
    const chunksToPay: number[] = [];
    for (let i = highestContiguous + 1; i <= targetChunk; i++) {
      if (!unlockedChunks.has(i)) {
        chunksToPay.push(i);
      }
    }
    
    if (chunksToPay.length === 0) return true;
    
    console.log(`💰 Need to pay for chunks: ${chunksToPay.join(', ')}`);
    
    for (const chunk of chunksToPay) {
      const success = await payForChunk(chunk);
      if (!success) return false;
    }
    
    return true;
  }, [unlockedChunks]);

  // Pay for a specific chunk
  const payForChunk = useCallback(async (chunkIndex: number, isAuto: boolean = false): Promise<boolean> => {
    if (unlockedChunks.has(chunkIndex)) {
      console.log(`✅ Chunk ${chunkIndex} already paid`);
      return true;
    }
    
    console.log(`💰 Paying for chunk ${chunkIndex} ${isAuto ? '(auto)' : '(manual)'}`);
    
    if (!isAuto) {
      setPaymentStatus('pending');
    }
    
    try {
      let paymentDetails: PaymentDetails | null = null;
      
      try {
        await videoAPI.requestChunkAccess(videoId, chunkIndex);
        setUnlockedChunks(prev => new Set(prev).add(chunkIndex));
        setLastPaidChunk(Math.max(lastPaidChunk, chunkIndex));
        onPaymentSuccess?.(chunkIndex, formatUSDC(pricePerChunk));
        return true;
      } catch (err: any) {
        if (err.response?.status === 402) {
          paymentDetails = x402Utils.parsePaymentDetails(err.response);
        } else if (err.response?.status === 200) {
          setUnlockedChunks(prev => new Set(prev).add(chunkIndex));
          setLastPaidChunk(Math.max(lastPaidChunk, chunkIndex));
          return true;
        } else {
          throw err;
        }
      }

      if (!paymentDetails) throw new Error('No payment details');

      const signRes = await videoAPI.signChunk(videoId, chunkIndex, viewerWallet!);
      const { signature, nonce } = signRes.data.data;
      
      const signedPayment: SignedPayment = {
        signature,
        paymentDetails: { ...paymentDetails, nonce },
        payerAddress: viewerDcw!,
      };
      
      await videoAPI.requestChunkAccess(videoId, chunkIndex, signedPayment);
      
      setUnlockedChunks(prev => new Set(prev).add(chunkIndex));
      setLastPaidChunk(Math.max(lastPaidChunk, chunkIndex));
      onPaymentSuccess?.(chunkIndex, formatUSDC(pricePerChunk));
      
      return true;
      
    } catch (err: any) {
      console.error('❌ Payment error for chunk', chunkIndex, err);
      
      if (err.response?.data?.error?.includes('Unique constraint') || 
          err.message?.includes('Unique constraint')) {
        setUnlockedChunks(prev => new Set(prev).add(chunkIndex));
        setLastPaidChunk(Math.max(lastPaidChunk, chunkIndex));
        return true;
      }
      
      if (!isAuto) {
        toast.error(`Failed to pay for chunk ${chunkIndex + 1}`);
      }
      onPaymentError?.(err.message);
      return false;
    } finally {
      if (!isAuto) {
        setPaymentStatus('idle');
      }
    }
  }, [videoId, pricePerChunk, viewerWallet, viewerDcw, lastPaidChunk, unlockedChunks, onPaymentSuccess, onPaymentError]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (!videoRef.current || !ready) {
      toast.error('Video is still loading...');
      return;
    }
    
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
      return;
    }
    
    if (!unlockedChunks.has(currentChunk)) {
      if (!viewerWallet || !viewerDcw) {
        toast.error('Please connect your wallet to continue');
        return;
      }
      setNeedsPayment(true);
      initiatePayment();
      return;
    }
    
    videoRef.current.play().catch(err => {
      console.error('Play error:', err);
      toast.error('Failed to play video: ' + err.message);
    });
    setPlaying(true);
    setNeedsPayment(false);
  }, [playing, ready, currentChunk, unlockedChunks, viewerWallet, viewerDcw]);

  // Handle time update
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !mounted || isSeeking) return;
    
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    
    const newChunk = Math.floor(time / chunkSeconds);
    
    if (newChunk !== currentChunk) {
      console.log(`📊 Chunk changed: ${currentChunk} -> ${newChunk}`);
      
      if (!unlockedChunks.has(newChunk)) {
        console.log(`⏸️ Hit unpaid chunk ${newChunk}, pausing`);
        videoRef.current.pause();
        setPlaying(false);
        setCurrentChunk(newChunk);
        setNeedsPayment(true);
        return;
      }
      
      setCurrentChunk(newChunk);
    }
    
    if (time >= currentChunkEndTime - 0.3 && !unlockedChunks.has(currentChunk)) {
      console.log(`⏸️ End of unpaid chunk ${currentChunk}`);
      videoRef.current.pause();
      setPlaying(false);
      setNeedsPayment(true);
    }
  }, [chunkSeconds, currentChunk, currentChunkEndTime, unlockedChunks, mounted, isSeeking]);

  // Initiate payment for current chunk
  const initiatePayment = useCallback(async () => {
    if (!viewerWallet || !viewerDcw) {
      toast.error('Please connect your wallet to continue');
      return;
    }
    
    setNeedsPayment(false);
    const success = await ensureChunksPaid(currentChunk);
    
    if (success) {
      setPaymentStatus('success');
      setNeedsPayment(false);
      videoRef.current?.play();
      setPlaying(true);
      setTimeout(() => setPaymentStatus('idle'), 2000);
    } else {
      setPaymentStatus('error');
      setNeedsPayment(true);
    }
  }, [viewerWallet, viewerDcw, currentChunk, ensureChunksPaid]);

  // Handle seek
  const handleSeek = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    
    const newTime = parseFloat(e.target.value);
    const newChunk = Math.floor(newTime / chunkSeconds);
    
    console.log(`🎯 Seeking to ${newTime}s, chunk ${newChunk}, paid: ${unlockedChunks.has(newChunk)}`);
    
    if (!unlockedChunks.has(newChunk) && newChunk > 0) {
      toast.error(`Chunk ${newChunk + 1} is locked`);
      return;
    }
    
    setIsSeeking(true);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setCurrentChunk(newChunk);
    
    // Clear auto-pay processed flag when seeking
    setAutoPayProcessedForChunk(prev => {
      const next = new Set(prev);
      next.delete(newChunk + 1);
      return next;
    });
    
    setTimeout(() => setIsSeeking(false), 200);
  }, [chunkSeconds, unlockedChunks]);

  const handleSeeking = useCallback(() => setIsSeeking(true), []);
  
  const handleSeeked = useCallback(() => {
    if (!videoRef.current) return;
    
    const newTime = videoRef.current.currentTime;
    const newChunk = Math.floor(newTime / chunkSeconds);
    
    console.log(`🎯 Seeked to ${newTime}s, chunk ${newChunk}`);
    
    if (!unlockedChunks.has(newChunk) && newChunk > 0) {
      let lastPaid = 0;
      for (let i = newChunk - 1; i >= 0; i--) {
        if (unlockedChunks.has(i)) {
          lastPaid = i;
          break;
        }
      }
      
      const seekBackTime = (lastPaid + 1) * chunkSeconds - 0.1;
      videoRef.current.currentTime = Math.max(0, seekBackTime);
      setCurrentTime(seekBackTime);
      setCurrentChunk(lastPaid);
      toast.error('Cannot skip unpaid content');
    } else {
      setCurrentTime(newTime);
      setCurrentChunk(newChunk);
    }
    
    setIsSeeking(false);
  }, [chunkSeconds, unlockedChunks]);

  const handleLoadedData = () => {
    console.log('✅ Video loaded');
    setReady(true);
    setIsLoading(false);
  };

  const handleCanPlay = () => {
    console.log('✅ Video can play');
    setReady(true);
    setIsLoading(false);
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const error = video.error;
    
    console.error('❌ Video error details:', { code: error?.code, message: error?.message });
    
    let errorMessage = 'Failed to load video';
    if (error) {
      switch (error.code) {
        case 1: errorMessage = 'Video loading aborted'; break;
        case 2: errorMessage = 'Network error'; break;
        case 3: errorMessage = 'Video decoding failed'; break;
        case 4: errorMessage = 'Video not found'; break;
        default: errorMessage = `Video error: ${error.message}`;
      }
    }
    
    setVideoError(errorMessage);
    setIsLoading(false);
  };

  const handleEnded = () => {
    console.log('🏁 Video ended');
    setPlaying(false);
  };

  const handleRetry = () => {
    setVideoError(null);
    setIsLoading(true);
    setReady(false);
    if (videoRef.current) videoRef.current.load();
  };

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = (currentTime / durationSeconds) * 100;
  const maxUnlockedTime = Math.min((lastPaidChunk + 1) * chunkSeconds, durationSeconds);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
      <video
        ref={videoRef}
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
        onLoadedData={handleLoadedData}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onEnded={handleEnded}
        onSeeking={handleSeeking}
        onSeeked={handleSeeked}
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      >
        <source src={streamUrl} type="video/mp4" />
      </video>
      
      {/* Loading overlay */}
      {isLoading && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <div className="text-center">
            <Loader2 className="animate-spin text-white mx-auto mb-2" size={48} />
            <p className="text-white text-sm font-medium">Loading video...</p>
          </div>
        </div>
      )}
      
      {/* Error overlay */}
      {videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="text-center p-6">
            <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
            <p className="text-white mb-4">{videoError}</p>
            <button onClick={handleRetry} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              <RotateCcw size={16} className="inline mr-2" /> Retry
            </button>
          </div>
        </div>
      )}
      
      {/* Regular payment overlay */}
      {paymentStatus === 'pending' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
          <div className="bg-gray-800 rounded-xl p-6 text-center">
            <Loader2 className="animate-spin mx-auto mb-3 text-blue-500" size={32} />
            <p className="text-white text-lg mb-1 font-medium">Processing Payment</p>
            <p className="text-gray-400">{formatUSDC(pricePerChunk)} USDC</p>
          </div>
        </div>
      )}
      
      {/* Auto-pay processing indicator */}
      {isAutoPaying && (
        <div className="absolute top-4 right-4 bg-amber-500/90 text-white px-3 py-1.5 rounded-full z-40 shadow-lg flex items-center gap-2">
          <Loader2 className="animate-spin" size={14} />
          <span className="text-xs font-medium">Auto-paying next chunk...</span>
        </div>
      )}
      
      {/* Locked chunk indicator */}
      {needsPayment && !isCurrentChunkPaid && paymentStatus === 'idle' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-4 py-2 rounded-lg z-20 shadow-lg flex items-center gap-2">
          <Lock size={16} />
          <span className="font-medium">Press play to unlock • {formatUSDC(pricePerChunk)} USDC</span>
        </div>
      )}
      
      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        {/* Progress bar */}
        <div className="relative w-full h-2 bg-gray-600/80 rounded-full mb-3 overflow-hidden">
          <div 
            className="absolute h-full bg-green-500/40" 
            style={{ width: `${(maxUnlockedTime / durationSeconds) * 100}%` }}
          />
          <div 
            className="absolute h-full bg-blue-500 transition-all duration-300" 
            style={{ width: `${progressPercent}%` }}
          />
          <input
            type="range"
            min={0}
            max={durationSeconds}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayPause}
              disabled={!ready || paymentStatus === 'pending'}
              className="w-12 h-12 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full text-white disabled:opacity-50 transition shadow-lg"
            >
              {!ready || isLoading ? (
                <Loader2 className="animate-spin" size={22} />
              ) : playing ? (
                <Pause size={24} />
              ) : (
                <Play size={24} />
              )}
            </button>
            
            <span className="text-sm text-white font-mono font-medium">
              {formatTime(currentTime)} / {formatTime(durationSeconds)}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Auto-Pay Toggle Button */}
            <button
              onClick={toggleAutoPay}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-lg ${
                autoPayEnabled 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={autoPayEnabled ? 'Auto-pay enabled - click to disable' : 'Auto-pay disabled - click to enable'}
            >
              {autoPayEnabled ? (
                <>
                  <Zap size={14} className="fill-current" />
                  Auto On
                </>
              ) : (
                <>
                  <ZapOff size={14} />
                  Auto Off
                </>
              )}
            </button>
            
            <span className="text-xs text-gray-300 bg-black/30 px-2 py-1 rounded-full">
              Chunk {currentChunk + 1}/{totalChunks} • {formatDuration(chunkSeconds)}
            </span>
          </div>
        </div>
        
        {/* Chunk status indicators */}
        <div className="flex gap-1 mt-3">
          {Array.from({ length: Math.min(totalChunks, 30) }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                unlockedChunks.has(i) 
                  ? 'bg-green-500 hover:bg-green-400 shadow-sm shadow-green-500/50' 
                  : i === currentChunk 
                    ? 'bg-yellow-500 shadow-sm shadow-yellow-500/50' 
                    : 'bg-gray-600 hover:bg-gray-500'
              }`}
              onClick={() => {
                if (unlockedChunks.has(i) && videoRef.current) {
                  videoRef.current.currentTime = i * chunkSeconds;
                } else if (!unlockedChunks.has(i) && i > 0) {
                  toast(`Chunk ${i + 1} is locked. Press play to unlock.`, {
                    icon: '🔒',
                  });
                }
              }}
              title={`Chunk ${i + 1}: ${unlockedChunks.has(i) ? 'Unlocked' : 'Locked'}${!unlockedChunks.has(i) ? ` - ${formatUSDC(pricePerChunk)} USDC` : ''}`}
            />
          ))}
          {totalChunks > 30 && (
            <span className="text-xs text-gray-400 ml-1 bg-black/30 px-1.5 py-0.5 rounded-full">+{totalChunks - 30}</span>
          )}
        </div>
      </div>
    </div>
  );
}
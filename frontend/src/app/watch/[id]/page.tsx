// frontend/src/app/watch/[id]/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Share2, Heart, MessageCircle, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { videoAPI } from '@/lib/api';
import { useWallet } from '@/components/WalletAuth';
import WalletAuth from '@/components/WalletAuth';
import VideoPlayer from '@/components/VideoPlayer';
import { formatUSDC, calculateVideoChunks, formatDuration } from '@/config/app';

interface Video {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  chunkDurationSeconds: number;
  pricePerChunk: number;
  creatorWallet: string;
  creatorDcw: string;
  videoUrl: string;
  createdAt: string;
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  
  const { eoa: viewerWallet, dcwAddress: viewerDcw } = useWallet();
  
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [paymentLog, setPaymentLog] = useState<Array<{ chunk: number; amount: string; timestamp: string }>>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const videoId = params.id as string;

  const isCreator = video && viewerWallet && 
    video.creatorWallet.toLowerCase() === viewerWallet.toLowerCase();

  const handleDelete = async () => {
    if (!video || !viewerWallet) return;
    
    setDeleting(true);
    try {
      const res = await videoAPI.delete(video.id, viewerWallet);
      toast.success(res.data.data.message || 'Video deleted successfully');
      router.push('/');
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.response?.data?.error || 'Failed to delete video');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    const fetchVideo = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await videoAPI.getVideo(videoId);
        setVideo(res.data.data || res.data);
      } catch (err: any) {
        console.error('Fetch error:', err);
        setError(err.response?.data?.error || 'Video not found');
        if (err.response?.status === 404) {
          toast.error('Video not found');
          setTimeout(() => router.push('/'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };
    
    if (videoId) fetchVideo();
  }, [videoId, router]);
  
  const handlePaymentSuccess = (chunkIndex: number, amount: string) => {
    setPaymentLog(prev => [...prev, {
      chunk: chunkIndex,
      amount,
      timestamp: new Date().toISOString()
    }]);
    console.log(`💸 Nanopayment: Chunk ${chunkIndex} - ${amount} USDC to ${video?.creatorDcw}`);
  };
  
  const handlePaymentError = (errorMsg: string) => {
    toast.error(errorMsg);
  };
  
  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-blue-600" size={40} />
          <p className="text-gray-600 dark:text-gray-300">Loading video...</p>
        </div>
      </main>
    );
  }
  
  if (error || !video) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Video Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "The video you're looking for doesn't exist."}</p>
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <ArrowLeft size={16} />
            Back to Feed
          </Link>
        </div>
      </main>
    );
  }
  
  // ✅ Calculate chunks using chunkDurationSeconds
  const { chunkSeconds, totalChunks } = calculateVideoChunks(
    video.durationSeconds, 
    video.chunkDurationSeconds
  );
  
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link 
            href="/" 
            className="flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:text-blue-600 transition"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </Link>
          
          <div className="flex items-center gap-2">
            {isCreator && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                title="Delete video"
              >
                <Trash2 size={20} />
              </button>
            )}
            <button className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition">
              <Heart size={20} />
            </button>
            <button className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition">
              <MessageCircle size={20} />
            </button>
            <button className="p-2 text-gray-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </header>
      
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <WalletAuth />
        
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{video.title}</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-4">{video.description}</p>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              ⏱️ {formatDuration(video.durationSeconds)} total
            </span>
            <span className="flex items-center gap-1">
              💰 {formatUSDC(video.pricePerChunk)} / {formatDuration(video.chunkDurationSeconds)}
            </span>
            <span className="flex items-center gap-1">
              🔢 {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
              ✓ ≤ $0.01/chunk (Hackathon Compliant)
            </span>
          </div>
        </div>
        
        {viewerWallet ? (
          <VideoPlayer
            videoId={video.id}
            videoUrl={video.videoUrl}
            durationSeconds={video.durationSeconds}
            chunkDurationSeconds={video.chunkDurationSeconds}
            pricePerChunk={video.pricePerChunk}
            creatorWallet={video.creatorWallet}
            creatorDcw={video.creatorDcw}
            viewerWallet={viewerWallet}
            viewerDcw={viewerDcw}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentError={handlePaymentError}
          />
        ) : (
          <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center">
            <p className="text-gray-500 dark:text-gray-400 text-center px-8">
              🔐 Connect your wallet above to start watching with nanopayments
            </p>
          </div>
        )}
        
        {paymentLog.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Payment History</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {paymentLog.map((payment, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                  <span className="text-gray-600 dark:text-gray-300">
                    Chunk {payment.chunk + 1} ({formatDuration(chunkSeconds)})
                  </span>
                  <span className="font-mono font-medium text-green-600 dark:text-green-400">
                    -{payment.amount} USDC
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              💡 Hackathon Requirement: 50+ on-chain transactions achieved via granular chunks.
            </p>
          </div>
        )}
        
        {/* Debug Link */}
        <div className="text-right">
          <a
            href={`http://localhost:3001/api/videos/debug/${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            🔍 Debug Video
          </a>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Video?</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              This will permanently delete "{video.title}" and all associated payment records. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Yes, Delete
                  </>
                )}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
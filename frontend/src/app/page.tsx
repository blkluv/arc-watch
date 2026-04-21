// // src/app/page.tsx

// 'use client';

// import { useEffect, useState } from 'react';
// import WalletAuth from '@/components/WalletAuth';
// import { videoAPI } from '@/lib/api';
// import { Search, AlertCircle, RefreshCw } from 'lucide-react';
// import Link from 'next/link';

// interface Video {
//   id: string;
//   title: string;
//   description: string;
//   durationSeconds: number;
//   pricingModel: 'per_5s' | 'per_minute';
//   pricePerChunk: number;
//   creatorWallet: string;
//   videoUrl: string;
//   createdAt: string;
// }

// export default function Home() {
//   const [videos, setVideos] = useState<Video[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [q, setQ] = useState('');

//   const fetchVideos = async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await videoAPI.list(q);
      
//       // ✅ FIX: Backend now returns { success, data: videos[], count }
//       // Handle both new and old response formats for compatibility
//       const videosData = res.data?.data || res.data || [];
//       setVideos(Array.isArray(videosData) ? videosData : []);
      
//     } catch (err: any) {
//       console.error('Fetch error:', err);
//       setError('Could not connect to backend. Is it running on port 3001?');
//       setVideos([]); // Ensure videos is always an array
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => { 
//     fetchVideos(); 
//   }, [q]);

//   return (
//     <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 max-w-5xl mx-auto space-y-6">
//       <header className="flex justify-between items-center">
//         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🎬 ArcStream</h1>
//         <Link 
//           href="/upload" 
//           className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium transition"
//         >
//           + List Video
//         </Link>
//       </header>
      
//       <WalletAuth />

//       {/* Search Bar */}
//       <div className="relative">
//         <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
//         <input 
//           value={q} 
//           onChange={e => setQ(e.target.value)} 
//           placeholder="Search by title or ID..." 
//           className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
//         />
//       </div>

//       {/* Error / Retry State */}
//       {error && (
//         <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between text-red-800 dark:text-red-200">
//           <div className="flex items-center gap-2">
//             <AlertCircle size={20}/>
//             <span>{error}</span>
//           </div>
//           <button 
//             onClick={fetchVideos} 
//             className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1 rounded shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
//           >
//             <RefreshCw size={16}/> Retry
//           </button>
//         </div>
//       )}

//       {/* Loading State */}
//       {loading && !error && (
//         <div className="text-center py-12">
//           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
//           <p className="text-gray-500 dark:text-gray-400">Loading feed...</p>
//         </div>
//       )}

//       {/* Video Grid */}
//       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//         {videos.map(v => (
//           <Link 
//             key={v.id} 
//             href={`/watch/${v.id}`} 
//             className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition border border-gray-100 dark:border-gray-700"
//           >
//             <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{v.title}</h3>
//             <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 line-clamp-2">{v.description}</p>
//             <div className="mt-3 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
//               <span className="font-medium text-blue-600 dark:text-blue-400">
//                 💰 ${v.pricePerChunk.toFixed(6)} / {v.pricingModel === 'per_5s' ? '5s' : '1min'}
//               </span>
//               <span>⏱️ {Math.floor(v.durationSeconds/60)}m {v.durationSeconds%60}s</span>
//             </div>
//           </Link>
//         ))}
        
//         {!loading && !error && videos.length === 0 && (
//           <div className="col-span-2 text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
//             <p className="text-gray-500 dark:text-gray-400">No videos found.</p>
//             <Link href="/upload" className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
//               Be the first to list one!
//             </Link>
//           </div>
//         )}
//       </div>
//     </main>
//   );
// }


// frontend/src/app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import WalletAuth from '@/components/WalletAuth';
import { videoAPI } from '@/lib/api';
import { Search, AlertCircle, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useWallet } from '@/components/WalletAuth';

interface Video {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  chunkDuration: number;
  pricePerChunk: number;
  creatorWallet: string;
  videoUrl: string;
  createdAt: string;
}

export default function Home() {
  const { eoa: viewerWallet } = useWallet();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await videoAPI.list(q);
      const videosData = res.data?.data || res.data || [];
      setVideos(Array.isArray(videosData) ? videosData : []);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError('Could not connect to backend. Is it running on port 3001?');
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    fetchVideos(); 
  }, [q]);

  const handleDelete = async (videoId: string) => {
    if (!viewerWallet) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    setDeletingId(videoId);
    try {
      const res = await videoAPI.delete(videoId, viewerWallet);
      toast.success(res.data.data.message || 'Video deleted successfully');
      // Remove from local state
      setVideos(prev => prev.filter(v => v.id !== videoId));
      setShowDeleteConfirm(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err.response?.data?.error || 'Failed to delete video');
    } finally {
      setDeletingId(null);
    }
  };

  const isCreator = (video: Video) => {
    return viewerWallet && video.creatorWallet.toLowerCase() === viewerWallet.toLowerCase();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 max-w-5xl mx-auto space-y-6">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🎬 ArcStream</h1>
        <Link 
          href="/upload" 
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium transition"
        >
          + List Video
        </Link>
      </header>
      
      <WalletAuth />

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-gray-400" size={20}/>
        <input 
          value={q} 
          onChange={e => setQ(e.target.value)} 
          placeholder="Search by title or ID..." 
          className="w-full pl-10 p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
      </div>

      {/* Error / Retry State */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between text-red-800 dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle size={20}/>
            <span>{error}</span>
          </div>
          <button 
            onClick={fetchVideos} 
            className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1 rounded shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition"
          >
            <RefreshCw size={16}/> Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading feed...</p>
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {videos.map(v => (
          <div key={v.id} className="relative group">
            <Link 
              href={`/watch/${v.id}`} 
              className="block p-4 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition border border-gray-100 dark:border-gray-700"
            >
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{v.title}</h3>
                {isCreator(v) && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowDeleteConfirm(v.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition opacity-0 group-hover:opacity-100"
                    title="Delete video"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1 line-clamp-2">{v.description}</p>
              <div className="mt-3 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded">
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  💰 ${v.pricePerChunk.toFixed(6)} / {v.chunkDuration} min
                </span>
                <span>⏱️ {formatDuration(v.durationSeconds)}</span>
              </div>
              {isCreator(v) && (
                <div className="mt-2 text-xs">
                  <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                    Your Video
                  </span>
                </div>
              )}
            </Link>
            
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm === v.id && (
              <div className="absolute inset-0 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-10">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Delete Video?</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  This will permanently delete "{v.title}" and all associated payment records.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(v.id)}
                    disabled={deletingId === v.id}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {deletingId === v.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Delete
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {!loading && !error && videos.length === 0 && (
          <div className="col-span-2 text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-gray-500 dark:text-gray-400">No videos found.</p>
            <Link href="/upload" className="text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
              Be the first to list one!
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
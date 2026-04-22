// frontend/src/app/upload/page.tsx

'use client';

import { useState, ChangeEvent, FormEvent, useRef } from 'react';
import { useWallet } from '@/components/WalletAuth';
import { videoAPI } from '@/lib/api';
import { upload } from '@vercel/blob/client';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Upload as UploadIcon, FileVideo, Loader2, DollarSign, Settings, X } from 'lucide-react';
import { formatDuration } from '@/config/app';

interface UploadForm {
  title: string;
  description: string;
  durationSeconds: string;
  chunkUnit: 'seconds' | 'minutes';
  chunkValue: string;
  pricePerChunk: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

export default function UploadPage() {
  const { eoa: eoaAddress, dcwAddress } = useWallet();
  const router = useRouter();
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [form, setForm] = useState<UploadForm>({
    title: '',
    description: '',
    durationSeconds: '',
    chunkUnit: 'minutes',
    chunkValue: '5',
    pricePerChunk: '0.001',
  });
  const [submitting, setSubmitting] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // ✅ CORRECT client-side upload with REAL progress tracking
  const uploadDirectToBlob = async (file: File): Promise<string> => {
    console.log('📤 Starting client upload to Vercel Blob...');
    
    const handleUploadUrl = `${process.env.NEXT_PUBLIC_API_URL}/videos/upload-token`;
    console.log('   handleUploadUrl:', handleUploadUrl);
    
    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    // @ts-ignore - onUploadProgress exists but types might be outdated
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: handleUploadUrl,
      clientPayload: JSON.stringify({
        eoaAddress: eoaAddress,
        filename: file.name,
      }),
      abortSignal: abortControllerRef.current.signal,
      // ✅ REAL progress tracking - built into the SDK!
      onUploadProgress: (progressEvent: { loaded: number; total: number; percentage: number }) => {
        const percent = Math.round(progressEvent.percentage);
        setUploadProgress(percent);
        setUploadStatus(`Uploading... ${percent}%`);
        console.log(`📊 Upload progress: ${percent}% (${(progressEvent.loaded / 1024 / 1024).toFixed(2)} MB / ${(progressEvent.total / 1024 / 1024).toFixed(2)} MB)`);
      },
    });

    console.log('✅ Blob upload complete:', blob.url);
    return blob.url;
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File size must be less than 5GB`);
      return;
    }
    
    setVideoFile(file);
    setUploadProgress(0);
    setUploadStatus('');
    
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Math.floor(video.duration);
      setVideoDuration(duration);
      setForm(prev => ({ 
        ...prev, 
        durationSeconds: duration.toString(),
        title: prev.title || file.name.replace(/\.[^/.]+$/, "")
      }));
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(file);
    
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    toast.success(`✅ Selected: ${file.name} (${sizeMB} MB)`);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      processFile(file);
    } else {
      toast.error('Please drop a valid video file');
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSubmitting(false);
    setUploadProgress(0);
    setUploadStatus('');
    toast.error('Upload cancelled');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!eoaAddress || !dcwAddress) {
      toast.error('Connect wallet first');
      return;
    }
    
    if (!videoFile) {
      toast.error('Please select a video file to upload');
      return;
    }

    if (!form.durationSeconds || parseInt(form.durationSeconds) < 1) {
      toast.error('Please enter a valid video duration');
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    setUploadStatus('Preparing upload...');
    
    const sizeMB = (videoFile.size / (1024 * 1024)).toFixed(2);
    toast.loading(`Starting upload (${sizeMB} MB)...`, { id: 'upload-toast' });

    try {
      const videoUrl = await uploadDirectToBlob(videoFile);
      
      toast.dismiss('upload-toast');
      toast.success('✅ Upload complete! Saving video...', { id: 'save-toast' });
      setUploadStatus('Saving video metadata...');
      
      const res = await videoAPI.confirmUpload({
        videoUrl,
        title: form.title,
        description: form.description,
        durationSeconds: form.durationSeconds,
        chunkUnit: form.chunkUnit,
        chunkValue: form.chunkValue,
        pricePerChunk: form.pricePerChunk,
      }, eoaAddress);
      
      toast.dismiss('save-toast');
      toast.success('✅ Video published successfully!');
      router.push(`/watch/${res.data.data.id}`);
      
    } catch (err: any) {
      toast.dismiss('upload-toast');
      toast.dismiss('save-toast');
      console.error('Upload error:', err);
      
      if (err.name === 'AbortError' || err.message?.includes('abort')) {
        toast.error('Upload cancelled');
      } else {
        toast.error(err.message || 'Failed to publish video');
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
      setUploadStatus('');
      abortControllerRef.current = null;
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const getChunkSeconds = (): number => {
    const value = parseFloat(form.chunkValue) || 5;
    return form.chunkUnit === 'minutes' ? Math.round(value * 60) : Math.round(value);
  };
  
  const chunkSeconds = getChunkSeconds();
  const durationSec = parseInt(form.durationSeconds) || 0;
  const totalChunks = durationSec > 0 ? Math.ceil(durationSec / chunkSeconds) : 0;
  const totalCost = totalChunks * parseFloat(form.pricePerChunk || '0.001');
  const isValidChunk = chunkSeconds >= 5 && chunkSeconds <= 3600 && chunkSeconds <= (durationSec || Infinity);

  const fileSizeMB = videoFile ? (videoFile.size / (1024 * 1024)).toFixed(2) : '0';

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <UploadIcon size={24} />
          Publish Video
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-5">
            
            {/* File Upload Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Video File
              </label>
              <div 
                className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                    : videoFile 
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                      : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !submitting && document.getElementById('video-file')?.click()}
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="video-file"
                  disabled={submitting}
                />
                <FileVideo size={48} className={`mx-auto mb-3 ${videoFile ? 'text-green-500' : 'text-gray-400'}`} />
                <p className="text-gray-700 dark:text-gray-200 font-medium">
                  {videoFile ? videoFile.name : 'Click or drag video here'}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  MP4, MOV, or WebM (Up to 5GB direct upload)
                </p>
              </div>
              {videoFile && !submitting && (
                <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 px-1 mt-2">
                  <span>Size: {fileSizeMB} MB</span>
                  {videoDuration && <span>Duration: {formatDuration(videoDuration)}</span>}
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {submitting && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {uploadStatus || 'Preparing upload...'}
                  </span>
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {uploadProgress < 100 ? 'Uploading... Please do not close this page.' : 'Processing...'}
                  </p>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <X size={12} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input 
                name="title" 
                required 
                value={form.title} 
                onChange={handleChange} 
                placeholder="My Awesome Video"
                disabled={submitting}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <textarea 
                name="description" 
                required 
                value={form.description} 
                onChange={handleChange} 
                rows={3} 
                placeholder="Tell viewers about your content..."
                disabled={submitting}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
              />
            </div>

            {/* Duration & Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (seconds)</label>
                <input 
                  name="durationSeconds" 
                  type="number" 
                  required 
                  value={form.durationSeconds} 
                  onChange={handleChange} 
                  min="1"
                  disabled={submitting}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <DollarSign size={14} />
                  Price / Chunk (USDC)
                </label>
                <input 
                  name="pricePerChunk" 
                  type="number" 
                  step="0.000001" 
                  required 
                  value={form.pricePerChunk} 
                  onChange={handleChange} 
                  min="0.000001"
                  max="0.01"
                  disabled={submitting}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
                />
              </div>
            </div>

            {/* Chunk Configuration */}
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Settings size={16} /> Chunk Configuration
              </label>
              <div className="flex gap-2">
                <input 
                  name="chunkValue" 
                  type="number" 
                  value={form.chunkValue} 
                  onChange={handleChange} 
                  min="1"
                  disabled={submitting}
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" 
                />
                <select 
                  name="chunkUnit" 
                  value={form.chunkUnit} 
                  onChange={handleChange} 
                  disabled={submitting}
                  className="w-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
              <div className="mt-3 flex justify-between items-end">
                <p className="text-xs text-gray-500">
                  Total Chunks: <span className="font-bold text-blue-600">{totalChunks}</span><br /> 
                  Total Cost: <span className="font-bold text-green-600">${totalCost.toFixed(4)} USDC</span>
                </p>
                {!isValidChunk && durationSec > 0 && (
                   <p className="text-[10px] text-red-500 font-medium italic">
                     {chunkSeconds < 5 ? 'Min 5 seconds' : 
                      chunkSeconds > 3600 ? 'Max 60 minutes' : 
                      'Exceeds video duration'}
                   </p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !eoaAddress || !videoFile || !isValidChunk}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {uploadStatus || 'Uploading...'}
                </>
              ) : (
                '🚀 Publish to ArcStream'
              )}
            </button>
          </form>
        </div>
        
        {/* Tips */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">💡 Upload Tips</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Maximum file size: 5GB (Vercel Blob)</li>
            <li>• Minimum chunk: 5 seconds</li>
            <li>• Maximum chunk: 60 minutes (3600 seconds)</li>
            <li>• First chunk is always free for preview</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
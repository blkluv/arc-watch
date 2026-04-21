
// frontend/src/app/upload/page.tsx

'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useWallet } from '@/components/WalletAuth';
import { videoAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { Upload as UploadIcon, FileVideo, Link2, ToggleLeft, ToggleRight, Clock, DollarSign, Settings } from 'lucide-react';
import { appConfig, formatDuration } from '@/config/app';

interface UploadForm {
  title: string;
  description: string;
  durationSeconds: string;
  chunkUnit: 'seconds' | 'minutes';
  chunkValue: string;
  pricePerChunk: string;
  videoUrl: string;
}

export default function UploadPage() {
  const { eoa: eoaAddress, dcwAddress } = useWallet();
  const router = useRouter();
  
  const [form, setForm] = useState<UploadForm>({
    title: '',
    description: '',
    durationSeconds: '',
    chunkUnit: 'minutes',
    chunkValue: '5',
    pricePerChunk: '0.001',
    videoUrl: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [useLocalFile, setUseLocalFile] = useState(true);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = Math.floor(video.duration);
        setVideoDuration(duration);
        setForm(prev => ({ 
          ...prev, 
          durationSeconds: duration.toString(),
          title: file.name.replace(/\.[^/.]+$/, "")
        }));
        URL.revokeObjectURL(video.src);
      };
      video.src = URL.createObjectURL(file);
      
      const localPath = `C:/Users/${process.env.USERNAME || 'worko'}/Videos/${file.name}`;
      setForm(prev => ({ ...prev, videoUrl: localPath }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!eoaAddress || !dcwAddress) {
      toast.error('Connect wallet first');
      return;
    }
    
    if (!form.durationSeconds || parseInt(form.durationSeconds) < 5) {
      toast.error('Video duration must be at least 5 seconds');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        durationSeconds: parseInt(form.durationSeconds, 10),
        chunkUnit: form.chunkUnit,
        chunkValue: form.chunkValue,
        pricePerChunk: parseFloat(form.pricePerChunk),
        videoUrl: form.videoUrl
      };
      
      console.log('📤 Uploading video:', payload);
      
      const res = await videoAPI.create(payload, eoaAddress);
      
      toast.success('✅ Video listed successfully!');
      router.push(`/watch/${res.data.data.id}`);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.error || 'Failed to list video');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // Calculate preview
  const getChunkSeconds = (): number => {
    const value = parseFloat(form.chunkValue) || 5;
    return form.chunkUnit === 'minutes' ? Math.round(value * 60) : Math.round(value);
  };
  
  const chunkSeconds = getChunkSeconds();
  const durationSec = parseInt(form.durationSeconds) || 0;
  const totalChunks = durationSec > 0 ? Math.ceil(durationSec / chunkSeconds) : 0;
  const totalCost = totalChunks * parseFloat(form.pricePerChunk || '0.001');

  const isValidChunk = chunkSeconds >= 5 && chunkSeconds <= 3600 && chunkSeconds <= durationSec;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <UploadIcon size={24} />
          List Your Video
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Source Selection Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Video Source:
              </span>
              <button
                type="button"
                onClick={() => setUseLocalFile(!useLocalFile)}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400"
              >
                {useLocalFile ? (
                  <>
                    <FileVideo size={16} />
                    Local File
                    <ToggleRight size={20} />
                  </>
                ) : (
                  <>
                    <Link2 size={16} />
                    Remote URL
                    <ToggleLeft size={20} />
                  </>
                )}
              </button>
            </div>

            {/* Local File Upload */}
            {useLocalFile ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select Video File
                  </label>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="video-file"
                    />
                    <label htmlFor="video-file" className="cursor-pointer">
                      <FileVideo size={48} className="mx-auto mb-2 text-gray-400" />
                      <p className="text-gray-600 dark:text-gray-300">
                        {videoFile ? videoFile.name : 'Click to select a video file'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        MP4, WebM, MOV (max 500MB recommended)
                      </p>
                    </label>
                  </div>
                  {videoFile && (
                    <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                      <p className="text-green-700 dark:text-green-300">
                        ✓ Selected: {videoFile.name}
                      </p>
                      <p className="text-green-600 dark:text-green-400 text-xs">
                        Size: {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                        {videoDuration && ` • Duration: ${formatDuration(videoDuration)}`}
                      </p>
                    </div>
                  )}
                </div>
                
                {form.videoUrl && (
                  <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">File Path:</p>
                    <code className="text-xs break-all">{form.videoUrl}</code>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Public Video URL *
                </label>
                <input
                  name="videoUrl"
                  required
                  type="url"
                  value={form.videoUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/video.mp4"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Video Title *
              </label>
              <input
                name="title"
                required
                value={form.title}
                onChange={handleChange}
                placeholder="Amazing Tutorial"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description *
              </label>
              <textarea
                name="description"
                required
                value={form.description}
                onChange={handleChange}
                placeholder="Brief intro to your video content..."
                rows={4}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Duration (seconds) *
              </label>
              <input
                name="durationSeconds"
                required
                type="number"
                min="5"
                step="1"
                value={form.durationSeconds}
                onChange={handleChange}
                placeholder="300"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              {form.durationSeconds && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatDuration(parseInt(form.durationSeconds))}
                </p>
              )}
            </div>

            {/* Chunk Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Settings size={14} />
                Chunk Duration *
              </label>
              <div className="flex gap-2">
                <input
                  name="chunkValue"
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.chunkValue}
                  onChange={handleChange}
                  placeholder="5"
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
                <select
                  name="chunkUnit"
                  value={form.chunkUnit}
                  onChange={handleChange}
                  className="w-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {chunkSeconds >= 60 
                  ? `${chunkSeconds / 60} minute${chunkSeconds >= 120 ? 's' : ''}`
                  : `${chunkSeconds} second${chunkSeconds !== 1 ? 's' : ''}`} per chunk
                {!isValidChunk && chunkSeconds > 0 && (
                  <span className="text-red-500 ml-2">
                    {chunkSeconds < 5 ? '(min 5 seconds)' : 
                     chunkSeconds > 3600 ? '(max 60 minutes)' : 
                     chunkSeconds > durationSec ? '(exceeds video duration)' : ''}
                  </span>
                )}
              </p>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <DollarSign size={14} />
                Price per chunk (USDC) *
              </label>
              <input
                name="pricePerChunk"
                required
                type="number"
                step="0.000001"
                min="0.000001"
                max="0.01"
                value={form.pricePerChunk}
                onChange={handleChange}
                placeholder="0.001"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                ≤ $0.01 per chunk (Hackathon compliant) ✓
              </p>
            </div>

            {/* Preview */}
            {durationSec > 0 && isValidChunk && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">📊 Video Preview</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Total Duration</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatDuration(durationSec)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Chunk Size</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {formatDuration(chunkSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Total Chunks</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {totalChunks} chunks
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Price per Chunk</p>
                    <p className="font-medium text-green-600 dark:text-green-400">
                      ${parseFloat(form.pricePerChunk || '0.001').toFixed(6)} USDC
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    💰 Total cost if fully watched: 
                    <span className="font-bold ml-1">${totalCost.toFixed(6)} USDC</span>
                  </p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !eoaAddress || !dcwAddress || (useLocalFile && !videoFile) || !isValidChunk}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {submitting 
                ? 'Publishing...' 
                : !eoaAddress || !dcwAddress
                  ? 'Connect Wallet to Publish' 
                  : useLocalFile && !videoFile
                  ? 'Select a Video File'
                  : !isValidChunk
                  ? 'Invalid Chunk Duration'
                  : '🚀 Publish Video'
              }
            </button>
          </form>
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-2">💡 Chunking Tips</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <li>• Minimum chunk: 5 seconds</li>
            <li>• Maximum chunk: 60 minutes (3600 seconds)</li>
            <li>• Shorter chunks = more granular payments</li>
            <li>• Longer chunks = fewer payment interruptions</li>
            <li>• First chunk is always free for preview</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
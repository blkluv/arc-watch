// backend/src/services/videoService.ts

import { prisma } from '../lib/prisma';

export interface Video {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  chunkDurationSeconds: number;  // ✅ Always stored as seconds
  pricePerChunk: number;
  creatorWallet: string;
  creatorDcw: string;
  videoUrl: string;
  createdAt: string;
}

export type CreateVideoInput = Omit<Video, 'id' | 'createdAt'>;

export async function createVideo(data: CreateVideoInput): Promise<Video> {
  // Validate chunk duration (minimum 5 seconds, maximum 1 hour)
  if (data.chunkDurationSeconds < 5) {
    throw new Error('Chunk duration must be at least 5 seconds');
  }
  if (data.chunkDurationSeconds > 3600) {
    throw new Error('Chunk duration cannot exceed 60 minutes (3600 seconds)');
  }
  
  const creator = await prisma.user.findUnique({
    where: { eoaAddress: data.creatorWallet }
  });
  
  if (!creator) {
    throw new Error(`Creator wallet ${data.creatorWallet} not found.`);
  }

  const video = await prisma.video.create({
    data: {
      title: data.title,
      description: data.description,
      durationSeconds: data.durationSeconds,
      pricePerSession: data.pricePerChunk,
      sessionDuration: data.chunkDurationSeconds,  // ✅ Store as seconds
      creatorAddress: data.creatorWallet,
      creatorDcw: data.creatorDcw,
      hlsManifestUrl: data.videoUrl,
      hlsBaseUrl: data.videoUrl.replace(/\/[^/]*$/, ''),
    },
  });

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    durationSeconds: video.durationSeconds,
    chunkDurationSeconds: video.sessionDuration,
    pricePerChunk: Number(video.pricePerSession),
    creatorWallet: video.creatorAddress,
    creatorDcw: video.creatorDcw,
    videoUrl: video.hlsManifestUrl,
    createdAt: video.createdAt.toISOString(),
  };
}

export async function getAllVideos(): Promise<Video[]> {
  const videos = await prisma.video.findMany({ 
    orderBy: { createdAt: 'desc' },
  });
  
  return videos.map(v => ({
    id: v.id,
    title: v.title,
    description: v.description,
    durationSeconds: v.durationSeconds,
    chunkDurationSeconds: v.sessionDuration,
    pricePerChunk: Number(v.pricePerSession),
    creatorWallet: v.creatorAddress,
    creatorDcw: v.creatorDcw,
    videoUrl: v.hlsManifestUrl,
    createdAt: v.createdAt.toISOString(),
  }));
}

export async function getVideoById(id: string): Promise<Video | undefined> {
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) return undefined;

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    durationSeconds: video.durationSeconds,
    chunkDurationSeconds: video.sessionDuration,
    pricePerChunk: Number(video.pricePerSession),
    creatorWallet: video.creatorAddress,
    creatorDcw: video.creatorDcw,
    videoUrl: video.hlsManifestUrl,
    createdAt: video.createdAt.toISOString(),
  };
}
/**
 * Persistence Service for Resumable Operations
 * Saves intermediate state to localStorage to allow resuming failed multi-step operations
 */

import { GeneratedTrend } from "../types";

const STORAGE_PREFIX = 'trendme_operation_';

export interface PostGenerationCheckpoint {
  influencerId: string;
  influencerName: string;
  timestamp: number;
  step: 'content' | 'images' | 'upload';
  content?: GeneratedTrend;
  images?: string[];
  gridType?: '2x2' | '3x3';
}

export interface InfluencerCreationCheckpoint {
  userId: string;
  timestamp: number;
  step: 'persona' | 'visuals';
  niche?: string;
  persona?: {
    name: string;
    bio: string;
    personality: string;
    visualOptions: string[];
  };
  selectedVisualIndex?: number;
}

/**
 * Save a checkpoint for post generation
 */
export const savePostGenerationCheckpoint = (checkpoint: PostGenerationCheckpoint): void => {
  try {
    const key = `${STORAGE_PREFIX}post_${checkpoint.influencerId}`;
    localStorage.setItem(key, JSON.stringify(checkpoint));
    console.log(`[Persistence] Saved checkpoint for post generation (${checkpoint.step})`);
  } catch (e) {
    console.error('[Persistence] Failed to save checkpoint:', e);
  }
};

/**
 * Load a checkpoint for post generation
 */
export const loadPostGenerationCheckpoint = (influencerId: string): PostGenerationCheckpoint | null => {
  try {
    const key = `${STORAGE_PREFIX}post_${influencerId}`;
    const data = localStorage.getItem(key);
    if (!data) return null;
    
    const checkpoint = JSON.parse(data) as PostGenerationCheckpoint;
    
    // Only return checkpoints less than 1 hour old
    const ageMs = Date.now() - checkpoint.timestamp;
    if (ageMs > 3600000) {
      console.log('[Persistence] Checkpoint expired, removing');
      clearPostGenerationCheckpoint(influencerId);
      return null;
    }
    
    console.log(`[Persistence] Loaded checkpoint for post generation (${checkpoint.step})`);
    return checkpoint;
  } catch (e) {
    console.error('[Persistence] Failed to load checkpoint:', e);
    return null;
  }
};

/**
 * Clear a checkpoint for post generation
 */
export const clearPostGenerationCheckpoint = (influencerId: string): void => {
  try {
    const key = `${STORAGE_PREFIX}post_${influencerId}`;
    localStorage.removeItem(key);
    console.log('[Persistence] Cleared checkpoint for post generation');
  } catch (e) {
    console.error('[Persistence] Failed to clear checkpoint:', e);
  }
};

/**
 * Save a checkpoint for influencer creation
 */
export const saveInfluencerCreationCheckpoint = (checkpoint: InfluencerCreationCheckpoint): void => {
  try {
    const key = `${STORAGE_PREFIX}influencer_${checkpoint.userId}`;
    localStorage.setItem(key, JSON.stringify(checkpoint));
    console.log(`[Persistence] Saved checkpoint for influencer creation (${checkpoint.step})`);
  } catch (e) {
    console.error('[Persistence] Failed to save checkpoint:', e);
  }
};

/**
 * Load a checkpoint for influencer creation
 */
export const loadInfluencerCreationCheckpoint = (userId: string): InfluencerCreationCheckpoint | null => {
  try {
    const key = `${STORAGE_PREFIX}influencer_${userId}`;
    const data = localStorage.getItem(key);
    if (!data) return null;
    
    const checkpoint = JSON.parse(data) as InfluencerCreationCheckpoint;
    
    // Only return checkpoints less than 1 hour old
    const ageMs = Date.now() - checkpoint.timestamp;
    if (ageMs > 3600000) {
      console.log('[Persistence] Checkpoint expired, removing');
      clearInfluencerCreationCheckpoint(userId);
      return null;
    }
    
    console.log(`[Persistence] Loaded checkpoint for influencer creation (${checkpoint.step})`);
    return checkpoint;
  } catch (e) {
    console.error('[Persistence] Failed to load checkpoint:', e);
    return null;
  }
};

/**
 * Clear a checkpoint for influencer creation
 */
export const clearInfluencerCreationCheckpoint = (userId: string): void => {
  try {
    const key = `${STORAGE_PREFIX}influencer_${userId}`;
    localStorage.removeItem(key);
    console.log('[Persistence] Cleared checkpoint for influencer creation');
  } catch (e) {
    console.error('[Persistence] Failed to clear checkpoint:', e);
  }
};

/**
 * Get all active checkpoints (for debugging)
 */
export const getAllCheckpoints = (): { key: string; data: any }[] => {
  const checkpoints: { key: string; data: any }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          checkpoints.push({ key, data: JSON.parse(data) });
        }
      }
    }
  } catch (e) {
    console.error('[Persistence] Failed to get all checkpoints:', e);
  }
  return checkpoints;
};

/**
 * Clear all expired checkpoints
 */
export const cleanupExpiredCheckpoints = (): void => {
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const data = localStorage.getItem(key);
        if (data) {
          const checkpoint = JSON.parse(data);
          const ageMs = now - checkpoint.timestamp;
          if (ageMs > 3600000) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log(`[Persistence] Cleaned up ${keysToRemove.length} expired checkpoints`);
    }
  } catch (e) {
    console.error('[Persistence] Failed to cleanup checkpoints:', e);
  }
};

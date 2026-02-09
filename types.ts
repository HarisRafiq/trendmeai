export interface Influencer {
  id: string;
  name: string;
  niche: string;
  bio: string;
  avatarUrl: string; // Base64 or URL
  visualStyle: string; // Description of their look for consistency
  personality: string;
  posts: Post[];
  createdAt: number;
}

export interface Post {
  id: string;
  influencerId: string;
  timestamp: number;
  topic: string; // The real-world event/trend
  caption: string;
  hashtags: string[];
  gridType: '2x2' | '3x3';
  images: string[]; // Array of Base64 image strings
  groundingUrls?: string[]; // Links to sources found by Gemini
}

export interface GeneratedTrend {
  topic: string;
  summary: string;
  caption: string;
  hashtags: string[];
  storyNarrative: string; // Rich description of the visual story arc
  slideDescriptions: string[]; // Per-slide intent/purpose (not image prompts)
  colorPalette: string; // Mood-driven color direction
  visualMood: string; // Overall aesthetic direction
  sourceUrls: string[];
}

export interface GridImageContext {
  topic: string;
  summary: string;
  storyNarrative: string;
  slideDescriptions: string[];
  colorPalette: string;
  visualMood: string;
  influencerName: string;
  visualStyle: string;
  personality: string;
  niche: string;
}

export interface TrendSignal {
  id: string;
  headline: string;
  summary: string;
  relevanceScore: number;
  sourceUrl?: string;
  context: string; // Full context for the generator
}

export interface GridConfig {
  rows: number;
  cols: number;
}

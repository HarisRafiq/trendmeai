import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedTrend, GridImageContext, TrendSignal, NewsArticle } from "../types";
import { fetchNewsForNiche, saveNewsArticles, getLastFetchTime, getNewsMetadata, markFetchInProgress } from "./firebase";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// Custom Error Classes
// ============================================

export class GeminiError extends Error {
  constructor(message: string, public operation: string, public originalError?: any) {
    super(message);
    this.name = 'GeminiError';
  }
}

export class GeminiQuotaError extends GeminiError {
  constructor(operation: string, originalError?: any) {
    super('API quota exceeded. Please try again later or check your API key limits.', operation, originalError);
    this.name = 'GeminiQuotaError';
  }
}

export class GeminiNetworkError extends GeminiError {
  constructor(operation: string, originalError?: any) {
    super('Network connection failed. Please check your internet connection.', operation, originalError);
    this.name = 'GeminiNetworkError';
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(operation: string, timeout: number, originalError?: any) {
    super(`Operation timed out after ${timeout / 1000}s. The request took too long to complete.`, operation, originalError);
    this.name = 'GeminiTimeoutError';
  }
}

export class GeminiParsingError extends GeminiError {
  constructor(operation: string, originalError?: any) {
    super('Failed to parse API response. The data format was unexpected.', operation, originalError);
    this.name = 'GeminiParsingError';
  }
}

export class GeminiAuthError extends GeminiError {
  constructor(operation: string, originalError?: any) {
    super('Authentication failed. Please check your API key configuration.', operation, originalError);
    this.name = 'GeminiAuthError';
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Wraps an async operation with a timeout.
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new GeminiTimeoutError(operation, timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
};

/**
 * Detects error type from API error and wraps it in appropriate typed error.
 */
const wrapError = (error: any, operation: string): GeminiError => {
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorString = String(error).toLowerCase();
  
  // Check for quota/rate limit errors
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || 
      errorString.includes('quota') || errorString.includes('429')) {
    return new GeminiQuotaError(operation, error);
  }
  
  // Check for authentication errors
  if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || 
      errorMessage.includes('forbidden') || errorString.includes('401') || errorString.includes('403')) {
    return new GeminiAuthError(operation, error);
  }
  
  // Check for network errors
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || 
      errorMessage.includes('connection') || error?.code === 'ECONNREFUSED') {
    return new GeminiNetworkError(operation, error);
  }
  
  // Check for timeout errors
  if (error instanceof GeminiTimeoutError) {
    return error;
  }
  
  // Check for parsing errors
  if (error instanceof SyntaxError || errorMessage.includes('json') || errorMessage.includes('parse')) {
    return new GeminiParsingError(operation, error);
  }
  
  // Generic Gemini error
  return new GeminiError(error?.message || 'An unexpected error occurred', operation, error);
};

/**
 * Retry an async operation with exponential backoff.
 * @param fn The async function to retry
 * @param operation Name of the operation for logging
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param initialDelay Initial delay in ms (default: 1000ms)
 * @param backoffMultiplier Multiplier for each retry delay (default: 2)
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  operation: string,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  backoffMultiplier: number = 2
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${operation}] Attempt ${attempt}/${maxRetries}...`);
      const result = await fn();
      if (attempt > 1) {
        console.log(`[${operation}] ✓ Succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      const wrappedError = wrapError(error, operation);
      
      // Don't retry on auth errors (will fail every time)
      if (wrappedError instanceof GeminiAuthError) {
        console.error(`[${operation}] ✗ Authentication error (not retrying):`, wrappedError.message);
        throw wrappedError;
      }
      
      // Don't retry on parsing errors (likely a bug, not transient)
      if (wrappedError instanceof GeminiParsingError) {
        console.error(`[${operation}] ✗ Parsing error (not retrying):`, wrappedError.message);
        throw wrappedError;
      }
      
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
        console.warn(`[${operation}] ⚠ Attempt ${attempt} failed: ${wrappedError.message}. Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error(`[${operation}] ✗ All ${maxRetries} attempts failed:`, wrappedError.message);
        throw wrappedError;
      }
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw wrapError(lastError, operation);
};

export const generateInfluencerPersona = async (niche: string): Promise<{ name: string; bio: string; personality: string; visualOptions: string[] }> => {
  return retryWithBackoff(async () => {
    const prompt = `Create a hyper-realistic, human-like persona for a social media influencer in the "${niche}" niche. 
    
    Return a JSON object with:
    - name: A realistic name (suitable for the niche).
    - bio: A short, engaging Instagram bio (max 150 chars).
    - personality: Key personality traits.
    - visualOptions: An array of exactly 4 DISTINCT physical descriptions. 
      * They must represent DIFFERENT people/characters (vary ethnicity, hair color/style, facial features).
      * Each description must be detailed enough for an image generator (e.g., "Asian woman with purple streak bob", "Latino man with curly fade and glasses", "Redhead woman with freckles").
      * All must fit the generated Name.
    `;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              bio: { type: Type.STRING },
              personality: { type: Type.STRING },
              visualOptions: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      }),
      30000, // 30s timeout
      'generateInfluencerPersona'
    );

    const text = response.text || '{}';
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```([\s\S]*?)```/);
      if (match) {
        data = JSON.parse(match[1]);
      } else {
        throw new GeminiParsingError('generateInfluencerPersona', e);
      }
    }

    // Fallback if visualOptions is missing or empty
    if (!data.visualOptions || !Array.isArray(data.visualOptions) || data.visualOptions.length === 0) {
      data.visualOptions = [
        "Natural look, brown hair, soft lighting",
        "Edgy look, dyed hair, street fashion",
        "Professional look, clean cut, glasses",
        "Boho chic look, wavy hair, warm tones"
      ];
    }
    
    // Ensure we have 4 options by repeating if necessary
    while(data.visualOptions.length < 4) {
      data.visualOptions.push(data.visualOptions[0]);
    }

    return data;
  }, 'generateInfluencerPersona');
};

export const generateSubTopics = async (niche: string): Promise<string[]> => {
  try {
    return await retryWithBackoff(async () => {
      const prompt = `Generate 5 specific, high-traffic sub-topics or search keywords related to "${niche}" that are likely to have recent news or trending content right now.
      Avoid generic terms. Be specific (e.g., instead of "Fashion", use "Sustainable fabrics" or "Met Gala" or "Thrifting trends").
      
      RETURN RAW JSON ARRAY OF STRINGS ONLY.`;

      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }),
        30000,
        'generateSubTopics'
      );
      
      const text = response.text || '[]';
      try {
        return JSON.parse(text);
      } catch (e) {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
        throw new GeminiParsingError('generateSubTopics', e);
      }
    }, 'generateSubTopics', 2);
  } catch (e) {
    console.warn(`[generateSubTopics] All attempts failed, using fallback:`, e instanceof GeminiError ? e.message : e);
    return [`${niche} news`, `${niche} trends`, `New in ${niche}`, `${niche} tips`, `Future of ${niche}`];
  }
};

const parseTrendsResponse = (text: string): any[] => {
    let trends: any[] = [];
    try {
        trends = JSON.parse(text);
    } catch (e) {
        const match = text.match(/```json\n([\s\S]*?)\n```/) || 
                      text.match(/```([\s\S]*?)```/) || 
                      text.match(/\[[\s\S]*\]/); 
        if (match) {
            try { trends = JSON.parse(match[0] || match[1]); } catch (err) {}
        }
    }
    
    if (!Array.isArray(trends) && trends && typeof trends === 'object') {
        return [trends];
    }
    return Array.isArray(trends) ? trends : [];
};

// ============================================
// NEWS ARTICLE DISCOVERY (with Firestore caching)
// ============================================

/**
 * Fetch news articles for a niche with intelligent caching and 1-hour rate limiting
 * Checks Firestore metadata for last fetch time, enforces 1-hour minimum between fetches globally
 * @param niche The niche to fetch news for
 * @param allowRetry Allow retry even if within 1-hour window (only for first-load failures)
 */
export const fetchNewsArticles = async (niche: string, allowRetry: boolean = false): Promise<NewsArticle[]> => {
  const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
  const IN_PROGRESS_TIMEOUT = 2 * 60 * 1000; // 2 minutes
  
  try {
    // Step 1: Check Firestore metadata for last fetch status and time
    console.log(`📰 Checking ${niche} news metadata...`);
    const metadata = await getNewsMetadata(niche);
    
    // Step 2: Handle different states
    if (metadata && !allowRetry) {
      const timeSinceLastFetch = Date.now() - metadata.lastFetchTime;
      const minutesSinceLastFetch = Math.round(timeSinceLastFetch / 60000);
      
      // Case 1: Fetch is in-progress
      if (metadata.status === 'in-progress') {
        if (timeSinceLastFetch < IN_PROGRESS_TIMEOUT) {
          // Recent in-progress fetch, return cache or wait
          console.log(`⏳ Fetch in-progress (${minutesSinceLastFetch}min ago), returning cache...`);
          const cachedArticles = await fetchNewsForNiche(niche, 50);
          if (cachedArticles.length > 0) {
            console.log(`📦 Returning ${cachedArticles.length} cached articles while fetch completes`);
            return cachedArticles;
          }
          // No cache yet, return empty (UI will show loading)
          console.log(`⏳ No cache yet, fetch still in progress`);
          return [];
        } else {
          // Stale in-progress (>2 min), assume failed, proceed with new fetch
          console.log(`⚠️ In-progress fetch timed out (${minutesSinceLastFetch}min), retrying...`);
        }
      }
      // Case 2: Fetch completed successfully
      else if (metadata.status === 'completed') {
        if (timeSinceLastFetch < ONE_HOUR) {
          const minutesRemaining = Math.ceil((ONE_HOUR - timeSinceLastFetch) / 60000);
          console.log(`✅ USING CACHE - ${minutesRemaining} min until next refresh`);
          
          const cachedArticles = await fetchNewsForNiche(niche, 50);
          console.log(`📦 Returning ${cachedArticles.length} cached articles (NO GEMINI CALL)`);
          return cachedArticles;
        } else {
          console.log(`❌ CACHE EXPIRED - ${minutesSinceLastFetch}min old, fetching fresh...`);
        }
      }
      // Case 3: Previous fetch failed
      else if (metadata.status === 'failed') {
        console.log(`⚠️ Previous fetch failed, retrying...`);
      }
    } else if (!metadata) {
      console.log(`🆕 FIRST FETCH for ${niche}`);
    } else {
      console.log(`🔄 RETRY ALLOWED`);
    }
    
    // Step 3: Mark fetch as in-progress before starting
    await markFetchInProgress(niche);
    
    // Step 4: Fetch fresh articles from Gemini
    console.log(`🔍 🚨 CALLING GEMINI API for ${niche}...`);
    const articles = await discoverNewsArticles(niche);
    
    // Step 5: Save to Firestore (this marks status as completed)
    if (articles.length > 0) {
      await saveNewsArticles(niche, articles);
      console.log(`✅ Saved ${articles.length} articles, marked as completed`);
    }
    
    return articles;
  } catch (error) {
    console.error(`❌ Error fetching news articles:`, error);
    
    // Mark fetch as failed
    try {
      const metadataRef = { niche, status: 'failed' as const, lastFetchTime: Date.now() };
      console.log(`❌ Marked ${niche} fetch as failed`);
    } catch (e) {
      console.error(`❌ Error marking fetch as failed:`, e);
    }
    
    // Fallback to cache even if stale
    try {
      const cachedArticles = await fetchNewsForNiche(niche, 50);
      if (cachedArticles.length > 0) {
        console.log(`⚠️ Returning ${cachedArticles.length} stale cached articles as fallback`);
        return cachedArticles;
      }
    } catch (cacheError) {
      console.error(`❌ Cache fallback failed:`, cacheError);
    }
    
    throw error;
  }
};

/**
 * Discover fresh news articles using Gemini with Google Search
 * Fetches 10-15 articles with 300-500 word detailed summaries for reading
 */
const discoverNewsArticles = async (niche: string): Promise<NewsArticle[]> => {
  // Attempt 1: Real-time search with Tools (with retry)
  try {
    return await retryWithBackoff(async () => {
      const prompt = `Find 12 specific, real-world news stories from the last 7 days related to "${niche}".
      
      For each article, provide:
      - headline: Clear, engaging title
      - summary: Brief 100-150 word summary
      - fullContext: Detailed 300-500 word article with key facts, quotes, and analysis for reading
      - relevanceScore: 0-100 score for ${niche} niche
      
      RETURN RAW JSON ONLY. No markdown.
      Format:
      [ { "headline": "...", "summary": "...", "fullContext": "...", "relevanceScore": 85 } ]`;
    
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }]
          }
        }),
        60000, // 60s timeout for more articles
        'discoverNewsArticles (search)'
      );

      const rawArticles = parseTrendsResponse(response.text || '[]');
      
      if (rawArticles.length === 0) {
        throw new Error('No articles returned from search');
      }
      
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      // Map to NewsArticle format
      const articles: NewsArticle[] = rawArticles.map((article, i) => {
        const sourceUrl = chunks[i]?.web?.uri || chunks.find(c => c.web?.uri)?.web?.uri || null;
        
        return {
          id: `news-${niche.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i}`,
          niche,
          headline: article?.headline || "Breaking News",
          summary: article?.summary || "",
          fullContext: article?.fullContext || article?.context || article?.summary || "",
          sourceUrl,
          relevanceScore: article?.relevanceScore || 80,
          fetchedAt: Date.now(),
          usageCount: 0,
          usedByPosts: []
        };
      });
      
      console.log(`✅ Discovered ${articles.length} news articles`);
      return articles;
    }, 'discoverNewsArticles (search)', 2);
  } catch (e) {
    console.warn(`[discoverNewsArticles] Search failed, falling back to internal knowledge:`, e instanceof GeminiError ? e.message : e);
  }

  // Attempt 2: Fallback (No Tools) with retry
  try {
    return await retryWithBackoff(async () => {
      const fallbackPrompt = `Generate 12 realistic news stories or content topics for the "${niche}" niche. 
      Focus on evergreen topics, current trends, and general industry news.
      
      For each article, provide:
      - headline: Clear, engaging title
      - summary: Brief 100-150 word summary
      - fullContext: Detailed 300-500 word article with key information for reading
      - relevanceScore: 0-100 score
      
      RETURN RAW JSON ONLY.
      Format: [ { "headline": "...", "summary": "...", "fullContext": "...", "relevanceScore": 70 } ]`;

      const fallbackResponse = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: fallbackPrompt,
          config: {
            responseMimeType: 'application/json'
          }
        }),
        45000,
        'discoverNewsArticles (fallback)'
      );

      const rawArticles = parseTrendsResponse(fallbackResponse.text || '[]');
      
      if (rawArticles.length === 0) {
        throw new GeminiParsingError('discoverNewsArticles (fallback)', new Error('Empty articles array'));
      }
      
      const articles: NewsArticle[] = rawArticles.map((article, i) => ({
        id: `news-${niche.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i}`,
        niche,
        headline: article?.headline || "Trending Topic",
        summary: article?.summary || "",
        fullContext: article?.fullContext || article?.context || article?.summary || "",
        sourceUrl: null,
        relevanceScore: article?.relevanceScore || 70,
        fetchedAt: Date.now(),
        usageCount: 0,
        usedByPosts: []
      }));
      
      console.log(`✅ Generated ${articles.length} fallback articles`);
      return articles;
    }, 'discoverNewsArticles (fallback)', 2);
  } catch (e) {
    console.error(`[discoverNewsArticles] All attempts failed:`, e instanceof GeminiError ? e.message : e);
    throw e instanceof GeminiError ? e : wrapError(e, 'discoverNewsArticles');
  }
};

export const discoverTrends = async (niche: string, focus?: string): Promise<TrendSignal[]> => {
    const searchTerm = focus ? `${focus} (${niche})` : niche;

    // Attempt 1: Real-time search with Tools (with retry)
    try {
        return await retryWithBackoff(async () => {
            const prompt = `Find 3 specific, real-world news stories from the last 7 days related to "${searchTerm}".
            
            RETURN RAW JSON ONLY. No markdown.
            Format:
            [ { "headline": "...", "summary": "...", "context": "...", "relevanceScore": 85 } ]`;
          
            const response = await withTimeout(
                ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt,
                    config: {
                        tools: [{ googleSearch: {} }]
                    }
                }),
                45000,
                'discoverTrends (search)'
            );

            const trends = parseTrendsResponse(response.text || '[]');
            
            if (trends.length === 0) {
                throw new Error('No trends returned from search');
            }
            
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const globalUrl = chunks.find(c => c.web?.uri)?.web?.uri;

            return trends.map((t, i) => ({
                id: `trend-live-${Date.now()}-${i}`,
                headline: t?.headline || "News Update",
                summary: t?.summary || "",
                relevanceScore: t?.relevanceScore || 80,
                context: t?.context || t?.summary || "",
                sourceUrl: globalUrl 
            }));
        }, 'discoverTrends (search)', 2);
    } catch (e) {
        console.warn(`[discoverTrends] Search failed, falling back to internal knowledge:`, e instanceof GeminiError ? e.message : e);
    }

    // Attempt 2: Fallback (No Tools) with retry
    try {
        return await retryWithBackoff(async () => {
            const topic = focus || niche;
            const fallbackPrompt = `Generate 3 realistic trending topics or content ideas for a "${topic}" influencer. 
            Focus on evergreen topics or general current events.
            
            RETURN RAW JSON ONLY.
            Format: [ { "headline": "...", "summary": "...", "context": "...", "relevanceScore": 70 } ]`;

            const fallbackResponse = await withTimeout(
                ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: fallbackPrompt,
                    config: {
                        responseMimeType: 'application/json'
                    }
                }),
                30000,
                'discoverTrends (fallback)'
            );

            const trends = parseTrendsResponse(fallbackResponse.text || '[]');
            if (trends.length === 0) {
                throw new GeminiParsingError('discoverTrends (fallback)', new Error('Empty trends array'));
            }
            
            return trends.map((t, i) => ({
                id: `trend-fallback-${Date.now()}-${i}`,
                headline: t?.headline || "Trending Topic",
                summary: t?.summary || "",
                relevanceScore: t?.relevanceScore || 70,
                context: t?.context || "",
                sourceUrl: undefined
            }));
        }, 'discoverTrends (fallback)', 2);
    } catch (e) {
        console.error(`[discoverTrends] All attempts failed:`, e instanceof GeminiError ? e.message : e);
        throw e instanceof GeminiError ? e : wrapError(e, 'discoverTrends');
    }
};

export const generateTrendPostContent = async (
  niche: string, 
  influencerName: string, 
  personality: string, 
  visualStyle: string,
  gridType: '2x2' | '3x3',
  specificTrend?: TrendSignal
): Promise<GeneratedTrend> => {
  return retryWithBackoff(async () => {
    const numSlides = gridType === '2x2' ? 4 : 9;
    
    let promptContext = "";
    if (specificTrend) {
      promptContext = `
      TOPIC TO COVER: ${specificTrend.headline}
      CONTEXT: ${specificTrend.context}
      SOURCE SUMMARY: ${specificTrend.summary}
      
      You must create a post specifically about this topic. Do not invent a new topic.
      `;
    } else {
      promptContext = `Find a currently trending topic or news event related to the "${niche}" industry.`;
    }

    const prompt = `You are ${influencerName}, a ${personality} ${niche} influencer. Create content for an Instagram carousel post.
      
${promptContext}

IMPORTANT - Fill out ALL fields with actual content:

1. CAPTION: Write a real Instagram caption in ${influencerName}'s voice. Use lowercase, be conversational, minimal emojis. 2-4 sentences about the topic. Example style: "honestly can't stop thinking about this... here's what i learned 💭"

2. TOPIC: A clear headline for this post

3. SUMMARY: 1-2 sentence summary of what the carousel covers

4. HASHTAGS: 5-8 relevant hashtags as array

5. STORY NARRATIVE: 2-3 sentences describing the visual journey - how does this carousel tell a story?

6. VISUAL MOOD: The aesthetic/vibe (e.g., "golden hour documentary" or "raw iPhone meets editorial")

7. COLOR PALETTE: 3-4 specific colors that tie it together (e.g., "warm amber, charcoal, cream")

8. SLIDE DESCRIPTIONS: ${numSlides} story beats - one for each slide. Mix candid photos of ${influencerName}, text cards with bold statements, data/insights, and personal moments. Visual style: ${visualStyle}

Return valid JSON matching the schema. DO NOT leave fields empty.`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: specificTrend ? [] : [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              summary: { type: Type.STRING },
              caption: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              storyNarrative: { type: Type.STRING },
              visualMood: { type: Type.STRING },
              colorPalette: { type: Type.STRING },
              slideDescriptions: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      }),
      specificTrend ? 30000 : 45000, // 30s with trend, 45s with search
      'generateTrendPostContent'
    );

    const text = response.text;
    let data: any = {};
    try {
      data = JSON.parse(text || '{}');
    } catch (e) {
      const match = text?.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        data = JSON.parse(match[1]);
      } else {
        throw new GeminiParsingError('generateTrendPostContent', e);
      }
    }
    
    // Debug logging
    console.log('[generateTrendPostContent] Parsed data:', {
      hasCaption: !!data.caption,
      captionLength: data.caption?.length || 0,
      captionPreview: data.caption?.substring(0, 50) || '(empty)'
    });
    
    // Extract grounding metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sourceUrls: string[] = specificTrend?.sourceUrl ? [specificTrend.sourceUrl] : [];
    chunks.forEach(chunk => {
      if (chunk.web?.uri) sourceUrls.push(chunk.web.uri);
    });

    const topicName = data.topic || specificTrend?.headline || "Update";

    const safeData: GeneratedTrend = {
      topic: topicName,
      summary: data.summary || specificTrend?.summary || "",
      caption: data.caption || `check this out... talking about ${topicName.toLowerCase()} today 💭`,
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      storyNarrative: data.storyNarrative || `A visual story exploring ${topicName} through the lens of ${influencerName}.`,
      visualMood: data.visualMood || "raw documentary feel with warm natural tones",
      colorPalette: data.colorPalette || "warm amber, soft white, deep charcoal, muted sage",
      slideDescriptions: Array.isArray(data.slideDescriptions) ? data.slideDescriptions : [],
      sourceUrls
    };

    // Fallback slide descriptions if empty
    if (safeData.slideDescriptions.length === 0) {
      const fallbackBeats = [
        `Opening hook — bold visual or statement about ${topicName} that stops the scroll`,
        `${influencerName} in their element, candid and unposed, connecting the topic to their personal world`,
        `Key insight or data point presented with editorial typography`,
        `The emotional core — why this matters, shown through a personal lens`,
      ];
      if (numSlides > 4) {
        fallbackBeats.push(
          `Deeper context — behind the scenes or real-world evidence`,
          `A provocative question or contrarian take to spark engagement`,
          `Visual proof or example that makes the abstract concrete`,
          `Community voice — quotes, DMs, or crowd reactions`,
          `Closing CTA — personal sign-off with personality`
        );
      }
      safeData.slideDescriptions = fallbackBeats.slice(0, numSlides);
    }
    
    // Pad if needed
    while (safeData.slideDescriptions.length < numSlides) {
      safeData.slideDescriptions.push(`Additional perspective on ${topicName} from ${influencerName}'s point of view`);
    }
    
    return safeData;
  }, 'generateTrendPostContent');
};

const splitImage = async (base64Image: string, rows: number, cols: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const pieceWidth = img.width / cols;
        const pieceHeight = img.height / rows;
        const pieces: string[] = [];
        
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const canvas = document.createElement('canvas');
            canvas.width = pieceWidth;
            canvas.height = pieceHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            
            ctx.drawImage(img, x * pieceWidth, y * pieceHeight, pieceWidth, pieceHeight, 0, 0, pieceWidth, pieceHeight);
            pieces.push(canvas.toDataURL('image/png'));
          }
        }
        resolve(pieces);
      };
      img.onerror = (e) => reject(e);
      img.src = base64Image;
    });
};

/**
 * Generate a grid of images from raw prompts (used for avatar generation).
 * Each prompt becomes one panel in a simple grid collage.
 */
export const generateGridImagesFromPrompts = async (prompts: string[], gridType: '2x2' | '3x3'): Promise<string[]> => {
    const rows = gridType === '2x2' ? 2 : 3;
    const cols = rows;
    
    try {
        return await retryWithBackoff(async () => {
            const panelDescriptions = prompts.map((p, i) => `Panel ${i + 1}: ${p}`).join('\n');
            
            const combinedPrompt = `
              Create a single ${gridType} grid collage image containing ${rows * cols} distinct panels.
              The grid MUST have clear, thin white separation lines between panels.
              
              Panels:
              ${panelDescriptions}
              
              Each panel must be photorealistic. Maintain consistency across all panels.
            `;
            
            const response = await withTimeout(
                ai.models.generateContent({
                    model: 'gemini-3-pro-image-preview',
                    contents: { parts: [{ text: combinedPrompt }] },
                    config: { imageConfig: { aspectRatio: "1:1", imageSize: "2K"  } }
                }),
                90000, // 90s for image generation
                'generateGridImagesFromPrompts'
            );

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    const gridImageBase64 = `data:image/png;base64,${part.inlineData.data}`;
                    return await splitImage(gridImageBase64, rows, cols);
                }
            }
            throw new GeminiParsingError('generateGridImagesFromPrompts', new Error('No image data in response'));
        }, 'generateGridImagesFromPrompts', 2); // Only 2 retries for expensive image gen
    } catch (e) {
        console.error(`[generateGridImagesFromPrompts] All attempts failed:`, e instanceof GeminiError ? e.message : e);
        // Fallback to placeholder images
        return Array(rows * cols).fill(`https://picsum.photos/400/400?random=${Math.random()}`);
    }
};

/**
 * Story-driven grid image generation.
 * Takes full creative context and generates a cohesive visual narrative as a grid,
 * then splits it into individual carousel slides.
 */
export const generateGridImages = async (context: GridImageContext, gridType: '2x2' | '3x3'): Promise<string[]> => {
    const rows = gridType === '2x2' ? 2 : 3;
    const cols = rows;
    const totalSlides = rows * cols;
    
    try {
        return await retryWithBackoff(async () => {
            // Build the story beats with position context
            const storyBeats = context.slideDescriptions.slice(0, totalSlides).map((desc, i) => {
                const position = i === 0 ? 'OPENING' : i === totalSlides - 1 ? 'CLOSING' : `MIDDLE (beat ${i})`;
                return `  Slide ${i + 1} [${position}]: ${desc}`;
            }).join('\n');
            
            const cinematicPrompt = `
You are an elite creative director shooting an Instagram carousel for ${context.influencerName}, a ${context.personality} voice in ${context.niche}.

THE STORY: ${context.topic}
${context.summary}

CREATIVE BRIEF:
${context.storyNarrative}

VISUAL DIRECTION:
- Mood: ${context.visualMood}
- Color palette: ${context.colorPalette}
- The influencer: ${context.visualStyle}

YOUR TASK: Create a single ${gridType} grid image (${totalSlides} panels separated by thin white lines) that tells this story as a cohesive visual narrative. This is NOT a collection of random images — it's a STORY told in ${totalSlides} frames.

STORY BEATS (each panel):
${storyBeats}

CRITICAL CREATIVE RULES:
1. VISUAL VARIETY IS EVERYTHING — each panel must feel like a different "camera angle" or medium:
   • Mix close-ups (face, hands, details) with wide/environmental shots
   • Mix real photography panels with typography/text-card panels
   • Vary perspective: overhead flat-lay, eye-level candid, low-angle dramatic
   • Some panels should be bold text on colored backgrounds (use the color palette)
   • Some panels should be raw, grainy, shot-on-iPhone feeling photos

2. ANTI-SAMENESS RULES:
   • NO two adjacent panels should use the same visual technique
   • NO uniform lighting across all panels — mix golden hour, harsh flash, soft window light, ring light
   • Text panels should use DIFFERENT typography styles (serif editorial, bold sans, handwritten)
   • Photo panels should vary between posed editorial and caught-off-guard candid

3. COHESION WITHOUT UNIFORMITY:
   • The color palette (${context.colorPalette}) is the thread that connects everything
   • Consistent identity of ${context.influencerName} across photo panels (${context.visualStyle})
   • The emotional arc should build — not every panel at the same intensity

4. MAKE IT FEEL HUMAN:
   • Imperfect crops, slightly off-center compositions, film grain on photos
   • Text cards should look designed but not corporate
   • The overall feel should be "talented creator with taste" not "AI generated content"

Generate the grid image now. Photorealistic for photo panels, editorial design for text panels. NOT illustration, NOT 3d render, NOT cartoon, NOT stock photo feeling.
`;
            
            const response = await withTimeout(
                ai.models.generateContent({
                    model: 'gemini-3-pro-image-preview',
                    contents: { parts: [{ text: cinematicPrompt }] },
                    config: { imageConfig: { aspectRatio: "1:1", imageSize: "2K"  } }
                }),
                90000, // 90s for complex image generation
                'generateGridImages'
            );

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    const gridImageBase64 = `data:image/png;base64,${part.inlineData.data}`;
                    return await splitImage(gridImageBase64, rows, cols);
                }
            }
            throw new GeminiParsingError('generateGridImages', new Error('No image data in response'));
        }, 'generateGridImages', 2); // Only 2 retries for expensive image gen
    } catch (e) {
        console.error(`[generateGridImages] All attempts failed:`, e instanceof GeminiError ? e.message : e);
        // Fallback to placeholder images
        return Array(totalSlides).fill(`https://picsum.photos/400/400?random=${Math.random()}`);
    }
};

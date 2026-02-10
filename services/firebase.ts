/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, where, orderBy, deleteDoc, getDocs, getDoc, writeBatch, Timestamp, limit } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Influencer, Post, NewsArticle } from '../types';

// Replace these with your actual Firebase config or ensure they are in your environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Debug: Log the config to see what values are being used
console.log('Firebase Config:', firebaseConfig);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// Auth Functions
export const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Error signing in", error);
    throw error;
  }
};

export const logout = () => firebaseSignOut(auth);

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Data Persistence Functions

// ============================================
// STORAGE FUNCTIONS - Upload images to Firebase Storage
// ============================================

/**
 * Upload a base64 image to Firebase Storage and return the download URL
 */
export const uploadImage = async (userId: string, base64Image: string, path: string): Promise<string> => {
  try {
    // Convert base64 to blob
    const response = await fetch(base64Image);
    const blob = await response.blob();
    
    // Create a unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const filename = `${timestamp}_${random}.jpg`;
    
    // Upload to Firebase Storage
    const imageRef = storageRef(storage, `users/${userId}/${path}/${filename}`);
    await uploadBytes(imageRef, blob);
    
    // Get and return the download URL
    const downloadURL = await getDownloadURL(imageRef);
    return downloadURL;
  } catch (error) {
    console.error("❌ Error uploading image:", error);
    throw error;
  }
};

/**
 * Upload multiple images in parallel
 */
export const uploadImages = async (userId: string, base64Images: string[], path: string): Promise<string[]> => {
  console.log(`📤 Uploading ${base64Images.length} images to Storage...`);
  const uploadPromises = base64Images.map(img => uploadImage(userId, img, path));
  const urls = await Promise.all(uploadPromises);
  console.log(`✅ Successfully uploaded ${urls.length} images`);
  return urls;
};

// ============================================
// INFLUENCER FUNCTIONS
// ============================================

/**
 * Subscribe to a user's influencers collection in real-time
 */
export const subscribeToInfluencers = (userId: string, callback: (data: Influencer[]) => void) => {
  console.log(`🔄 Subscribing to influencers for user: ${userId}`);
  const q = query(collection(db, 'users', userId, 'influencers'));
  
  return onSnapshot(q, (snapshot) => {
    console.log(`📦 Received ${snapshot.docs.length} influencer(s) from Firestore`);
    const influencers = snapshot.docs.map(doc => {
      const data = doc.data() as Omit<Influencer, 'posts'>;
      // Posts are stored separately now
      return { ...data, posts: [] } as Influencer;
    });
    // Sort by creation time (newest first)
    influencers.sort((a, b) => b.createdAt - a.createdAt);
    callback(influencers);
  }, (error) => {
    console.error("❌ Error fetching influencers:", error);
  });
};

/**
 * Save influencer metadata (without posts - they're stored separately)
 */
export const saveInfluencer = async (userId: string, influencer: Omit<Influencer, 'posts'>) => {
  try {
    const ref = doc(db, 'users', userId, 'influencers', influencer.id);
    
    const dataToSave = {
      id: influencer.id,
      name: influencer.name,
      niche: influencer.niche,
      bio: influencer.bio,
      avatarUrl: influencer.avatarUrl,
      visualStyle: influencer.visualStyle,
      personality: influencer.personality,
      createdAt: influencer.createdAt
    };
    
    console.log(`💾 Saving influencer: ${influencer.name}`);
    await setDoc(ref, dataToSave);
    console.log(`✅ Successfully saved influencer: ${influencer.name}`);
  } catch (error) {
    console.error("❌ Error saving influencer:", error);
    throw error;
  }
};

// ============================================
// POST FUNCTIONS
// ============================================

/**
 * Subscribe to posts for a specific influencer in real-time
 */
export const subscribeToPosts = (userId: string, influencerId: string, callback: (posts: Post[]) => void) => {
  console.log(`🔄 Subscribing to posts for influencer: ${influencerId}`);
  console.log(`   Path: users/${userId}/posts`);
  console.log(`   Filter: influencerId == ${influencerId}`);
  
  // Query without orderBy to avoid needing a composite index
  // We'll sort in memory instead
  const q = query(
    collection(db, 'users', userId, 'posts'),
    where('influencerId', '==', influencerId)
  );
  
  return onSnapshot(q, (snapshot) => {
    console.log(`📦 Received ${snapshot.docs.length} post(s) for influencer ${influencerId}`);
    if (snapshot.docs.length > 0) {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`   - Post: "${data.topic}" (${doc.id})`);
      });
    }
    
    // Get posts and sort by timestamp in memory (newest first)
    const posts = snapshot.docs
      .map(doc => doc.data() as Post)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    callback(posts);
  }, (error) => {
    console.error("❌ Error fetching posts:", error);
    console.error("   Error code:", error.code);
    console.error("   Error message:", error.message);
    callback([]);
  });
};

/**
 * Save a post (images should already be uploaded to Storage)
 */
export const savePost = async (userId: string, post: Post) => {
  try {
    const ref = doc(db, 'users', userId, 'posts', post.id);
    
    console.log(`💾 Saving post to Firestore...`);
    console.log(`   Path: users/${userId}/posts/${post.id}`);
    console.log(`   Topic: "${post.topic}"`);
    console.log(`   Images: ${post.images.length}`);
    console.log(`   Influencer ID: ${post.influencerId}`);
    
    await setDoc(ref, post);
    console.log(`✅ Successfully saved post: ${post.topic}`);
  } catch (error) {
    console.error("❌ Error saving post:", error);
    console.error("Post data:", {
      id: post.id,
      topic: post.topic,
      influencerId: post.influencerId,
      imagesCount: post.images.length
    });
    throw error;
  }
};

/**
 * Delete a post
 */
export const deletePost = async (userId: string, postId: string) => {
  try {
    const ref = doc(db, 'users', userId, 'posts', postId);
    await deleteDoc(ref);
    console.log(`✅ Deleted post: ${postId}`);
  } catch (error) {
    console.error("❌ Error deleting post:", error);
    throw error;
  }
};

// ============================================
// NEWS ARTICLE FUNCTIONS
// ============================================

/**
 * Get the metadata for a specific niche including status and timestamps
 * Returns null if niche has never been fetched
 */
export const getNewsMetadata = async (niche: string): Promise<{
  lastFetchTime: number;
  status: 'in-progress' | 'completed' | 'failed';
  articleCount: number;
} | null> => {
  try {
    const metadataRef = doc(db, 'newsArticles', niche, 'metadata', 'lastFetch');
    const snapshot = await getDoc(metadataRef);
    
    if (!snapshot.exists()) {
      console.log(`📭 No metadata found for ${niche}`);
      return null;
    }
    
    const data = snapshot.data();
    const lastFetchTime = data?.lastFetchTime || Date.now();
    const status = data?.status || 'completed';
    const articleCount = data?.articleCount || 0;
    
    const minutesAgo = Math.round((Date.now() - lastFetchTime) / 60000);
    console.log(`📅 ${niche} metadata: status=${status}, ${minutesAgo}min ago, ${articleCount} articles`);
    
    return { lastFetchTime, status, articleCount };
  } catch (error) {
    console.error("❌ Error fetching metadata:", error);
    return null;
  }
};

/**
 * Get the last fetch time for a specific niche from metadata document
 * Returns null if niche has never been fetched
 */
export const getLastFetchTime = async (niche: string): Promise<number | null> => {
  const metadata = await getNewsMetadata(niche);
  return metadata?.lastFetchTime || null;
};

/**
 * Fetch news articles for a specific niche from the top-level newsArticles collection
 * Articles are shared across all users for efficient caching
 */
export const fetchNewsForNiche = async (niche: string, maxResults: number = 50): Promise<NewsArticle[]> => {
  try {
    console.log(`📰 Fetching news for niche: ${niche}`);
    
    // Query top-level collection: newsArticles/{niche}/articles
    const q = query(
      collection(db, 'newsArticles', niche, 'articles'),
      orderBy('fetchedAt', 'desc'),
      limit(maxResults)
    );
    
    const snapshot = await getDocs(q);
    const articles = snapshot.docs.map(doc => doc.data() as NewsArticle);
    
    console.log(`✅ Fetched ${articles.length} articles for ${niche}`);
    return articles;
  } catch (error) {
    console.error("❌ Error fetching news articles:", error);
    return [];
  }
};

/**
 * Mark a niche fetch as in-progress
 * Call this before starting a fetch to prevent duplicate requests
 */
export const markFetchInProgress = async (niche: string) => {
  try {
    const metadataRef = doc(db, 'newsArticles', niche, 'metadata', 'lastFetch');
    await setDoc(metadataRef, {
      niche,
      status: 'in-progress',
      lastFetchTime: Date.now(),
      lastUpdated: Date.now()
    }, { merge: true });
    console.log(`🔄 Marked ${niche} fetch as in-progress`);
  } catch (error) {
    console.error("❌ Error marking fetch in-progress:", error);
  }
};

/**
 * Save multiple news articles to Firestore
 * Uses merge to avoid overwriting existing usage data
 * Also updates metadata document with lastFetchTime and completed status
 */
export const saveNewsArticles = async (niche: string, articles: NewsArticle[]) => {
  try {
    console.log(`💾 Saving ${articles.length} news articles for ${niche}...`);
    
    const batch = writeBatch(db);
    
    // Save all articles
    for (const article of articles) {
      const ref = doc(db, 'newsArticles', niche, 'articles', article.id);
      // Use merge to preserve existing usageCount and usedByPosts if they exist
      batch.set(ref, article, { merge: true });
    }
    
    // Update metadata document with fetch timestamp and completed status
    const metadataRef = doc(db, 'newsArticles', niche, 'metadata', 'lastFetch');
    batch.set(metadataRef, {
      niche,
      lastFetchTime: Date.now(),
      status: 'completed',
      articleCount: articles.length,
      lastUpdated: Date.now()
    }, { merge: true });
    
    await batch.commit();
    console.log(`✅ Successfully saved ${articles.length} articles and marked as completed`);
  } catch (error) {
    console.error("❌ Error saving news articles:", error);
    throw error;
  }
};

/**
 * Mark a news article as used by creating a post reference
 * Updates usageCount and adds to usedByPosts array
 */
export const markArticleUsed = async (
  niche: string,
  articleId: string,
  postId: string,
  userId: string,
  influencerId: string
) => {
  try {
    console.log(`📍 Marking article ${articleId} as used by post ${postId}`);
    
    const ref = doc(db, 'newsArticles', niche, 'articles', articleId);
    
    // Fetch current article to update arrays
    const snapshot = await getDocs(query(collection(db, 'newsArticles', niche, 'articles'), where('__name__', '==', articleId)));
    
    if (snapshot.empty) {
      console.warn(`⚠️ Article ${articleId} not found`);
      return;
    }
    
    const currentData = snapshot.docs[0].data() as NewsArticle;
    const updatedUsedByPosts = [
      ...(currentData.usedByPosts || []),
      { postId, userId, influencerId }
    ];
    
    await setDoc(ref, {
      usageCount: (currentData.usageCount || 0) + 1,
      usedByPosts: updatedUsedByPosts
    }, { merge: true });
    
    console.log(`✅ Updated article usage tracking`);
  } catch (error) {
    console.error("❌ Error marking article as used:", error);
    throw error;
  }
};

/**
 * Check if a user has already created a post from a specific article
 */
export const checkUserUsedArticle = async (
  niche: string,
  articleId: string,
  userId: string
): Promise<boolean> => {
  try {
    const q = query(
      collection(db, 'newsArticles', niche, 'articles'),
      where('__name__', '==', articleId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return false;
    
    const article = snapshot.docs[0].data() as NewsArticle;
    const usedByPosts = article.usedByPosts || [];
    
    return usedByPosts.some(usage => usage.userId === userId);
  } catch (error) {
    console.error("❌ Error checking article usage:", error);
    return false;
  }
};

/**
 * Clean up old news articles (older than specified days)
 * Runs as a batch delete operation
 */
export const cleanupOldNews = async (olderThanDays: number = 7) => {
  try {
    console.log(`🧹 Cleaning up news articles older than ${olderThanDays} days...`);
    
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    // Note: In a production app, you'd want to query all niches
    // For now, this is a manual cleanup function that needs niche specified
    // Consider using Firebase Cloud Functions for automated cleanup
    
    console.log(`ℹ️ Cleanup requires niche parameter - implement via Cloud Function for automation`);
  } catch (error) {
    console.error("❌ Error cleaning up old news:", error);
    throw error;
  }
};
/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Influencer, Post } from '../types';

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
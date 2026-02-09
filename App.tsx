import React, { useState, useEffect, useMemo } from "react";
import { Toaster } from "react-hot-toast";
import { Sidebar } from "./components/Sidebar";
import { CreateInfluencerModal } from "./components/CreateInfluencerModal";
import { InfluencerFeed } from "./components/InfluencerFeed";
import { Login } from "./components/Login";
import { Influencer, Post } from "./types";
import { Users, Loader2, Menu, X } from "lucide-react";
import {
  subscribeToAuth,
  subscribeToInfluencers,
  subscribeToPosts,
  saveInfluencer,
  logout,
} from "./services/firebase";
import { User } from "firebase/auth";

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [activeInfluencerId, setActiveInfluencerId] = useState<string | null>(
    null,
  );
  const [activePosts, setActivePosts] = useState<Post[]>([]);
  const [postsCount, setPostsCount] = useState<Record<string, number>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = subscribeToAuth((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Influencers when User is logged in
  useEffect(() => {
    if (!user) {
      setInfluencers([]);
      return;
    }

    const unsubscribe = subscribeToInfluencers(user.uid, (data) => {
      setInfluencers(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Monitor Posts for the active influencer
  useEffect(() => {
    if (!user || !activeInfluencerId) {
      setActivePosts([]);
      return;
    }

    console.log(
      `📊 Setting up post subscription for influencer: ${activeInfluencerId}`,
    );
    const unsubscribe = subscribeToPosts(
      user.uid,
      activeInfluencerId,
      (posts) => {
        console.log(
          `📥 Received ${posts.length} posts for influencer ${activeInfluencerId}`,
        );
        setActivePosts(posts);

        // Update posts count for this influencer
        setPostsCount((prev) => ({
          ...prev,
          [activeInfluencerId]: posts.length,
        }));
      },
    );
    return () => {
      console.log(`🔌 Unsubscribing from posts for ${activeInfluencerId}`);
      unsubscribe();
    };
  }, [user, activeInfluencerId]);

  const handleCreateInfluencer = async (newInfluencer: Influencer) => {
    if (!user) return;
    console.log("📝 Creating new influencer:", newInfluencer.name);
    // Save to Firestore (without posts - they're stored separately)
    const { posts, ...influencerData } = newInfluencer;
    await saveInfluencer(user.uid, influencerData);
    setActiveInfluencerId(newInfluencer.id);
  };

  // Combine influencer data with posts for the active influencer
  // Use useMemo to prevent unnecessary re-renders
  const activeInfluencerWithPosts = useMemo(() => {
    const activeInfluencer = influencers.find(
      (inf) => inf.id === activeInfluencerId,
    );
    if (!activeInfluencer) return null;

    console.log(
      `🔄 Combining influencer ${activeInfluencer.name} with ${activePosts.length} posts`,
    );
    return { ...activeInfluencer, posts: activePosts };
  }, [influencers, activeInfluencerId, activePosts]);

  // Auth Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  // Not Logged In
  if (!user) {
    return <Login />;
  }

  // Main App
  return (
    <div className="flex min-h-screen bg-[#0f172a] text-slate-100 font-sans">
      {/* Mobile backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        influencers={influencers}
        activeInfluencerId={activeInfluencerId}
        onSelectInfluencer={(id) => {
          setActiveInfluencerId(id);
          setIsMobileSidebarOpen(false);
        }}
        onOpenCreateModal={() => {
          setIsModalOpen(true);
          setIsMobileSidebarOpen(false);
        }}
        user={user}
        onLogout={logout}
        postsCount={postsCount}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      {activeInfluencerWithPosts ? (
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header */}
          <div className="md:hidden sticky top-0 z-30 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 border border-slate-600">
                <img
                  src={activeInfluencerWithPosts.avatarUrl}
                  alt={activeInfluencerWithPosts.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="font-semibold text-white truncate">
                {activeInfluencerWithPosts.name}
              </h2>
            </div>
          </div>
          <InfluencerFeed
            influencer={activeInfluencerWithPosts}
            userId={user.uid}
          />
        </main>
      ) : (
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header */}
          <div className="md:hidden sticky top-0 z-30 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-pink-500" />
              <h2 className="font-semibold text-white">TrendMeAI</h2>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-[#0f172a]">
            <div className="max-w-lg w-full text-center space-y-4 sm:space-y-6">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 transform rotate-3 border border-slate-700 shadow-xl">
                <Users className="w-8 h-8 sm:w-10 sm:h-10 text-pink-500" />
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                Welcome to TrendMeAI
              </h1>
              <p className="text-base sm:text-lg text-slate-400 px-2">
                Your personal studio for creating virtual influencers driven by
                real-world data and Gemini AI.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-6 sm:mt-8">
                <div className="bg-slate-800/50 p-4 sm:p-6 rounded-xl border border-slate-700">
                  <h3 className="font-semibold text-white mb-2">
                    Create Persona
                  </h3>
                  <p className="text-sm text-slate-400">
                    Define a niche and let Gemini generate a unique personality
                    and visual style.
                  </p>
                </div>
                <div className="bg-slate-800/50 p-4 sm:p-6 rounded-xl border border-slate-700">
                  <h3 className="font-semibold text-white mb-2">
                    Automate Content
                  </h3>
                  <p className="text-sm text-slate-400">
                    Connect to real-time search trends to generate relevant
                    posts and story grids.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-6 sm:mt-8 px-6 sm:px-8 py-3 sm:py-4 bg-white text-slate-900 font-bold rounded-lg hover:bg-slate-200 transition-colors min-h-[44px] text-sm sm:text-base"
              >
                Get Started
              </button>
            </div>
          </div>
        </main>
      )}

      {isModalOpen && (
        <CreateInfluencerModal
          onClose={() => setIsModalOpen(false)}
          onCreate={handleCreateInfluencer}
          userId={user.uid}
        />
      )}

      {/* Global Toast Notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: "#1e293b",
            color: "#fff",
            border: "1px solid #334155",
          },
          success: {
            iconTheme: {
              primary: "#10b981",
              secondary: "#fff",
            },
          },
          error: {
            duration: 6000,
            iconTheme: {
              primary: "#ef4444",
              secondary: "#fff",
            },
          },
          loading: {
            iconTheme: {
              primary: "#3b82f6",
              secondary: "#fff",
            },
          },
        }}
      />
    </div>
  );
};

export default App;

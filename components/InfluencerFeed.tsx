import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Influencer,
  Post,
  TrendSignal,
  GridImageContext,
  NewsArticle,
} from "../types";
import {
  generateTrendPostContent,
  generateGridImages,
  GeminiError,
} from "../services/geminiService";
import { uploadImages, savePost, markArticleUsed } from "../services/firebase";
import { PostGrid } from "./PostGrid";
import { BreakingNewsRoom } from "./BreakingNewsRoom";
import {
  Sparkles,
  Loader2,
  Globe,
  LayoutGrid,
  Radar,
  AlertCircle,
  RefreshCw,
  Newspaper,
} from "lucide-react";
import {
  savePostGenerationCheckpoint,
  loadPostGenerationCheckpoint,
  clearPostGenerationCheckpoint,
} from "../services/persistenceService";

interface InfluencerFeedProps {
  influencer: Influencer;
  userId: string;
}

export const InfluencerFeed: React.FC<InfluencerFeedProps> = ({
  influencer,
  userId,
}) => {
  const [activeTab, setActiveTab] = useState<"feed" | "newsroom">("newsroom");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [gridType, setGridType] = useState<"2x2" | "3x3">("2x2");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check for checkpoint on mount
  useEffect(() => {
    const checkpoint = loadPostGenerationCheckpoint(influencer.id);
    if (checkpoint) {
      const shouldResume = window.confirm(
        `You have an incomplete post generation (${checkpoint.step}). Would you like to resume?`,
      );

      if (shouldResume) {
        if (checkpoint.content && checkpoint.step === "images") {
          // Resume from image generation
          handleResumeFromCheckpoint(checkpoint);
        } else if (checkpoint.images && checkpoint.step === "upload") {
          // Resume from upload (rare case if upload failed)
          handleResumeUpload(checkpoint);
        }
      } else {
        clearPostGenerationCheckpoint(influencer.id);
      }
    }
  }, [influencer.id]);

  const handleResumeFromCheckpoint = async (checkpoint: any) => {
    setIsGenerating(true);
    setActiveTab("feed");
    setErrorMsg(null);
    toast.loading("Resuming from checkpoint...", { duration: 2000 });

    try {
      if (checkpoint.step === "images" && checkpoint.content) {
        // Resume image generation
        setGenerationStatus(
          `Directing visual story (Grid ${checkpoint.gridType || "2x2"})...`,
        );

        const imageContext: GridImageContext = {
          topic: checkpoint.content.topic,
          summary: checkpoint.content.summary,
          storyNarrative: checkpoint.content.storyNarrative,
          slideDescriptions: checkpoint.content.slideDescriptions,
          colorPalette: checkpoint.content.colorPalette,
          visualMood: checkpoint.content.visualMood,
          influencerName: influencer.name,
          visualStyle: influencer.visualStyle,
          personality: influencer.personality,
          niche: influencer.niche,
        };

        const base64Images = await generateGridImages(
          imageContext,
          checkpoint.gridType || "2x2",
        );

        // Update checkpoint with images
        savePostGenerationCheckpoint({
          ...checkpoint,
          step: "upload",
          images: base64Images,
        });

        setGenerationStatus("Uploading images to cloud storage...");
        const imageUrls = await uploadImages(
          userId,
          base64Images,
          `posts/${influencer.id}`,
        );

        const newPost: Post = {
          id: Math.random().toString(36).substring(2, 9),
          influencerId: influencer.id,
          timestamp: Date.now(),
          topic: checkpoint.content.topic,
          caption: checkpoint.content.caption,
          hashtags: checkpoint.content.hashtags,
          gridType: checkpoint.gridType || "2x2",
          images: imageUrls,
          groundingUrls: checkpoint.content.sourceUrls,
        };

        setGenerationStatus("Saving post...");
        await savePost(userId, newPost);
        clearPostGenerationCheckpoint(influencer.id);
        toast.success("Post published successfully!");
      }
    } catch (error) {
      const errorMessage =
        error instanceof GeminiError ? error.message : "Resume failed";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  const handleResumeUpload = async (checkpoint: any) => {
    setIsGenerating(true);
    setActiveTab("feed");
    setErrorMsg(null);
    toast.loading("Resuming upload...", { duration: 2000 });

    try {
      setGenerationStatus("Uploading images to cloud storage...");
      const imageUrls = await uploadImages(
        userId,
        checkpoint.images,
        `posts/${influencer.id}`,
      );

      const newPost: Post = {
        id: Math.random().toString(36).substring(2, 9),
        influencerId: influencer.id,
        timestamp: Date.now(),
        topic: checkpoint.content.topic,
        caption: checkpoint.content.caption,
        hashtags: checkpoint.content.hashtags,
        gridType: checkpoint.gridType || "2x2",
        images: imageUrls,
        groundingUrls: checkpoint.content.sourceUrls,
      };

      setGenerationStatus("Saving post...");
      await savePost(userId, newPost);
      clearPostGenerationCheckpoint(influencer.id);
      toast.success("Post published successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  const handleCreatePost = async (
    articleOrTrend?: NewsArticle | TrendSignal,
  ) => {
    setIsGenerating(true);
    setActiveTab("feed");
    setErrorMsg(null);

    // Determine if we're using a NewsArticle or TrendSignal
    const isNewsArticle = articleOrTrend && "fullContext" in articleOrTrend;
    const sourceArticle = isNewsArticle
      ? (articleOrTrend as NewsArticle)
      : undefined;
    const trendSignal = isNewsArticle
      ? undefined
      : (articleOrTrend as TrendSignal | undefined);

    // Convert NewsArticle to TrendSignal format for content generation
    const specificTrend: TrendSignal | undefined = sourceArticle
      ? {
          id: sourceArticle.id,
          headline: sourceArticle.headline,
          summary: sourceArticle.summary,
          relevanceScore: sourceArticle.relevanceScore,
          sourceUrl: sourceArticle.sourceUrl,
          context: sourceArticle.fullContext,
        }
      : trendSignal;

    try {
      // Step 1: Generate content
      if (specificTrend) {
        setGenerationStatus(
          `Analyzing: ${specificTrend.headline.substring(0, 30)}...`,
        );
        toast.loading(
          `Analyzing: ${specificTrend.headline.substring(0, 30)}...`,
          { id: "content-gen" },
        );
      } else {
        setGenerationStatus("Scanning global events...");
        toast.loading("Scanning global events...", { id: "content-gen" });
      }

      const trendData = await generateTrendPostContent(
        influencer.niche,
        influencer.name,
        influencer.personality,
        influencer.visualStyle,
        gridType,
        specificTrend,
      );
      toast.success("Content ready!", { id: "content-gen" });

      // Save checkpoint after content generation
      savePostGenerationCheckpoint({
        influencerId: influencer.id,
        influencerName: influencer.name,
        timestamp: Date.now(),
        step: "images",
        content: trendData,
        gridType,
      });

      // Step 2: Generate images
      setGenerationStatus(`Directing visual story (Grid ${gridType})...`);
      toast.loading(`Generating ${gridType} story grid...`, {
        id: "images-gen",
      });

      const imageContext: GridImageContext = {
        topic: trendData.topic,
        summary: trendData.summary,
        storyNarrative: trendData.storyNarrative,
        slideDescriptions: trendData.slideDescriptions,
        colorPalette: trendData.colorPalette,
        visualMood: trendData.visualMood,
        influencerName: influencer.name,
        visualStyle: influencer.visualStyle,
        personality: influencer.personality,
        niche: influencer.niche,
      };

      const base64Images = await generateGridImages(imageContext, gridType);
      toast.success("Images generated!", { id: "images-gen" });

      // Update checkpoint with images
      savePostGenerationCheckpoint({
        influencerId: influencer.id,
        influencerName: influencer.name,
        timestamp: Date.now(),
        step: "upload",
        content: trendData,
        images: base64Images,
        gridType,
      });

      // Step 3: Upload
      setGenerationStatus("Uploading images to cloud storage...");
      toast.loading("Uploading to cloud...", { id: "upload" });

      const imageUrls = await uploadImages(
        userId,
        base64Images,
        `posts/${influencer.id}`,
      );
      toast.success("Upload complete!", { id: "upload" });

      // Step 4: Save post
      const newPost: Post = {
        id: Math.random().toString(36).substring(2, 9),
        influencerId: influencer.id,
        timestamp: Date.now(),
        topic: trendData.topic,
        caption: trendData.caption,
        hashtags: trendData.hashtags,
        gridType: gridType,
        images: imageUrls,
        groundingUrls: trendData.sourceUrls,
        ...(sourceArticle?.id && { sourceArticleId: sourceArticle.id }), // Only include if exists
      };

      setGenerationStatus("Saving post...");
      toast.loading("Publishing post...", { id: "save" });

      await savePost(userId, newPost);

      // Mark article as used if it was a news article
      if (sourceArticle) {
        await markArticleUsed(
          sourceArticle.niche,
          sourceArticle.id,
          newPost.id,
          userId,
          influencer.id,
        );
      }

      clearPostGenerationCheckpoint(influencer.id);
      toast.success("Post published successfully!", { id: "save" });
    } catch (error) {
      const errorMessage =
        error instanceof GeminiError
          ? error.message
          : "Failed to generate content";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
      // Keep checkpoint so user can retry
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  return (
    <div className="flex-1 h-screen overflow-hidden flex flex-col bg-[#0f172a]">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 sm:p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 shrink-0">
        {/* Influencer info - hidden on mobile as shown in mobile header */}
        <div className="hidden sm:flex items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-emerald-500/50 p-0.5">
            <img
              src={influencer.avatarUrl}
              alt={influencer.name}
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              {influencer.name}
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
                AI MODEL
              </span>
            </h1>
            <p className="text-slate-400 text-xs">{influencer.niche}</p>
          </div>
        </div>

        {/* Tab Switcher and Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
          {/* Tab Switcher */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab("newsroom")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all min-h-[44px] ${
                activeTab === "newsroom"
                  ? "bg-slate-800 text-blue-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Radar size={16} />
              <span className="hidden xs:inline">Breaking News</span>
              <span className="xs:hidden">News</span>
            </button>
            <button
              onClick={() => setActiveTab("feed")}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all min-h-[44px] ${
                activeTab === "feed"
                  ? "bg-slate-800 text-pink-400 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutGrid size={16} />
              <span className="hidden xs:inline">Live Feed</span>
              <span className="xs:hidden">Feed</span>
            </button>
          </div>

          {/* Grid Type Selector & Generate Button */}
          <div className="flex items-center gap-3 justify-between sm:justify-start">
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setGridType("2x2")}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all min-h-[44px] ${gridType === "2x2" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              >
                2x2
              </button>
              <button
                onClick={() => setGridType("3x3")}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-all min-h-[44px] ${gridType === "3x3" ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
              >
                3x3
              </button>
            </div>
            {/* Quick create button */}
            <button
              onClick={() => handleCreatePost()}
              disabled={isGenerating}
              className="bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-lg transition-all border border-slate-700 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Random Auto-Generate"
            >
              <Sparkles
                size={20}
                className={isGenerating ? "text-slate-500" : "text-pink-500"}
              />
            </button>
          </div>
        </div>
      </div>

      {isGenerating && (
        <div className="w-full bg-emerald-900/20 border-b border-emerald-900/50 p-2 text-center text-xs text-emerald-400 font-mono animate-pulse flex items-center justify-center gap-2">
          <Loader2 size={12} className="animate-spin" />
          STATUS: {generationStatus.toUpperCase()}
        </div>
      )}

      {errorMsg && !isGenerating && (
        <div className="w-full bg-red-900/20 border-b border-red-900/50 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-red-200 text-xs font-medium">
                Generation Failed
              </p>
              <p className="text-red-300 text-xs mt-0.5">{errorMsg}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMsg(null);
              // Check if there's a checkpoint to resume
              const checkpoint = loadPostGenerationCheckpoint(influencer.id);
              if (checkpoint) {
                if (checkpoint.step === "images" && checkpoint.content) {
                  handleResumeFromCheckpoint(checkpoint);
                } else {
                  // No valid checkpoint, user needs to start fresh
                  toast("Please generate a new post from the War Room", {
                    icon: "ℹ️",
                  });
                }
              }
            }}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        {activeTab === "newsroom" ? (
          <BreakingNewsRoom
            niche={influencer.niche}
            userId={userId}
            onCreatePost={handleCreatePost}
            isProcessing={isGenerating}
          />
        ) : (
          <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
            {influencer.posts.length === 0 ? (
              <div className="text-center py-12 sm:py-20 text-slate-500">
                <Radar className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 opacity-20 text-blue-500" />
                <h3 className="text-base sm:text-lg font-medium text-slate-400 mb-2">
                  Feed Empty
                </h3>
                <p className="text-sm px-4">
                  Go to the <strong>Breaking News</strong> room to browse
                  articles and create content.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 pb-12 sm:pb-20">
                {influencer.posts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors shadow-lg"
                  >
                    {/* Post Header */}
                    <div className="p-3 sm:p-4 flex items-center justify-between border-b border-slate-800">
                      <div className="flex items-center gap-2 max-w-[70%]">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        <span className="text-xs sm:text-sm font-bold text-slate-200 truncate uppercase tracking-wider">
                          {post.topic}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(post.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Grid Image */}
                    <div className="p-0">
                      <PostGrid images={post.images} type={post.gridType} />
                    </div>

                    {/* Caption & Metadata */}
                    <div className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 mt-0.5 sm:mt-1">
                          <img
                            src={influencer.avatarUrl}
                            className="w-full h-full object-cover"
                            alt={influencer.name}
                          />
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          <span className="font-bold text-white mr-1 sm:mr-2">
                            {influencer.name}
                          </span>
                          {post.caption}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1.5 sm:gap-2 pl-9 sm:pl-11">
                        {post.hashtags.map((tag, i) => (
                          <span
                            key={i}
                            className="text-xs sm:text-sm text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>

                      {post.sourceArticleId && (
                        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-slate-800 pl-9 sm:pl-11">
                          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-blue-500">
                            <Newspaper size={12} />
                            <span className="font-mono uppercase">
                              Created from Breaking News Article
                            </span>
                          </div>
                        </div>
                      )}

                      {post.groundingUrls && post.groundingUrls.length > 0 && (
                        <div className="mt-3 sm:mt-4 pt-2 sm:pt-3 border-t border-slate-800 pl-9 sm:pl-11">
                          <div className="flex flex-col gap-1">
                            {post.groundingUrls.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] sm:text-xs text-slate-500 hover:text-emerald-400 truncate flex items-center gap-1 transition-colors uppercase font-mono"
                              >
                                <Globe size={10} />
                                SOURCE: {new URL(url).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

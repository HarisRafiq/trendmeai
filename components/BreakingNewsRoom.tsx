import React, { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { NewsArticle } from "../types";
import { fetchNewsArticles, GeminiError } from "../services/geminiService";
import { checkUserUsedArticle, getLastFetchTime } from "../services/firebase";
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Clock,
  TrendingUp,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Maximize2,
} from "lucide-react";

interface BreakingNewsRoomProps {
  niche: string;
  userId: string;
  onCreatePost: (article: NewsArticle) => void;
  isProcessing: boolean;
}

type FilterTab = "all" | "unused" | "popular";

export const BreakingNewsRoom: React.FC<BreakingNewsRoomProps> = ({
  niche,
  userId,
  onCreatePost,
  isProcessing,
}) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<NewsArticle[]>([]);
  const [userUsedArticles, setUserUsedArticles] = useState<Set<string>>(
    new Set(),
  );
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(
    null,
  );
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(
    null,
  );

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(false);

  // Track if we've already loaded articles for this niche to prevent duplicate requests
  const loadedNicheRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Auto-refresh every 10 minutes (rate limiting handled by Firestore metadata)
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

    const intervalId = setInterval(() => {
      if (!isLoadingRef.current && niche) {
        console.log("🔄 Auto-refresh triggered");
        loadArticles(false);
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [niche]);

  // Load news articles when niche changes
  useEffect(() => {
    // If niche actually changed, reset everything
    if (loadedNicheRef.current !== niche) {
      console.log(
        `🔄 Niche changed from ${loadedNicheRef.current} to ${niche}`,
      );
      setArticles([]); // Clear old articles
      setFilteredArticles([]);
      setExpandedArticleId(null);
      loadedNicheRef.current = niche;
      loadArticles(false);
      return;
    }

    // Same niche, check if already loading to prevent duplicate requests
    if (isLoadingRef.current) {
      console.log(`⏭️ Load already in progress for ${niche}, skipping`);
      return;
    }

    // Same niche but not loaded yet (e.g., first mount)
    if (articles.length === 0 && !isLoadingRef.current) {
      console.log(`📰 Loading articles for ${niche}`);
      loadArticles(false);
    }
  }, [niche]);

  // Check which articles the user has already used
  useEffect(() => {
    if (articles.length > 0 && userId) {
      checkUsedArticles();
    }
  }, [articles, userId]);

  // Filter articles based on active filter
  useEffect(() => {
    filterArticles();
  }, [articles, activeFilter, userUsedArticles]);

  const loadArticles = async (isRetry: boolean = false) => {
    // Prevent duplicate concurrent calls
    if (isLoadingRef.current && !isRetry) {
      console.log("⏭️ Load already in progress, skipping");
      return;
    }

    isLoadingRef.current = true;

    // Check if this is first load for this niche and if cache exists
    const lastFetch = await getLastFetchTime(niche);
    const isFirst = lastFetch === null;
    setIsFirstLoad(isFirst);

    // Determine if we'll actually need to fetch from Gemini (cache expired or doesn't exist)
    const ONE_HOUR = 60 * 60 * 1000;
    const willFetchFromGemini =
      isFirst || isRetry || (lastFetch && Date.now() - lastFetch >= ONE_HOUR);

    // Only show loading state if we're actually going to call Gemini
    if (willFetchFromGemini) {
      setIsLoading(true);
      setFetchError(null);
    }

    const toastId = willFetchFromGemini
      ? toast.loading(
          isFirst ? "Creating your news feed..." : "Loading news coverage...",
        )
      : null;

    try {
      const fetchedArticles = await fetchNewsArticles(niche, isRetry);

      if (fetchedArticles.length === 0) {
        if (toastId) toast.error("No articles found", { id: toastId });
        setFetchError("No articles found for this niche");
      } else {
        if (toastId) {
          toast.success(`Loaded ${fetchedArticles.length} articles`, {
            id: toastId,
          });
        } else {
          console.log(
            `📦 Silently loaded ${fetchedArticles.length} cached articles`,
          );
        }
        setArticles(fetchedArticles);

        // Update lastFetchTime from Firestore
        const updatedLastFetch = await getLastFetchTime(niche);
        setLastFetchTime(updatedLastFetch);
        setFetchError(null);
      }
    } catch (e: any) {
      const errorMessage =
        e instanceof GeminiError ? e.message : "Failed to fetch news coverage";
      console.error(e);
      if (toastId) {
        toast.error(errorMessage, { id: toastId });
      }
      setFetchError(errorMessage);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  const checkUsedArticles = async () => {
    const usedSet = new Set<string>();

    // Check usage for each article
    for (const article of articles) {
      const isUsed = await checkUserUsedArticle(niche, article.id, userId);
      if (isUsed) {
        usedSet.add(article.id);
      }
    }

    setUserUsedArticles(usedSet);
  };

  const filterArticles = () => {
    let filtered = [...articles];

    switch (activeFilter) {
      case "unused":
        filtered = filtered.filter((a) => !userUsedArticles.has(a.id));
        break;
      case "popular":
        filtered = filtered
          .filter((a) => a.usageCount > 0)
          .sort((a, b) => b.usageCount - a.usageCount);
        break;
      case "all":
      default:
        // Show all, sorted by relevance and recency
        filtered.sort((a, b) => {
          const scoreDiff = b.relevanceScore - a.relevanceScore;
          if (Math.abs(scoreDiff) > 10) return scoreDiff;
          return b.fetchedAt - a.fetchedAt;
        });
        break;
    }

    setFilteredArticles(filtered);
  };

  const toggleExpand = (articleId: string) => {
    setExpandedArticleId(expandedArticleId === articleId ? null : articleId);
  };

  const openDetailModal = (article: NewsArticle) => {
    setSelectedArticle(article);
  };

  const closeDetailModal = () => {
    setSelectedArticle(null);
  };

  const handleCreatePost = (article: NewsArticle) => {
    closeDetailModal();
    onCreatePost(article);
  };

  const getTimeAgo = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8 border-b border-blue-900/30 pb-4 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <Newspaper className="text-blue-500 w-5 h-5 sm:w-6 sm:h-6" />
              <span>Breaking News Room</span>
              <span className="flex items-center gap-1 text-xs font-normal text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Auto-updating
              </span>
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 flex items-center gap-2">
              <span className="font-semibold text-blue-400 uppercase">
                {niche}
              </span>
              {lastFetchTime && (
                <>
                  <span className="text-slate-600">•</span>
                  <Clock size={12} className="text-slate-500" />
                  <span className="text-slate-500 text-xs">
                    Last updated {getTimeAgo(lastFetchTime)}
                  </span>
                </>
              )}
              {isLoading && isFirstLoad && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-blue-400 text-xs animate-pulse">
                    Creating feed...
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Show retry button only on error during first load */}
          {fetchError && isFirstLoad && !isLoading && (
            <button
              onClick={() => loadArticles(true)}
              disabled={isProcessing}
              className="w-full sm:w-auto px-4 sm:px-6 py-3 rounded-lg font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all min-h-[48px] bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30"
            >
              <RefreshCw size={18} />
              Retry
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              activeFilter === "all"
                ? "bg-blue-500 text-white"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            All Articles ({articles.length})
          </button>
          <button
            onClick={() => setActiveFilter("unused")}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              activeFilter === "unused"
                ? "bg-blue-500 text-white"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            Unused ({articles.filter((a) => !userUsedArticles.has(a.id)).length}
            )
          </button>
          <button
            onClick={() => setActiveFilter("popular")}
            className={`flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
              activeFilter === "popular"
                ? "bg-blue-500 text-white"
                : "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <TrendingUp size={16} />
            Popular ({articles.filter((a) => a.usageCount > 0).length})
          </button>
        </div>
      </div>

      {/* Empty State */}
      {!isLoading && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
          <Newspaper className="w-12 h-12 text-slate-700 mb-4" />
          {fetchError ? (
            <>
              <p className="text-red-400 font-semibold text-sm mb-2">
                {fetchError}
              </p>
              {isFirstLoad && (
                <button
                  onClick={() => loadArticles(true)}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all"
                >
                  Try Again
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-slate-500 font-semibold text-sm">
                No breaking news in {niche}
              </p>
              <p className="text-slate-600 text-xs mt-2">
                Articles will auto-update when available
              </p>
            </>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && articles.length === 0 && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse"
            >
              <div className="space-y-3">
                <div className="h-6 bg-slate-800 rounded w-3/4"></div>
                <div className="h-4 bg-slate-800 rounded w-full"></div>
                <div className="h-4 bg-slate-800 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results with Filter */}
      {!isLoading && articles.length > 0 && filteredArticles.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 border border-slate-800 rounded-xl bg-slate-900/30">
          <AlertCircle className="w-10 h-10 text-slate-600 mb-3" />
          <p className="text-slate-400">No articles match this filter</p>
          <button
            onClick={() => setActiveFilter("all")}
            className="mt-3 text-blue-500 hover:text-blue-400 text-sm font-medium underline"
          >
            View all articles
          </button>
        </div>
      )}

      {/* News Feed - Single Column */}
      {!isLoading && filteredArticles.length > 0 && (
        <div className="space-y-4">
          {filteredArticles.map((article) => {
            const isExpanded = expandedArticleId === article.id;
            const isUsed = userUsedArticles.has(article.id);

            return (
              <article
                key={article.id}
                className={`bg-slate-900 border rounded-xl transition-all ${
                  isExpanded
                    ? "border-blue-500 shadow-xl shadow-blue-900/20"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Article Header - Always Visible */}
                <div
                  className="p-4 sm:p-6 cursor-pointer"
                  onClick={() => toggleExpand(article.id)}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">
                          Breaking
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs text-slate-500">
                          {getTimeAgo(article.fetchedAt)}
                        </span>
                        {article.usageCount > 0 && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <TrendingUp size={12} />
                              {article.usageCount} post
                              {article.usageCount !== 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                        {isUsed && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-xs text-emerald-500 flex items-center gap-1 font-medium">
                              <CheckCircle size={12} />
                              You used this
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="text-lg sm:text-xl font-bold text-white leading-tight mb-2 line-clamp-2">
                        {article.headline}
                      </h3>

                      <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                        {article.summary}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-slate-500 font-medium uppercase">
                          Score
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            article.relevanceScore > 80
                              ? "text-blue-500"
                              : "text-slate-400"
                          }`}
                        >
                          {article.relevanceScore}
                        </span>
                      </div>

                      <button className="text-slate-500 hover:text-white transition-colors p-1">
                        {isExpanded ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-slate-800">
                    <div className="pt-4 mb-4">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div
                          className="text-slate-300 leading-relaxed space-y-3"
                          style={{ maxWidth: "65ch" }}
                        >
                          {article.fullContext
                            .split("\n\n")
                            .map((paragraph, idx) => (
                              <p
                                key={idx}
                                className="text-sm sm:text-base"
                                style={{ lineHeight: "1.6" }}
                              >
                                {paragraph}
                              </p>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                      {article.sourceUrl && (
                        <a
                          href={article.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={16} />
                          Read Full Article
                        </a>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetailModal(article);
                        }}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Maximize2 size={16} />
                        Full View
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreatePost(article);
                        }}
                        disabled={isProcessing}
                        className="ml-auto flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30"
                      >
                        Create Post
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedArticle && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={closeDetailModal}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-6 flex items-start justify-between gap-4 z-10">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                  <Newspaper size={14} className="text-blue-500" />
                  <span className="font-bold text-blue-400 uppercase">
                    Breaking News
                  </span>
                  <span>•</span>
                  <span>{getTimeAgo(selectedArticle.fetchedAt)}</span>
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">
                  {selectedArticle.headline}
                </h2>
              </div>
              <button
                onClick={closeDetailModal}
                className="text-slate-500 hover:text-white transition-colors p-2"
              >
                <ChevronUp size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="prose prose-invert prose-base max-w-none mb-6">
                <div
                  className="text-slate-300 leading-relaxed space-y-4"
                  style={{ maxWidth: "65ch", lineHeight: "1.6" }}
                >
                  {selectedArticle.fullContext
                    .split("\n\n")
                    .map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                </div>
              </div>

              {selectedArticle.sourceUrl && (
                <a
                  href={selectedArticle.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-4"
                >
                  <ExternalLink size={16} />
                  View Original Source
                </a>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="text-sm text-slate-500">
                  Relevance Score:{" "}
                  <span className="font-bold text-blue-400">
                    {selectedArticle.relevanceScore}
                  </span>
                  {selectedArticle.usageCount > 0 && (
                    <>
                      {" • "}
                      Used by {selectedArticle.usageCount} post
                      {selectedArticle.usageCount !== 1 ? "s" : ""}
                    </>
                  )}
                </div>
                <button
                  onClick={() => handleCreatePost(selectedArticle)}
                  disabled={isProcessing}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30"
                >
                  Create Post from This
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

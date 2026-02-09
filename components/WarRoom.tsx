import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { TrendSignal } from "../types";
import {
  discoverTrends,
  generateSubTopics,
  GeminiError,
} from "../services/geminiService";
import {
  Radar,
  ExternalLink,
  Zap,
  RefreshCw,
  AlertCircle,
  Radio,
  AlertTriangle,
  Target,
  Search,
  X,
} from "lucide-react";

interface WarRoomProps {
  niche: string;
  onSelectTrend: (trend: TrendSignal) => void;
  isProcessing: boolean;
}

export const WarRoom: React.FC<WarRoomProps> = ({
  niche,
  onSelectTrend,
  isProcessing,
}) => {
  const [trends, setTrends] = useState<TrendSignal[]>([]);
  const [subTopics, setSubTopics] = useState<string[]>([]);
  const [customFocus, setCustomFocus] = useState("");
  const [activeFocus, setActiveFocus] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load subtopics when niche changes
  useEffect(() => {
    generateSubTopics(niche)
      .then(setSubTopics)
      .catch((e) => {
        console.error("Failed to load subtopics:", e);
        // Silent failure for subtopics as they have fallbacks
      });
    setTrends([]);
    setHasScanned(false);
    setActiveFocus(null);
    setCustomFocus("");
  }, [niche]);

  const handleScan = async (overrideFocus?: string) => {
    // If overrideFocus is passed (e.g. clicking a chip), use it.
    // Otherwise use activeFocus or customFocus from state.
    const query =
      overrideFocus !== undefined ? overrideFocus : customFocus || null;

    if (overrideFocus) {
      setActiveFocus(overrideFocus);
      setCustomFocus(overrideFocus);
    } else if (customFocus) {
      setActiveFocus(customFocus);
    } else {
      setActiveFocus(null); // Broad scan
    }

    setIsLoading(true);
    setTrends([]);
    setHasScanned(false);
    setErrorMsg(null);

    const scanTopic = query ? `${query} (${niche})` : niche;
    const toastId = toast.loading(`Scanning: ${scanTopic.substring(0, 40)}...`);

    try {
      const results = await discoverTrends(niche, query || undefined);
      setTrends(results);
      toast.success(`Found ${results.length} trends`, { id: toastId });
    } catch (e: any) {
      const errorMessage =
        e instanceof GeminiError
          ? e.message
          : "Failed to retrieve intelligence";
      console.error(e);
      setErrorMsg(errorMessage);
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
      setHasScanned(true);
    }
  };

  const handleClearFocus = () => {
    setCustomFocus("");
    setActiveFocus(null);
  };

  return (
    <div className="h-full bg-slate-950 p-4 sm:p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8 border-b border-slate-800 pb-4 sm:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 sm:gap-3">
              <Radar className="text-emerald-500 animate-pulse w-5 h-5 sm:w-6 sm:h-6" />
              <span className="hidden sm:inline">Intelligence War Room</span>
              <span className="sm:hidden">Intel War Room</span>
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 font-mono">
              SECTOR:{" "}
              <span className="text-emerald-400 uppercase truncate">
                {niche}
              </span>
            </p>
          </div>

          <button
            onClick={() => handleScan()}
            disabled={isLoading || isProcessing}
            className={`w-full sm:w-auto px-4 sm:px-6 py-3 rounded-md font-mono text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all min-h-[48px] ${
              isLoading
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            }`}
          >
            {isLoading ? (
              <RefreshCw className="animate-spin" size={18} />
            ) : (
              <Radio size={18} />
            )}
            {hasScanned ? "RE-SCAN" : "SCAN"}
            <span className="hidden sm:inline">
              {hasScanned ? "SECTOR" : "SECTOR"}
            </span>
          </button>
        </div>

        {/* Targeting System */}
        <div className="bg-slate-900/50 rounded-xl p-3 sm:p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-3 text-xs font-mono text-slate-500 uppercase tracking-wider">
            <Target size={14} />
            <span className="hidden sm:inline">Targeting System</span>
            <span className="sm:hidden">Target</span>
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                type="text"
                value={customFocus}
                onChange={(e) => setCustomFocus(e.target.value)}
                placeholder={`Refine scan for ${niche}...`}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-10 py-3 text-sm text-white focus:ring-1 focus:ring-emerald-500 outline-none transition-all min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
              />
              {customFocus && (
                <button
                  onClick={handleClearFocus}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-2 min-w-[40px] min-h-[40px] flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Suggested Chips */}
          {subTopics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {subTopics.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => handleScan(topic)}
                  className={`text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border transition-all min-h-[40px] ${
                    activeFocus === topic
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty State / Initial */}
      {!hasScanned && !isLoading && (
        <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20">
          <Zap className="w-12 h-12 text-slate-700 mb-4" />
          <p className="text-slate-500 font-mono text-sm">AWAITING INTEL...</p>
          <p className="text-slate-600 text-xs mt-2">
            Select a sub-topic or click 'Initiate Scan' to intercept real-time
            trends.
          </p>
        </div>
      )}

      {/* Scanning Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 bg-slate-900/50 border border-slate-800 rounded-xl p-4 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                <div className="h-3 bg-slate-800 rounded w-full"></div>
                <div className="h-3 bg-slate-800 rounded w-5/6"></div>
              </div>
              <div className="h-8 bg-slate-800 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error / No Results State */}
      {!isLoading && hasScanned && (trends.length === 0 || errorMsg) && (
        <div className="flex flex-col items-center justify-center h-64 border border-slate-800 rounded-xl bg-slate-900/30">
          <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
          <p className="text-slate-300 font-bold">
            {errorMsg ? "Connection Failed" : "No intelligence found"}
          </p>
          <p className="text-slate-500 text-sm mt-1 max-w-md text-center">
            {errorMsg ||
              `The scanner could not retrieve specific trends for "${activeFocus || niche}". Try a different keyword.`}
          </p>
          <button
            onClick={() => handleScan()}
            className="mt-4 text-emerald-500 hover:text-emerald-400 text-sm font-medium underline"
          >
            Retry Operation
          </button>
        </div>
      )}

      {/* Results Grid */}
      {!isLoading && hasScanned && trends.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {trends.map((trend) => (
            <div
              key={trend.id}
              className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-4 sm:p-5 flex flex-col transition-all hover:shadow-xl hover:shadow-emerald-900/20 relative overflow-hidden"
            >
              {/* Score Indicator */}
              <div className="absolute top-0 right-0 p-3">
                <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded px-2 py-1">
                  <span className="text-[10px] text-slate-500 font-mono uppercase">
                    Relevance
                  </span>
                  <span
                    className={`text-xs font-bold font-mono ${trend.relevanceScore > 80 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {trend.relevanceScore}%
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} className="text-emerald-500" />
                  <span className="text-xs sm:text-sm text-emerald-500 font-bold uppercase tracking-wider">
                    Detected Signal
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-100 leading-tight mb-2 line-clamp-2">
                  {trend.headline}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 line-clamp-3 leading-relaxed">
                  {trend.summary}
                </p>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                {trend.sourceUrl && (
                  <a
                    href={trend.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="View Source"
                  >
                    <ExternalLink size={18} />
                  </a>
                )}
                <button
                  onClick={() => onSelectTrend(trend)}
                  disabled={isProcessing}
                  className="flex-1 bg-slate-100 hover:bg-white text-slate-900 py-3 rounded font-bold text-xs sm:text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px]"
                >
                  {isProcessing ? "Deploying..." : "Dispatch Post"}
                  {!isProcessing && (
                    <Zap size={14} className="text-slate-900" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

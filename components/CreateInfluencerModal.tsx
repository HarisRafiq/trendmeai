import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { X, Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  generateInfluencerPersona,
  generateGridImagesFromPrompts,
  GeminiError,
} from "../services/geminiService";
import { uploadImage } from "../services/firebase";
import { Influencer } from "../types";
import {
  saveInfluencerCreationCheckpoint,
  loadInfluencerCreationCheckpoint,
  clearInfluencerCreationCheckpoint,
} from "../services/persistenceService";

interface CreateInfluencerModalProps {
  onClose: () => void;
  onCreate: (influencer: Influencer) => void;
  userId: string;
}

export const CreateInfluencerModal: React.FC<CreateInfluencerModalProps> = ({
  onClose,
  onCreate,
  userId,
}) => {
  const [niche, setNiche] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"input" | "generating" | "preview">("input");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<{
    persona: {
      name: string;
      bio: string;
      personality: string;
      visualOptions: string[];
    };
    avatarOptions: string[];
    selectedAvatarIndex: number;
  } | null>(null);

  // Load checkpoint on mount
  useEffect(() => {
    const checkpoint = loadInfluencerCreationCheckpoint(userId);
    if (checkpoint && checkpoint.persona) {
      const shouldResume = window.confirm(
        "You have an incomplete influencer creation. Would you like to resume from where you left off?",
      );

      if (shouldResume) {
        setNiche(checkpoint.niche || "");
        if (checkpoint.step === "visuals" && checkpoint.persona) {
          // We have persona but need to regenerate visuals
          toast.loading("Resuming from checkpoint...", { duration: 2000 });
          setGeneratedData({
            persona: checkpoint.persona,
            avatarOptions: [], // Will regenerate
            selectedAvatarIndex: checkpoint.selectedVisualIndex || 0,
          });
          // Trigger visual generation
          handleResumeVisualGeneration(
            checkpoint.persona,
            checkpoint.niche || "",
          );
        }
      } else {
        clearInfluencerCreationCheckpoint(userId);
      }
    }
  }, [userId]);

  const handleResumeVisualGeneration = async (
    persona: any,
    nicheValue: string,
  ) => {
    setIsLoading(true);
    setStep("generating");
    setErrorMsg(null);

    try {
      const prompts = persona.visualOptions.map(
        (style: string) =>
          `Hyper-realistic close-up headshot of a real person (${persona.name}), social media influencer profile picture. ${style}. Detailed skin texture, visible pores, natural eye contact, soft window lighting, shot on Sony A7R IV 85mm f/1.8 lens, authentic look.`,
      );

      const avatarOptions = await generateGridImagesFromPrompts(prompts, "2x2");

      setGeneratedData({
        persona,
        avatarOptions,
        selectedAvatarIndex: 0,
      });
      setStep("preview");
      toast.success("Visuals generated successfully!");
    } catch (e) {
      const errorMessage =
        e instanceof GeminiError ? e.message : "Failed to generate visuals";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!niche) return;
    setIsLoading(true);
    setStep("generating");
    setErrorMsg(null);

    try {
      toast.loading("Generating persona...", { id: "persona-gen" });
      const persona = await generateInfluencerPersona(niche);
      toast.success("Persona generated!", { id: "persona-gen" });

      // Save checkpoint after persona generation
      saveInfluencerCreationCheckpoint({
        userId,
        timestamp: Date.now(),
        step: "visuals",
        niche,
        persona,
      });

      toast.loading("Generating visual options...", { id: "visuals-gen" });
      const prompts = persona.visualOptions.map(
        (style) =>
          `Hyper-realistic close-up headshot of a real person (${persona.name}), social media influencer profile picture. ${style}. Detailed skin texture, visible pores, natural eye contact, soft window lighting, shot on Sony A7R IV 85mm f/1.8 lens, authentic look.`,
      );

      const avatarOptions = await generateGridImagesFromPrompts(prompts, "2x2");
      toast.success("Visuals ready!", { id: "visuals-gen" });

      setGeneratedData({
        persona,
        avatarOptions,
        selectedAvatarIndex: 0,
      });
      setStep("preview");
    } catch (e) {
      const errorMessage =
        e instanceof GeminiError ? e.message : "Failed to generate persona";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!generatedData) return;

    setIsLoading(true);
    setStep("generating");
    setErrorMsg(null);

    try {
      toast.loading("Uploading avatar...", { id: "upload" });
      const selectedVisual =
        generatedData.persona.visualOptions[generatedData.selectedAvatarIndex];
      const selectedAvatarBase64 =
        generatedData.avatarOptions[generatedData.selectedAvatarIndex];

      const avatarUrl = await uploadImage(
        userId,
        selectedAvatarBase64,
        `avatars`,
      );
      toast.success("Avatar uploaded!", { id: "upload" });

      const newInfluencer: Influencer = {
        id: Math.random().toString(36).substring(2, 9),
        name: generatedData.persona.name,
        niche: niche,
        bio: generatedData.persona.bio,
        visualStyle: selectedVisual,
        personality: generatedData.persona.personality,
        avatarUrl: avatarUrl,
        posts: [],
        createdAt: Date.now(),
      };

      onCreate(newInfluencer);
      clearInfluencerCreationCheckpoint(userId);
      toast.success(`${generatedData.persona.name} created successfully!`);
      onClose();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create influencer";
      setErrorMsg(errorMessage);
      toast.error(errorMessage);
      setStep("preview");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-slate-400 hover:text-white z-10 p-2 hover:bg-slate-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 pr-10">
            Create AI Influencer
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mb-4 sm:mb-6">
            Define a niche and Gemini will craft a unique persona.
          </p>

          {step === "input" && (
            <div className="space-y-4">
              {errorMsg && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 sm:p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-200 text-sm font-medium">Error</p>
                    <p className="text-red-300 text-xs mt-1">{errorMsg}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Target Niche
                </label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g. Sustainable Fashion, Tech Reviews"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-pink-500 outline-none transition-all min-h-[48px] text-sm sm:text-base"
                />
              </div>
              <button
                onClick={handleGenerate}
                disabled={!niche}
                className="w-full bg-gradient-to-r from-pink-600 to-violet-600 hover:from-pink-500 hover:to-violet-500 text-white font-medium py-3 sm:py-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] text-sm sm:text-base"
              >
                <Sparkles size={18} />
                {errorMsg ? "Retry Generation" : "Generate Persona"}
              </button>
            </div>
          )}

          {step === "generating" && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-4" />
              <p className="text-white font-medium">Crafting Persona...</p>
              <p className="text-slate-500 text-sm mt-1">
                Generating unique character options...
              </p>
            </div>
          )}

          {step === "preview" && generatedData && (
            <div className="space-y-4 sm:space-y-6">
              <div className="text-center">
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {generatedData.persona.name}
                </h3>
                <p className="text-pink-400 text-xs sm:text-sm font-medium uppercase tracking-wide mt-1">
                  {niche}
                </p>
                <p className="text-slate-400 text-xs sm:text-sm mt-2">
                  Select your influencer's look:
                </p>
              </div>

              {/* Avatar Selection Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {generatedData.avatarOptions.map((url, idx) => (
                  <button
                    key={idx}
                    onClick={() =>
                      setGeneratedData({
                        ...generatedData,
                        selectedAvatarIndex: idx,
                      })
                    }
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all group min-h-[120px] sm:min-h-[140px] ${
                      generatedData.selectedAvatarIndex === idx
                        ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        : "border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500"
                    }`}
                    title={generatedData.persona.visualOptions[idx]}
                    aria-label={`Avatar option ${idx + 1}`}
                  >
                    <img
                      src={url}
                      alt={`Option ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {generatedData.selectedAvatarIndex === idx && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-0.5">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                    {/* Tooltip hint for visual style */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[9px] text-white truncate px-1">
                        {generatedData.persona.visualOptions[idx]}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3">
                <div>
                  <span className="text-xs text-slate-500 uppercase font-bold">
                    Bio
                  </span>
                  <p className="text-xs sm:text-sm text-slate-300 italic mt-1">
                    "{generatedData.persona.bio}"
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 uppercase font-bold">
                    Personality
                  </span>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">
                    {generatedData.persona.personality}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2">
                <button
                  onClick={() => setStep("input")}
                  className="px-3 sm:px-4 py-3 sm:py-4 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors text-sm font-medium min-h-[48px]"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-3 sm:px-4 py-3 sm:py-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 transition-colors text-sm font-bold shadow-lg min-h-[48px]"
                >
                  Confirm Selection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

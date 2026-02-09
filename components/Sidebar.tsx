import React from "react";
import { Influencer } from "../types";
import {
  Plus,
  Users,
  LayoutDashboard,
  Zap,
  LogOut,
  User as UserIcon,
  X,
} from "lucide-react";
import { User } from "firebase/auth";

interface SidebarProps {
  influencers: Influencer[];
  activeInfluencerId: string | null;
  onSelectInfluencer: (id: string) => void;
  onOpenCreateModal: () => void;
  user: User | null;
  onLogout: () => void;
  postsCount: Record<string, number>;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  influencers,
  activeInfluencerId,
  onSelectInfluencer,
  onOpenCreateModal,
  user,
  onLogout,
  postsCount,
  isMobileOpen,
  onMobileClose,
}) => {
  return (
    <div
      className={`
        w-64 h-screen bg-slate-900 border-r border-slate-800 flex flex-col z-50
        fixed left-0 top-0 transition-transform duration-300 ease-in-out
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 md:relative
      `}
    >
      {/* Mobile close button */}
      <div className="md:hidden absolute top-4 right-4 z-10">
        <button
          onClick={onMobileClose}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="p-6 border-b border-slate-800 flex items-center gap-2">
        <Zap className="text-pink-500 w-6 h-6" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
          TrendMeAI
        </h1>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
            Dashboard
          </h2>
          <button
            onClick={() => onSelectInfluencer("")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors min-h-[44px] ${
              !activeInfluencerId
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between px-2 mb-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Influencers
            </h2>
            <button
              onClick={onOpenCreateModal}
              className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Create Influencer"
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="space-y-1">
            {influencers.map((influencer) => (
              <button
                key={influencer.id}
                onClick={() => onSelectInfluencer(influencer.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors group min-h-[48px] ${
                  activeInfluencerId === influencer.id
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 flex-shrink-0 border border-slate-600">
                  <img
                    src={influencer.avatarUrl}
                    alt={influencer.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="truncate">{influencer.name}</span>
                {postsCount[influencer.id] > 0 && (
                  <span className="ml-auto text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full">
                    {postsCount[influencer.id]}
                  </span>
                )}
              </button>
            ))}

            {influencers.length === 0 && (
              <div className="px-3 py-4 text-center border-2 border-dashed border-slate-800 rounded-lg">
                <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No influencers yet</p>
                <button
                  onClick={onOpenCreateModal}
                  className="mt-2 px-3 py-2 text-xs text-pink-500 hover:text-pink-400 font-medium min-h-[44px]"
                >
                  Create your first
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Section */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        {user ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-700 border border-slate-600">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="User"
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-full h-full p-1 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.displayName || "User"}
              </p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        ) : null}

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors min-h-[44px]"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
};

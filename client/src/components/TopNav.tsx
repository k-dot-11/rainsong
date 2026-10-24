import React from "react";
import { MessageSquare, ShieldCheck, Activity, Database, Cpu } from "lucide-react";

interface TopNavProps {
  viewMode: "buyer" | "manager";
  setViewMode: (mode: "buyer" | "manager") => void;
  pendingApprovalsCount: number;
}

export const TopNav: React.FC<TopNavProps> = ({
  viewMode,
  setViewMode,
  pendingApprovalsCount,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">QuoteFlow</span>
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded">
                Edge
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span>Cloudflare Pi Harness</span>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Llama 3.3
              </span>
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode("buyer")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "buyer"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Buyer Chat (WhatsApp)</span>
          </button>
          <button
            onClick={() => setViewMode("manager")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
              viewMode === "manager"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Merchant Console</span>
            {pendingApprovalsCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-xs font-bold bg-amber-500 text-slate-950 rounded-full animate-bounce">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        </div>

        {/* Cloudflare Tech Badges */}
        <div className="hidden lg:flex items-center space-x-2 text-xs">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Database className="w-3.5 h-3.5 text-orange-400" />
            <span>DO SQLite</span>
          </div>
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Workers AI</span>
          </div>
        </div>
      </div>
    </header>
  );
};

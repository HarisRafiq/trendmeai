import React from 'react';
import { signInWithGoogle } from '../services/firebase';
import { Zap, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-pink-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-600/20 rounded-full blur-[120px]"></div>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-2xl border border-slate-700 shadow-2xl max-w-md w-full text-center relative z-10">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-slate-700 transform -rotate-6 shadow-lg">
            <Zap className="w-10 h-10 text-transparent bg-clip-text bg-gradient-to-br from-pink-500 to-violet-500 fill-current" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">TrendMeAI</h1>
        <p className="text-slate-400 mb-8 text-sm leading-relaxed">
          The ultimate AI Influencer Studio. Generate personas, discover real-world trends, and automate content creation with Gemini.
        </p>
        
        <button 
            onClick={signInWithGoogle}
            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
        >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
        </button>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-600">
            <ShieldCheck size={14} />
            <span>Secure Authentication by Firebase</span>
        </div>
      </div>
    </div>
  );
};
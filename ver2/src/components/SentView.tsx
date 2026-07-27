import React from 'react';
import { CheckCircle2, ArrowRight } from 'lucide-react';

interface SentViewProps {
  title: string;
  signers: { name: string; email: string }[];
  ccEmails: string[];
  signToken: string;
  onGoToDashboard: () => void;
}

export const SentView: React.FC<SentViewProps> = ({ title, signers, onGoToDashboard }) => {
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-[#121214] border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckCircle2 size={36} />
        </div>

        <div>
          <h2 className="text-xl font-bold">署名依頼を送信しました</h2>
          <p className="text-xs text-gray-400 mt-1">「{title}」の署名手続きを開始しました。</p>
        </div>

        <div className="w-full bg-[#1c1c1f] p-4 rounded-2xl text-left flex flex-col gap-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">送信先（署名者）</span>
          {signers.map((s, idx) => (
            <div key={idx} className="flex justify-between items-center text-xs">
              <span className="font-semibold text-white">{s.name}</span>
              <span className="text-gray-400">{s.email}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onGoToDashboard}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <span>ダッシュボードへ移動</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

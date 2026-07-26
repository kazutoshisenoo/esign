import React from 'react';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
import { Send, Users, Mail } from 'lucide-react';

interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
}

interface SentViewProps {
  title: string;
  signers: Signer[];
  ccEmails: string[];
  signToken: string;
  onGoToDashboard: () => void;
}

export const SentView: React.FC<SentViewProps> = ({
  title,
  signers,
  ccEmails,
  onGoToDashboard
}) => {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background styling */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-b from-[#0071e3]/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-lg shadow-3xl border-white/5 relative z-10">
        <CardContent className="p-8 flex flex-col items-center gap-6 text-center">
          
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Send className="w-7 h-7" />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-white">署名依頼を送信しました</h2>
            <p className="text-xs text-[#86868b]">
              各署名者への署名依頼メールの送信処理（設定されたプロバイダ経由）が完了しました。
            </p>
          </div>

          {/* Info Block */}
          <div className="w-full bg-[#121214]/50 border border-white/5 p-4 rounded-xl text-left flex flex-col gap-3.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[#86868b] text-xs">書類名:</span>
              <span className="font-semibold text-white truncate max-w-[240px]">{title}</span>
            </div>
            
            <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
              <span className="text-[#86868b] text-xs font-semibold flex items-center gap-1">
                <Users size={12} />
                署名者一覧:
              </span>
              <div className="flex flex-col gap-1 mt-1 pl-1">
                {signers.map((s, idx) => (
                  <div key={s.id} className="flex justify-between items-center text-xs">
                    <span className="text-white">{idx + 1}. {s.name}</span>
                    <span className="text-[#86868b] font-mono">{s.email}</span>
                  </div>
                ))}
              </div>
            </div>

            {ccEmails.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                <span className="text-[#86868b] text-xs font-semibold flex items-center gap-1">
                  <Mail size={12} />
                  署名完了時の共有先 (CC):
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1 pl-1">
                  {ccEmails.map((email) => (
                    <span key={email} className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[10px] text-[#a1a1aa]">
                      {email}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Action Buttons */}
          <div className="w-full flex mt-2">
            <Button variant="outline" className="w-full" onClick={onGoToDashboard}>
              ダッシュボードへ戻る
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

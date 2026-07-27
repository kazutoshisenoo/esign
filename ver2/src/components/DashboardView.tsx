import React, { useState } from 'react';
import { Upload, FileText, Settings, Download, LogOut, CheckCircle, Clock } from 'lucide-react';

interface DocumentItem {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'completed';
  createdAt: string;
  signers: { id: string; name: string; email: string; status: 'pending' | 'signed' }[];
  fileId?: string;
  signToken: string;
  fields: any[];
  ccEmails: string[];
}

interface DashboardViewProps {
  userEmail: string;
  documents: DocumentItem[];
  emailProvider: 'resend' | 'gmail_gas';
  resendApiKey: string;
  gasUrl: string;
  onSaveSettings: (provider: 'resend' | 'gmail_gas', apiKey: string, gasUrl: string) => void;
  onLogout: () => void;
  onUploadSuccess: (file: File) => void;
  onSelectDocument: (id: string, isSignView?: boolean) => void;
  onDownloadPdf: (doc: DocumentItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userEmail,
  documents,
  emailProvider,
  resendApiKey,
  gasUrl,
  onSaveSettings,
  onLogout,
  onUploadSuccess,
  onSelectDocument,
  onDownloadPdf
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'resend' | 'gmail_gas'>(emailProvider);
  const [apiKey, setApiKey] = useState(resendApiKey);
  const [gasUrlInput, setGasUrlInput] = useState(gasUrl);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadSuccess(e.target.files[0]);
    }
  };

  const handleSave = () => {
    onSaveSettings(provider, apiKey, gasUrlInput.trim());
    setIsSettingsOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#121214] px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500" />
          <h1 className="text-base font-bold tracking-tight">AuraSign v2</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-gray-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-gray-400 hover:text-rose-400 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 max-w-5xl mx-auto w-full flex flex-col gap-8">
        {/* Upload Card */}
        <div className="relative p-8 rounded-3xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-white/10 flex flex-col items-center justify-center text-center gap-4 group">
          <div className="p-4 bg-blue-600/20 rounded-2xl border border-blue-500/30 text-blue-400">
            <Upload size={32} />
          </div>
          <div>
            <h2 className="text-lg font-bold">新規PDFの送信・署名設定</h2>
            <p className="text-xs text-gray-400 mt-1">PDFファイルをドラッグ＆ドロップまたは選択してください。</p>
          </div>
          <label className="cursor-pointer px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg active:scale-95 transition-all">
            ファイルを選択
            <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
          </label>
        </div>

        {/* History Section */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-bold text-gray-300">送信ドキュメント履歴</h3>
          <div className="flex flex-col gap-3">
            {documents.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500 bg-[#121214] rounded-2xl border border-white/5">
                まだ送信されたドキュメントはありません。
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 bg-[#121214] border border-white/10 rounded-2xl flex items-center justify-between hover:border-white/20 transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 bg-white/5 rounded-xl text-gray-400">
                      <FileText size={20} />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-semibold text-white">{doc.title}</span>
                      <span className="text-[11px] text-gray-400 mt-0.5">{doc.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {doc.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium">
                        <CheckCircle size={12} /> 締結完了
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
                        <Clock size={12} /> 署名待ち
                      </span>
                    )}

                    <button
                      onClick={() => onDownloadPdf(doc)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-xs font-semibold rounded-xl flex items-center gap-1 text-gray-300"
                    >
                      <Download size={14} /> ダウンロード
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#121214] border border-white/10 p-6 rounded-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-white">メール配信設定</h3>
            <div className="flex flex-col gap-3 text-left">
              <label className="text-xs text-gray-400">プロバイダー選択</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#1c1c1f] border border-white/10 rounded-xl text-xs text-white"
              >
                <option value="gmail_gas">Gmail (GAS - Google Apps Script)</option>
                <option value="resend">Resend API</option>
              </select>

              {provider === 'gmail_gas' ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400">GAS ウェブアプリのURL</label>
                  <input
                    type="text"
                    value={gasUrlInput}
                    onChange={(e) => setGasUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-2 bg-[#1c1c1f] border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400">Resend API Key</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="re_..."
                    className="w-full px-3 py-2 bg-[#1c1c1f] border border-white/10 rounded-xl text-xs text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2.5 mt-2">
              <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 rounded-xl text-xs text-gray-400 bg-white/5">
                キャンセル
              </button>
              <button onClick={handleSave} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs text-white font-semibold">
                設定を保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

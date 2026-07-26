import React, { useState, useRef } from 'react';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
import { Input } from './ui/Input';
import { 
  FileText, Plus, LogOut, Clock, CheckCircle2, Send, 
  FileUp, ShieldCheck, Copy, Check, Users, Mail, Settings, Key, Download
} from 'lucide-react';


interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
  otp?: string;
}

interface Field {
  id: string;
  type: 'signature' | 'date' | 'name' | 'company' | 'text' | 'checkbox';
  pageNumber: number;
  x: number;
  y: number;
  w: number;
  h: number;
  signerId: string;
  value?: string;
}

interface DocumentItem {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'completed';
  createdAt: string;
  originalSize: string;
  signers: Signer[];
  ccEmails: string[];
  signToken: string;
  fields: Field[];
  signedPdfBlob?: Blob;
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
  onDownloadPdf: (doc: DocumentItem) => Promise<void>; // 追加 ★
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
  onDownloadPdf // 追加 ★
}) => {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempProvider, setTempProvider] = useState<'resend' | 'gmail_gas'>(emailProvider);
  const [inputKey, setInputKey] = useState(resendApiKey);
  const [inputGasUrl, setInputGasUrl] = useState(gasUrl);
  const [inputPasscode, setInputPasscode] = useState(() => localStorage.getItem('aurasign_admin_passcode') || 'aurasign2026'); // 追加 ★

  const fileInputRef = useRef<HTMLInputElement>(null);



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onUploadSuccess(file);
        setIsUploadOpen(false);
      } else {
        alert('PDFファイルのみアップロード可能です。');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadSuccess(e.target.files[0]);
      setIsUploadOpen(false);
    }
  };

  const handleCopySignUrl = (e: React.MouseEvent, doc: DocumentItem) => {
    e.stopPropagation();
    
    const unsigned = doc.signers.find(s => s.status === 'pending') || doc.signers[0];
    if (!unsigned) return;

    const url = `${window.location.origin}/sign/${doc.signToken}?signer=${unsigned.id}`;
    navigator.clipboard.writeText(url);
    
    setCopiedDocId(doc.id);
    setTimeout(() => setCopiedDocId(null), 2000);
  };

  // 設定の保存 ★変更
  const handleSaveSettings = () => {
    if (tempProvider === 'gmail_gas' && !inputGasUrl.trim()) {
      alert('Gmail送信用のGoogle Apps Script URLを入力してください。');
      return;
    }
    if (tempProvider === 'resend' && !inputKey.trim()) {
      alert('ResendのAPIキーを入力してください。');
      return;
    }
    
    // 管理者ログイン用パスコードも保存する ★追加
    localStorage.setItem('aurasign_admin_passcode', inputPasscode.trim() || 'aurasign2026');
    
    onSaveSettings(tempProvider, inputKey, inputGasUrl);
    setIsSettingsOpen(false);
    alert('送信設定を保存しました。');
  };

  const getStatusBadge = (doc: DocumentItem) => {
    const signedCount = doc.signers.filter(s => s.status === 'signed').length;
    const totalCount = doc.signers.length;

    switch (doc.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} />
            署名完了 ({signedCount}/{totalCount})
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Send size={12} />
            署名待ち ({signedCount}/{totalCount})
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <Clock size={12} />
            下書き
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#0071e3]/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 bg-[#09090b]/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white to-[#a1a1aa] flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-black" />
            </div>
            <span className="font-semibold text-base text-white tracking-tight">AuraSign</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#86868b]">アカウント: {userEmail}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setTempProvider(emailProvider);
                setInputKey(resendApiKey);
                setInputGasUrl(gasUrl);
                setIsSettingsOpen(true);
              }} 
              className="text-[#86868b] hover:text-white p-2"
            >
              <Settings size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="text-[#86868b] hover:text-white">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        
        {/* Settings Alert (If no method is configured) ★変更 */}
        {!resendApiKey && !gasUrl && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-left text-xs text-amber-300">
            <div>
              <p className="font-semibold flex items-center gap-1.5 text-sm">
                <Key size={14} />
                実際のメール送信には設定が必要です
              </p>
              <p className="mt-1 text-[#a1a1aa]">
                現在、実際のメール送信に必要な設定が完了していません。
                ご自身の「Gmail（完全無料）」または「Resend API」を連携することで、入力されたメールアドレス宛てに実際にコード付きメールが送信できるようになります。
              </p>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => setIsSettingsOpen(true)}
              className="bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 text-amber-300 text-xs py-1.5"
            >
              メール送信設定を開く
            </Button>
          </div>
        )}

        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">ダッシュボード</h1>
            <p className="text-sm text-[#86868b]">署名依頼の作成と送信案件の進捗ステータス確認</p>
          </div>
          <Button variant="primary" onClick={() => setIsUploadOpen(true)} className="gap-2">
            <Plus size={16} />
            新規署名依頼
          </Button>
        </div>

        {/* Extended Settings Modal (GAS / Resend selection) ★追加・変更 */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000]/60 backdrop-blur-sm overflow-y-auto">
            <Card className="w-full max-w-xl border-white/10 shadow-3xl my-8">
              <CardContent className="p-8 flex flex-col gap-5 text-left max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-semibold text-white">メール送信設定</h2>
                    <p className="text-xs text-[#86868b] mt-1">認証コードの通知メールの送信方法を選択します。</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsSettingsOpen(false)} className="p-1 rounded-full">✕</Button>
                </div>

                {/* Provider Selector */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">送信元プロバイダ</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setTempProvider('gmail_gas')}
                      className={`p-3.5 border rounded-xl text-xs text-left transition-all ${
                        tempProvider === 'gmail_gas'
                          ? 'border-[#0071e3] bg-[#0071e3]/5 text-white'
                          : 'border-white/5 bg-transparent hover:border-white/20 text-[#a1a1aa]'
                      }`}
                    >
                      <p className="font-bold">Gmail (Google Apps Script)</p>
                      <p className="text-[10px] text-[#86868b] mt-1">完全無料・自分のGmailアドレスから送信可能</p>
                    </button>
                    <button
                      onClick={() => setTempProvider('resend')}
                      className={`p-3.5 border rounded-xl text-xs text-left transition-all ${
                        tempProvider === 'resend'
                          ? 'border-[#0071e3] bg-[#0071e3]/5 text-white'
                          : 'border-white/5 bg-transparent hover:border-white/20 text-[#a1a1aa]'
                      }`}
                    >
                      <p className="font-bold">Resend API</p>
                      <p className="text-[10px] text-[#86868b] mt-1">開発者向けメール配信APIを利用して高速送信</p>
                    </button>
                  </div>
                </div>

                {/* Conditional Settings Form */}
                {tempProvider === 'gmail_gas' ? (
                  <div className="flex flex-col gap-4">
                    <Input
                      label="Google Apps Script (GAS) WebアプリのURL"
                      placeholder="https://script.google.com/macros/s/xxxx/exec"
                      value={inputGasUrl}
                      onChange={(e) => setInputGasUrl(e.target.value)}
                    />
                    
                    <div className="p-4 bg-white/5 border border-white/5 rounded-lg text-xs leading-relaxed text-[#a1a1aa]">
                      <p className="font-bold text-white mb-2">💡 【5分で完成】無料のGmail送信APIの作り方</p>
                      <ol className="list-decimal list-inside space-y-1.5 pl-1">
                        <li>Googleアカウントでログインし、<a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google Apps Script</a> を開きます。</li>
                        <li>「新しいプロジェクト」を作成し、最初からあるコードをすべて消して**以下のコード**を貼り付けます。</li>
                      </ol>

                      {/* GAS Script Preview */}
                      <pre className="bg-black/80 border border-white/5 p-3 rounded-lg text-[10px] font-mono text-[#e4e4e7] overflow-x-auto my-2.5 max-h-36 select-all">
{`function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  MailApp.sendEmail({
    to: data.to,
    subject: data.subject,
    htmlBody: data.html
  });
  return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
    .setMimeType(ContentService.MimeType.JSON);
}`}
                      </pre>

                      <ol className="list-decimal list-inside space-y-1.5 pl-1" start={3}>
                        <li>右上の「デプロイ」➜「新しいデプロイ」をクリックします。</li>
                        <li>種類の選択で「ウェブアプリ」を選びます。</li>
                        <li>設定を以下に変更してデプロイします：
                          <ul className="list-disc list-inside pl-4 mt-1 text-[#86868b]">
                            <li>次のユーザーとして実行: <strong className="text-white">自分</strong></li>
                            <li>アクセスできるユーザー: <strong className="text-white">全員 (Anonymous)</strong></li>
                          </ul>
                        </li>
                        <li>発行された「ウェブアプリのURL」をコピーし、上記の入力欄に貼り付けます。</li>
                      </ol>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <Input
                      label="Resend API キー (re_...)"
                      type="password"
                      placeholder="re_xxxxxxxxxxxxxxxx"
                      value={inputKey}
                      onChange={(e) => setInputKey(e.target.value)}
                    />
                    <div className="p-4 bg-white/5 border border-white/5 rounded-lg text-xs leading-relaxed text-[#a1a1aa]">
                      <p className="font-semibold text-white mb-1">【設定方法】</p>
                      1. <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">resend.com</a> で無料アカウントを作成。<br />
                      2. 「API Keys」メニューからキーを作成し、ここに貼り付けます。
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-[#27272a] pt-4 mt-2">
                  <p className="text-xs font-semibold text-white mb-1">🔐 セキュリティ設定（ダッシュボード保護）</p>
                  <Input
                    label="管理者用ログインパスコード"
                    type="password"
                    placeholder="新しいパスコードを入力（デフォルト: aurasign2026）"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                  />
                  <span className="text-[10px] text-[#86868b]">※本番環境でダッシュボードの閲覧を制限するためのパスコードです。</span>
                </div>

                <div className="flex gap-3 justify-end border-t border-white/5 pt-4 mt-2">
                  <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(false)}>
                    キャンセル
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleSaveSettings}>
                    設定を保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Upload Modal Overlay */}
        {isUploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000]/60 backdrop-blur-sm">
            <Card className="w-full max-w-lg border-white/10 shadow-3xl">
              <CardContent className="p-8 flex flex-col gap-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-semibold text-white">ドキュメントをアップロード</h2>
                    <p className="text-xs text-[#86868b] mt-1">署名を配置するPDFファイルを選択してください</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsUploadOpen(false)} className="p-1 rounded-full">✕</Button>
                </div>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 ${
                    isDragging
                      ? 'border-white bg-white/5'
                      : 'border-[#27272a] hover:border-white/20 bg-white/0 hover:bg-white/[0.01]'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf"
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                    <FileUp className="w-6 h-6 text-[#a1a1aa]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-white font-medium">ドラッグ＆ドロップしてアップロード</p>
                    <p className="text-xs text-[#86868b] mt-1">またはクリックしてファイルを選択（最大10MB）</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Document List */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">最近のドキュメント</h2>
            
            {documents.length === 0 ? (
              <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                <FileText className="w-12 h-12 text-[#3f3f46] mb-4" />
                <p className="text-sm text-white font-medium">ドキュメントはありません</p>
                <p className="text-xs text-[#86868b] mt-1">新規依頼を作成してPDFをアップロードしてください。</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {documents.map((doc) => (
                  <Card 
                    key={doc.id} 
                    hoverEffect 
                    className="cursor-pointer border-white/5" 
                    onClick={() => onSelectDocument(doc.id, doc.status === 'sent')}
                  >
                    <CardContent className="p-5 flex flex-col gap-3">
                      
                      {/* Document Meta Row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white border border-white/5 flex-shrink-0">
                            <FileText size={20} className="text-blue-400" />
                          </div>
                          <div className="min-w-0 text-left">
                            <h3 className="text-sm font-semibold text-white truncate hover:underline">{doc.title}</h3>
                            <div className="flex items-center gap-2 mt-1 text-xs text-[#86868b]">
                              <span>{doc.createdAt}</span>
                              <span>•</span>
                              <span>{doc.originalSize}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          {getStatusBadge(doc)}
                        </div>
                      </div>

                      {/* Signers Progress Bar Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121214]/50 border border-white/[0.03] p-3 rounded-lg text-xs text-left">
                        <div className="flex flex-col gap-1">
                          <span className="text-[#86868b] font-medium flex items-center gap-1 text-[10px] uppercase tracking-wider">
                            <Users size={10} />
                            署名状況:
                          </span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {doc.signers.map((signer) => (
                              <span 
                                key={signer.id}
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  signer.status === 'signed'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                                }`}
                              >
                                {signer.name}: {signer.status === 'signed' ? '署名済' : '署名待ち'}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* CC Info */}
                        {doc.ccEmails.length > 0 && (
                          <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-white/5 pt-2 sm:pt-0 sm:pl-3">
                            <span className="text-[#86868b] font-medium flex items-center gap-1 text-[10px] uppercase tracking-wider">
                              <Mail size={10} />
                              共有先(CC):
                            </span>
                            <span className="text-[#a1a1aa] mt-1 truncate max-w-[120px]">{doc.ccEmails.join(', ')}</span>
                          </div>
                        )}

                        {/* Actions: Copy Link / Download Signed PDF */}
                        {doc.status === 'sent' && (
                          <div className="flex-shrink-0 self-end sm:self-center">
                            <Button 
                              variant="secondary" 
                              size="sm" 
                              onClick={(e) => handleCopySignUrl(e, doc)}
                              className="gap-1.5 text-xs py-1.5 h-8 bg-[#18181b] hover:bg-[#27272a]"
                            >
                              {copiedDocId === doc.id ? (
                                <>
                                  <Check size={12} className="text-emerald-400" />
                                  コピー完了
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  署名用URLをコピー
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {doc.status === 'completed' && (
                          <div className="flex-shrink-0 self-end sm:self-center">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation(); // CompletedView遷移を防ぐ
                                onDownloadPdf(doc);
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 shadow-md active:scale-[0.98] border-0 cursor-pointer h-8"
                            >
                              <Download size={12} />
                              署名済みPDFをダウンロード
                            </button>
                          </div>
                        )}
                      </div>

                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Audit Logs */}
          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider">アクティビティログ</h2>
            <Card className="flex-1 bg-[#121214]/40 border-white/5">
              <CardContent className="p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#86868b] border-b border-white/5 pb-3">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  セキュアシステム監査証跡
                </div>
                
                <div className="flex flex-col gap-4 overflow-y-auto max-h-[350px] text-left">
                  {documents.length === 0 ? (
                    <p className="text-xs text-[#86868b] text-center py-4">アクティビティログはありません</p>
                  ) : (
                    documents.flatMap((doc) => {
                      const events = [];

                      // 1. 署名完了イベント
                      if (doc.status === 'completed') {
                        events.push({
                          key: `${doc.id}-completed`,
                          title: `署名完了: ${doc.title}`,
                          desc: `署名者: ${doc.signers.map(s => s.name).join(', ')} (全員の署名手続きが完了しました)`,
                          date: doc.createdAt,
                          color: 'bg-emerald-400'
                        });
                      }

                      // 2. 署名者個別の「署名済」イベント
                      doc.signers.forEach((s) => {
                        if (s.status === 'signed') {
                          events.push({
                            key: `${doc.id}-signed-${s.id}`,
                            title: `署名が挿入されました: ${doc.title}`,
                            desc: `署名者: ${s.name} (${s.email})`,
                            date: doc.createdAt,
                            color: 'bg-teal-400'
                          });
                        }
                      });

                      // 3. 送信イベント
                      events.push({
                        key: `${doc.id}-sent`,
                        title: `署名依頼の送信`,
                        desc: `宛先: ${doc.signers.map(s => s.name).join(', ')} ${doc.ccEmails.length > 0 ? `• 共有先(CC): ${doc.ccEmails.join(', ')}` : ''}`,
                        date: doc.createdAt,
                        color: 'bg-blue-400'
                      });

                      // 4. アップロードイベント
                      events.push({
                        key: `${doc.id}-uploaded`,
                        title: `ドキュメントアップロード`,
                        desc: `ファイル名: ${doc.title} (${doc.originalSize})`,
                        date: doc.createdAt,
                        color: 'bg-zinc-400'
                      });

                      return events;
                    })
                    .sort((a, b) => b.date.localeCompare(a.date)) // 新しいログを上にする
                    .map((ev) => (
                      <div key={ev.key} className="flex gap-3 text-xs animate-fade-in">
                        <div className={`w-1.5 h-1.5 rounded-full ${ev.color} mt-1.5 flex-shrink-0`} />
                        <div>
                          <p className="text-white font-medium">{ev.title}</p>
                          <p className="text-[#86868b] mt-0.5">{ev.desc}</p>
                          <p className="text-[#3f3f46] mt-0.5">{ev.date}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>

      </main>
    </div>
  );
};

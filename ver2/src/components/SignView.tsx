import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Field, embedFieldsIntoPdf } from '../lib/pdfUtils';
import { SignaturePadModal } from './SignaturePadModal';
import { PenTool, Calendar, User, Building, Type, CheckSquare, RefreshCw, Shield, Info } from 'lucide-react';
import { sendOtpEmail } from '../lib/emailService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
  otp?: string;
}

interface SignViewProps {
  title: string;
  fields: Field[];
  originalPdfFile: File | null;
  signers: Signer[];
  activeSignerId: string;
  onSignatureCompleted: (signedPdfBlob: Blob, updatedFields: Field[], signerId: string) => void;
  onBack: () => void;
}

export const SignView: React.FC<SignViewProps> = ({
  title,
  fields: initialFields,
  originalPdfFile,
  signers,
  activeSignerId,
  onSignatureCompleted
}) => {
  const currentSigner = signers.find((s) => s.id === activeSignerId) || signers[0];

  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [fields, setFields] = useState<Field[]>(initialFields);

  const [isCompleting, setIsCompleting] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 署名お絵描きモーダル用
  const [isSigModalOpen, setIsSigModalOpen] = useState(false);
  const [activeSigField, setActiveSigField] = useState<Field | null>(null);

  // 一般テキスト入力モーダル用
  const [activeTextModalField, setActiveTextModalField] = useState<Field | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  const [pdfAspectRatio, setPdfAspectRatio] = useState<number>(1.4142);

  // 認証ロジック
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (authEmail.trim().toLowerCase() !== currentSigner?.email.toLowerCase()) {
      setAuthError(`この署名者（${currentSigner?.name}）のアドレスと一致しません。`);
      return;
    }
    setIsVerifying(true);
    const generatedOtp = currentSigner?.otp || '123456';
    const result = await sendOtpEmail(currentSigner.email, currentSigner.name, generatedOtp, title);
    setIsVerifying(false);
    setIsOtpSent(true);
    if (!result.success) {
      setAuthError(`【エラー】${result.error}`);
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      if (otp === (currentSigner?.otp || '123456')) {
        setIsAuthenticated(true);
      } else {
        setAuthError('ワンタイムパスワードが正しくありません。');
      }
    }, 800);
  };

  // PDFロード
  useEffect(() => {
    if (!isAuthenticated || !originalPdfFile) return;

    setIsLoadingPdf(true);
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);

        if (pdf.numPages > 0) {
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1.0 });
          if (viewport.width > 0) {
            setPdfAspectRatio(viewport.height / viewport.width);
          }
        }
      } catch (error) {
        console.error('Error reading PDF:', error);
      } finally {
        setIsLoadingPdf(false);
      }
    };
    fileReader.readAsArrayBuffer(originalPdfFile);
  }, [isAuthenticated, originalPdfFile]);

  // PDFレンダリング
  const renderMainPage = async (page: pdfjsLib.PDFPageProxy, pageNum: number) => {
    const pageContainer = pageRefs.current[pageNum];
    if (!pageContainer) return;

    const oldCanvas = pageContainer.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 w-full h-full shadow-md rounded-lg pointer-events-none';
    pageContainer.insertBefore(canvas, pageContainer.firstChild);

    const containerWidth = pageContainer.clientWidth || 600;
    const initialViewport = page.getViewport({ scale: 1.0 });
    const scale = containerWidth / initialViewport.width;
    const outputScale = window.devicePixelRatio || 2.0;
    const viewport = page.getViewport({ scale: scale * outputScale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    }
  };

  useEffect(() => {
    if (isLoadingPdf || !pdfDoc || numPages === 0) return;

    const renderAllPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          await renderMainPage(page, pageNum);
        } catch (err) {
          console.error(`Page render error ${pageNum}:`, err);
        }
      }
    };

    const timer = setTimeout(renderAllPages, 100);
    return () => clearTimeout(timer);
  }, [isLoadingPdf, pdfDoc, numPages]);

  // 枠のクリック処理
  const handleFieldClick = (field: Field) => {
    if (field.signerId !== activeSignerId) return;

    if (field.type === 'signature') {
      setActiveSigField(field);
      setIsSigModalOpen(true);
    } else if (field.type === 'checkbox') {
      const nextVal = field.value === 'true' ? 'false' : 'true';
      setFields(fields.map((f) => (f.id === field.id ? { ...f, value: nextVal } : f)));
    } else {
      setActiveTextModalField(field);
      setTextInputValue(field.value || '');
    }
  };

  // テキスト保存
  const handleSaveTextInput = () => {
    if (!activeTextModalField) return;
    if (!textInputValue.trim()) {
      alert('入力内容を入力してください。');
      return;
    }
    setFields(fields.map((f) => (f.id === activeTextModalField.id ? { ...f, value: textInputValue.trim() } : f)));
    setActiveTextModalField(null);
  };

  // 完了処理
  const handleComplete = async () => {
    const myFields = fields.filter((f) => f.signerId === activeSignerId);
    const emptyRequired = myFields.find((f) => f.isRequired !== false && !f.value && f.type !== 'checkbox');

    if (emptyRequired) {
      alert(`「${getFieldTypeName(emptyRequired.type)}」が未入力です。すべての必須項目に入力してください。`);
      return;
    }

    setIsCompleting(true);

    try {
      const arrayBuffer = await originalPdfFile!.arrayBuffer();
      const signedBlob = await embedFieldsIntoPdf(arrayBuffer, fields, activeSignerId);
      onSignatureCompleted(signedBlob, fields, activeSignerId);
    } catch (err) {
      console.error('Failed to complete signature:', err);
      alert('署名の合成に失敗しました。');
      setIsCompleting(false);
    }
  };

  const getFieldTypeName = (type: Field['type']) => {
    switch (type) {
      case 'signature': return '署名';
      case 'date': return '日付';
      case 'name': return '氏名';
      case 'company': return '会社名';
      case 'text': return 'テキスト';
      case 'checkbox': return 'チェック';
    }
  };

  const getFieldIcon = (type: Field['type']) => {
    switch (type) {
      case 'signature': return <PenTool size={12} />;
      case 'date': return <Calendar size={12} />;
      case 'name': return <User size={12} />;
      case 'company': return <Building size={12} />;
      case 'text': return <Type size={12} />;
      case 'checkbox': return <CheckSquare size={12} />;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-[#121214] border border-white/10 p-8 rounded-2xl shadow-2xl">
          <div className="flex flex-col items-center gap-3 text-center mb-6">
            <Shield className="w-10 h-10 text-blue-500" />
            <h2 className="text-xl font-bold text-white">署名者認証</h2>
            <p className="text-xs text-gray-400">
              署名者「{currentSigner?.name}」様の本人確認を行います。
            </p>
          </div>
          {authError && <div className="p-3 bg-red-500/20 text-red-300 text-xs rounded-xl mb-4">{authError}</div>}
          {!isOtpSent ? (
            <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="メールアドレス"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#1c1c1f] border border-white/10 text-white text-sm"
                required
              />
              <button type="submit" disabled={isVerifying} className="py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-sm">
                認証コード送信
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="6桁のコード (123456)"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#1c1c1f] border border-white/10 text-white text-sm text-center tracking-widest"
                required
              />
              <button type="submit" disabled={isVerifying} className="py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-sm">
                確認して次へ
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#09090b] text-white flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="border-b border-white/10 bg-[#121214] px-6 h-16 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h1 className="text-sm font-semibold truncate max-w-xs">{title}</h1>
          <span className="text-xs text-gray-500 hidden sm:inline">| 署名者: {currentSigner?.name}</span>
        </div>
        <button
          onClick={handleComplete}
          disabled={isCompleting}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg active:scale-95 transition-all"
        >
          {isCompleting ? '処理中...' : '署名を完了'}
        </button>
      </header>

      {/* Main Viewport */}
      <div className="flex-1 overflow-y-auto bg-[#141416] p-4 sm:p-8 flex justify-center items-start">
        {isLoadingPdf ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-gray-400">
            <RefreshCw className="animate-spin" size={28} />
            <span className="text-xs">PDFを読み込んでいます...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6 max-w-2xl w-full">
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-center gap-2">
              <Info size={16} className="text-blue-400 shrink-0" />
              <span>あなた専用の枠（点滅）をタップして署名・記入を行ってください。</span>
            </div>

            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => { pageRefs.current[pageNum] = el; }}
                style={{ aspectRatio: `1 / ${pdfAspectRatio}` }}
                className="relative w-full bg-white rounded-lg shadow-2xl mx-auto overflow-hidden border border-white/5"
              >
                <div className="absolute inset-0 z-20 pointer-events-auto">
                  {fields
                    .filter((f) => f.pageNumber === pageNum)
                    .map((field) => {
                      if (field.value && field.signerId !== activeSignerId) return null;

                      const isMyField = field.signerId === activeSignerId;
                      const isFilled = !!field.value;
                      const signerObj = signers.find(s => s.id === field.signerId);
                      const idx = signers.findIndex(s => s.id === field.signerId);
                      const colorMap = [
                        { bg: 'bg-blue-500/25 border-blue-600 text-blue-950', filled: 'bg-blue-500/10 border-blue-500 text-blue-900', badge: 'bg-blue-600 text-white' },
                        { bg: 'bg-purple-500/25 border-purple-600 text-purple-950', filled: 'bg-purple-500/10 border-purple-500 text-purple-900', badge: 'bg-purple-600 text-white' },
                        { bg: 'bg-emerald-500/25 border-emerald-600 text-emerald-950', filled: 'bg-emerald-500/10 border-emerald-500 text-emerald-900', badge: 'bg-emerald-600 text-white' },
                        { bg: 'bg-amber-500/25 border-amber-600 text-amber-950', filled: 'bg-amber-500/10 border-amber-500 text-amber-900', badge: 'bg-amber-600 text-white' }
                      ];
                      const colors = colorMap[idx % colorMap.length] || colorMap[0];

                      return (
                        <div
                          key={field.id}
                          onClick={() => handleFieldClick(field)}
                          onTouchEnd={(e) => {
                            e.stopPropagation();
                            handleFieldClick(field);
                          }}
                          style={{
                            left: `${field.x}%`,
                            top: `${field.y}%`,
                            width: `${field.w}%`,
                            height: `${field.h}%`
                          }}
                          className={`absolute flex items-center justify-center border-2 rounded transition-all select-none ${
                            isMyField
                              ? isFilled
                                ? `${colors.filled} cursor-pointer z-30 font-semibold`
                                : `${colors.bg} animate-pulse font-bold cursor-pointer z-30 shadow-lg`
                              : 'bg-gray-400/10 border-gray-400 text-gray-500 cursor-not-allowed z-10 opacity-50'
                          }`}
                        >
                          <div className={`absolute -top-4 left-0 px-1 py-0.5 rounded text-[8px] font-bold ${colors.badge} select-none`}>
                            {signerObj?.name || '署名者'}
                          </div>

                          <div className="flex items-center gap-1 text-[11px] truncate px-1 font-semibold">
                            {!isFilled && getFieldIcon(field.type)}
                            <span>
                              {field.value
                                ? field.value.startsWith('data:image/')
                                  ? '［手書き署名済］'
                                  : field.value.startsWith('typed:')
                                  ? field.value.split(':')[1]
                                  : field.value
                                : isMyField
                                ? `タップして${getFieldTypeName(field.type)}`
                                : '他者の入力欄'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 手書き・文字入力署名モーダル */}
      {isSigModalOpen && activeSigField && (
        <SignaturePadModal
          title="署名"
          initialValue={activeSigField.value}
          onSave={(val) => {
            setFields(fields.map((f) => (f.id === activeSigField.id ? { ...f, value: val } : f)));
            setIsSigModalOpen(false);
            setActiveSigField(null);
          }}
          onClose={() => {
            setIsSigModalOpen(false);
            setActiveSigField(null);
          }}
        />
      )}

      {/* テキスト入力モーダル */}
      {activeTextModalField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-[#121214] border border-white/10 p-6 rounded-2xl shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white">
              {getFieldTypeName(activeTextModalField.type)}を入力
            </h3>
            <input
              type="text"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              placeholder={`${getFieldTypeName(activeTextModalField.type)}を入力`}
              className="w-full px-3 py-2.5 rounded-xl bg-[#1c1c1f] border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTextInput(); }}
            />
            <div className="flex justify-end gap-2.5 mt-2">
              <button
                onClick={() => setActiveTextModalField(null)}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 bg-white/5 hover:bg-white/10"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveTextInput}
                className="px-5 py-2 rounded-xl text-xs text-white bg-blue-600 hover:bg-blue-500 font-semibold"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

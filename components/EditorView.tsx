import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { 
  FileText, Calendar, User, Building, Type, CheckSquare, 
  ChevronLeft, Trash2, ArrowRight, RefreshCw, Plus, Users, Mail 
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
}

interface Field {
  id: string;
  type: 'signature' | 'date' | 'name' | 'company' | 'text' | 'checkbox';
  pageNumber: number;
  x: number; // 左からの％
  y: number; // 上からの％
  w: number; // 幅の％
  h: number; // 高さの％
  value?: string;
  isRequired?: boolean;
  signerId: string; // どの署名者に紐付いているか
}

interface EditorViewProps {
  file: File | null;
  onBack: () => void;
  onSendRequest: (data: {
    title: string;
    signers: Signer[];
    ccEmails: string[];
    fields: Field[];
    pdfUrl: string;
  }) => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ file, onBack, onSendRequest }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>(file?.name || '名称未設定のドキュメント');
  
  // 複数署名者ステート (初期値は1名)
  const [signers, setSigners] = useState<Signer[]>([
    { id: 'signer-1', name: '署名者 1', email: '', status: 'pending' }
  ]);
  const [activeSignerSelect, setActiveSignerSelect] = useState<string>('signer-1'); // 新規フィールド追加時に割り当てる署名者ID

  // 共有先(CC)メールアドレスステート
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [tempCcEmail, setTempCcEmail] = useState('');

  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ドラッグ操作ステート
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingFieldId, setResizingFieldId] = useState<string | null>(null);
  const [initialResizeSize, setInitialResizeSize] = useState({ w: 0, h: 0 });
  const [initialMousePos, setInitialMousePos] = useState({ x: 0, y: 0 });

  // PDFのロード処理
  useEffect(() => {
    if (!file) return;

    setIsLoadingPdf(true);
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        
        // 最初のレンダリング
        await renderAllPages(pdf);
      } catch (error) {
        console.error('Error rendering PDF:', error);
        alert('PDFファイルの読み込みに失敗しました。');
      } finally {
        setIsLoadingPdf(false);
      }
    };
    fileReader.readAsArrayBuffer(file);
  }, [file]);

  // 全ページのサムネイルをレンダリング
  const renderAllPages = async (pdf: pdfjsLib.PDFDocumentProxy) => {
    const thumbs: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      
      // サムネイル生成用
      const viewport = page.getViewport({ scale: 0.2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      if (context) {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        thumbs.push(canvas.toDataURL());
      }
    }
    setThumbnails(thumbs);
  };

  // メインのPDFキャンバスのレンダリング
  const renderMainPage = async (page: pdfjsLib.PDFPageProxy, pageNum: number) => {
    const pageContainer = pageRefs.current[pageNum];
    if (!pageContainer) return;

    // コンテナ幅に合わせて自動スケーリング
    const containerWidth = pageContainer.clientWidth || 600;
    const initialViewport = page.getViewport({ scale: 1.0 });
    const scale = containerWidth / initialViewport.width;
    const viewport = page.getViewport({ scale });

    // 既存のキャンバスがあれば削除
    const oldCanvas = pageContainer.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = 'shadow-md border border-white/5 rounded-lg';
    
    pageContainer.insertBefore(canvas, pageContainer.firstChild);

    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    }
  };

  // PDFのロード・パース完了後、DOMがマウントされてからメインのプレビューを描画する ★追加
  useEffect(() => {
    if (isLoadingPdf || !pdfDoc || numPages === 0) return;

    const renderAllMainPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          await renderMainPage(page, pageNum);
        } catch (err) {
          console.error(`Error rendering page preview ${pageNum}:`, err);
        }
      }
    };

    // DOMマウントが完了するのを少し待ってから実行
    const timer = setTimeout(() => {
      renderAllMainPages();
    }, 150);

    return () => clearTimeout(timer);
  }, [isLoadingPdf, pdfDoc, numPages]);

  // 署名者の追加
  const addSigner = () => {
    const newId = `signer-${Date.now()}`;
    const newSigner: Signer = {
      id: newId,
      name: `署名者 ${signers.length + 1}`,
      email: '',
      status: 'pending'
    };
    setSigners([...signers, newSigner]);
    setActiveSignerSelect(newId);
  };

  // 署名者情報の更新
  const updateSigner = (id: string, field: 'name' | 'email', value: string) => {
    setSigners(signers.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // 署名者の削除
  const deleteSigner = (id: string) => {
    if (signers.length <= 1) {
      alert('署名者は最低1名必要です。');
      return;
    }
    setSigners(signers.filter(s => s.id !== id));
    // 削除された署名者に紐付いていたフィールドも削除
    setFields(fields.filter(f => f.signerId !== id));
    if (activeSignerSelect === id) {
      const remaining = signers.filter(s => s.id !== id);
      setActiveSignerSelect(remaining[0].id);
    }
  };

  // 共有先(CC)の追加
  const addCcEmail = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(tempCcEmail)) {
      alert('正しいメールアドレス形式で入力してください。');
      return;
    }
    if (ccEmails.includes(tempCcEmail)) {
      alert('既に登録済みのメールアドレスです。');
      return;
    }
    setCcEmails([...ccEmails, tempCcEmail]);
    setTempCcEmail('');
  };

  // 共有先(CC)の削除
  const deleteCcEmail = (email: string) => {
    setCcEmails(ccEmails.filter(e => e !== email));
  };

  // フィールドの追加
  const addField = (type: Field['type']) => {
    let defaultW = 22; // ％表記
    let defaultH = 6;
    if (type === 'checkbox') {
      defaultW = 4;
      defaultH = 4;
    }

    const newField: Field = {
      id: `field-${Date.now()}`,
      type,
      pageNumber: currentPage,
      x: 35, // 初期位置は中央付近
      y: 40,
      w: defaultW,
      h: defaultH,
      signerId: activeSignerSelect
    };

    setFields([...fields, newField]);
    setSelectedFieldId(newField.id);
  };

  // フィールド削除
  const deleteField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  // マウスイベントによるドラッグ開始
  const handleDragStart = (e: React.MouseEvent, field: Field) => {
    e.stopPropagation();
    setSelectedFieldId(field.id);
    setDraggingFieldId(field.id);

    const pageContainer = pageRefs.current[field.pageNumber];
    if (!pageContainer) return;

    const rect = pageContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left - (field.x / 100 * rect.width);
    const clickY = e.clientY - rect.top - (field.y / 100 * rect.height);
    setDragOffset({ x: clickX, y: clickY });
  };

  // リサイズ開始
  const handleResizeStart = (e: React.MouseEvent, field: Field) => {
    e.stopPropagation();
    setSelectedFieldId(field.id);
    setResizingFieldId(field.id);
    setInitialResizeSize({ w: field.w, h: field.h });
    setInitialMousePos({ x: e.clientX, y: e.clientY });
  };

  // ドラッグ中・リサイズ中
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingFieldId) {
        const field = fields.find(f => f.id === draggingFieldId);
        if (!field) return;

        const pageContainer = pageRefs.current[field.pageNumber];
        if (!pageContainer) return;

        const rect = pageContainer.getBoundingClientRect();
        
        let newX = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
        let newY = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;

        newX = Math.max(0, Math.min(100 - field.w, newX));
        newY = Math.max(0, Math.min(100 - field.h, newY));

        setFields(fields.map(f => f.id === draggingFieldId ? { ...f, x: newX, y: newY } : f));
      }

      if (resizingFieldId) {
        const field = fields.find(f => f.id === resizingFieldId);
        if (!field) return;

        const pageContainer = pageRefs.current[field.pageNumber];
        if (!pageContainer) return;

        const rect = pageContainer.getBoundingClientRect();
        const deltaX = e.clientX - initialMousePos.x;
        const deltaY = e.clientY - initialMousePos.y;

        const deltaWPercent = (deltaX / rect.width) * 100;
        const deltaHPercent = (deltaY / rect.height) * 100;

        let newW = initialResizeSize.w + deltaWPercent;
        let newH = initialResizeSize.h + deltaHPercent;

        newW = Math.max(2, Math.min(100 - field.x, newW));
        newH = Math.max(2, Math.min(100 - field.y, newH));

        setFields(fields.map(f => f.id === resizingFieldId ? { ...f, w: newW, h: newH } : f));
      }
    };

    const handleMouseUp = () => {
      setDraggingFieldId(null);
      setResizingFieldId(null);
    };

    if (draggingFieldId || resizingFieldId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingFieldId, resizingFieldId, fields, dragOffset, initialResizeSize, initialMousePos]);

  // 送信処理
  const handleSend = () => {
    // 署名者情報の入力チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const signer of signers) {
      if (!signer.name.trim()) {
        alert('すべての署名者の氏名を入力してください。');
        return;
      }
      if (!emailRegex.test(signer.email)) {
        alert(`署名者 「${signer.name}」 のメールアドレスが正しくありません。`);
        return;
      }
    }

    if (fields.length === 0) {
      alert('署名フィールドを1つ以上配置してください。');
      return;
    }

    onSendRequest({
      title,
      signers,
      ccEmails,
      fields,
      pdfUrl: 'mock-pdf-url'
    });
  };

  // 署名者別のスタイリング（枠色と背景色を明確に着色） ★視認性向上の修正
  const getSignerColorClasses = (signerId: string, isSelected: boolean) => {
    const index = signers.findIndex(s => s.id === signerId);
    
    // 署名者ごとのパレット (背景色/枠線色/バッジ色) - PDFの白背景で見えやすいようしっかり濃い色に
    const colorMap = [
      { // 署名者 1: 青
        bg: 'bg-blue-500/20',
        border: isSelected ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-blue-500',
        text: 'text-blue-700 font-semibold',
        badgeBg: 'bg-blue-600'
      },
      { // 署名者 2: 紫
        bg: 'bg-purple-500/20',
        border: isSelected ? 'border-purple-600 ring-2 ring-purple-500/20' : 'border-purple-500',
        text: 'text-purple-700 font-semibold',
        badgeBg: 'bg-purple-600'
      },
      { // 署名者 3: 緑
        bg: 'bg-emerald-500/20',
        border: isSelected ? 'border-emerald-600 ring-2 ring-emerald-500/20' : 'border-emerald-500',
        text: 'text-emerald-700 font-semibold',
        badgeBg: 'bg-emerald-600'
      },
      { // 署名者 4: 黄
        bg: 'bg-amber-500/20',
        border: isSelected ? 'border-amber-600 ring-2 ring-amber-500/20' : 'border-amber-500',
        text: 'text-amber-700 font-semibold',
        badgeBg: 'bg-amber-600'
      }
    ];

    const fallback = {
      bg: 'bg-zinc-500/20',
      border: isSelected ? 'border-zinc-600 ring-2 ring-zinc-500/20' : 'border-zinc-500',
      text: 'text-zinc-700 font-semibold',
      badgeBg: 'bg-zinc-600'
    };

    return colorMap[index % colorMap.length] || fallback;
  };

  const getFieldIcon = (type: Field['type']) => {
    switch (type) {
      case 'signature': return <FileText size={13} />;
      case 'date': return <Calendar size={13} />;
      case 'name': return <User size={13} />;
      case 'company': return <Building size={13} />;
      case 'text': return <Type size={13} />;
      case 'checkbox': return <CheckSquare size={13} />;
    }
  };

  const getFieldLabel = (type: Field['type']) => {
    switch (type) {
      case 'signature': return '署名欄';
      case 'date': return '日付';
      case 'name': return '氏名';
      case 'company': return '会社名';
      case 'text': return 'テキスト';
      case 'checkbox': return 'チェック';
    }
  };

  return (
    <div className="h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <header className="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md px-6 h-16 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="p-1.5 rounded-lg">
            <ChevronLeft size={18} />
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-[#86868b] text-sm">編集</span>
            <span className="text-[#3f3f46]">/</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-0 font-semibold text-sm text-white focus:ring-1 focus:ring-white/20 px-2 py-1 rounded"
            />
          </div>
        </div>
        
        <Button variant="primary" size="sm" onClick={handleSend} className="gap-2 text-xs">
          署名依頼を送信
          <ArrowRight size={14} />
        </Button>
      </header>

      {/* Editor Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Thumbnail Panel */}
        <aside className="w-48 border-r border-white/5 bg-[#09090b]/40 overflow-y-auto hidden md:flex flex-col gap-4 p-4">
          <h3 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">ページ一覧</h3>
          {isLoadingPdf ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-xs text-[#86868b]">
              <RefreshCw className="animate-spin" size={16} />
              読み込み中...
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {thumbnails.map((thumb, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setCurrentPage(index + 1);
                    pageRefs.current[index + 1]?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`relative cursor-pointer rounded-lg overflow-hidden border transition-all duration-200 ${
                    currentPage === index + 1
                      ? 'border-white/50 ring-2 ring-white/10'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <img src={thumb} alt={`Page ${index + 1}`} className="w-full h-auto" />
                  <div className="absolute bottom-1 right-1 bg-black/70 text-[9px] px-1.5 py-0.5 rounded text-white">
                    {index + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center: PDF Viewer Canvas Container */}
        <main className="flex-1 overflow-y-auto bg-[#141416]/50 p-6 md:p-10 flex justify-center items-start">
          {isLoadingPdf ? (
            <div className="flex flex-col items-center gap-4 text-center mt-20">
              <RefreshCw className="animate-spin text-white" size={32} />
              <p className="text-sm text-[#86868b]">PDFドキュメントをレンダリングしています...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8 max-w-2xl w-full" ref={containerRef}>
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={(el) => {
                    pageRefs.current[pageNum] = el;
                  }}
                  onClick={() => setCurrentPage(pageNum)}
                  className="relative w-full aspect-[1/1.41] bg-white rounded-lg shadow-xl"
                >
                  {/* Absolute positioning fields overlay layer */}
                  <div className="absolute inset-0 z-20 pointer-events-auto">
                    {fields
                      .filter((f) => f.pageNumber === pageNum)
                      .map((field) => {
                        const isSelected = selectedFieldId === field.id;
                        const colors = getSignerColorClasses(field.signerId, isSelected);
                        const assignedSigner = signers.find(s => s.id === field.signerId);
                        
                        return (
                          <div
                            key={field.id}
                            onMouseDown={(e) => handleDragStart(e, field)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFieldId(field.id);
                            }}
                            style={{
                              left: `${field.x}%`,
                              top: `${field.y}%`,
                              width: `${field.w}%`,
                              height: `${field.h}%`
                            }}
                            // 白地PDFの上で見やすいように border-2、実線、半透明の濃い背景を適用
                            className={`absolute flex items-center justify-center border-2 rounded cursor-move transition-shadow ${colors.bg} ${colors.border} ${colors.text}`}
                          >
                            {/* Assigned User Tag on top of the field */}
                            <div className={`absolute -top-4.5 left-0 px-1 py-0.5 rounded text-[8px] text-white ${colors.badgeBg} max-w-full truncate scale-90 origin-bottom-left select-none font-medium`}>
                              {assignedSigner?.name || '未割当'}
                            </div>

                            <div className="flex items-center gap-1.5 select-none pointer-events-none truncate text-[10px]">
                              {getFieldIcon(field.type)}
                              {getFieldLabel(field.type)}
                            </div>
                            
                            {/* Resize Handle */}
                            {isSelected && (
                              <div
                                onMouseDown={(e) => handleResizeStart(e, field)}
                                className="absolute bottom-0 right-0 w-3 h-3 bg-white border border-zinc-900 rounded-tl cursor-se-resize z-30"
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right: Sidebar Properties Panel */}
        <aside className="w-80 border-l border-white/5 bg-[#09090b]/40 flex flex-col gap-6 p-6 overflow-y-auto">
          
          {/* Signers List Form */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} className="text-[#0071e3]" />
                署名者リスト
              </h3>
              <button 
                onClick={addSigner}
                className="text-[10px] text-white hover:text-blue-400 font-semibold flex items-center gap-1 bg-white/5 border border-white/5 rounded-md px-2 py-1 transition-colors"
              >
                <Plus size={10} />
                追加
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              {signers.map((signer, index) => {
                const colors = getSignerColorClasses(signer.id, false);
                return (
                  <div key={signer.id} className="p-3 bg-[#121214]/60 border border-white/5 rounded-lg flex flex-col gap-2 relative">
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${colors.badgeBg}`}>
                        署名者 {index + 1}
                      </span>
                      {signers.length > 1 && (
                        <button 
                          onClick={() => deleteSigner(signer.id)}
                          className="text-[#86868b] hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <Input
                      placeholder="お名前"
                      value={signer.name}
                      onChange={(e) => updateSigner(signer.id, 'name', e.target.value)}
                      className="py-1.5 text-xs"
                    />
                    <Input
                      placeholder="メールアドレス"
                      value={signer.email}
                      onChange={(e) => updateSigner(signer.id, 'email', e.target.value)}
                      className="py-1.5 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <hr className="border-white/5" />

          {/* CC Recipients Form */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5">
              <Mail size={12} className="text-purple-400" />
              署名完了の共有先 (CC)
            </h3>
            
            <div className="flex gap-2">
              <Input
                placeholder="cc@company.com"
                value={tempCcEmail}
                onChange={(e) => setTempCcEmail(e.target.value)}
                className="py-1.5 text-xs flex-1"
              />
              <Button variant="secondary" size="sm" onClick={addCcEmail} className="px-3">
                追加
              </Button>
            </div>

            {ccEmails.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                {ccEmails.map((email) => (
                  <div key={email} className="flex justify-between items-center text-xs bg-[#121214]/40 border border-white/5 px-2.5 py-1.5 rounded-lg text-[#a1a1aa]">
                    <span className="truncate max-w-[190px]">{email}</span>
                    <button 
                      onClick={() => deleteCcEmail(email)}
                      className="text-[#86868b] hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-white/5" />

          {/* Active Signer Selection (For placing fields) */}
          <div className="flex flex-col gap-2 text-left">
            <label className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">
              配置フィールドの割り当て先
            </label>
            <select
              value={activeSignerSelect}
              onChange={(e) => setActiveSignerSelect(e.target.value)}
              className="w-full px-3 py-2 bg-[#121214] border border-white/5 rounded-lg text-xs text-white font-medium focus:ring-1 focus:ring-white/20 outline-none"
            >
              {signers.map((s, idx) => (
                <option key={s.id} value={s.id}>
                  {s.name || `署名者 ${idx + 1}`} ({s.email || '未設定'})
                </option>
              ))}
            </select>
          </div>

          {/* Draggable (Click to Place) Fields Panel */}
          <div className="flex flex-col gap-4">
            <p className="text-[10px] text-[#86868b]">配置したい項目をクリックすると、現在表示されているページ（p.{currentPage}）の中央に枠が現れます。ドラッグで位置を動かしてください。</p>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => addField('signature')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <FileText size={14} className="text-[#0071e3]" />
                署名欄
              </button>
              <button
                onClick={() => addField('date')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <Calendar size={14} className="text-purple-400" />
                日付
              </button>
              <button
                onClick={() => addField('name')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <User size={14} className="text-emerald-400" />
                氏名
              </button>
              <button
                onClick={() => addField('company')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <Building size={14} className="text-amber-400" />
                会社名
              </button>
              <button
                onClick={() => addField('text')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <Type size={14} className="text-blue-400" />
                フリー入力
              </button>
              <button
                onClick={() => addField('checkbox')}
                className="flex items-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-xs text-white font-medium transition-colors text-left"
              >
                <CheckSquare size={14} className="text-pink-400" />
                チェック欄
              </button>
            </div>
          </div>

          {/* Selected Field Operations */}
          {selectedFieldId && (
            <>
              <hr className="border-white/5" />
              <div className="flex flex-col gap-3 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">選択中のフィールド</h4>
                  <button
                    onClick={() => deleteField(selectedFieldId)}
                    className="p-1 hover:bg-red-500/10 text-[#86868b] hover:text-red-400 rounded transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                
                <div className="bg-[#121214]/50 border border-white/5 p-3.5 rounded-lg text-xs flex flex-col gap-2.5">
                  <div className="flex justify-between">
                    <span className="text-[#86868b]">項目タイプ:</span>
                    <span className="font-semibold text-white">
                      {getFieldLabel(fields.find((f) => f.id === selectedFieldId)?.type || 'signature')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86868b]">配置ページ:</span>
                    <span className="text-white">p.{fields.find((f) => f.id === selectedFieldId)?.pageNumber}</span>
                  </div>
                  <div className="flex flex-col gap-1 mt-1 border-t border-white/5 pt-2">
                    <span className="text-[#86868b]">割り当て署名者:</span>
                    <select
                      value={fields.find((f) => f.id === selectedFieldId)?.signerId || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFields(fields.map(f => f.id === selectedFieldId ? { ...f, signerId: val } : f));
                      }}
                      className="w-full mt-1 px-2 py-1 bg-[#09090b] border border-white/10 rounded text-xs text-white"
                    >
                      {signers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

        </aside>

      </div>
    </div>
  );
};

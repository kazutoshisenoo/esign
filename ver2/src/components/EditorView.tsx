import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { Field } from '../lib/pdfUtils';
import { PenTool, Calendar, User, Building, Type, CheckSquare, Plus, Trash2, Send, ArrowLeft, RefreshCw, Move, Maximize2 } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
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

const SIGNER_COLORS = [
  { bg: 'bg-blue-500/25', border: 'border-blue-500', text: 'text-blue-950 font-bold', badge: 'bg-blue-600 text-white', label: '青 (署名者1)' },
  { bg: 'bg-purple-500/25', border: 'border-purple-500', text: 'text-purple-950 font-bold', badge: 'bg-purple-600 text-white', label: '紫 (署名者2)' },
  { bg: 'bg-emerald-500/25', border: 'border-emerald-500', text: 'text-emerald-950 font-bold', badge: 'bg-emerald-600 text-white', label: '緑 (署名者3)' },
  { bg: 'bg-amber-500/25', border: 'border-amber-500', text: 'text-amber-950 font-bold', badge: 'bg-amber-600 text-white', label: '橙 (署名者4)' }
];

export const EditorView: React.FC<EditorViewProps> = ({ file, onBack, onSendRequest }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [title, setTitle] = useState(file?.name || '名称未設定ドキュメント.pdf');
  const [signers, setSigners] = useState<Signer[]>([
    { id: 'signer-1', name: '署名者 1', email: '', status: 'pending' },
    { id: 'signer-2', name: '署名者 2', email: '', status: 'pending' }
  ]);
  const [selectedSignerId, setSelectedSignerId] = useState<string>('signer-1');

  const [fields, setFields] = useState<Field[]>([]);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [pdfAspectRatio, setPdfAspectRatio] = useState<number>(1.4142);

  // ドラッグ＆リサイズ用ステート
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [resizingFieldId, setResizingFieldId] = useState<string | null>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number; startW: number; startH: number }>({
    mouseX: 0, mouseY: 0, startX: 0, startY: 0, startW: 0, startH: 0
  });

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getSignerColor = (signerId: string) => {
    const idx = signers.findIndex(s => s.id === signerId);
    return SIGNER_COLORS[idx % SIGNER_COLORS.length] || SIGNER_COLORS[0];
  };

  useEffect(() => {
    if (!file) return;

    setIsLoading(true);
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);

        if (pdf.numPages > 0) {
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1.0 });
          if (viewport.width > 0) {
            setPdfAspectRatio(viewport.height / viewport.width);
          }
        }
      } catch (err) {
        console.error('Failed to load PDF in editor:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fileReader.readAsArrayBuffer(file);
  }, [file]);

  const renderEditorPage = async (page: pdfjsLib.PDFPageProxy, pageNum: number) => {
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
    if (isLoading || !pdfDoc || numPages === 0) return;

    const renderPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          await renderEditorPage(page, pageNum);
        } catch (err) {
          console.error(`Editor render page error ${pageNum}:`, err);
        }
      }
    };

    const timer = setTimeout(renderPages, 100);
    return () => clearTimeout(timer);
  }, [isLoading, pdfDoc, numPages]);

  // マウス＆タッチドラッグイベントのグルー
  const handleMouseDownField = (e: React.MouseEvent | React.TouchEvent, field: Field) => {
    e.stopPropagation();
    setActiveFieldId(field.id);
    setDraggingFieldId(field.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragStartPos.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: field.x,
      startY: field.y,
      startW: field.w,
      startH: field.h
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent | React.TouchEvent, field: Field) => {
    e.stopPropagation();
    setActiveFieldId(field.id);
    setResizingFieldId(field.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragStartPos.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: field.x,
      startY: field.y,
      startW: field.w,
      startH: field.h
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!draggingFieldId && !resizingFieldId) return;

      const targetId = draggingFieldId || resizingFieldId;
      const targetField = fields.find(f => f.id === targetId);
      if (!targetField) return;

      const pageEl = pageRefs.current[targetField.pageNumber];
      if (!pageEl) return;

      const rect = pageEl.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

      const deltaXPercent = ((clientX - dragStartPos.current.mouseX) / rect.width) * 100;
      const deltaYPercent = ((clientY - dragStartPos.current.mouseY) / rect.height) * 100;

      if (draggingFieldId) {
        let newX = Math.max(0, Math.min(100 - targetField.w, dragStartPos.current.startX + deltaXPercent));
        let newY = Math.max(0, Math.min(100 - targetField.h, dragStartPos.current.startY + deltaYPercent));
        
        setFields(fields.map(f => f.id === draggingFieldId ? { ...f, x: newX, y: newY } : f));
      } else if (resizingFieldId) {
        let newW = Math.max(3, Math.min(100 - targetField.x, dragStartPos.current.startW + deltaXPercent));
        let newH = Math.max(2, Math.min(100 - targetField.y, dragStartPos.current.startH + deltaYPercent));

        setFields(fields.map(f => f.id === resizingFieldId ? { ...f, w: newW, h: newH } : f));
      }
    };

    const handleMouseUp = () => {
      setDraggingFieldId(null);
      setResizingFieldId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleMouseMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [draggingFieldId, resizingFieldId, fields]);

  // フィールド追加
  const addField = (type: Field['type']) => {
    const newField: Field = {
      id: `field-${Date.now()}`,
      type,
      pageNumber: 1,
      x: 35,
      y: 40 + (fields.length % 5) * 7,
      w: type === 'signature' ? 26 : type === 'checkbox' ? 5 : 22,
      h: type === 'checkbox' ? 4 : 5.5,
      signerId: selectedSignerId
    };
    setFields([...fields, newField]);
    setActiveFieldId(newField.id);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    if (activeFieldId === id) setActiveFieldId(null);
  };

  const handleSend = () => {
    if (fields.length === 0) {
      alert('署名または入力フィールドを1つ以上追加してください。');
      return;
    }
    const invalidSigner = signers.find((s) => !s.email.trim());
    if (invalidSigner) {
      alert(`「${invalidSigner.name}」のメールアドレスを入力してください。`);
      return;
    }

    onSendRequest({
      title,
      signers,
      ccEmails: [],
      fields,
      pdfUrl: ''
    });
  };

  const getFieldTypeName = (type: Field['type']) => {
    switch (type) {
      case 'signature': return '署名欄';
      case 'date': return '日付欄';
      case 'name': return '氏名欄';
      case 'company': return '会社名';
      case 'text': return 'テキスト';
      case 'checkbox': return 'チェック';
    }
  };

  return (
    <div className="h-screen bg-[#09090b] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#121214] px-6 h-16 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 text-gray-400 hover:text-white rounded-xl bg-white/5">
            <ArrowLeft size={16} />
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent border border-white/10 rounded-lg px-3 py-1 text-sm font-semibold text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          onClick={handleSend}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg active:scale-95 transition-all"
        >
          <Send size={14} />
          <span>送信する</span>
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-white/10 bg-[#121214] p-5 flex flex-col gap-6 overflow-y-auto shrink-0">
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">1. 署名者の設定＆色分け</h3>
            <div className="flex flex-col gap-2.5">
              {signers.map((s, idx) => {
                const color = SIGNER_COLORS[idx % SIGNER_COLORS.length];
                return (
                  <div key={s.id} className="p-3 bg-[#1a1a1e] border border-white/10 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded font-bold ${color.badge}`}>
                        {s.name}
                      </span>
                      {signers.length > 1 && (
                        <button
                          onClick={() => setSigners(signers.filter((item) => item.id !== s.id))}
                          className="text-gray-500 hover:text-rose-400 text-xs"
                        >
                          削除
                        </button>
                      )}
                    </div>
                    <input
                      type="email"
                      placeholder="メールアドレス"
                      value={s.email}
                      onChange={(e) =>
                        setSigners(signers.map((item) => (item.id === s.id ? { ...item, email: e.target.value } : item)))
                      }
                      className="w-full px-2.5 py-1.5 bg-[#09090b] border border-white/10 rounded-lg text-xs text-white"
                    />
                  </div>
                );
              })}
              <button
                onClick={() =>
                  setSigners([
                    ...signers,
                    { id: `signer-${signers.length + 1}`, name: `署名者 ${signers.length + 1}`, email: '', status: 'pending' }
                  ])
                }
                className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-300 flex items-center justify-center gap-1 border border-dashed border-white/20"
              >
                <Plus size={14} /> 署名者を追加
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">2. 配置する署名者を選択</h3>
            <select
              value={selectedSignerId}
              onChange={(e) => setSelectedSignerId(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a1e] border border-white/10 rounded-xl text-xs text-white"
            >
              {signers.map((s, idx) => {
                const color = SIGNER_COLORS[idx % SIGNER_COLORS.length];
                return (
                  <option key={s.id} value={s.id}>
                    ● {s.name}（{color.label}）
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">3. 項目パーツの配置</h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => addField('signature')} className="p-2.5 bg-[#1a1a1e] hover:bg-blue-600/20 border border-white/10 rounded-xl text-xs text-left flex flex-col gap-1">
                <PenTool size={14} className="text-blue-400" />
                <span>署名欄</span>
              </button>
              <button onClick={() => addField('name')} className="p-2.5 bg-[#1a1a1e] hover:bg-purple-600/20 border border-white/10 rounded-xl text-xs text-left flex flex-col gap-1">
                <User size={14} className="text-purple-400" />
                <span>氏名欄</span>
              </button>
              <button onClick={() => addField('date')} className="p-2.5 bg-[#1a1a1e] hover:bg-emerald-600/20 border border-white/10 rounded-xl text-xs text-left flex flex-col gap-1">
                <Calendar size={14} className="text-emerald-400" />
                <span>日付欄</span>
              </button>
              <button onClick={() => addField('text')} className="p-2.5 bg-[#1a1a1e] hover:bg-amber-600/20 border border-white/10 rounded-xl text-xs text-left flex flex-col gap-1">
                <Type size={14} className="text-amber-400" />
                <span>テキスト</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300">
            💡 <strong>操作ヒント:</strong><br />
            配置した枠は<strong>ドラッグで自由に移動</strong>でき、右下のハンドルで<strong>サイズ変更（リサイズ）</strong>が可能です。
          </div>
        </aside>

        {/* Center Canvas Area */}
        <main className="flex-1 overflow-y-auto bg-[#141416] p-6 flex justify-center items-start">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 mt-20 text-gray-400">
              <RefreshCw className="animate-spin" size={28} />
              <span className="text-xs">エディターを準備しています...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-6 max-w-2xl w-full">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={(el) => { pageRefs.current[pageNum] = el; }}
                  style={{ aspectRatio: `1 / ${pdfAspectRatio}` }}
                  className="relative w-full bg-white rounded-lg shadow-2xl mx-auto overflow-hidden border border-white/5 select-none"
                >
                  <div className="absolute inset-0 z-20 pointer-events-auto">
                    {fields
                      .filter((f) => f.pageNumber === pageNum)
                      .map((field) => {
                        const signerObj = signers.find((s) => s.id === field.signerId);
                        const color = getSignerColor(field.signerId);
                        const isActive = activeFieldId === field.id;

                        return (
                          <div
                            key={field.id}
                            onMouseDown={(e) => handleMouseDownField(e, field)}
                            onTouchStart={(e) => handleMouseDownField(e, field)}
                            style={{
                              left: `${field.x}%`,
                              top: `${field.y}%`,
                              width: `${field.w}%`,
                              height: `${field.h}%`
                            }}
                            className={`absolute border-2 rounded flex items-center justify-between px-2 cursor-move z-30 transition-shadow ${color.bg} ${color.border} ${
                              isActive ? 'ring-2 ring-white ring-offset-1 shadow-xl' : ''
                            }`}
                          >
                            {/* 署名者ネームタグ（色分けバッジ） */}
                            <div className={`absolute -top-4 left-0 px-1 py-0.5 rounded text-[8px] font-bold ${color.badge} select-none`}>
                              {signerObj?.name || '他者'}
                            </div>

                            <span className={`text-[10px] truncate select-none ${color.text}`}>
                              {getFieldTypeName(field.type)}
                            </span>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(field.id);
                              }}
                              className="text-rose-600 hover:text-rose-800 p-0.5 shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>

                            {/* リサイズハンドル (右下) */}
                            <div
                              onMouseDown={(e) => handleMouseDownResize(e, field)}
                              onTouchStart={(e) => handleMouseDownResize(e, field)}
                              className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-white border border-gray-400 rounded-tl cursor-se-resize flex items-center justify-center"
                            >
                              <div className="w-1.5 h-1.5 border-r border-b border-gray-600" />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

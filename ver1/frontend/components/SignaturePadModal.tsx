import React, { useState, useRef, useEffect } from 'react';

interface SignaturePadModalProps {
  title: string;
  initialValue?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  title,
  initialValue = '',
  onSave,
  onClose
}) => {
  const [tab, setTab] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (initialValue.startsWith('typed:')) {
      setTab('type');
      setTypedName(initialValue.split(':')[1] || '');
    } else if (initialValue.startsWith('data:image/')) {
      setTab('draw');
    }
  }, [initialValue]);

  useEffect(() => {
    if (tab !== 'draw') return;

    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [tab]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawing.current = true;
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    const { x, y } = getCanvasCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
  };

  const handleApply = () => {
    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    } else {
      if (!typedName.trim()) {
        alert('お名前を入力してください。');
        return;
      }
      onSave(`typed:${typedName.trim()}:font-signature-1`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-[#121214] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{title}を入力</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xs px-2 py-1">
            ✕
          </button>
        </div>

        <div className="flex border-b border-white/10 bg-[#1a1a1e]">
          <button
            onClick={() => setTab('draw')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all ${
              tab === 'draw' ? 'bg-[#0071e3] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            ✍️ 指で手書き署名
          </button>
          <button
            onClick={() => setTab('type')}
            className={`flex-1 py-2.5 text-xs font-semibold transition-all ${
              tab === 'type' ? 'bg-[#0071e3] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            ⌨️ 綺麗に名前を入力
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {tab === 'draw' ? (
            <div className="flex flex-col gap-2">
              <div className="relative w-full h-44 bg-white rounded-xl overflow-hidden border border-gray-300 touch-none">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-gray-400 pointer-events-none select-none">
                  枠内に指でサインしてください
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={clearCanvas}
                  className="text-xs text-gray-400 hover:text-rose-400 transition-colors"
                >
                  クリア（書き直す）
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-4">
              <label className="text-xs text-gray-300">署名者のお名前</label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="例: 山田 太郎"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1c1c1f] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#0071e3] text-sm"
                autoFocus
              />
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-center mt-2">
                <span className="text-xs text-gray-400 block mb-1">プレビュー</span>
                <span className="font-serif italic text-2xl text-blue-400 font-bold">
                  {typedName || '山田 太郎'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-[#18181b]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-gray-300 bg-white/5 hover:bg-white/10 font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs text-white bg-[#0071e3] hover:bg-blue-500 font-semibold shadow-md active:scale-95 transition-all"
          >
            確定して適用
          </button>
        </div>
      </div>
    </div>
  );
};

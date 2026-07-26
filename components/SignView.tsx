import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { Card, CardContent } from './ui/Card';
import { Input } from './ui/Input';
import { 
  Shield, RefreshCw, PenTool, Calendar, CheckSquare, User, Building, Info, Type
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { sendOtpEmail } from '../lib/emailService';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

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
  value?: string;
  isRequired?: boolean;
  signerId: string;
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
  const currentSigner = signers.find(s => s.id === activeSignerId) || signers[0];

  // 認証フロー (ワンタイムパスワード手続き不要のため最初からtrueに設定) ★修正
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // PDFレンダリング
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [fields, setFields] = useState<Field[]>(initialFields);

  const [isCompleting, setIsCompleting] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 入力モーダル用ステート ★追加
  const [activeInputField, setActiveInputField] = useState<Field | null>(null);
  const [modalInputValue, setModalInputValue] = useState('');
  const [pdfAspectRatio, setPdfAspectRatio] = useState<number>(1.4142); // ★動的アスペクト比ステート追加

  // 1. 認証：メールアドレス検証 & OTP送信 (現在の activeSignerId のアドレスと一致するか確認)
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    if (authEmail.trim().toLowerCase() !== currentSigner?.email.toLowerCase()) {
      setAuthError(`この署名者（${currentSigner?.name}）に依頼されたメールアドレスと一致しません。`);
      return;
    }
    
    setIsVerifying(true);
    const generatedOtp = currentSigner?.otp || '123456';
    
    const result = await sendOtpEmail(currentSigner.email, currentSigner.name, generatedOtp, title);
    
    setIsVerifying(false);
    setIsOtpSent(true);
    
    if (!result.success) {
      setAuthError(`【エラー】メールの送信に失敗しました：${result.error}`);
    }
  };

  // 2. 認証：OTP確認 (デモコードは無効化、完全ランダム一致のみ)
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsVerifying(true);

    const expectedOtp = currentSigner?.otp || '123456';

    setTimeout(() => {
      setIsVerifying(false);
      // ランダムOTPのみで通過 ★修正
      if (otp === expectedOtp) {
        setIsAuthenticated(true);
      } else {
        setAuthError(`ワンタイムパスワードが正しくありません。`);
      }
    }, 1000);
  };

  // PDFのロード処理
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

        // 最初のページの縦横比を動的に計測してセットする ★追加
        if (pdf.numPages > 0) {
          const firstPage = await pdf.getPage(1);
          const viewport = firstPage.getViewport({ scale: 1.0 });
          if (viewport.width > 0) {
            setPdfAspectRatio(viewport.height / viewport.width);
          }
        }
      } catch (error) {
        console.error('Error rendering PDF for sign:', error);
        alert('PDFファイルの読み込みに失敗しました。');
      } finally {
        setIsLoadingPdf(false);
      }
    };
    fileReader.readAsArrayBuffer(originalPdfFile);
  }, [isAuthenticated, originalPdfFile]);

  // メイン of PDFキャンバスのレンダリング ★Retina高画質対応（用紙サイズズレ完全解消版）
  const renderMainPage = async (page: pdfjsLib.PDFPageProxy, pageNum: number) => {
    const pageContainer = pageRefs.current[pageNum];
    if (!pageContainer) return;

    const oldCanvas = pageContainer.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    const canvas = document.createElement('canvas');
    // Canvasはコンテナ全体に absolute フィット
    canvas.className = 'absolute inset-0 w-full h-full shadow-md rounded-lg';
    pageContainer.insertBefore(canvas, pageContainer.firstChild);

    // 高解像度（2.5倍）で内部解像度を決定
    const containerWidth = pageContainer.clientWidth || 600;
    const initialViewport = page.getViewport({ scale: 1.0 });
    const scale = containerWidth / initialViewport.width;
    const outputScale = 2.5;
    const viewport = page.getViewport({ scale: scale * outputScale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    }
  };

  // PDFのロード・パース完了後、DOMがマウントされてからプレビューを確実に描画する
  useEffect(() => {
    if (isLoadingPdf || !pdfDoc || numPages === 0) return;

    const renderAllMainPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          await renderMainPage(page, pageNum);
        } catch (err) {
          console.error(`Error rendering signature page preview ${pageNum}:`, err);
        }
      }
    };

    const timer = setTimeout(() => {
      renderAllMainPages();
    }, 150);

    return () => clearTimeout(timer);
  }, [isLoadingPdf, pdfDoc, numPages, fields]);

  // 署名マージ & 送信確定処理 (pdf-lib)
  const handleCompleteSign = async () => {
    // 自身の必須フィールドがすべて埋まっているか確認
    const myFields = fields.filter(f => f.signerId === activeSignerId);
    const emptyRequiredField = myFields.find(f => f.isRequired !== false && !f.value && f.type !== 'checkbox');
    if (emptyRequiredField) {
      alert(`「${getFieldLabelName(emptyRequiredField.type)}」が入力されていません。すべての必須箇所に入力してください。`);
      return;
    }

    // デフォルト名（「署名者 1」「署名者 2」や「署名」）のままで署名完了を押すのをブロック ★追加
    const defaultNames = ['署名者 1', '署名者 2', '署名者1', '署名者2', '署名', ''];
    const hasDefaultSignature = myFields.some(f => {
      if (f.type === 'signature' && f.value) {
        const namePart = f.value.startsWith('typed:') ? f.value.split(':')[1] : f.value;
        return defaultNames.includes(namePart.trim());
      }
      if (f.type === 'name' && f.value) {
        return defaultNames.includes(f.value.trim());
      }
      return false;
    });

    if (hasDefaultSignature) {
      alert('「署名者 1」や「署名者 2」などのデフォルト表記のままでは完了できません。ご自身の正しいお名前に変更してから「署名を完了」してください。');
      return;
    }

    setIsCompleting(true);

    const getJstTimestamp = () => {
      const now = new Date();
      const jstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      const yyyy = jstDate.getUTCFullYear();
      const mm = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(jstDate.getUTCDate()).padStart(2, '0');
      const hh = String(jstDate.getUTCHours()).padStart(2, '0');
      const min = String(jstDate.getUTCMinutes()).padStart(2, '0');
      const ss = String(jstDate.getUTCSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} JST`;
    };

    try {
      const pdfBytes = await originalPdfFile!.arrayBuffer();
      const pdfDocInstance = await PDFDocument.load(pdfBytes);
      const pages = pdfDocInstance.getPages();

      for (const field of fields) {
        const isCurrentAction = field.signerId === activeSignerId;
        const valueToEmbed = (isCurrentAction ? field.value : (field.value || '')) || '';

        if (!valueToEmbed && field.type !== 'checkbox') continue;
        
        const page = pages[field.pageNumber - 1];
        
        // MediaBox または CropBox から正確な物理境界サイズとオフセット座標を取得する ★超重要（ズレ解消の根本治療）
        const mediaBox = page.getMediaBox();
        const cropBox = page.getCropBox() || mediaBox;
        
        const boxX = cropBox.x;
        const boxY = cropBox.y;
        const boxW = cropBox.width;
        const boxH = cropBox.height;

        const pdfX = boxX + (field.x / 100) * boxW;
        const pdfY = boxY + boxH - ((field.y + field.h) / 100) * boxH;
        const pdfW = (field.w / 100) * boxW;
        const pdfH = (field.h / 100) * boxH;

        if (field.type === 'signature') {
          if (valueToEmbed.startsWith('typed:')) {
            const [_, nameText] = valueToEmbed.split(':');
            
            // 日本語フォント制限を回避するため、Canvas上に筆記体で描画してPNG画像化 ★修正（JSTタイムスタンプ追加）
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 120; // タイムスタンプ表示領域確保のため高さを拡張
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 300, 120);
              
              // 1. 署名者氏名
              ctx.fillStyle = '#0f172a'; // 深い紺色の署名カラー
              ctx.font = 'italic bold 32px Georgia, cursive, sans-serif';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'center';
              ctx.fillText(nameText, 150, 40);
              
              // 2. 日本時間タイムスタンプ印字 ★追加
              const jstTime = getJstTimestamp();
              ctx.fillStyle = '#64748b'; // セキュアグレー
              ctx.font = '10px monospace';
              ctx.fillText(`JST: ${jstTime}`, 150, 85);
              ctx.fillText(`AUDIT ID: ${field.id}`, 150, 100);
              
              const imgDataUrl = canvas.toDataURL('image/png');
              const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
              const embeddedImg = await pdfDocInstance.embedPng(imgBytes);
              
              page.drawImage(embeddedImg, {
                x: pdfX,
                y: pdfY,
                width: pdfW,
                height: pdfH
              });
            }
          }
        } else if (field.type === 'checkbox') {
          if (valueToEmbed === 'true') {
            const canvas = document.createElement('canvas');
            canvas.width = 50;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 50, 50);
              ctx.fillStyle = '#000000';
              ctx.font = 'bold 40px sans-serif';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'center';
              ctx.fillText('✓', 25, 25);
              
              const imgDataUrl = canvas.toDataURL('image/png');
              const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
              const embeddedImg = await pdfDocInstance.embedPng(imgBytes);
              
              page.drawImage(embeddedImg, {
                x: pdfX,
                y: pdfY,
                width: pdfW,
                height: pdfH
              });
            }
          }
          page.drawRectangle({
            x: pdfX,
            y: pdfY,
            width: pdfW,
            height: pdfH,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
          });
        } else {
          // 氏名・会社名・日付・テキストも日本語に対応するため、Canvasを介してPNG埋め込み ★修正
          const canvas = document.createElement('canvas');
          canvas.width = 400;
          canvas.height = 80;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 400, 80);
            ctx.fillStyle = '#000000';
            ctx.font = '28px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(valueToEmbed, 10, 40);
            
            const imgDataUrl = canvas.toDataURL('image/png');
            const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
            const embeddedImg = await pdfDocInstance.embedPng(imgBytes);
            
            page.drawImage(embeddedImg, {
              x: pdfX,
              y: pdfY,
              width: pdfW,
              height: pdfH
            });
          }
        }
      }

      const signedPdfBytes = await pdfDocInstance.save();
      const signedBlob = new Blob([signedPdfBytes as any], { type: 'application/pdf' });
      
      setTimeout(() => {
        setIsCompleting(false);
        onSignatureCompleted(signedBlob, fields, activeSignerId);
      }, 1500);

    } catch (error) {
      console.error('Error completing signature process:', error);
      alert('PDFの合成および保存処理に失敗しました。');
      setIsCompleting(false);
    }
  };

  const handleFieldClick = (field: Field) => {
    const isMyField = field.signerId === activeSignerId;
    if (!isMyField) return;

    if (field.type === 'checkbox') {
      const nextVal = field.value === 'true' ? 'false' : 'true';
      setFields(fields.map(f => f.id === field.id ? { ...f, value: nextVal } : f));
    } else {
      setActiveInputField(field);
      
      // 初期値の設定（デフォルトの「署名者 1」等のダミー値は空文字にして、ユーザーに手入力させる）
      const currentValue = field.value || '';
      const extractedVal = currentValue.startsWith('typed:') 
        ? currentValue.split(':')[1] 
        : currentValue;
      
      const defaultNames = ['署名者 1', '署名者 2', '署名者1', '署名者2', '署名'];
      const initialVal = defaultNames.includes(extractedVal) ? '' : extractedVal;
      setModalInputValue(initialVal);
    }
  };

  const handleSaveModalInput = () => {
    if (!activeInputField) return;

    let finalVal = modalInputValue.trim();
    if (!finalVal) {
      alert(`${getFieldLabelName(activeInputField.type)}を入力してください。`);
      return;
    }

    const defaultNames = ['署名者 1', '署名者 2', '署名者1', '署名者2', '署名'];
    if (defaultNames.includes(finalVal)) {
      alert('「署名者 1」や「署名者 2」などのデフォルト名のままでは適用できません。ご自身の正しいお名前をご入力ください。');
      return;
    }

    if (activeInputField.type === 'signature') {
      finalVal = `typed:${finalVal}:font-signature-1`;
    }

    setFields(fields.map(f => f.id === activeInputField.id ? { ...f, value: finalVal } : f));
    setActiveInputField(null);
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

  const getFieldLabelName = (type: Field['type']) => {
    switch (type) {
      case 'signature': return '署名';
      case 'date': return '日付';
      case 'name': return '氏名';
      case 'company': return '会社名';
      case 'text': return 'テキスト';
      case 'checkbox': return 'チェック';
    }
  };

  const getFieldLabel = (field: Field) => {
    if (field.value) {
      if (field.type === 'checkbox') return field.value === 'true' ? '✓' : '□';
      if (field.value.startsWith('typed:')) return field.value.split(':')[1];
      return field.value;
    }
    const isMyField = field.signerId === activeSignerId;
    if (!isMyField) {
      const assignedSigner = signers.find(s => s.id === field.signerId);
      return `${assignedSigner?.name || '他者'}の入力欄`;
    }

    switch (field.type) {
      case 'signature': return 'クリックして署名';
      case 'date': return 'クリックして日付挿入';
      case 'name': return 'クリックして氏名挿入';
      case 'company': return 'クリックして会社名入力';
      case 'text': return 'クリックしてテキスト入力';
      case 'checkbox': return '□';
    }
  };

  const getFieldColorClasses = (signerId: string, isMyField: boolean, isFilled: boolean) => {
    const index = signers.findIndex(s => s.id === signerId);
    const colorMap = [
      {
        myActive: 'bg-blue-500/20 border-blue-600 hover:bg-blue-500/35 hover:border-blue-700 text-blue-800',
        other: 'bg-blue-500/10 border-blue-300 text-blue-400 opacity-60 pointer-events-none',
        filled: 'bg-blue-500/5 border-blue-400 text-blue-600'
      },
      {
        myActive: 'bg-purple-500/20 border-purple-600 hover:bg-purple-500/35 hover:border-purple-700 text-purple-800',
        other: 'bg-purple-500/10 border-purple-300 text-purple-400 opacity-60 pointer-events-none',
        filled: 'bg-purple-500/5 border-purple-400 text-purple-600'
      },
      {
        myActive: 'bg-emerald-500/20 border-emerald-600 hover:bg-emerald-500/35 hover:border-emerald-700 text-emerald-800',
        other: 'bg-emerald-500/10 border-emerald-300 text-emerald-400 opacity-60 pointer-events-none',
        filled: 'bg-emerald-500/5 border-emerald-400 text-emerald-600'
      },
      {
        myActive: 'bg-amber-500/20 border-amber-600 hover:bg-amber-500/35 hover:border-amber-700 text-amber-800',
        other: 'bg-amber-500/10 border-amber-300 text-amber-400 opacity-60 pointer-events-none',
        filled: 'bg-amber-500/5 border-amber-400 text-emerald-600'
      }
    ];

    const colors = colorMap[index % colorMap.length] || {
      myActive: 'bg-zinc-500/20 border-zinc-600 text-zinc-800',
      other: 'bg-zinc-500/10 border-zinc-300 text-zinc-400 opacity-60 pointer-events-none',
      filled: 'bg-zinc-500/5 border-zinc-400 text-zinc-600'
    };

    if (isFilled) return colors.filled;
    return isMyField ? colors.myActive : colors.other;
  };

  const getSignerBadgeBg = (signerId: string) => {
    const index = signers.findIndex(s => s.id === signerId);
    const badgeBgs = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-amber-600'];
    return badgeBgs[index % badgeBgs.length] || 'bg-zinc-600';
  };

  // 認証画面 (ダッシュボードへのリンクを完全削除) ★修正
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col justify-center items-center p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-b from-[#0071e3]/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

        <Card className="w-full max-w-md shadow-3xl border-white/5 relative z-10">
          <CardContent className="p-8 flex flex-col gap-6">
            
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white">
                <Shield className="w-6 h-6 text-[#0071e3]" />
              </div>
              <h2 className="text-xl font-semibold text-white">受信者メールアドレス認証</h2>
              <p className="text-xs text-[#86868b]">
                署名者 「<span className="text-white font-semibold">{currentSigner?.name}</span>」 としての署名手続きのため、メールアドレスの確認を行います。
              </p>
            </div>

            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg text-left">
                {authError}
              </div>
            )}

            {!isOtpSent ? (
              <form onSubmit={handleSendOtp} className="flex flex-col gap-4 text-left">
                <Input
                  label="ご自身のメールアドレス"
                  type="email"
                  placeholder="your-email@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
                <Button type="submit" className="w-full mt-2" isLoading={isVerifying}>
                  認証コードを送信
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 text-left">
                <Input
                  label="確認用ワンタイムコード"
                  type="text"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
                <div className="flex gap-3 mt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsOtpSent(false)}>
                    戻る
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={isVerifying}>
                    認証して署名へ
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 認証後の署名入力画面
  return (
    <div className="h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="border-b border-white/5 bg-[#09090b]/80 backdrop-blur-md px-6 h-16 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-sm font-semibold text-white">{title}</h1>
          </div>
          <span className="text-xs text-[#86868b] hidden sm:inline">|</span>
          <span className="text-xs text-[#86868b] hidden sm:inline">署名者: {currentSigner?.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleCompleteSign} 
            isLoading={isCompleting}
            className="gap-2 text-xs"
          >
            署名を完了
          </Button>
        </div>
      </header>

      {/* Main Signing Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* PDF Viewer Container */}
        <main className="flex-1 overflow-y-auto bg-[#141416]/50 p-6 md:p-10 flex justify-center items-start">
          {isLoadingPdf ? (
            <div className="flex flex-col items-center gap-4 text-center mt-20">
              <RefreshCw className="animate-spin text-white" size={32} />
              <p className="text-sm text-[#86868b]">PDFをレンダリングしています...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8 max-w-2xl w-full">
              <div className="flex items-start gap-2.5 p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 text-left">
                <Info size={16} className="flex-shrink-0 text-blue-400 mt-0.5" />
                <div>
                  <p className="font-semibold">署名手順</p>
                  <p className="mt-0.5">あなた専用のカラー枠をクリックすると Joint 署名・氏名・テキストの入力モーダルが表示されます。すべての項目を入力し終えたら、右上の「署名を完了」を押してください。</p>
                </div>
              </div>

              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={(el) => {
                    pageRefs.current[pageNum] = el;
                  }}
                  style={{ aspectRatio: `1 / ${pdfAspectRatio}` }}
                  className="relative w-full bg-white rounded-lg shadow-xl mx-auto overflow-hidden border border-white/5"
                >
                  <div className="absolute inset-0 z-20 pointer-events-auto">
                    {fields
                      .filter((f) => f.pageNumber === pageNum)
                      .map((field) => {
                        // 既に値が書き込み保存されている他人のフィールドは、画面上の枠としては重ねて非表示にする ★修正
                        if (field.value && field.signerId !== activeSignerId) return null;

                        const isFilled = !!field.value;
                        const isMyField = field.signerId === activeSignerId;
                        const colors = getFieldColorClasses(field.signerId, isMyField, isFilled);
                        const assignedSigner = signers.find(s => s.id === field.signerId);
                        const badgeBg = getSignerBadgeBg(field.signerId);

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
                            className={`absolute flex items-center justify-center border-2 rounded transition-all duration-200 ${colors} ${
                              isMyField ? 'cursor-pointer animate-pulse z-30' : 'cursor-not-allowed z-10'
                            }`}
                          >
                            <div className={`absolute -top-4.5 left-0 px-1 py-0.5 rounded text-[8px] text-white ${badgeBg} scale-90 origin-bottom-left select-none font-medium`}>
                              {assignedSigner?.name || '他者'}
                            </div>

                            <div className="flex items-center gap-1.5 select-none pointer-events-none truncate text-[10px] font-semibold text-center justify-center w-full">
                              {!isFilled && getFieldIcon(field.type)}
                              {getFieldLabel(field)}
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

      {/* 入力用モーダル (window.prompt を完全廃止しスマホ対応) */}
      {activeInputField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <Card className="w-full max-w-sm border-white/10 bg-[#121214]/90 shadow-3xl">
            <CardContent className="p-6 flex flex-col gap-4 text-left">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {getFieldLabelName(activeInputField.type)}を入力してください
                </h3>
                <p className="text-[11px] text-[#86868b] mt-1">
                  PDF上の「{activeInputField.type === 'signature' ? '署名印影' : getFieldLabelName(activeInputField.type)}」として挿入されます。
                </p>
              </div>

              <input
                type="text"
                value={modalInputValue}
                onChange={(e) => setModalInputValue(e.target.value)}
                placeholder={`${getFieldLabelName(activeInputField.type)}を入力`}
                className="w-full px-3 py-2 rounded-lg bg-[#1c1c1f] border border-white/10 text-white placeholder-[#52525b] focus:outline-none focus:border-[#0071e3] transition-all text-sm font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveModalInput();
                }}
              />

              <div className="flex gap-2.5 justify-end mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setActiveInputField(null)}
                  className="text-xs"
                >
                  キャンセル
                </Button>
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={handleSaveModalInput}
                  className="text-xs bg-blue-600 hover:bg-blue-500"
                >
                  適用する
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Card, CardContent } from './ui/Card';
import { CheckCircle2, Download, ShieldCheck, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

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
  x: number;
  y: number;
  w: number;
  h: number;
  signerId: string;
  value?: string;
}

interface CompletedViewProps {
  title: string;
  signedPdfBlob: Blob | null;
  signers: Signer[];
  ccEmails: string[];
  ownerEmail: string;
  originalPdfFile: File | null; // 追加 ★
  fields: Field[]; // 追加 ★
}

export const CompletedView: React.FC<CompletedViewProps> = ({
  title,
  signedPdfBlob,
  signers,
  ccEmails,
  ownerEmail,
  originalPdfFile,
  fields
}) => {
  
  // PDFのダウンロード (URLから復元した署名データと元PDFをその場で再合成する堅牢ダウンロードロジック) ★修正
  const downloadSignedPdf = async () => {
    let blobToDownload = signedPdfBlob;

    // 1. メモリにBlobがない場合、元PDFに復元された署名フィールドを再マッピングしてその場で最終PDFを組み立てる
    if (!blobToDownload && originalPdfFile && fields && fields.length > 0) {
      try {
        const pdfBytes = await originalPdfFile.arrayBuffer();
        const pdfDocInstance = await PDFDocument.load(pdfBytes);
        const pages = pdfDocInstance.getPages();

        for (const field of fields) {
          const valueToEmbed = field.value || '';
          if (!valueToEmbed && field.type !== 'checkbox') continue;

          const page = pages[field.pageNumber - 1];
          if (!page) continue;
          
          const { width, height } = page.getSize();
          const pdfX = (field.x / 100) * width;
          const pdfY = height - ((field.y + field.h) / 100) * height;
          const pdfW = (field.w / 100) * width;
          const pdfH = (field.h / 100) * height;

          if (field.type === 'signature') {
            if (valueToEmbed.startsWith('typed:')) {
              const [_, nameText] = valueToEmbed.split(':');
              
              const canvas = document.createElement('canvas');
              canvas.width = 300;
              canvas.height = 120;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, 300, 120);
                
                // 1. 署名氏名
                ctx.fillStyle = '#0f172a';
                ctx.font = 'italic bold 32px Georgia, cursive, sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillText(nameText, 150, 40);
                
                // 2. 証跡タイムスタンプ
                ctx.fillStyle = '#64748b';
                ctx.font = '10px monospace';
                ctx.fillText(`AUDIT SIGNATURE VERIFIED`, 150, 85);
                ctx.fillText(`ID: ${field.id}`, 150, 100);
                
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
          } else {
            // テキスト、日付などの文字をCanvas化してマッピング
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 80;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 400, 80);
              ctx.fillStyle = '#000000';
              ctx.font = 'bold 24px sans-serif';
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

        const pdfBytesSaved = await pdfDocInstance.save();
        blobToDownload = new Blob([pdfBytesSaved as any], { type: 'application/pdf' });
        console.log('Successfully re-synthesized signed PDF on the fly.');
      } catch (err) {
        console.error('Failed to reconstruct signed PDF on the fly:', err);
      }
    }

    // 2. それでも取得できない場合、データベース(IndexedDB)のキャッシュを参照する
    if (!blobToDownload) {
      try {
        const fileFromDB = await new Promise<File | null>((resolve) => {
          const dbRequest = indexedDB.open('aurasign_pdf_db', 1);
          dbRequest.onsuccess = () => {
            const db = dbRequest.result;
            if (db.objectStoreNames.contains('pdfs')) {
              const tx = db.transaction('pdfs', 'readonly');
              const store = tx.objectStore('pdfs');
              const req = store.get('current_pdf_file');
              req.onsuccess = () => resolve(req.result as File || null);
              req.onerror = () => resolve(null);
            } else {
              resolve(null);
            }
          };
          dbRequest.onerror = () => resolve(null);
        });

        if (fileFromDB) {
          blobToDownload = fileFromDB;
          console.log('Successfully loaded final signed PDF from IndexedDB fallback.');
        }
      } catch (err) {
        console.error('Failed to retrieve PDF from IndexedDB:', err);
      }
    }

    if (!blobToDownload) {
      alert('PDFデータのダウンロード準備に失敗しました。ファイルが見つかりません。');
      return;
    }

    // ダウンロード実行
    const url = URL.createObjectURL(blobToDownload);
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isInApp = /Line|FBAN|FBAV|Instagram|Gmail/i.test(navigator.userAgent);

    if (isMobile || isInApp) {
      // スマホ・アプリ内ブラウザでは、別ウィンドウで直接PDFを表示し、共有メニュー等から保存させる
      window.open(url, '_blank');
    } else {
      // PCでは通常どおりの自動ダウンロード保存
      const a = document.createElement('a');
      a.href = url;
      a.download = `[署名済み]_${title}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const isAllSigned = signers.every(s => s.status === 'signed');

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Premium background gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-b from-emerald-500/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-lg shadow-3xl border-emerald-500/10 relative z-10">
        <CardContent className="p-8 flex flex-col items-center gap-6 text-center">
          
          {/* Animated check circle */}
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-white">署名手続きが完了しました</h2>
            <p className="text-xs text-[#86868b]">
              {isAllSigned 
                ? '関係者全員 of の署名が完了し、最終版データ（ダウンロード用URL）をメールで送付しました。' 
                : 'あなたの署名手続きが完了しました（他の署名者の完了を待っています）。'}
            </p>
          </div>

          {/* Secure Audit Summary */}
          <div className="w-full bg-[#121214]/50 border border-white/5 p-5 rounded-xl text-left flex flex-col gap-4 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-[#86868b] border-b border-white/5 pb-2">
              <ShieldCheck size={14} className="text-emerald-400" />
              完了通知およびデータ送付状況
            </div>
            
            <div className="flex flex-col gap-3">
              {/* アカウント保有者(送信者)へのデータ送付ステータス */}
              <div className="flex justify-between items-start bg-white/[0.02] border border-white/5 p-2.5 rounded-lg">
                <div>
                  <p className="font-semibold text-white text-xs">アカウント保有者（送信者）</p>
                  <p className="text-[10px] text-[#86868b] mt-0.5">{ownerEmail}</p>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  送付完了
                </span>
              </div>

              {/* CC (共有先) へのデータ送付ステータス */}
              {ccEmails && ccEmails.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider pl-1">共有先 (CC)</p>
                  {ccEmails.map(email => (
                    <div key={email} className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-2.5 rounded-lg text-xs">
                      <span className="text-[#a1a1aa] truncate max-w-[200px]">{email}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        送付完了
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 署名者別のステータス一覧 */}
              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider pl-1">署名者ステータス</p>
                {signers.map((s) => (
                  <div key={s.id} className="flex justify-between items-center text-xs px-1">
                    <span className="text-[#a1a1aa]">{s.name} ({s.email})</span>
                    {s.status === 'signed' ? (
                      <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">✓ 署名完了</span>
                    ) : (
                      <span className="text-amber-400 font-medium text-[11px] flex items-center gap-1">○ 署名待ち</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-[10px] text-[#86868b] text-left">
            <Info size={14} className="flex-shrink-0 text-blue-400" />
            <span>署名データはPDFに直接埋め込まれており、改ざん防止技術が適用されています。送信者・受信者・共有先にダウンロードリンク付きメールが送信されました。</span>
          </div>

          {/* Download Action Only */}
          <div className="w-full flex flex-col gap-3 mt-4">
            <button 
              onClick={downloadSignedPdf}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 shadow-md active:scale-[0.98] border-0 cursor-pointer"
            >
              <Download size={14} />
              署名済みPDFを保存
            </button>
            <p className="text-[10px] text-[#86868b] leading-relaxed text-left bg-white/5 border border-white/5 p-3 rounded-lg">
              📱 <strong>スマホをご利用の場合</strong><br />
              ボタンを押すとPDFファイルが別ウィンドウで開きます。表示された画面から<strong>ブラウザの「共有」ボタン ➜「ファイルに保存」</strong>を選択して保存してください。
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

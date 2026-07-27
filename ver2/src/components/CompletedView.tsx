import React, { useState, useEffect } from 'react';
import { Field, embedFieldsIntoPdf } from '../lib/pdfUtils';
import { Download, CheckCircle, RefreshCw } from 'lucide-react';

interface CompletedViewProps {
  title: string;
  signedPdfBlob: Blob | null;
  signers: { name: string; email: string }[];
  ccEmails: string[];
  ownerEmail: string;
  originalPdfFile: File | null;
  fields: Field[];
}

export const CompletedView: React.FC<CompletedViewProps> = ({
  title,
  signedPdfBlob,
  originalPdfFile,
  fields
}) => {
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(signedPdfBlob);
  const [isGenerating, setIsGenerating] = useState(!signedPdfBlob);

  useEffect(() => {
    if (signedPdfBlob) {
      setDownloadBlob(signedPdfBlob);
      setIsGenerating(false);
      return;
    }

    const generate = async () => {
      if (!originalPdfFile) return;
      setIsGenerating(true);
      try {
        const buffer = await originalPdfFile.arrayBuffer();
        const blob = await embedFieldsIntoPdf(buffer, fields);
        setDownloadBlob(blob);
      } catch (err) {
        console.error('Failed to generate final PDF:', err);
      } finally {
        setIsGenerating(false);
      }
    };

    generate();
  }, [signedPdfBlob, originalPdfFile, fields]);

  const handleDownload = () => {
    if (!downloadBlob) return;
    const url = URL.createObjectURL(downloadBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.endsWith('.pdf') ? title : `${title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-[#121214] border border-white/10 p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <CheckCircle size={36} />
        </div>

        <div>
          <h2 className="text-xl font-bold">合意締結・署名完了</h2>
          <p className="text-xs text-gray-400 mt-1">「{title}」のすべての署名手続きが完了しました。</p>
        </div>

        {isGenerating ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 my-4">
            <RefreshCw className="animate-spin" size={16} />
            <span>最終版PDFを合成中...</span>
          </div>
        ) : (
          <button
            onClick={handleDownload}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            <Download size={16} />
            <span>最終締結済PDFをダウンロード</span>
          </button>
        )}
      </div>
    </div>
  );
};

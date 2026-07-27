import { PDFDocument, rgb } from 'pdf-lib';

export interface Field {
  id: string;
  type: 'signature' | 'date' | 'name' | 'company' | 'text' | 'checkbox';
  pageNumber: number;
  x: number; // 0..100 (%)
  y: number; // 0..100 (%)
  w: number; // 0..100 (%)
  h: number; // 0..100 (%)
  value?: string;
  isRequired?: boolean;
  signerId: string;
}

export function getJstTimestampString(): string {
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = jstDate.getUTCFullYear();
  const mm = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getUTCDate()).padStart(2, '0');
  const hh = String(jstDate.getUTCHours()).padStart(2, '0');
  const min = String(jstDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(jstDate.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} JST`;
}

/**
 * PDFDocument に全フィールドを寸分違わず合成焼き付けする高精度ロジック
 */
export async function embedFieldsIntoPdf(
  originalPdfArrayBuffer: ArrayBuffer,
  fields: Field[],
  activeSignerId?: string
): Promise<Blob> {
  const pdfDoc = await PDFDocument.load(originalPdfArrayBuffer);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const isCurrentAction = activeSignerId ? field.signerId === activeSignerId : true;
    const valueToEmbed = field.value || '';

    if (!valueToEmbed && field.type !== 'checkbox') continue;
    if (field.pageNumber < 1 || field.pageNumber > pages.length) continue;

    const page = pages[field.pageNumber - 1];

    // CropBox / MediaBox の境界座標とオフセットを完全計算（絶対ズレゼロ化）
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
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.clearRect(0, 0, 400, 160);

        if (valueToEmbed.startsWith('data:image/')) {
          // 手書きサイン PNG データ
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = valueToEmbed;
          });
          ctx.drawImage(img, 20, 10, 360, 100);
        } else {
          // テキスト印影（手書き風筆記体）
          const nameText = valueToEmbed.startsWith('typed:') 
            ? valueToEmbed.split(':')[1] 
            : valueToEmbed;

          ctx.fillStyle = '#0f172a';
          ctx.font = 'italic bold 38px Georgia, cursive, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText(nameText, 200, 50);
        }

        // セキュアタイムスタンプとAUDIT印字
        const jstTime = getJstTimestampString();
        ctx.fillStyle = '#64748b';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`JST: ${jstTime}`, 200, 125);
        ctx.fillText(`AUDIT ID: ${field.id}`, 200, 142);

        const imgDataUrl = canvas.toDataURL('image/png');
        const imgBytes = await fetch(imgDataUrl).then((r) => r.arrayBuffer());
        const embeddedImg = await pdfDoc.embedPng(imgBytes);

        page.drawImage(embeddedImg, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH
        });
      }
    } else if (field.type === 'checkbox') {
      if (valueToEmbed === 'true') {
        const canvas = document.createElement('canvas');
        canvas.width = 60;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 60, 60);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 48px sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          ctx.fillText('✓', 30, 30);

          const imgDataUrl = canvas.toDataURL('image/png');
          const imgBytes = await fetch(imgDataUrl).then((r) => r.arrayBuffer());
          const embeddedImg = await pdfDoc.embedPng(imgBytes);

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
        borderWidth: 1.5
      });
    } else {
      // 氏名、会社名、日付、一般テキスト
      const canvas = document.createElement('canvas');
      canvas.width = 500;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 500, 100);
        ctx.fillStyle = '#000000';
        ctx.font = '34px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(valueToEmbed, 15, 50);

        const imgDataUrl = canvas.toDataURL('image/png');
        const imgBytes = await fetch(imgDataUrl).then((r) => r.arrayBuffer());
        const embeddedImg = await pdfDoc.embedPng(imgBytes);

        page.drawImage(embeddedImg, {
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH
        });
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

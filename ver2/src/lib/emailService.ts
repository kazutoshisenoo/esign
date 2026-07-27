const API_KEY_KEY = 'aurasign_resend_api_key';
const PROVIDER_KEY = 'aurasign_email_provider';
const GAS_URL_KEY = 'aurasign_gas_url';

export function getResendApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) || import.meta.env.VITE_RESEND_API_KEY || '';
}

export function setResendApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

export function getEmailProvider(): 'resend' | 'gmail_gas' {
  return (localStorage.getItem(PROVIDER_KEY) as 'resend' | 'gmail_gas') || 'resend';
}

export function setEmailProvider(provider: 'resend' | 'gmail_gas'): void {
  localStorage.setItem(PROVIDER_KEY, provider);
}

export function getGasUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);
  const gasParam = searchParams.get('gas');
  if (gasParam) {
    try {
      return decodeURIComponent(escape(atob(gasParam)));
    } catch (e) {
      console.error('Failed to decode gas URL parameter:', e);
    }
  }
  return localStorage.getItem(GAS_URL_KEY) || '';
}

export function setGasUrl(url: string): void {
  localStorage.setItem(GAS_URL_KEY, url);
}

async function sendViaGas(to: string, subject: string, html: string, gasUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, html })
    });
    return { success: true };
  } catch (err: any) {
    console.error('Failed to send email via GAS:', err);
    return {
      success: false,
      error: err.message || 'Gmail (GAS) 経由での送信に失敗しました。'
    };
  }
}

async function sendViaResend(to: string, subject: string, html: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      mode: 'cors',
      body: JSON.stringify({
        from: 'AuraSign <onboarding@resend.dev>',
        to,
        subject,
        html
      })
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errData = await response.json();
      return { 
        success: false, 
        error: errData.message || `APIエラー (ステータス: ${response.status})` 
      };
    }
  } catch (err: any) {
    return { 
      success: false, 
      error: err.message || 'Resendへのメール送信に失敗しました。' 
    };
  }
}

export async function sendOtpEmail(
  signerEmail: string, 
  signerName: string, 
  otp: string, 
  docTitle: string
): Promise<{ success: boolean; error?: string }> {
  const provider = getEmailProvider();

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="font-size: 20px; font-weight: bold; color: #111827; margin-bottom: 16px;">AuraSign 署名者確認</h2>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        ${signerName} 様<br /><br />
        電子署名サービス「AuraSign」にて、あなた宛てに署名依頼されたドキュメント <strong>「${docTitle}」</strong> の本人確認手続きが行われました。
      </p>
      <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0071e3;">${otp}</span>
      </div>
    </div>
  `;

  if (provider === 'gmail_gas') {
    const gasUrl = getGasUrl();
    if (!gasUrl) return { success: false, error: 'Google Apps ScriptのURLが設定されていません。' };
    return sendViaGas(signerEmail, `【AuraSign】「${docTitle}」署名用認証コード`, emailHtml, gasUrl);
  }

  const apiKey = getResendApiKey();
  if (!apiKey) return { success: false, error: 'ResendのAPIキーが設定されていません。' };
  return sendViaResend(signerEmail, `【AuraSign】「${docTitle}」署名用認証コード`, emailHtml, apiKey);
}

export async function sendSignRequestEmail(
  signerEmail: string,
  signerName: string,
  docTitle: string,
  signLink: string
): Promise<{ success: boolean; error?: string }> {
  const provider = getEmailProvider();
  
  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="font-size: 20px; font-weight: bold; color: #111827; margin-bottom: 16px;">AuraSign 署名のご依頼</h2>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        ${signerName} 様<br /><br />
        電子署名サービス「AuraSign」を通じて、あなた宛てに署名依頼ドキュメント <strong>「${docTitle}」</strong> が送信されました。
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${signLink}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0071e3; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px;">
          書類を確認して署名する
        </a>
      </div>
      <p style="font-size: 12px; color: #86868b; word-break: break-all;">
        ※URL: <a href="${signLink}" target="_blank" style="color: #0071e3;">${signLink}</a>
      </p>
    </div>
  `;

  if (provider === 'gmail_gas') {
    const gasUrl = getGasUrl();
    if (!gasUrl) return { success: false, error: 'Google Apps ScriptのURLが設定されていません。' };
    return sendViaGas(signerEmail, `【署名依頼】「${docTitle}」へのご署名をお願いします`, emailHtml, gasUrl);
  }

  const apiKey = getResendApiKey();
  if (!apiKey) return { success: false, error: 'ResendのAPIキーが設定されていません。' };
  return sendViaResend(signerEmail, `【署名依頼】「${docTitle}」へのご署名をお願いします`, emailHtml, apiKey);
}

export async function sendFinalCompletedEmail(
  targetEmail: string,
  targetName: string,
  docTitle: string,
  completedLink: string
): Promise<{ success: boolean; error?: string }> {
  const provider = getEmailProvider();

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="font-size: 20px; font-weight: bold; color: #10b981; margin-bottom: 16px;">合意締結・署名完了のお知らせ</h2>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        ${targetName} 様<br /><br />
        ドキュメント <strong>「${docTitle}」</strong> の合意が締結されましたので、最終版データを共有いたします。
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${completedLink}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px;">
          最終版PDFをダウンロード
        </a>
      </div>
      <p style="font-size: 12px; color: #86868b; word-break: break-all;">
        ※URL: <a href="${completedLink}" target="_blank" style="color: #10b981;">${completedLink}</a>
      </p>
    </div>
  `;

  if (provider === 'gmail_gas') {
    const gasUrl = getGasUrl();
    if (!gasUrl) return { success: false, error: 'Google Apps ScriptのURLが設定されていません。' };
    return sendViaGas(targetEmail, `【締結完了】「${docTitle}」の署名手続きが完了しました`, emailHtml, gasUrl);
  }

  const apiKey = getResendApiKey();
  if (!apiKey) return { success: false, error: 'ResendのAPIキーが設定されていません。' };
  return sendViaResend(targetEmail, `【締結完了】「${docTitle}」の署名手続きが完了しました`, emailHtml, apiKey);
}

export async function uploadPdfToGas(file: File, gasUrl: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
  try {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
    
    reader.readAsDataURL(file);
    const pdfBase64 = await base64Promise;

    const params = new URLSearchParams();
    params.append('action', 'uploadPdf');
    params.append('pdfBase64', pdfBase64);
    params.append('fileName', file.name);

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (data && data.success && data.fileId) {
      return { success: true, fileId: data.fileId };
    } else {
      return { success: false, error: data.error || 'GASからの応答エラーです。' };
    }
  } catch (err: any) {
    console.error('Failed to upload PDF to GAS:', err);
    return { success: false, error: err.message || 'GAS通信エラー。' };
  }
}

export async function downloadPdfFromGas(fileId: string, gasUrl: string): Promise<File | null> {
  try {
    const url = `${gasUrl}?action=getPdf&fileId=${fileId}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data && data.success && data.pdfBase64) {
      const pdfBytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      return new File([blob], data.fileName || 'document.pdf', { type: 'application/pdf' });
    } else {
      console.error('Failed to download PDF from GAS:', data.error || 'Unknown error');
      return null;
    }
  } catch (err) {
    console.error('Failed to download PDF from GAS:', err);
    return null;
  }
}

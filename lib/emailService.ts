// 設定の管理 (localStorage に保存して永続化)
const API_KEY_KEY = 'aurasign_resend_api_key';
const PROVIDER_KEY = 'aurasign_email_provider'; // 'resend' | 'gmail_gas'
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

// 署名者PCなど他ブラウザアクセス時にも送信元の GAS URL を引き継ぐためのパラメータ解読 ★追加
export function getGasUrl(): string {
  const searchParams = new URLSearchParams(window.location.search);
  const gasParam = searchParams.get('gas');
  if (gasParam) {
    try {
      // 安全にBase64デコード
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

// 共通：GAS (Google Apps Script) への汎用送信
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

// 共通：Resend への汎用送信
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

// 1. 認証用ワンタイムパスワード (OTP) メールの送信
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
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-top: 16px;">
        署名手続きを進めるには、以下の確認用ワンタイムコードを入力してください。
      </p>
      <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #0071e3;">${otp}</span>
      </div>
      <p style="font-size: 11px; color: #9ca3af; line-height: 1.4; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        ※このメール is 送信専用です。本メールに心当たりがない場合は破棄してください。
      </p>
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

// 2. 署名依頼（署名URL付き）メールの送信
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
      <p style="font-size: 14px; color: #4b5563; margin-top: 16px;">
        以下のリンクをクリックして、内容確認および署名手続きを行ってください。
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${signLink}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0071e3; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px;">
          書類を確認して署名する
        </a>
      </div>
      <p style="font-size: 12px; color: #86868b; word-break: break-all;">
        ※ボタンがクリックできない場合は、以下のURLをブラウザに貼り付けてアクセスしてください：<br />
        <a href="${signLink}" target="_blank" style="color: #0071e3;">${signLink}</a>
      </p>
      <p style="font-size: 11px; color: #9ca3af; line-height: 1.4; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        ※このメールは送信専用です。本メールに心当たりがない場合は破棄してください。
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

// 3. 全員署名完了時の「署名者および送信者宛て最終完了PDF共有」メール送信
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
        電子署名サービス「AuraSign」をご利用いただきありがとうございます。<br /><br />
        関係者全員 of 署名手続きが完了し、ドキュメント <strong>「${docTitle}」</strong> の合意が締結されましたので、最終版データ（PDF）を共有いたします。
      </p>
      
      <div style="margin: 24px 0; text-align: center;">
        <a href="${completedLink}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px;">
          最終版PDFをダウンロード
        </a>
      </div>
      
      <p style="font-size: 12px; color: #86868b; word-break: break-all;">
        ※ボタンがクリックできない場合は、以下のURLをブラウザに貼り付けてアクセスしてください：<br />
        <a href="${completedLink}" target="_blank" style="color: #10b981;">${completedLink}</a>
      </p>
      
      <p style="font-size: 14px; color: #4b5563; margin-top: 16px;">
        このドキュメントは改ざん防止処理が施され、署名証跡が記録されています。各自ダウンロードのうえ大切に保管してください。
      </p>
      <p style="font-size: 12px; color: #86868b; margin-top: 24px; padding: 12px; background-color: #f9fafb; border-radius: 8px;">
        ※本システムでは、関係するすべての署名者および共有先（CC）に同時に最終版データが配信されます。
      </p>
      <p style="font-size: 11px; color: #9ca3af; line-height: 1.4; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
        ※このメールは送信専用です。本メールに心当たりがない場合は破棄してください。
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

// GAS経由でPDFファイルをアップロードし、Googleドライブの fileId を取得する関数 ★追加
export async function uploadPdfToGas(file: File, gasUrl: string): Promise<string | null> {
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

    const response = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'uploadPdf',
        pdfBase64: pdfBase64,
        fileName: file.name
      })
    });

    const data = await response.json();
    if (data && data.success && data.fileId) {
      console.log('PDF uploaded to Google Drive successfully. File ID:', data.fileId);
      return data.fileId;
    } else {
      console.error('Failed to upload PDF to GAS:', data.error || 'Unknown error');
      return null;
    }
  } catch (err) {
    console.error('Failed to upload PDF to GAS:', err);
    return null;
  }
}

// GAS経由でGoogleドライブからPDFファイルをダウンロードし、Fileオブジェクトに復元する関数 ★追加
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

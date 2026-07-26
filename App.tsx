import { useState, useEffect } from 'react';
import { DashboardView } from './components/DashboardView';
import { EditorView } from './components/EditorView';
import { SentView } from './components/SentView';
import { SignView } from './components/SignView';
import { CompletedView } from './components/CompletedView';
import { PDFDocument } from 'pdf-lib';
import { 
  getResendApiKey, setResendApiKey, 
  getEmailProvider, setEmailProvider, 
  getGasUrl, setGasUrl,
  sendSignRequestEmail,
  sendFinalCompletedEmail
} from './lib/emailService';

type ViewState = 'dashboard' | 'editor' | 'sent' | 'sign' | 'completed';

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

interface DocumentItem {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'completed';
  createdAt: string;
  originalSize: string;
  signers: Signer[];
  ccEmails: string[];
  fields: Field[];
  signToken: string;
  signedPdfBlob?: Blob;
}

// ★ IndexedDBによるPDFの完全かつ壊れないバイナリ保存・復元処理 ★追加
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('aurasign_pdf_db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const savePdfToIndexedDB = async (file: File, docId?: string) => {
  try {
    const db = await getDB();
    const tx = db.transaction('pdfs', 'readwrite');
    const store = tx.objectStore('pdfs');
    await new Promise<void>((resolve, reject) => {
      store.put(file, 'current_pdf_file');
      if (docId) {
        store.put(file, `pdf_${docId}`);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    localStorage.setItem('aurasign_saved_pdf_name', file.name);
    console.log(`PDF saved to IndexedDB successfully for docId: ${docId}`);
  } catch (err) {
    console.error('Failed to save PDF to IndexedDB:', err);
  }
};

const restorePdfFromIndexedDB = async (docId?: string): Promise<File | null> => {
  try {
    const db = await getDB();
    return await new Promise<File | null>((resolve) => {
      const tx = db.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const key = docId ? `pdf_${docId}` : 'current_pdf_file';
      const req = store.get(key);
      req.onsuccess = () => {
        const file = req.result as File;
        resolve(file || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('Failed to restore PDF from IndexedDB:', err);
    return null;
  }
};

const getBasePath = () => {
  const path = window.location.pathname;
  if (path.startsWith('/esign')) {
    return '/esign';
  }
  return '';
};

function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [userEmail] = useState<string>('owner@aura-sign.com');
  
  // ドキュメント履歴ステート
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    const savedDocs = localStorage.getItem('aurasign_saved_documents');
    if (savedDocs) {
      try {
        return JSON.parse(savedDocs);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'doc-1',
        title: '2026年度 業務委託契約書.pdf',
        status: 'completed',
        createdAt: '2026-07-25 14:32',
        originalSize: '1.2 MB',
        signers: [
          { id: 's-1', name: '佐藤 優', email: 'sato@example.com', status: 'signed', otp: '123456' }
        ],
        ccEmails: ['manager@aura-sign.com'],
        fields: [],
        signToken: 'token-demo-completed'
      }
    ];
  });

  // アプリ共通ステート
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState(() => localStorage.getItem('aurasign_saved_pdf_name') || '');
  const [signers, setSigners] = useState<Signer[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [signToken, setSignToken] = useState('');
  const [activeSignerId, setActiveSignerId] = useState<string>(''); 
  const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string>(''); 

  // 設定用ステート
  const [emailProvider, setProviderState] = useState<'resend' | 'gmail_gas'>(getEmailProvider());
  const [resendKey, setResendKeyState] = useState<string>(getResendApiKey());
  const [gasUrl, setGasUrlState] = useState<string>(getGasUrl());

  // 管理者ログイン用パスコード認証ステート ★追加
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem('aurasign_admin_authenticated') === 'true';
  });
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  const handleAdminLogin = () => {
    const correctPasscode = localStorage.getItem('aurasign_admin_passcode') || 'aurasign2026';
    if (passcodeInput === correctPasscode) {
      sessionStorage.setItem('aurasign_admin_authenticated', 'true');
      setIsAdminAuthenticated(true);
      setPasscodeError('');
    } else {
      setPasscodeError('パスコードが正しくありません。');
    }
  };

  // 初期読み込み時に IndexedDB から PDF を復元
  useEffect(() => {
    restorePdfFromIndexedDB().then(file => {
      if (file) {
        setPdfFile(file);
      }
    });
  }, []);

  // 履歴が更新されたらローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('aurasign_saved_documents', JSON.stringify(documents));
  }, [documents]);

  // デモ用の白紙PDFを動的に生成する関数
  const generateDemoPdf = async () => {
    try {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      page.drawText('Premium AuraSign NDA Document', {
        x: 50,
        y: 730,
        size: 22,
      });
      page.drawText('This is a simulated contract document created dynamically to test AuraSign features.', {
        x: 50,
        y: 690,
        size: 10,
      });
      page.drawText('Please sign in the designated areas.', {
        x: 50,
        y: 670,
        size: 10,
      });
      
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      return new File([blob], 'デモ用NDA（秘密保持契約書）.pdf', { type: 'application/pdf' });
    } catch (err) {
      console.error('Failed to generate demo PDF:', err);
      return null;
    }
  };

  // URLによる簡易ルーティング処理 ★IndexedDBからのロードに対応
  useEffect(() => {
    const handleUrlRouting = async () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const signerIdParam = searchParams.get('signer');

      // 送信元の GAS ウェブアプリURLを引き継ぐ ★追加
      const gasParam = searchParams.get('gas');
      if (gasParam) {
        try {
          const decodedGasUrl = decodeURIComponent(escape(atob(gasParam)));
          if (decodedGasUrl && localStorage.getItem('aurasign_gas_url') !== decodedGasUrl) {
            localStorage.setItem('aurasign_gas_url', decodedGasUrl);
            localStorage.setItem('aurasign_email_provider', 'gmail_gas'); // 自動でGAS送信モードにする
          }
        } catch (e) {
          console.error('Failed to auto-sync gas URL:', e);
        }
      }

      // 完了画面へのルーティング処理 ★修正（URLパラメータからのデータ復旧に対応）
      if (path.includes('/completed')) {
        const token = searchParams.get('token') || '';
        const rawData = searchParams.get('data') || '';
        
        const foundDoc = documents.find(d => d.signToken === token);
        const docId = foundDoc ? foundDoc.id : '';
        let file = await restorePdfFromIndexedDB(docId);
        if (!file) {
          file = await restorePdfFromIndexedDB(); // 後方互換性フォールバック
        }
        if (!file) {
          file = await generateDemoPdf();
        }

        // URLパラメータの data から署名者情報とフィールドデータを復元する ★超重要（別ブラウザ・他者アクセス対応）
        if (rawData) {
          try {
            const decodedJson = decodeURIComponent(escape(atob(rawData)));
            const parsed = JSON.parse(decodedJson);
            if (parsed.fields) setFields(parsed.fields);
            if (parsed.signers) setSigners(parsed.signers);
            if (parsed.title) setPdfTitle(parsed.title);
            if (parsed.ccEmails) setCcEmails(parsed.ccEmails);
            if (file) setPdfFile(file);
            setView('completed');
            return;
          } catch (e) {
            console.error('Failed to restore data from URL parameter:', e);
          }
        }

        if (foundDoc) {
          setPdfTitle(foundDoc.title);
          setSigners(foundDoc.signers);
          setCcEmails(foundDoc.ccEmails);
          setFields(foundDoc.fields);
          setSignedPdfBlob(foundDoc.signedPdfBlob || null);
          if (file) setPdfFile(file);
          setView('completed');
          return;
        }
        
        // フォールバック
        if (file) setPdfFile(file);
        setView('completed');
        return;
      }

      if (path.includes('/sign/')) {
        const parts = path.split('/');
        const tokenIndex = parts.indexOf('sign') + 1;
        const token = parts[tokenIndex] || '';

        if (!token) return;

        const foundDoc = documents.find(d => d.signToken === token);
        const docId = foundDoc ? foundDoc.id : '';
        let file = await restorePdfFromIndexedDB(docId);
        if (!file) {
          file = await restorePdfFromIndexedDB(); // 後方互換性フォールバック
        }
        if (!file) {
          file = await generateDemoPdf();
        }

        // 既存の foundDoc を使用
        if (foundDoc) {
          setPdfTitle(foundDoc.title);
          setSigners(foundDoc.signers);
          setCcEmails(foundDoc.ccEmails);
          setFields(foundDoc.fields);
          setSignToken(token);
          setCurrentDocumentId(foundDoc.id);
          
          const targetSignerId = signerIdParam || foundDoc.signers[0]?.id || '';
          setActiveSignerId(targetSignerId);

          if (file) {
            setPdfFile(file);
            setView('sign'); 
          }
        } else {
          if (file) {
            setPdfFile(file);
            setPdfTitle(file.name || 'インスペクション申込書.pdf');
            
            const targetSignerId = signerIdParam || 'signer-1';
            
            const restoredSigners: Signer[] = [
              { id: 'signer-1', name: '署名者 1', email: 'ru004080@gmail.com', status: 'pending', otp: '123456' },
              { id: 'signer-2', name: '署名者 2', email: 'kazutoshi.senoo@tkk.tokyu.co.jp', status: 'pending', otp: '789012' }
            ];
            
            setSigners(restoredSigners);
            setCcEmails([]);
            setSignToken(token);
            setActiveSignerId(targetSignerId);
            
            setFields([
              {
                id: 'restored-f-1',
                type: 'signature',
                pageNumber: 1,
                x: 20,
                y: 70,
                w: 25,
                h: 6,
                signerId: 'signer-1'
              },
              {
                id: 'restored-f-2',
                type: 'signature',
                pageNumber: 1,
                x: 20,
                y: 78,
                w: 25,
                h: 6,
                signerId: 'signer-2'
              }
            ]);
            
            setView('sign'); 
          }
        }
      }
    };

    handleUrlRouting();
    
    window.addEventListener('popstate', handleUrlRouting);
    return () => window.removeEventListener('popstate', handleUrlRouting);
  }, [documents]);

  const handleLogout = () => {
    sessionStorage.removeItem('aurasign_admin_authenticated');
    setIsAdminAuthenticated(false);
    setPasscodeInput('');
  };

  const handleUploadSuccess = (file: File) => {
    const docId = `doc-${Date.now()}`;
    setPdfFile(file);
    setPdfTitle(file.name);
    setFields([]);
    setSigners([{ id: 'signer-1', name: '署名者 1', email: '', status: 'pending', otp: generateOtp() }]);
    setCcEmails([]);
    setCurrentDocumentId(docId);
    
    // IndexedDB に本物PDFファイルを安全にバイナリ保存（ドキュメント個別管理） ★修正
    savePdfToIndexedDB(file, docId);
    
    setView('editor');
    window.history.pushState({}, '', getBasePath() + '/');
  };

  const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleSelectDocument = async (id: string, isSignView = false) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    // IndexedDB から docId に対応する元PDFの復元を試みる ★修正
    let file = await restorePdfFromIndexedDB(doc.id);
    if (!file || file.name !== doc.title) {
      file = await generateDemoPdf();
    }

    if (file) {
      setPdfFile(file);
      setPdfTitle(doc.title);
      const mappedSigners = doc.signers.map(s => s.otp ? s : { ...s, otp: generateOtp() });
      setSigners(mappedSigners);
      setCcEmails(doc.ccEmails);
      setFields(doc.fields.length > 0 ? doc.fields : []);
      setSignToken(doc.signToken);
      setCurrentDocumentId(doc.id);

      if (doc.status === 'completed') {
        const currentGasUrl = getGasUrl();
        const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
        const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';
        
        const docData = {
          fields: doc.fields,
          signers: doc.signers,
          title: doc.title,
          ccEmails: doc.ccEmails,
          ownerEmail: userEmail
        };
        const encodedData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(docData)))));
        const completedLink = `${window.location.origin}${getBasePath()}/completed?token=${doc.signToken}${gasParamStr}&data=${encodedData}`;

        window.open(completedLink, '_blank');
        return;
      }

      if (isSignView) {
        const unsigned = mappedSigners.find(s => s.status === 'pending');
        setActiveSignerId(unsigned ? unsigned.id : mappedSigners[0]?.id);
        setView('sign');
      } else {
        setView('editor');
      }
    }
  };

  const handleSendRequest = (data: {
    title: string;
    signers: Signer[];
    ccEmails: string[];
    fields: Field[];
    pdfUrl: string;
  }) => {
    const token = `token-${Math.random().toString(36).substring(2, 10)}`;
    const signersWithOtp = data.signers.map(s => ({
      ...s,
      otp: s.otp || generateOtp()
    }));

    const currentGasUrl = getGasUrl();
    const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
    const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';

    signersWithOtp.forEach((signer) => {
      // 署名URLの末尾に &gas=xxxx を付与して送信者のGAS設定を引き継がせる ★修正
      const signLink = `${window.location.origin}${getBasePath()}/sign/${token}?signer=${signer.id}${gasParamStr}`;
      sendSignRequestEmail(signer.email, signer.name, data.title, signLink)
        .then(result => {
          if (!result.success) {
            console.error(`Failed to send request email to ${signer.email}:`, result.error);
          } else {
            console.log(`Successfully sent sign request email to ${signer.email}`);
          }
        });
    });

    const newDoc: DocumentItem = {
      id: currentDocumentId || `doc-${Date.now()}`,
      title: data.title,
      status: 'sent',
      createdAt: new Date().toLocaleString('ja-JP', { hour12: false }).replace(/\//g, '-').substring(0, 16),
      originalSize: pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(1)} MB` : '1.0 MB',
      signers: signersWithOtp,
      ccEmails: data.ccEmails,
      fields: data.fields,
      signToken: token
    };

    setDocuments(prev => {
      const exists = prev.some(d => d.id === newDoc.id);
      if (exists) {
        return prev.map(d => d.id === newDoc.id ? newDoc : d);
      }
      return [newDoc, ...prev];
    });

    setPdfTitle(data.title);
    setSigners(signersWithOtp);
    setCcEmails(data.ccEmails);
    setFields(data.fields);
    setSignToken(token);
    
    if (signersWithOtp.length > 0) {
      setActiveSignerId(signersWithOtp[0].id);
    }
    setView('sent');
  };

  const handleSignatureCompleted = async (blob: Blob, updatedFields: Field[], signerId: string) => {
    setSignedPdfBlob(blob);
    setFields(updatedFields);

    // 最新の合成後PDFファイルを IndexedDB に上書き保存する！ ★超重要（Aの署名が入った最新版をBに引き継ぐ）
    try {
      const updatedFile = new File([blob], pdfTitle, { type: 'application/pdf' });
      setPdfFile(updatedFile); // メモリ上の状態も更新
      await savePdfToIndexedDB(updatedFile, currentDocumentId); // docIdを渡す ★修正
      console.log('Successfully saved middle signed PDF to IndexedDB.');
    } catch (err) {
      console.error('Failed to save middle signed PDF to IndexedDB:', err);
    }

    const updatedSigners = signers.map(s => s.id === signerId ? { ...s, status: 'signed' as const } : s);
    setSigners(updatedSigners);

    const isAllSigned = updatedSigners.every(s => s.status === 'signed');
    const nextStatus = isAllSigned ? 'completed' as const : 'sent' as const;

    // 全員が署名を完了した場合、すべての署名者＋送信者＋妹尾様に最終版PDFの共有通知メールを送信
    if (isAllSigned) {
      const currentGasUrl = getGasUrl();
      const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
      const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';
      
      const currentDoc = documents.find(d => d.id === currentDocumentId);
      const targetCcEmails = currentDoc?.ccEmails || ccEmails;

      // 署名フィールドと署名者情報をBase64化してパラメータに付与する ★超重要（他者PCでのPDFの復元用）
      const docData = {
        fields: updatedFields,
        signers: updatedSigners,
        title: pdfTitle,
        ccEmails: targetCcEmails,
        ownerEmail: userEmail
      };
      const encodedData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(docData)))));
      const completedLink = `${window.location.origin}${getBasePath()}/completed?token=${signToken}${gasParamStr}&data=${encodedData}`;
      
      updatedSigners.forEach((s) => {
        sendFinalCompletedEmail(s.email, s.name, pdfTitle, completedLink);
      });
      // 送信者自身にも共有
      sendFinalCompletedEmail(userEmail, '送信者 (AuraSignオーナー)', pdfTitle, completedLink);
      // kazutoshi.senoo@gmail.com 宛てにも最終完了共有メールを送信
      sendFinalCompletedEmail('kazutoshi.senoo@gmail.com', '管理者 (妹尾 様)', pdfTitle, completedLink);
      // 登録された共有者 (CC) 全員へ最終完了通知メールを送信 ★修正（メモリ揮発対策）
      if (targetCcEmails) {
        targetCcEmails.forEach((ccEmail) => {
          sendFinalCompletedEmail(ccEmail, '共有先 (CC)', pdfTitle, completedLink);
        });
      }
    }

    setDocuments(prev => prev.map(d => {
      if (d.id === currentDocumentId) {
        return {
          ...d,
          status: nextStatus,
          signers: updatedSigners,
          fields: updatedFields,
          signedPdfBlob: blob
        };
      }
      return d;
    }));

    const nextUnsigned = updatedSigners.find(s => s.status === 'pending');
    if (nextUnsigned) {
      setActiveSignerId(nextUnsigned.id);
    }
    
    // 署名完了後にURLを書き換えて、リロード時に再度の署名（認証画面）に逆戻りするのを防止 ★修正
    const currentGasUrlVal = getGasUrl();
    const encodedGasVal = currentGasUrlVal ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrlVal)))) : '';
    const gasParamStrVal = encodedGasVal ? `&gas=${encodedGasVal}` : '';
    
    const finalDocData = {
      fields: updatedFields,
      signers: updatedSigners,
      title: pdfTitle,
      ccEmails: ccEmails,
      ownerEmail: userEmail
    };
    const encodedDataVal = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(finalDocData)))));

    window.history.pushState({}, '', `${getBasePath()}/completed?token=${signToken}${gasParamStrVal}&data=${encodedDataVal}`);
    setView('completed');
  };

  const handleSaveSettings = (provider: 'resend' | 'gmail_gas', apiKey: string, gasUrlString: string) => {
    setEmailProvider(provider);
    setResendApiKey(apiKey);
    setGasUrl(gasUrlString);

    setProviderState(provider);
    setResendKeyState(apiKey);
    setGasUrlState(gasUrlString);
  };

  // ダッシュボードから署名済みPDFを直接合成・ダウンロードする関数 ★修正（メールリンクと同様の遷移方式を採用）
  const handleDownloadPdf = async (doc: DocumentItem) => {
    const currentGasUrl = getGasUrl();
    const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
    const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';
    
    // 署名フィールドと署名者情報をBase64化してパラメータに付与する ★超重要（データパッキング）
    const docData = {
      fields: doc.fields,
      signers: doc.signers,
      title: doc.title,
      ccEmails: doc.ccEmails,
      ownerEmail: userEmail
    };
    const encodedData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(docData)))));
    const completedLink = `${window.location.origin}${getBasePath()}/completed?token=${doc.signToken}${gasParamStr}&data=${encodedData}`;

    // 新しいタブでダウンロード用の完了画面を即座に開く ★100%確実に動作する最強方式
    window.open(completedLink, '_blank');
  };

  return (
    <>
      {view === 'dashboard' && (
        !isAdminAuthenticated ? (
          // セキュアログインゲート（ダッシュボード保護） ★追加
          <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-4 select-none">
            <div className="w-full max-w-md bg-[#121214]/60 border border-white/5 p-8 rounded-2xl shadow-3xl backdrop-blur-md">
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight">管理者ログイン</h1>
                <p className="text-xs text-[#86868b] text-center leading-relaxed">
                  ダッシュボード（送信履歴・設定）を表示するには<br />
                  管理用のログインパスコードを入力してください。
                </p>
              </div>
              
              <div className="flex flex-col gap-4">
                <input 
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    setPasscodeError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdminLogin();
                  }}
                  placeholder="パスコードを入力"
                  className="w-full px-4 py-3 rounded-xl bg-[#1c1c1f] border border-white/10 text-white placeholder-[#52525b] focus:outline-none focus:border-emerald-500/50 transition-all duration-200 text-center font-mono tracking-widest text-lg"
                />
                {passcodeError && (
                  <p className="text-xs text-rose-400 text-center font-medium animate-pulse">{passcodeError}</p>
                )}
                <button
                  onClick={handleAdminLogin}
                  className="w-full py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-950/20 cursor-pointer border-0"
                >
                  ログイン
                </button>
              </div>
              <p className="text-[10px] text-[#3f3f46] text-center mt-6 uppercase tracking-wider">AuraSign System Administrator Gate • デフォルト: aurasign2026</p>
            </div>
          </div>
        ) : (
          <DashboardView
            userEmail={userEmail}
            documents={documents}
            emailProvider={emailProvider}
            resendApiKey={resendKey}
            gasUrl={gasUrl}
            onSaveSettings={handleSaveSettings}
            onLogout={handleLogout}
            onUploadSuccess={handleUploadSuccess}
            onSelectDocument={handleSelectDocument}
            onDownloadPdf={handleDownloadPdf}
          />
        )
      )}

      {view === 'editor' && (
        <EditorView
          file={pdfFile}
          onBack={() => setView('dashboard')}
          onSendRequest={handleSendRequest}
        />
      )}

      {view === 'sent' && (
        <SentView
          title={pdfTitle}
          signers={signers}
          ccEmails={ccEmails}
          signToken={signToken}
          onGoToDashboard={() => setView('dashboard')}
        />
      )}

      {view === 'sign' && (
        <SignView
          title={pdfTitle}
          fields={fields}
          originalPdfFile={pdfFile}
          signers={signers}
          activeSignerId={activeSignerId}
          onSignatureCompleted={handleSignatureCompleted}
          onBack={() => {
            setView('dashboard');
            window.history.pushState({}, '', '/');
          }}
        />
      )}

      {view === 'completed' && (
        <CompletedView
          title={pdfTitle}
          signedPdfBlob={signedPdfBlob}
          signers={signers}
          ccEmails={ccEmails}
          ownerEmail={userEmail}
          originalPdfFile={pdfFile}
          fields={fields}
        />
      )}
    </>
  );
}

export default App;

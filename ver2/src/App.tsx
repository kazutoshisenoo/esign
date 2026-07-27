import { useState, useEffect, useRef } from 'react';
import { DashboardView } from './components/DashboardView';
import { EditorView } from './components/EditorView';
import { SentView } from './components/SentView';
import { SignView } from './components/SignView';
import { CompletedView } from './components/CompletedView';
import { Field } from './lib/pdfUtils';
import { RefreshCw } from 'lucide-react';
import { 
  getResendApiKey, setResendApiKey, 
  getEmailProvider, setEmailProvider, 
  getGasUrl, setGasUrl,
  sendSignRequestEmail,
  sendFinalCompletedEmail,
  uploadPdfToGas,
  downloadPdfFromGas
} from './lib/emailService';

type ViewState = 'dashboard' | 'editor' | 'sent' | 'sign' | 'completed';

interface Signer {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'signed';
  otp?: string;
}

interface DocumentItem {
  id: string;
  title: string;
  status: 'draft' | 'sent' | 'completed';
  createdAt: string;
  signers: Signer[];
  ccEmails: string[];
  fields: Field[];
  signToken: string;
  signedPdfBlob?: Blob;
  fileId?: string;
}

const getBasePath = () => {
  const path = window.location.pathname;
  const repoPath = path.startsWith('/esign') ? '/esign' : '';
  return repoPath + '/#';
};

export default function App() {
  const [view, setView] = useState<ViewState>('dashboard');
  const [isRouteResolving, setIsRouteResolving] = useState<boolean>(true); // チラつき防止ローディング
  const [userEmail] = useState<string>('owner@aura-sign.com');

  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    const savedDocs = localStorage.getItem('aurasign_v2_documents');
    if (savedDocs) {
      try { return JSON.parse(savedDocs); } catch (e) { console.error(e); }
    }
    return [];
  });

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [signers, setSigners] = useState<Signer[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [signToken, setSignToken] = useState('');
  const [activeSignerId, setActiveSignerId] = useState<string>('');
  const [signedPdfBlob, setSignedPdfBlob] = useState<Blob | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string>('');

  const [emailProvider, setProviderState] = useState<'resend' | 'gmail_gas'>(getEmailProvider());
  const [resendKey, setResendKeyState] = useState<string>(getResendApiKey());
  const [gasUrl, setGasUrlState] = useState<string>(getGasUrl());

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return localStorage.getItem('aurasign_admin_auth_v2') === 'true';
  });
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  const isNavigatingByCompleted = useRef<boolean>(false);

  useEffect(() => {
    localStorage.setItem('aurasign_v2_documents', JSON.stringify(documents));
  }, [documents]);

  const handleAdminLogin = () => {
    const correctPasscode = localStorage.getItem('aurasign_admin_passcode') || '19890408';
    if (passcodeInput === correctPasscode) {
      localStorage.setItem('aurasign_admin_auth_v2', 'true');
      setIsAdminAuthenticated(true);
      setPasscodeError('');
    } else {
      setPasscodeError('パスコードが違います。');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aurasign_admin_auth_v2');
    setIsAdminAuthenticated(false);
    setPasscodeInput('');
  };

  // URL ルーティング処理（チラつき＆画面引き戻し徹底ブロック版）
  useEffect(() => {
    const handleRouting = async () => {
      if (isNavigatingByCompleted.current) {
        setIsRouteResolving(false);
        return;
      }

      let path = window.location.pathname;
      let searchStr = window.location.search || '';

      if (window.location.hash) {
        const hashPart = window.location.hash.substring(1);
        if (hashPart.includes('?')) {
          const [hashPath, hashQuery] = hashPart.split('?');
          path = hashPath;
          searchStr = searchStr ? `${searchStr}&${hashQuery}` : `?${hashQuery}`;
        } else {
          path = hashPart;
        }
      }

      const searchParams = new URLSearchParams(searchStr);
      const signerIdParam = searchParams.get('signer');
      const gasParam = searchParams.get('gas');
      let activeGasUrl = getGasUrl();

      if (gasParam) {
        try {
          const decodedGas = decodeURIComponent(escape(atob(gasParam)));
          if (decodedGas) {
            localStorage.setItem('aurasign_gas_url', decodedGas);
            localStorage.setItem('aurasign_email_provider', 'gmail_gas');
            activeGasUrl = decodedGas;
          }
        } catch (e) { console.error(e); }
      }

      const fileIdParam = searchParams.get('fileId');

      if (path.includes('/completed')) {
        const token = searchParams.get('token') || '';
        const rawData = searchParams.get('data') || '';
        const foundDoc = documents.find((d) => d.signToken === token);
        const fileId = fileIdParam || foundDoc?.fileId || '';

        let file: File | null = null;
        if (fileId && activeGasUrl) {
          file = await downloadPdfFromGas(fileId, activeGasUrl);
        }

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
            setIsRouteResolving(false);
            return;
          } catch (e) { console.error(e); }
        }

        if (foundDoc) {
          setPdfTitle(foundDoc.title);
          setSigners(foundDoc.signers);
          setCcEmails(foundDoc.ccEmails);
          setFields(foundDoc.fields);
          if (file) setPdfFile(file);
          setView('completed');
          setIsRouteResolving(false);
          return;
        }
        setView('completed');
        setIsRouteResolving(false);
        return;
      }

      if (path.includes('/sign/')) {
        const parts = path.split('/');
        const tokenIndex = parts.indexOf('sign') + 1;
        const token = parts[tokenIndex] || '';

        if (!token) {
          setIsRouteResolving(false);
          return;
        }

        const rawData = searchParams.get('data') || '';
        const foundDoc = documents.find((d) => d.signToken === token);
        const fileId = fileIdParam || foundDoc?.fileId || '';

        let file: File | null = null;
        if (fileId && activeGasUrl) {
          file = await downloadPdfFromGas(fileId, activeGasUrl);
        }

        if (rawData) {
          try {
            const decodedJson = decodeURIComponent(escape(atob(rawData)));
            const parsed = JSON.parse(decodedJson);
            if (parsed.fields) setFields(parsed.fields);
            if (parsed.signers) setSigners(parsed.signers);
            if (parsed.title) setPdfTitle(parsed.title);
            if (parsed.ccEmails) setCcEmails(parsed.ccEmails);
            setSignToken(token);
            const targetSignerId = signerIdParam || (parsed.signers && parsed.signers[0]?.id) || 'signer-1';
            setActiveSignerId(targetSignerId);
            if (file) setPdfFile(file);
            setView('sign');
            setIsRouteResolving(false);
            return;
          } catch (e) { console.error(e); }
        }

        if (foundDoc) {
          setPdfTitle(foundDoc.title);
          setSigners(foundDoc.signers);
          setCcEmails(foundDoc.ccEmails);
          setFields(foundDoc.fields);
          setSignToken(token);
          setCurrentDocumentId(foundDoc.id);
          const targetSignerId = signerIdParam || foundDoc.signers[0]?.id || '';
          setActiveSignerId(targetSignerId);
          if (file) setPdfFile(file);
          setView('sign');
          setIsRouteResolving(false);
          return;
        }
      }

      setIsRouteResolving(false);
    };

    handleRouting();
    window.addEventListener('popstate', handleRouting);
    window.addEventListener('hashchange', handleRouting);
    return () => {
      window.removeEventListener('popstate', handleRouting);
      window.removeEventListener('hashchange', handleRouting);
    };
  }, [documents]);

  const handleUploadSuccess = (file: File) => {
    const docId = `doc-${Date.now()}`;
    setPdfFile(file);
    setPdfTitle(file.name);
    setFields([]);
    setSigners([{ id: 'signer-1', name: '署名者 1', email: '', status: 'pending', otp: '123456' }]);
    setCcEmails([]);
    setCurrentDocumentId(docId);
    setView('editor');
  };

  const handleSendRequest = async (data: {
    title: string;
    signers: Signer[];
    ccEmails: string[];
    fields: Field[];
    pdfUrl: string;
  }) => {
    const token = `token-${Math.random().toString(36).substring(2, 10)}`;
    const currentGasUrl = getGasUrl();
    const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
    const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';

    let fileId = '';
    if (pdfFile && currentGasUrl && getEmailProvider() === 'gmail_gas') {
      try {
        const uploadResult = await uploadPdfToGas(pdfFile, currentGasUrl);
        if (uploadResult.success && uploadResult.fileId) {
          fileId = uploadResult.fileId;
        } else {
          alert(`【送信エラー】GAS保存失敗: ${uploadResult.error}`);
          return;
        }
      } catch (e) {
        alert('【通信エラー】GASへのPDF自動送信失敗');
        return;
      }
    }

    const fileIdParamStr = fileId ? `&fileId=${fileId}` : '';
    const firstSigner = data.signers[0];

    if (firstSigner) {
      const signLink = `${window.location.origin}${getBasePath()}/sign/${token}?signer=${firstSigner.id}${gasParamStr}${fileIdParamStr}`;
      sendSignRequestEmail(firstSigner.email, firstSigner.name, data.title, signLink);
    }

    const newDoc: DocumentItem = {
      id: currentDocumentId || `doc-${Date.now()}`,
      title: data.title,
      status: 'sent',
      createdAt: new Date().toLocaleString('ja-JP').substring(0, 16),
      signers: data.signers,
      ccEmails: data.ccEmails,
      fields: data.fields,
      signToken: token,
      fileId
    };

    setDocuments([newDoc, ...documents]);
    setPdfTitle(data.title);
    setSigners(data.signers);
    setCcEmails(data.ccEmails);
    setFields(data.fields);
    setSignToken(token);
    setView('sent');
  };

  const handleSignatureCompleted = (blob: Blob, updatedFields: Field[], signerId: string) => {
    isNavigatingByCompleted.current = true; // 引き戻しブロックフラグON
    setSignedPdfBlob(blob);
    setFields(updatedFields);

    const updatedFile = new File([blob], pdfTitle, { type: 'application/pdf' });
    setPdfFile(updatedFile);

    // 署名者ステータスの更新
    const updatedSigners = signers.map((s) => (s.id === signerId ? { ...s, status: 'signed' as const } : s));
    setSigners(updatedSigners);

    // 全員の署名が完了したかどうかの判定
    const isAllSigned = updatedSigners.every((s) => {
      const signerFields = updatedFields.filter(f => f.signerId === s.id);
      const isFieldsFilled = signerFields.every(f => !!f.value);
      return s.status === 'signed' || isFieldsFilled;
    });

    const nextStatus = isAllSigned ? ('completed' as const) : ('sent' as const);
    let activeFileId = '';
    const currentDoc = documents.find((d) => d.id === currentDocumentId || d.signToken === signToken);
    if (currentDoc) activeFileId = currentDoc.fileId || '';

    const currentGasUrl = getGasUrl();
    const encodedGasVal = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
    const gasParamStrVal = encodedGasVal ? `&gas=${encodedGasVal}` : '';
    const fileIdParamStrVal = activeFileId ? `&fileId=${activeFileId}` : '';

    const docData = {
      fields: updatedFields,
      signers: updatedSigners,
      title: pdfTitle,
      ccEmails,
      ownerEmail: userEmail
    };
    const encodedDataVal = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(docData)))));

    // ★待たずに0.01秒で即座に完了画面へ遷移！
    window.history.pushState({}, '', `${getBasePath()}/completed?token=${signToken}${gasParamStrVal}${fileIdParamStrVal}&data=${encodedDataVal}`);
    setView('completed');

    // ★重いGASアップロード・メール送信はバックグラウンドで並行実行
    (async () => {
      let uploadedFileId = activeFileId;
      if (currentGasUrl && getEmailProvider() === 'gmail_gas') {
        try {
          const uploadResult = await uploadPdfToGas(updatedFile, currentGasUrl);
          if (uploadResult.success && uploadResult.fileId) {
            uploadedFileId = uploadResult.fileId;
          }
        } catch (e) {
          console.error('Background PDF upload error:', e);
        }
      }

      const latestFileIdStr = uploadedFileId ? `&fileId=${uploadedFileId}` : '';
      const latestCompletedLink = `${window.location.origin}${getBasePath()}/completed?token=${signToken}${gasParamStrVal}${latestFileIdStr}&data=${encodedDataVal}`;

      setDocuments((prevDocs) => {
        return prevDocs.map(d => (d.id === currentDocumentId || d.signToken === signToken) ? {
          ...d,
          status: nextStatus,
          signers: updatedSigners,
          fields: updatedFields,
          signedPdfBlob: blob,
          fileId: uploadedFileId || d.fileId
        } : d);
      });

      if (isAllSigned) {
        updatedSigners.forEach((s) => sendFinalCompletedEmail(s.email, s.name, pdfTitle, latestCompletedLink));
        sendFinalCompletedEmail(userEmail, '送信者 (AuraSign)', pdfTitle, latestCompletedLink);
        sendFinalCompletedEmail('kazutoshi.senoo@gmail.com', '管理者 (妹尾 様)', pdfTitle, latestCompletedLink);
      } else {
        const nextUnsigned = updatedSigners.find((s) => s.status === 'pending');
        if (nextUnsigned) {
          setActiveSignerId(nextUnsigned.id);
          const nextDocData = {
            fields: updatedFields,
            signers: updatedSigners,
            title: pdfTitle,
            ccEmails,
            ownerEmail: userEmail
          };
          const encodedNextData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(nextDocData)))));
          const signLink = `${window.location.origin}${getBasePath()}/sign/${signToken}?signer=${nextUnsigned.id}${gasParamStrVal}${latestFileIdStr}&data=${encodedNextData}`;

          sendSignRequestEmail(nextUnsigned.email, nextUnsigned.name, pdfTitle, signLink);
        }
      }
    })();
  };

  const handleSaveSettings = (provider: 'resend' | 'gmail_gas', apiKey: string, gasUrlString: string) => {
    setEmailProvider(provider);
    setResendApiKey(apiKey);
    setGasUrl(gasUrlString);

    setProviderState(provider);
    setResendKeyState(apiKey);
    setGasUrlState(gasUrlString);
  };

  const handleDownloadPdf = async (doc: DocumentItem) => {
    const currentGasUrl = getGasUrl();
    const encodedGas = currentGasUrl ? encodeURIComponent(btoa(unescape(encodeURIComponent(currentGasUrl)))) : '';
    const gasParamStr = encodedGas ? `&gas=${encodedGas}` : '';
    const fileIdParamStr = doc.fileId ? `&fileId=${doc.fileId}` : '';

    const docData = {
      fields: doc.fields,
      signers: doc.signers,
      title: doc.title,
      ccEmails: doc.ccEmails,
      ownerEmail: userEmail
    };
    const encodedData = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(docData)))));
    const completedLink = `${window.location.origin}${getBasePath()}/completed?token=${doc.signToken}${doc.fileId ? gasParamStr + fileIdParamStr : ''}&data=${encodedData}`;

    window.open(completedLink, '_blank');
  };

  // 初期ルーティング処理中のローディング表示（チラつき防止）
  if (isRouteResolving) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center gap-3">
        <RefreshCw className="animate-spin text-blue-500" size={32} />
        <p className="text-xs text-gray-400">AuraSign をレンダリングしています...</p>
      </div>
    );
  }

  return (
    <>
      {view === 'dashboard' &&
        (!isAdminAuthenticated ? (
          <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#121214] border border-white/10 p-8 rounded-2xl flex flex-col gap-4 text-center">
              <h1 className="text-lg font-bold text-white">管理者ログイン (ver.2)</h1>
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="パスコード"
                className="w-full px-4 py-2.5 bg-[#1c1c1f] border border-white/10 rounded-xl text-center font-mono text-base"
              />
              {passcodeError && <p className="text-xs text-red-400">{passcodeError}</p>}
              <button onClick={handleAdminLogin} className="py-2.5 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-xs">
                ログイン
              </button>
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
            onSelectDocument={(id) => {}}
            onDownloadPdf={handleDownloadPdf}
          />
        ))}

      {view === 'editor' && <EditorView file={pdfFile} onBack={() => setView('dashboard')} onSendRequest={handleSendRequest} />}

      {view === 'sent' && (
        <SentView title={pdfTitle} signers={signers} ccEmails={ccEmails} signToken={signToken} onGoToDashboard={() => setView('dashboard')} />
      )}

      {view === 'sign' && (
        <SignView
          title={pdfTitle}
          fields={fields}
          originalPdfFile={pdfFile}
          signers={signers}
          activeSignerId={activeSignerId}
          onSignatureCompleted={handleSignatureCompleted}
          onBack={() => setView('dashboard')}
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

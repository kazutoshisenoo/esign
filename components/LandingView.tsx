import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card, CardContent } from './ui/Card';
import { Shield, FileSignature, Send, Download } from 'lucide-react';

interface LandingViewProps {
  onLoginSuccess: (email: string) => void;
  onEnterMockSign: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onLoginSuccess, onEnterMockSign }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // デモログインのシミュレーション
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess(email || 'demo@example.com');
    }, 1200);
  };

  return (
    <div className="relative min-h-screen bg-[#09090b] flex flex-col justify-between overflow-hidden">
      {/* Background radial gradients for Apple/Linear premium feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-[#0071e3]/10 to-transparent rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] bg-gradient-to-tr from-purple-500/5 to-transparent rounded-full blur-[100px] pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-white to-[#a1a1aa] flex items-center justify-center shadow-lg shadow-black/50">
            <FileSignature className="w-5 h-5 text-black" />
          </div>
          <span className="font-semibold text-lg tracking-tight text-white">AuraSign</span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={onEnterMockSign}>署名デモを試す</Button>
          <Button variant="outline" onClick={() => {
            const el = document.getElementById('auth-form');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}>ログイン</Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-16">
        {/* Left column: Value Proposition */}
        <div className="flex-1 text-left flex flex-col gap-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-[#a1a1aa] font-medium">
            <Shield className="w-3.5 h-3.5 text-[#0071e3]" />
            安全で堅牢な、次世代電子署名プラットフォーム
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            美しさと、<br />
            安全性が融合した<br />
            <span className="bg-gradient-to-r from-[#0071e3] via-blue-400 to-indigo-300 bg-clip-text text-transparent">新しい署名体験。</span>
          </h1>
          
          <p className="text-base sm:text-lg text-[#86868b] leading-relaxed max-w-lg">
            PDFをアップロードし、直感的なドラッグ＆ドロップでフィールドを配置。監査ログ、メール認証、タイムスタンプを完備した最高峰の署名ソリューション。
          </p>

          {/* Features grid */}
          <div className="grid grid-cols-2 gap-6 mt-4">
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white border border-white/5">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white text-sm">簡単な配置＆送信</h3>
              <p className="text-xs text-[#86868b]">ドラッグ＆ドロップで署名や日付欄を配置。</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white border border-white/5">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white text-sm">監査ログ＆認証</h3>
              <p className="text-xs text-[#86868b]">全ての履歴をタイムスタンプ付きで安全に保存。</p>
            </div>
          </div>
        </div>

        {/* Right column: Auth Card */}
        <div id="auth-form" className="w-full max-w-[420px] flex-shrink-0">
          <Card className="shadow-2xl">
            <CardContent className="flex flex-col gap-6 p-8">
              <div className="flex flex-col gap-2 text-center">
                <h2 className="text-xl font-semibold text-white">
                  {isLogin ? 'アカウントにサインイン' : 'アカウントを作成'}
                </h2>
                <p className="text-xs text-[#86868b]">
                  {isLogin ? 'メールアドレスとパスワードを入力してください' : '必要事項を入力して登録を完了させてください'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {!isLogin && (
                  <Input
                    label="氏名"
                    placeholder="山田 太郎"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                )}
                <Input
                  label="メールアドレス"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="パスワード"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
                  {isLogin ? 'サインイン' : 'アカウントを作成'}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/5" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-[#121214] px-2 text-[#86868b]">または</span></div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => onLoginSuccess('demo@example.com')}>
                デモアカウントで入る (ログイン不要)
              </Button>

              <div className="text-center text-xs text-[#86868b]">
                {isLogin ? 'アカウントをお持ちではありませんか？' : '既にアカウントをお持ちですか？'}{' '}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-white hover:underline font-medium focus:outline-none"
                >
                  {isLogin ? '新規登録' : 'サインイン'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-[#86868b] gap-4">
        <div>© 2026 AuraSign Inc. All rights reserved.</div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white transition-colors">利用規約</a>
          <a href="#" className="hover:text-white transition-colors">プライバシーポリシー</a>
          <a href="#" className="hover:text-white transition-colors">セキュリティ</a>
        </div>
      </footer>
    </div>
  );
};

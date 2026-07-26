import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-supabase-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// モックモードかどうかを判定（環境変数が無い場合はフロントエンド単体のデモモードで動作）
export const isMockMode = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

if (isMockMode) {
  console.warn('Supabase URL or Anon Key is missing. Running in MOCK DEMO MODE.');
}

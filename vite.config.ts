import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 載入環境變數 (.env 檔案)
  // 第三個參數設為 '' 表示載入所有變數，不僅限於 VITE_ 開頭的
  // 修正 process.cwd() 型別問題
  const env = loadEnv(mode, (process as any).cwd(), '');

  // 修正重點：
  // 在 Vercel 等部署平台，環境變數通常注入在 process.env 中
  // loadEnv 雖然會讀取 .env 檔案，但不一定會包含 process.env 的系統變數
  // 因此這裡優先讀取 process.env.API_KEY，確保部署時能抓到 Vercel 設定的值
  const apiKey = process.env.API_KEY || env.API_KEY;

  return {
    plugins: [react()],
    define: {
      // 這裡定義全域常數 replacement
      // 當程式碼出現 process.env.API_KEY 時，Vite 會在建置時將其替換為實際的字串值
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
  };
});
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 載入環境變數
  // 第三個參數設為 '' 表示載入所有變數，不僅限於 VITE_ 開頭的
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // 這裡定義全域常數 replacement
      // 當程式碼出現 process.env.API_KEY 時，Vite 會在建置時將其替換為實際的字串值
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
  };
});
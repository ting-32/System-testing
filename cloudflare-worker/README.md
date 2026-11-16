# Cloudflare Worker LINE Edge Webhook 部署說明

此 Worker 為零依賴 ES Module，可直接用 Cloudflare 網頁控制台貼上或使用 Wrangler CLI 部署。

## 必要環境變數（Secrets）
1. `LINE_CHANNEL_SECRET`：LINE Developers → Messaging API 分頁 → Basic settings → Channel secret
2. `LINE_CHANNEL_ACCESS_TOKEN`：LINE Messaging API Token
3. `GAS_URL`：Google Apps Script `/exec` 網址
4. `EDGE_SHARED_SECRET`：自行設定的 32 位亂數密鑰（需與系統內「通知中心 → Edge Webhook 加速設定」一致）
5. `FIREBASE_DB_AUTH`（選填）：若 Firebase RTDB 有設定安全規則權限時填入 Database Secret

## 兩種部署方式

### 方式 A：Cloudflare Dashboard 直接貼上（免裝工具）
1. 登入 Cloudflare Dashboard → `Workers & Pages` → `Create` → `Create Worker`。
2. 點 `Deploy` 後選 **`Edit code`**，將 `src/index.js` 內容完整貼上並點 `Deploy`。
3. 進入該 Worker 的 **`Settings → Variables and Secrets`**，新增上述 4 組 Secrets（類型選 Secret）。
4. 複製 Worker 網址（例如 `https://noodle-erp-line-edge.xxx.workers.dev`），貼回 LINE Developers 的 Webhook URL並點 `Verify`。

### 方式 B：Wrangler CLI
```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put GAS_URL
npx wrangler secret put EDGE_SHARED_SECRET
npx wrangler deploy
```

# NQ 交易紀律日誌

用於記錄 NQ／MNQ 交易前檢查、進出場計畫、實際損益與交易後復盤的個人日誌。提供四組可編輯策略 SOP、交易補登與修改、月曆統計、PF 帳號購買成本，以及觀看／編輯協作者管理。

線上網站：[NQ 交易紀律日誌](https://nq-entry-journal.tateru199988121.chatgpt.site)。此儲存庫提供程式碼，不包含交易資料庫、協作者名單或本機執行資料。原網站的觀看設計為持有連結即可查看日誌；擁有者與編輯權限用於限制修改操作。

## 技術與需求

- React、TypeScript、Vinext／Vite、Tailwind CSS。
- Cloudflare Workers 與 D1，使用 Drizzle 管理資料表與 migrations。
- Sites 提供託管與 ChatGPT 登入；自行部署到其他平台時，需要另外配置可信任的身分驗證，不能直接信任外部傳入的身分標頭。
- Node.js `>=22.13.0`，pnpm `11.19.0`（版本記錄於 `package.json`）。

`build/` 包含必要的 Worker 與 Vite 插件原始碼，需和 `scripts/`、`vendor/` 及其授權檔一起保留。`.openai/hosting.json` 宣告 D1 綁定 `DB`；若建立自己的 Sites 專案，請使用自己的專案 ID。

## 本機啟動

先安裝指定版本的 pnpm，再安裝依賴：

```powershell
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
Copy-Item .dev.vars.example .dev.vars
```

在 `.dev.vars` 設定 `OWNER_EMAIL`，值為擁有者登入的電子郵件。此設定會去除頭尾空白並轉成小寫；未設定或空白時，不會把任何帳號判定為擁有者。`.dev.vars` 與其他真實環境設定均被 Git 忽略。

可攜式本機預覽使用 Sites starter 的 mock 登入：開啟 `/signin-with-chatgpt?return_to=/` 後，身份為 `seedy@sites.test`。若要在本機操作擁有者功能，請把本機 `.dev.vars` 的 `OWNER_EMAIL` 設成這個測試信箱。`.dev.vars.example` 的 `owner@example.com` 只是設定範例。正式託管時，應在執行環境另外設定實際的 `OWNER_EMAIL`，並使用平台提供的登入機制。

首次執行先建置，產生本機 Wrangler 設定，再依檔名順序套用 D1 migrations。以下為 PowerShell 指令：

```powershell
pnpm build
Get-ChildItem ./drizzle/*.sql | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "D1 migration failed" }
}
pnpm dev
```

預設開發網址為 `http://localhost:5173`。只需對新的空白本機資料庫執行整組 migrations；已套用的檔案不要重複執行。`.wrangler/state` 儲存本機資料，未納入儲存庫。新增資料表時可使用 `pnpm db:generate` 產生 migration。

要預覽建置後的 Worker：

```powershell
pnpm build
pnpm start
```

`pnpm start` 使用同一個本機 D1 狀態，不會部署網站，也不會模擬 ChatGPT 登入。執行時請使用終端機顯示的 loopback 網址。正式部署需要配置 D1、套用 migrations、設定 `OWNER_EMAIL`，並接上受信任的登入來源。

## 公開來源與隱私處理

本公開副本取自原始碼 commit `f24cdf92361c524007585f4dc7f5ab6a192580c8`，以新的 snapshot 發布，未包含原 Git 歷史。

- 原本寫在程式裡的擁有者私人信箱改為 `OWNER_EMAIL` 環境設定。
- 本機 mock 登入的身份改為範例使用者，移除原本的個人測試身份。
- `drizzle/0005_confirmed_trade_correction.sql` 原本是特定交易的資料修正；公開副本以無資料變更的 SQL 保留序號，移除個人交易內容。
- 未包含本機資料庫、執行狀態、環境檔、金鑰、依賴目錄、編譯產物與部署封存檔。

這些處理只作用於公開副本；原始網站與原本的本機專案保持原狀。

# EcoLens V3 全面設計規劃

## 1. 目標與產品定位

EcoLens 是面向台灣與日本使用情境的 AI 智慧垃圾分類 Web App。核心目標不是只回答「這是什麼垃圾」，而是把影像辨識、地區規則、複合材質拆解、使用者回饋與資料沉澱串成一個可持續改善的系統。

本版本以 V3 提案為基準，設計重點如下：

- 使用者打開相機後自動啟動低頻即時偵測，不必先拍照或上傳。
- 保留手動拍照與圖片上傳，作為高信心確認與相機不可用時的備援。
- 依 GPS 或使用者手動選擇切換台灣 / 日本規則。
- 對複合材質輸出拆解式結果，例如杯麵容器、飲料杯、便當盒。
- 對污染、殘液、需清洗、需拆解等情境給出防呆提醒。
- 用戶可回報錯誤，前端即時收到 SSE 串流回應。
- 後端把錯誤案例存成可審核、可再訓練、可補規則的資料資產。

## 2. 使用者與核心場景

### 2.1 主要使用者

- 觀光客：不熟悉當地垃圾分類規則，需要快速、低文字負擔的答案。
- 在地居民：遇到複合材質、污染容器或地方規則差異時，需要可靠判斷。
- 維運 / 知識管理者：需要審核回饋案例、修正規則、建立模型改善資料集。

### 2.2 核心場景

1. 使用者打開 Web App，允許相機與定位。
2. 系統判斷目前區域為台灣或日本；若定位失敗，要求手動選擇地區。
3. 相機 preview 啟動後，前端自動從 video frame 低頻擷取畫面送往後端分類。
4. 後端 Vision Agent 回傳結構化分類結果。
5. 前端以 AR 標籤與分解清單即時呈現「各部件應怎麼丟」。
6. 若使用者需要更穩定結果，可按下確認拍攝，送出較高品質 frame 重新分類。
7. 若結果錯誤，使用者點擊「報錯」，輸入正確分類或補充說明。
8. SSE 立即串流回應，讓使用者知道系統已接收。
9. 後台儲存圖片、原判斷、修正答案、地區與信心分數，供後續審核與改善。

## 3. 系統架構

### 3.1 建議技術棧

- 前端：Next.js App Router + TypeScript
- UI：React + CSS Modules 或 Tailwind CSS
- 相機：Browser MediaDevices API
- 視覺輸入：Canvas 壓縮與 EXIF 移除
- API：Next.js Route Handlers 或 Vercel Serverless Functions
- SSE：Edge Runtime Route Handler
- Agent Orchestration：LangGraph
- LLM / Vision：可抽換的 Vision Provider 介面
- DB：Supabase Postgres
- 圖片儲存：Supabase Storage
- Observability：Vercel Logs + Supabase tables + structured request id

### 3.2 高層架構

```text
Browser
  ├─ Live camera detect
  ├─ Capture confirm / Upload fallback
  ├─ Region selector
  ├─ AR result overlay
  └─ Feedback SSE client

Next.js / Vercel
  ├─ POST /api/classify
  │    ├─ validate image
  │    ├─ resolve region
  │    ├─ call Vision Agent
  │    ├─ normalize output
  │    └─ return ClassificationResult
  │
  ├─ POST /api/feedback
  │    ├─ create feedback session
  │    ├─ persist record
  │    └─ return feedbackId
  │
  └─ GET /api/feedback/stream?id=...
       ├─ run LangGraph response node
       └─ stream SSE messages

Supabase
  ├─ Storage: captured images
  ├─ classification_events
  ├─ feedback_events
  ├─ rule_overrides
  └─ review_queue
```

## 4. 前端設計

### 4.1 頁面結構

MVP 不需要傳統 landing page，第一畫面就是可使用的分類工具。Phase 1 先使用 Upload Mode，讓使用者上傳圖片並手動選擇台灣 / 日本；Live Detect Mode 留到 Phase 3。

```text
/ 
  ├─ upload / preview area
  ├─ top status bar: region, GPS state, network state
  ├─ upload fallback controls
  ├─ result panel
  ├─ material breakdown list
  └─ feedback drawer
```

### 4.1.1 即時相機偵測模式

Live Detect Mode 是 Phase 3 的預設流程：

- 相機 preview 啟動後，前端不直接連續錄影上傳，而是定期從 `video` 擷取單張 frame。
- 預設偵測頻率建議為每 1.5 到 3 秒一次，依裝置效能、網路與成本調整。
- frame 送出前先壓縮成低解析 JPEG，例如長邊 640 到 960px。
- 前端需做節流，上一個分類請求未完成時不送下一張。
- 若畫面變化很小，可跳過送出，避免重複呼叫 Vision API。
- 若連續 2 次以上結果一致，才將分類標記為 stable，降低 AR 標籤跳動。
- 使用者按下確認拍攝時，才送出較高解析 frame 做一次 confirm classification。
- 使用者可暫停 live detect，避免鏡頭移動時持續消耗 API 成本。

偵測模式分層：

- Upload Mode：Phase 1 主要體驗，相機權限被拒、桌機無相機或使用者已有圖片時也使用。
- Live Detect Mode：Phase 3 主要體驗，打開相機即自動偵測。
- Capture Confirm Mode：按下確認拍攝，取得較高信心分類。

### 4.2 主要狀態

- `idle`：等待相機權限或圖片。
- `cameraStarting`：相機啟動中。
- `liveScanning`：相機已啟動，正在低頻擷取 frame 自動偵測。
- `livePaused`：使用者或系統暫停即時偵測。
- `classifyingFrame`：已送出 live frame，等待 AI 結果。
- `confirmingCapture`：使用者按下確認拍攝，等待高品質分類結果。
- `classified`：顯示分類結果。
- `feedbackOpen`：使用者正在填報錯誤。
- `feedbackStreaming`：接收 SSE 回覆。
- `error`：相機、定位、API 或模型失敗。

### 4.3 分類結果 UI

分類結果需避免只顯示單一答案，建議分成三層：

- 總結：最可能分類、地區、信心分數、是否需要拆解。
- 部件清單：每個材質 / 部件的分類、處理方式與警告。
- 行動提示：清洗、瀝乾、倒掉殘液、撕除標籤、分開投放。

範例資料呈現：

```text
杯麵容器
地區：日本
整體建議：拆成 3 個部分處理

1. 殘留湯汁
   類別：廚餘 / 可燃處理
   動作：先倒除，避免污染容器

2. 油膩紙杯
   類別：可燃垃圾
   警告：受污染紙容器不可作為乾淨紙類回收

3. 塑膠封膜
   類別：プラ 或一般垃圾，依地方規則確認
```

### 4.4 回饋 UI

回饋流程建議採 drawer 或 bottom sheet：

- 顯示 AI 原判斷。
- 提供快速選項：類別錯誤、地區規則錯誤、材質拆解不完整、提示不清楚。
- 允許輸入正確分類與補充文字。
- 送出後立刻顯示串流訊息。
- 背景儲存失敗時要重試，不要讓使用者停在空白狀態。

## 5. 後端 API 設計

### 5.1 `POST /api/classify`

用途：接收 live frame、確認拍攝圖片或上傳圖片，搭配地區資訊與定位，回傳結構化分類結果。

Request:

```json
{
  "image": {
    "mimeType": "image/jpeg",
    "base64": "..."
  },
  "capture": {
    "mode": "live_frame",
    "sequence": 12,
    "clientCapturedAt": "2026-06-30T02:30:00.000Z"
  },
  "location": {
    "lat": 35.6895,
    "lng": 139.6917,
    "source": "gps"
  },
  "regionHint": "jp",
  "locale": "zh-TW"
}
```

`capture.mode` 建議值：

- `live_frame`：相機 preview 自動擷取的低解析 frame。
- `confirm_capture`：使用者按下確認拍攝後送出的較高品質 frame。
- `upload`：使用者手動上傳圖片。

後端可依模式採用不同策略。`live_frame` 應偏向低延遲與低成本；`confirm_capture` 可使用更完整的推理與規則檢查。

Response:

```json
{
  "requestId": "cls_...",
  "region": {
    "country": "JP",
    "municipality": "Tokyo Shinjuku",
    "confidence": 0.82
  },
  "item": {
    "name": "杯麵容器",
    "confidence": 0.91
  },
  "overall": {
    "label": "需拆解處理",
    "severity": "warning",
    "summary": "請先倒除殘液，再依杯身與封膜分開處理。"
  },
  "components": [
    {
      "id": "broth",
      "name": "殘留湯汁",
      "material": "food_liquid",
      "category": "burnable_or_food_waste",
      "action": "先倒除",
      "warning": "殘液會污染可回收容器",
      "confidence": 0.86
    }
  ],
  "model": {
    "provider": "vision-provider",
    "version": "v1"
  }
}
```

### 5.2 `POST /api/feedback`

用途：建立回饋紀錄，回傳 `feedbackId` 供 SSE 使用。

Request:

```json
{
  "classificationRequestId": "cls_...",
  "reason": "wrong_category",
  "userCorrectLabel": "紙容器",
  "userNote": "這是紙杯，不是塑膠杯",
  "region": "TW",
  "imageRef": "storage://..."
}
```

Response:

```json
{
  "feedbackId": "fb_...",
  "streamUrl": "/api/feedback/stream?id=fb_..."
}
```

### 5.3 `GET /api/feedback/stream`

用途：以 SSE 串流 Agent 對使用者的回應。

事件格式：

```text
event: message
data: {"delta":"謝謝你的回報，"}

event: message
data: {"delta":"我已經把這次判斷和正解記錄下來。"}

event: done
data: {"feedbackId":"fb_..."}
```

## 6. Agent 與 LangGraph 設計

### 6.1 Classify Graph

```text
Input validation
  -> Region resolver
  -> Vision recognition
  -> Rule router
  -> Component decomposition
  -> Safety / contamination checker
  -> JSON schema validator
  -> Response normalizer
```

節點職責：

- Region resolver：將 GPS 轉成國家、城市、行政區；失敗時使用 `regionHint`。
- Vision recognition：辨識物品、材質、污染、殘液與可拆解部件。
- Rule router：套用台灣或日本規則。
- Component decomposition：避免只回單一分類，將複合材質拆成多個元件。
- Safety checker：補上污染、清洗、尖銳物、電池等風險提示。
- Validator：確保輸出符合 JSON Schema。

### 6.2 Feedback Graph

```text
Feedback input
  ├─ User-facing response node -> SSE stream
  └─ Persistence node -> DB / Storage / review queue
       -> Deduplication node
       -> Rule candidate node
```

提案中的「前台安撫」與「後台建檔」建議拆成兩條路徑，但不要讓資料寫入完全依賴 SSE 連線生命週期。較穩定的做法是：

1. `POST /api/feedback` 先建立最小可用紀錄。
2. `GET /api/feedback/stream` 只負責使用者可見的串流回覆。
3. 後續整理、去重、規則候選可以透過 queue 或 scheduled job 執行。

## 7. 資料庫設計

### 7.1 `classification_events`

```sql
create table classification_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  region_country text not null,
  region_municipality text,
  location_lat double precision,
  location_lng double precision,
  image_path text,
  predicted_item text not null,
  predicted_label text not null,
  confidence numeric,
  result_json jsonb not null,
  model_provider text,
  model_version text
);
```

### 7.2 `feedback_events`

```sql
create table feedback_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  classification_event_id uuid references classification_events(id),
  reason text not null,
  user_correct_label text,
  user_note text,
  original_prediction jsonb,
  region_country text,
  image_path text,
  status text not null default 'pending_review',
  dedupe_key text
);
```

### 7.3 `rule_overrides`

```sql
create table rule_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  country text not null,
  municipality text,
  item_pattern text not null,
  material text,
  category text not null,
  handling_instruction text not null,
  source text not null,
  status text not null default 'draft'
);
```

### 7.4 `review_queue`

```sql
create table review_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  feedback_event_id uuid references feedback_events(id),
  priority integer not null default 0,
  assigned_to text,
  decision text,
  reviewer_note text,
  reviewed_at timestamptz
);
```

## 8. 規則與知識庫設計

分類結果不可完全依賴模型自由生成，需建立規則層來約束答案。

### 8.1 規則層級

- Global rules：共通規則，例如污染紙類不可直接作乾淨紙回收。
- Country rules：台灣 / 日本的國家級分類差異。
- Municipality rules：行政區細則，例如日本各市區的プラ、可燃、不燃差異。
- Runtime overrides：經審核後加入的規則修正。

### 8.2 規則格式

```json
{
  "country": "JP",
  "municipality": "Shinjuku",
  "match": {
    "item": ["cup_noodle", "paper_cup"],
    "material": ["coated_paper"],
    "contaminated": true
  },
  "result": {
    "category": "burnable",
    "instruction": "請倒除殘液後作為可燃垃圾處理",
    "warning": "受油污污染的紙容器不應混入乾淨紙類"
  }
}
```

## 9. 安全、隱私與合規

- 圖片上傳前在前端壓縮，限制尺寸與檔案大小。
- 預設移除 EXIF，避免保留不必要個資。
- GPS 精度可降採樣，例如只保存到城市或行政區，除非需要除錯。
- 使用 Supabase Storage signed URL，不公開原始圖片。
- DB 不保存使用者姓名、電話、帳號等不必要資訊。
- 所有 API 驗證 MIME type、大小、base64 長度與 schema。
- 對 LLM 輸出使用 JSON Schema validation，失敗則要求重試或回傳保守結果。

## 10. 失敗處理

- 定位失敗：顯示手動地區選擇。
- 相機失敗：提供圖片上傳。
- Vision API 失敗：允許重試，並提示可手動查詢。
- JSON 解析失敗：後端重試一次；仍失敗則回傳通用保守分類。
- SSE 中斷：前端顯示已收到回饋，並提供重新連線。
- DB 寫入失敗：記錄 server log，前端不應無限等待。

## 11. 測試策略

### 11.1 單元測試

- region resolver
- classification result schema validator
- rule router
- feedback payload validator
- SSE event formatter

### 11.2 整合測試

- `/api/classify` 成功與失敗流程
- `/api/feedback` 建立回饋紀錄
- `/api/feedback/stream` 正常串流與中斷
- Supabase mock / test database 寫入

### 11.3 E2E 測試

- 開啟相機後自動進入 Live Detect Mode。
- live frame 送出後顯示分類結果與 stable 狀態。
- 使用者按下確認拍攝後取得更新後的分類結果。
- 手動選地區並上傳圖片
- 顯示複合材質拆解結果
- 送出回饋並看到串流訊息
- 相機權限拒絕時可改用上傳

## 12. 分階段交付計畫

原則：先交付可部署、可操作、零額外付費的版本，再逐步打開需要外部用量或成本控管的能力。Vercel Hobby + 靜態規則 / mock provider 是第一個可上線目標；真實 Vision、Live Detect、Storage、SSE 都不得阻塞免費 MVP。

### Phase 0: 專案骨架

- 建立 Next.js + TypeScript 專案。
- 設定 lint、format、test。
- 建立基本 UI layout。
- 建立環境變數範本。
- 建立 mock classification fixture，確保沒有外部服務也能跑完整流程。

### Phase 1: 免費可部署 MVP

- 部署到 Vercel Hobby。
- 先以圖片上傳建立最小可用分類流程，降低 Vision 與 schema 整合風險。
- 手動選擇法規地區：台灣 / 日本。
- 顯示語言與法規地區分離，例如台灣使用者在日本旅遊時可用繁體中文查看日本規則。
- `/api/classify` 使用 mock provider 與靜態規則檔，不呼叫付費 Vision API。
- 顯示分類總結與部件清單。
- 杯麵、飲料杯、便當盒提供可示範的多部件拆解結果。
- 回饋送出後先回傳固定成功訊息；不做 SSE。
- 預設不保存圖片，避免 Storage 成本與隱私負擔。
- 基本錯誤處理。

#### Phase 1 實作細節

Scope:

- `app/page.tsx`：單頁工具，包含法規地區選擇、顯示語言選擇、圖片上傳、結果顯示與回饋表單。
- `app/api/classify/route.ts`：驗證 request，呼叫 mock provider，回傳固定 schema。
- `app/api/feedback/route.ts`：驗證 request，回傳固定成功訊息。
- `lib/rules/tw.json`、`lib/rules/jp.json`：先放杯麵、飲料杯、便當盒三種示範規則。
- `lib/vision/mockProvider.ts`：依檔名或固定 fallback 回傳示範分類結果；不做真實影像辨識。
- `lib/schemas/classification.ts`、`lib/schemas/feedback.ts`：集中定義 TypeScript types 與最小 runtime validation。

Out of scope:

- 相機、GPS、Live Detect。
- LangGraph。
- Supabase、Storage、RLS。
- SSE。
- 真實 Vision API。
- 管理後台與 review queue。

Phase 1 UI state:

- `idle`：尚未選圖。
- `ready`：已選圖，可送出分類。
- `classifying`：等待 `/api/classify`。
- `classified`：顯示結果。
- `feedbackSubmitting`：送出回饋中。
- `error`：顯示可重試錯誤。

Phase 1 API contract:

`POST /api/classify`

```json
{
  "image": {
    "mimeType": "image/jpeg",
    "base64": "..."
  },
  "capture": {
    "mode": "upload"
  },
  "regionHint": "tw",
  "locale": "zh-TW"
}
```

`POST /api/feedback`

```json
{
  "classificationRequestId": "cls_...",
  "reason": "wrong_category",
  "userCorrectLabel": "紙容器",
  "userNote": "這是紙杯，不是塑膠杯",
  "region": "TW"
}
```

Phase 1 validation:

- 圖片只接受 `image/jpeg`、`image/png`、`image/webp`。
- base64 長度設上限，避免 Vercel function payload 過大。
- `regionHint` 只接受 `tw` 或 `jp`。
- `locale` 預設 `zh-TW`，可與 `regionHint` 獨立設定。
- `reason` 只接受固定選項：`wrong_category`、`wrong_region_rule`、`missing_breakdown`、`unclear_instruction`。

Phase 1 done:

- 本地 `npm run lint` 通過。
- 本地 `npm run build` 通過。
- 上傳任一圖片可以得到 mock 分類結果。
- 不設定任何外部 API key 也能完整操作。
- 部署到 Vercel Hobby 後可完成同樣流程。

### Phase 2: 真實 Vision 與規則路由

- 使用 Gemini API Free Tier 與穩定版 `gemini-3.5-flash`；模型可由 `GEMINI_MODEL` 調整。
- 後端以原生 `fetch` 呼叫 Gemini `generateContent`，不增加 SDK 依賴，API key 只放在 Vercel server environment。
- Gemini 只負責辨識物品並回傳受 JSON Schema 限制的規則 key、顯示名稱與信心值；台灣 / 日本丟棄方式仍由本地規則檔決定。
- 初版規則 key 為 `cup_noodle`、`drink_cup`、`bento_box`；其餘回傳 `unknown` 並提示查詢當地規則，不讓模型自行生成法規。
- 單張照片可辨識最多 5 種垃圾，Gemini 以 `items[]` 回傳；每項分別套用本地規則並顯示自己的拆解部件。
- 相同已知規則 key 在後端合併顯示一次，不做數量統計；不同 `unknown` 項目保留，避免錯誤合併。
- Phase 2 不做 bounding boxes；需要指出物品位置或照片複雜度提升時再加入。
- 無 `GEMINI_API_KEY`、API 超額、逾時、回應格式錯誤時，自動使用 mock provider，確保免費額度耗盡後服務仍可操作。
- 上傳前需明確同意影像傳送至 Google，並告知 Gemini Free Tier 內容可能用於改善 Google 產品。
- 不在 Phase 2 建立付費 rate-limit storage；先依 Gemini 專案免費配額限制，收到 `429` 時使用 mock fallback。
- 不保存上傳影像，也不記錄 API key 或完整 Gemini response。

Phase 2 environment:

```bash
GEMINI_API_KEY=your_server_only_key
GEMINI_MODEL=gemini-3.5-flash
```

Phase 2 done:

- 有效 API key 時，圖片由 Gemini 辨識並套用所選法規地區的本地規則。
- 同張照片包含多種垃圾時，可在一次呼叫中回傳多項分類結果。
- 同一法規地區可獨立選擇繁體中文或日文。
- 未設定 key 或免費額度耗盡時，分類流程可自動 fallback。
- `npm run lint` 與 `npm run build` 通過。

### Phase 3: 相機、定位與即時偵測

- Upload Mode 繼續作為預設模式與相機失敗 fallback。
- 法規地區仍可手動選擇；GPS 只在使用者點擊後取得位置並詢問是否切換，不自動覆蓋選擇。
- GPS 僅以免付費的台灣 / 日本座標範圍提供國家層級建議，不宣稱辨識自治體或提供精確自治體法規。
- Live Detect Mode 使用 `MediaDevices.getUserMedia()`，後鏡頭優先，切換模式、分頁進入背景或元件卸載時停止 camera tracks。
- 自動 frame 最長邊 640px、JPEG quality 0.65；前一個 request 完成後至少等待 10 秒。
- 以 32 × 32 canvas 像素差判斷畫面變化；變化不足不呼叫 Gemini。
- 同時間只允許一個 classify request；法規地區或語系變更時取消 / 忽略舊結果。
- 每個 Live session 最多送出 12 次，達上限後停止相機，使用者可重新開始。
- stable result：第一個結果立即顯示；之後規則組合改變時需連續兩次一致才替換畫面。
- Capture Confirm Mode：使用者可手動送出最長邊 1280px、JPEG quality 0.85 的 frame，並計入 session 上限。
- Live Mode 開始前沿用 Gemini 影像傳送同意；撤回同意時立即停止。

Phase 3 done:

- 手動地區、GPS 建議、圖片上傳與 Live Mode 可獨立操作。
- 相機權限拒絕、裝置無相機或定位失敗時不阻塞 Upload Mode。
- 自動畫面未變化時不增加 Gemini 呼叫。
- `npm test`、`npm run lint` 與 `npm run build` 通過。

### Phase 4: 回饋與 SSE

- `supabase/schema.sql` 建立 `feedback` table，啟用 RLS，只授權 `service_role` 寫入。
- `/api/feedback` 以原生 Supabase REST 寫入資料，不增加 SDK；service role key 僅存在 server environment。
- 未設定 Supabase 時回傳 `stored: false` 並明確告知未持久化，Phase 1-3 操作不受阻塞。
- `/api/feedback/stream` 以短時 SSE 回傳接收、待審核與完成訊息。
- 前端使用 feedback drawer，透過 Fetch Streams 讀取 SSE 並逐字顯示。
- 只保存 classification request id、錯誤原因、使用者修正文字、備註、法規地區與時間。
- 不保存圖片、Gemini response、GPS 座標或 API key。
- Supabase Free project 可用於 MVP；專案閒置暫停時回饋寫入會顯示錯誤，不假裝成功。

Phase 4 environment:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_key
```

Phase 4 done:

- 未設定 Supabase 時，回饋流程與 SSE 可完整操作並顯示未持久化狀態。
- 設定 Supabase 並執行 schema 後，回饋可寫入資料表。
- SSE 中斷時不影響已完成的回饋寫入。
- `npm test`、`npm run lint` 與 `npm run build` 通過。

### Phase 5: 審核與知識庫

- feedback 新增 `rule_key`、辨識名稱、審核狀態、審核時間與 fingerprint。
- feedback drawer 可指定照片中的目標垃圾，讓多物件回饋可追溯至正確規則。
- fingerprint unique index 阻止相同 classification、規則、原因與修正內容重複保存。
- `feedback_review_queue` view 依地區、規則、原因與修正內容聚合；2 次為 medium、5 次為 high priority。
- `npm run review-feedback -- list` 在本機列出規則候選。
- `npm run review-feedback -- approve <feedback-id>` 或 `reject` 更新審核狀態。
- 不建立公開 admin endpoint；review CLI 使用 server-only service role key。
- `npm run rule-override -- <region> <rule-key> <field> <locale> <value>` 經人工審核後修改本地規則。
- rule override 僅允許 item / overall / summary 與 component 的 name / category / action / warning，不自動採用使用者回饋。

Phase 5 migration:

- 在 Supabase SQL Editor 重新執行 `supabase/schema.sql`。
- migration 完成前，feedback API 會提示 schema 過期，不會假裝已保存。

Phase 5 done:

- 重複回饋不會建立第二筆資料。
- review queue 可顯示聚合次數、priority、sample feedback id 與最後出現時間。
- approve / reject 僅能從本機 CLI 執行。
- 規則修改仍需人工執行並經 Git diff 審核。
- `npm test`、`npm run lint` 與 `npm run build` 通過。

### Phase 5 UI 易讀性調整

- component 規則新增結構化 `destination` enum，不再由 localized category 字串推測去向。
- 支援 `fallbackDestination` 與 `fallbackCondition`，清楚區分主要去向和條件式例外。
- 固定去向為 `recycle`、`general`、`food`、`drain`、`burnable`、`local_rule`。
- 結果區優先顯示垃圾名稱、主要去向、處理動作與例外；材質與 provider 移出主要視覺層級。
- 每種去向使用固定色彩並同時顯示文字，不只依賴顏色。
- confidence 只在低於 70% 時提示，避免百分比被誤解為法規正確率。
- 多垃圾結果提供項目索引，每個項目可直接開啟預選完成的 feedback drawer。
- 手機完成上傳分類後，結果區排在圖片前方。

### Phase 6: 強化與上線

- 分類、回饋與 SSE 使用 process-local IP rate limit；需要跨 instance 強一致限制時才導入共享儲存。
- API 以結構化 JSON log 記錄 provider、fallback、耗時與 request id，不記錄圖片、金鑰或完整模型回應。
- `npm run test:smoke` 以真實 HTTP 驗證首頁、安全標頭、分類 API 與 SSE。
- `docs/production-checklist.md` 覆蓋 Vercel、Supabase、成本告警、隱私與 rollback。
- feedback table 啟用 RLS；`feedback-images` 為 private、deny-by-default，尚未有使用者明確 opt-in 前不保存圖片。
- Gemini 失敗時保留 mock fallback；Vercel 結構化 log 用於觀察 fallback 比例。

Phase 6 done:

- `npm test`、`npm run lint`、`npm run build` 與 `npm run test:smoke` 通過。
- 超過 API 限制時回傳 `429`、`Retry-After` 與 RateLimit headers。
- Production 回應包含 frame、MIME sniffing、referrer 與 camera / geolocation 權限安全標頭。

## 13. 建議初版目錄

```text
ecolens-vision/
├── app/
│   ├── api/
│   │   ├── classify/route.ts
│   │   └── feedback/
│   │       ├── route.ts
│   │       └── stream/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── CameraCapture.tsx
│   ├── ClassificationResult.tsx
│   ├── FeedbackDrawer.tsx
│   └── RegionSelector.tsx
├── lib/
│   ├── agents/
│   │   ├── classifyGraph.ts
│   │   └── feedbackGraph.ts
│   ├── db/
│   │   └── supabase.ts
│   ├── rules/
│   │   ├── jp.json
│   │   ├── tw.json
│   │   └── router.ts
│   ├── schemas/
│   │   ├── classification.ts
│   │   └── feedback.ts
│   └── vision/
│       ├── provider.ts
│       └── mockProvider.ts
├── supabase/
│   └── migrations/
├── tests/
│   ├── unit/
│   └── e2e/
├── proposal.md
├── design-plan.md
└── package.json
```

## 14. 主要風險與決策

- 地方規則變動：規則要可資料化，不應寫死在 prompt。
- Vision 幻覺：所有輸出必須過 schema 與規則層校正。
- SSE 與 DB 耦合：使用者串流體驗不可阻塞資料寫入。
- 圖片隱私：預設最小化保存，必要時提供清除策略。
- 成本控制：圖片壓縮、rate limit、mock provider、本地測試 fixture 都要先設計。
- 台日規則粒度：MVP 先做國家級與少量示範行政區，避免一開始追求完整全國規則。

## 15. MVP 驗收標準

- 使用者能上傳一張圖片並取得台灣或日本分類結果。
- 杯麵、飲料杯、便當盒至少能輸出多部件拆解。
- 使用者能手動選擇台灣 / 日本。
- 錯誤回饋能送出並得到成功回應。
- 後端分類 response 皆符合 schema，前端不依賴自由文字解析。
- 專案可部署到 Vercel Hobby，且不需要付費 Vision API、Supabase Storage 或 LangGraph 即可完成示範流程。

## 16. V3 完整版驗收標準

- 使用者打開相機後，不需拍照或上傳即可看到低頻即時分類結果。
- 使用者能按下確認拍攝取得較高品質分類結果。
- 定位不可用時仍可手動選地區完成流程。
- 錯誤回饋能建立 DB 紀錄。
- 前端能接收 SSE 並顯示串流文字。
- 圖片保存、RLS、storage policy、成本監控與模型 fallback 已啟用。

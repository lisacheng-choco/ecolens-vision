# EcoLens PRD：可信在地垃圾處理助手

> 版本：1.0  
> 日期：2026-07-06  
> 狀態：MVP 完成後的產品與技術重整  
> 目標版本：單一城市／場域 pilot

## 1. 目的

將現有台日 AI 垃圾分類 MVP，收斂成可在真實住宿或居住場域驗證的產品。pilot 版優先解決答案可信度、地區適用性與成效量測，不擴張為完整垃圾資訊平台。

## 2. 目標使用者與使用情境

### 主要使用者

- 在日本住宿、共居、留學或短住的繁體中文使用者
- 不熟悉當地物品名稱與分類規則
- 手上已有待處理物品，希望在 30 秒內得到答案

### 主要客戶

- 青年旅館、民宿、服務式公寓、共居空間
- 國際宿舍、語言學校與大學
- 外籍住戶比例高的物業管理者

### 核心情境

1. 使用者掃描場域 QR code，直接帶入所在場域與城市。
2. 使用者選擇圖片或開啟相機拍攝 1–3 件垃圾。
3. 系統辨識物品與部件，依「場域 > 自治體 > 國家」規則輸出。
4. 結果先顯示去向、前處理、例外與可信來源。
5. 無法安全確認時，系統要求換角度拍攝、詢問場域人員或查詢官方規則。
6. 使用者標記答案是否有幫助；錯誤時可提交修正。
7. 回饋進入人工審核，不直接改動規則。

## 3. 成功標準

### pilot 產品指標

- 至少 3 個合作場域完成導入。
- 至少 100 次有效掃描，排除開發與內部測試流量。
- 可信處置完成率達 70% 以上。
- 已回答結果的「有幫助」比例達 80% 以上。
- 危險物 false-safe、無效引用、跨自治體規則外洩皆為 0。

以上是驗證目標，不是現況數據；pilot 後依真實基線調整。

### 技術指標

- 圖片分類 p95 小於 12 秒。
- 一般分類平均模型呼叫不超過 1.2 次。
- API 錯誤時有明確可重試訊息，不顯示空白結果。
- 不保存原始圖片、GPS 座標、API key 或完整模型回應。
- `npm test`、`npm run lint`、`npm run build`、`npm run test:smoke` 全數通過。

## 4. 現有 MVP 盤點

### 已完成且應沿用

| 能力 | repo 現況 |
| --- | --- |
| Web 體驗 | Next.js 16、React 19、單頁 mobile-friendly UI |
| 輸入 | JPEG／PNG／WebP 上傳；瀏覽器相機；低頻 live frame |
| 地區 | 台灣／日本手動選擇；GPS 僅建議國家；10 個台灣、6 個日本城市選項 |
| 語言 | UI 支援繁中、日文；API type 另保留英文 |
| 辨識 | Gemini 最多辨識 5 種垃圾；受 JSON Schema 與 rule key 限制 |
| 規則 | 11 個已知 rule key，加 `unknown`；台日 JSON 規則 |
| 結果 | 多物件、複合部件、主要去向、前處理、例外與低信心提示 |
| 保守處理 | 未支援或高風險物品回傳 `unresolved`，不由模型生成法規 |
| 知識 fallback | 可從台日研究文件取回內容並要求引用；預設關閉 |
| 回饋 | Supabase 可選持久化、去重、審核狀態、CLI review／override |
| SSE | 固定進度訊息；與回饋寫入分離 |
| 維運 | process-local rate limit、結構化 log、安全 headers、smoke/eval scripts |
| 隱私 | 上傳圖片傳送 Gemini，但不持久化；影像傳送前需使用者同意 |
| 測試 | 大阪規則測試已加入；golden dataset 目前只有 7 個 seed case |

### 必須修正的產品落差

1. **城市選擇可能製造假精準。** 在知識 fallback 關閉時，大部分答案仍來自國家級 JSON；城市名稱雖顯示在結果中，卻不一定改變處置規則。
2. **規則答案沒有顯示依據。** JSON 規則已有部分 `sourceIds`，但 `strategy: rule` 的 API 結果目前 `evidence` 為空。
3. **評估集不可作為 release gate。** 7 個 seed case 無法代表開放物品、危險物、污染與城市差異。
4. **缺乏產品成效事件。** 結構化 log 可診斷 API，但無法計算「有幫助」或場域層級的可信處置完成率。
5. **旅客情境與家戶規則不完全相同。** 目前知識主要回答家庭垃圾；住宿場域實際投放方式應由場域規則覆蓋。
6. **live mode 尚未證明價值。** 它增加模型成本、隱私說明與相機狀態複雜度；pilot 先以單次拍攝／上傳為主。

## 5. pilot 範圍

### In scope

- 一個日本城市與 3–5 個可驗證場域
- 繁中與日文
- 圖片上傳與單次相機拍攝
- 最多 5 個物品、已知 rule key 與保守 `unknown`
- 場域、自治體、國家三層規則
- 每個答案的來源、適用範圍與最後審核日期
- QR code 帶入場域
- 有幫助／沒幫助與現有錯誤回饋
- 匿名、無影像的 pilot 指標
- 人工審核與 code-reviewed 規則更新

### Out of scope

- 新增原生 App
- 登入、個人歷史與社群功能
- 自助式客戶後台
- 自動抓取政府網站並直接發布
- 自動採用使用者回饋
- 垃圾車位置、完整收運日曆、公共垃圾桶地圖
- 付款與方案管理
- bounding boxes、AR 疊圖與連續即時辨識優化
- LangGraph、多 Agent 或新的 AI SDK
- 保存回饋圖片

## 6. 功能需求

### FR-1：場域與地區上下文

- 場域 QR 使用一般 URL，例如 `/?site=<site-id>`。
- 有效 `site-id` 自動帶入國家、自治體、顯示名稱與規則包。
- 沒有 site 時維持目前手動國家／城市選擇。
- GPS 只提出切換建議，不保存座標、不覆蓋使用者選擇。
- 若該自治體沒有經審核的規則，UI 必須顯示「目前使用國家級原則」，不得只顯示城市名稱暗示精準適用。

驗收：

- 掃描指定 QR 後，不需再選城市即可開始。
- 修改 site、region、municipality 或 locale 時，舊請求與舊結果失效。
- 結果明確標示規則層級：場域／自治體／國家。

### FR-2：影像輸入與同意

- 保留 JPEG、PNG、WebP 與目前 4.5 MB base64 上限。
- 非 JPEG 由瀏覽器轉為 JPEG，避免 EXIF 與格式差異。
- 上傳或拍攝前必須同意將影像傳送至 Gemini。
- pilot 主流程為單次上傳或拍攝；live mode 標為實驗功能或暫時隱藏。
- UI 建議一次拍 1–3 件、光線充足、物品不要重疊。

驗收：

- 權限拒絕或無相機時仍可上傳。
- 取消同意時立即停止相機。
- 逾時、配額、格式與服務未設定都有可理解訊息。

### FR-3：受控物品辨識

- Gemini 只輸出 `ruleKey`、顯示名稱、信心、可見材質與風險。
- 每張圖片最多 5 種不同物品；相同已知 rule key 合併，不同 unknown 保留。
- 支援清單維持現有 11 個 key，新增 key 必須同時具備規則、來源與測試。
- 噴霧罐、瓦斯罐、化學品容器、破損／膨脹電池等未完整支援情境回傳 `unknown` 或專用危險規則，不得落入一般容器。

驗收：

- 模型輸出不符合 schema 時不傳到前端。
- 未知物品不包含具體處置部件。
- 低於 0.7 信心時提示重拍，不把信心值當成法規正確率。

### FR-4：分層規則解析

處置規則優先序：

1. `site`：場域實際垃圾桶與住客處理方式
2. `municipality`：地方政府分類規則
3. `country`：中央制度與共通原則
4. `unresolved`：沒有足夠證據時停止

最小實作採 repo 內 versioned JSON／Markdown，不建立 CMS。每項規則至少包含：

- `ruleKey`
- 適用範圍與層級
- localized item／component／action／warning
- structured destination
- source URL 或場域負責人確認紀錄
- `reviewedAt`

驗收：

- 高層級規則只覆蓋明確欄位，其餘沿用低層級安全原則。
- API 回傳實際採用的 scope 與 evidence。
- 找不到適用規則時保守 unresolved。

### FR-5：結果呈現

顯示順序固定為：

1. 物品名稱
2. 丟棄去向
3. 前處理動作
4. 條件式例外／警告
5. 適用地點、來源與最後審核日期
6. 模型與 request id 診斷資訊（收合）

多物件時保留項目索引；每個項目可獨立回饋。不能只用顏色表示目的地。

驗收：

- 使用者不展開診斷資訊，也能完成處置。
- rule 與 knowledge 答案都至少有一項可開啟的依據。
- 場域規則清楚標示為場域指引，不冒充政府法規。

### FR-6：成效與錯誤回饋

- 每個結果提供「有幫助／沒幫助」。
- 沒幫助可接續目前四種原因與文字修正。
- 回饋保留去重、pending／approved／rejected 與人工 CLI 審核。
- SSE 維持固定進度文字；不呼叫模型生成安撫文案。
- 建立最小匿名 outcome event，欄位限於：
  - request id
  - site／region／municipality
  - rule keys 與 strategies
  - latency、model calls
  - resolved／unresolved
  - helpful（若使用者選擇）
  - created_at
- 不保存圖片、原始 GPS、IP、完整 Gemini response 或可識別個資。

驗收：

- 可按 site 計算掃描量、可信處置完成率、unresolved 與回饋率。
- Supabase 不可用時，分類仍可使用，事件寫入失敗只記錄 server log。
- 相同回饋不建立重複紀錄。

## 7. 技術設計

### 7.1 沿用架構

```text
Browser
  ├─ site / region / locale
  ├─ upload or single capture
  ├─ actionable result
  └─ helpful / feedback

Next.js Route Handlers
  ├─ POST /api/classify
  │    ├─ validate
  │    ├─ Gemini observation
  │    ├─ site > municipality > country resolver
  │    └─ safe normalized result
  ├─ POST /api/feedback
  └─ GET /api/feedback/stream

Versioned content
  ├─ item and disposal rules
  ├─ site rule packs
  └─ official source registry

Supabase
  ├─ feedback
  └─ anonymous outcome events
```

維持原生 `fetch`、本地 JSON、Node test runner 與 Supabase REST；不新增 SDK、狀態管理套件或 Agent framework。

### 7.2 分類資料流

1. Client 正規化圖片、取得同意、送出 context。
2. API 驗證 MIME、大小、capture mode、region、municipality 與 site。
3. Gemini 只觀察物品，回傳受控 schema。
4. 後端對每個 item 解析最高可用規則層級。
5. 規則與來源 validator 檢查 destination、scope、evidence。
6. 無法通過時降級成 unresolved。
7. 回傳結果並寫入匿名 outcome event。

### 7.3 建議的 response 增量

在現有 `ClassificationItemResult` 增加：

```ts
rule: {
  scope: "site" | "municipality" | "country";
  scopeLabel: string;
  reviewedAt: string;
}
```

沿用現有 `evidence[]`，讓 `rule` 與 `knowledge` strategy 使用同一種來源呈現。場域來源可以是場域指引頁，不必偽造成政府 URL。

### 7.4 知識 fallback

`CLASSIFICATION_KNOWLEDGE_FALLBACK` 維持預設 `false`。只有在擴充後的 golden dataset 同時通過下列 gate 才可對 pilot 開啟：

- 0 hazardous false-safe
- 0 unsupported assertive answer
- 0 invalid evidence
- 0 municipality leakage
- test split 未參與 prompt 或規則調整

即使開啟，知識 fallback 也只能引用提供的 chunk；解析失敗時回到 unresolved。

### 7.5 Rate limit 與成本

- 沿用 classify 20/min、feedback 10/min、SSE 30/min。
- pilot 使用目前 process-local limiter 即可。
- 只有發生跨 instance 濫用或帳單風險時，才導入共享 rate-limit store。
- 單次拍攝優先；live mode 不作預設入口。
- Google Cloud 設定 provider-side quota 與 billing alert。

## 8. 安全、隱私與可用性

- API key 與 Supabase service role 只存在 server environment。
- 圖片不得寫入 log、DB 或 Storage。
- 不保存精確 GPS；場域與自治體已足夠解析規則。
- 外部內容不得覆蓋 system prompt；影像中的文字視為資料，不視為指令。
- 危險物規則需人工審核與專用測試。
- 所有來源需記錄最後審核日期；過期規則降級或提示再次確認。
- 保留 RLS、private bucket、deny-by-default 與安全 headers。
- 互動元件需可鍵盤操作、有文字 label；狀態與 destination 不只依賴顏色。

## 9. 測試與發布

### 現況

- 大阪 POC 規則測試已納入 unit/script test。
- TypeScript `tsc --noEmit` 已通過。
- golden dataset 為 7 個 seed case，不可宣稱準確率或 release-ready。

### pilot 前最低測試集

沿用 `docs/golden-dataset.md` 的既有目標：

- Vision：至少 40 張，涵蓋已知規則、unknown、多物件、混合材質與危險物。
- Policy：至少 60 個人工審核的 item/location case。
- E2E：至少 30 個代表性 image/location case。

每次 release：

1. `npm test`
2. `npm run lint`
3. `npm run build`
4. staging `npm run test:smoke`
5. baseline 與 candidate eval 比較
6. 人工抽查 pilot 城市的來源與 UI
7. 部署後再跑 production smoke test

## 10. Rollout

1. 內部：只開啟一個場域設定，確認資料與事件。
2. Friendly pilot：1 個場域、工作人員可直接回報。
3. Limited pilot：3–5 個場域，QR 導流，維持同一城市。
4. Paid pilot：只有在可信處置完成率與 helpful 達標後測試收費。
5. 第二城市：只有在第一城市可用相同流程維護與交付時擴張。

## 11. 主要風險與對策

| 風險 | 對策 |
| --- | --- |
| 城市 UI 暗示不存在的精準度 | 顯示實際規則 scope；無地方資料時只顯示國家級 |
| Gemini 認錯物品 | 受控 key、低信心提示、unknown、單次重拍 |
| 地方規則變更 | source、reviewedAt、定期人工複查 |
| 場域規則與政府規則衝突 | 分開標示；場域回答「在這裡怎麼投放」，官方來源回答制度 |
| 旅客沒有持續使用需求 | 由合作場域 QR 分發，不依賴 App 留存 |
| AI 功能容易被複製 | 累積規則、評估集、內容維運與通路，而非自建模型 |
| 模型成本不可控 | 單次拍攝、frame 限制、quota、rate limit、模型呼叫指標 |
| 回饋被惡意或錯誤內容污染 | 去重、人工審核、Git diff、禁止自動上線 |

## 12. 開放決策

pilot 開始前只需要決定三件事：

1. 第一個城市已決定為大阪市；POC 先驗證家戶垃圾情境，再以結果接觸 3 個場域。
2. 第一批使用者是否鎖定繁中；若合作場域明確要求，再加入英文。
3. 場域最在意的成本是客服詢問、清潔重分、住客體驗還是永續揭露；這會決定付費訊息與成效報告。

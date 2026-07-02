# EcoLens: 台日雙區 AI 智慧垃圾分類系統 (V3)
**系統設計與全端架構提案書 — 終極整合：雙引擎路由 ＋ Multi-Agents 回饋串流進化機制**

## 1. 專案概述 (Project Overview - V3 Ultimate)
本專案 **EcoLens** 是一款跨國級 AI 智慧垃圾分類 Web App，致力於解決觀光客與在地居民面對複雜垃圾分類（如台灣專用袋與日本細緻材質拆解）的痛點。

V3 終極版在原有「雙引擎地理結界」與「跨國環保文化圖鑑」的基礎上，正式導入了 **Multi-AI-Agents (多智能體) 回饋糾錯系統**。系統不僅能辨識複雜材質（如油膩杯麵的精準拆解），還能在用戶指正錯誤時，透過 LangGraph 節點分發任務：一邊透過 SSE (Server-Sent Events) 即時流式安撫用戶，一邊在背景默默將錯誤資料寫入資料庫 (DB)，讓系統具備自我進化的能力。

## 2. V3 系統總體架構 (System Architecture with Feedback Loop)

| 系統元件 | 技術實現 | 核心職責說明 |
| :--- | :--- | :--- |
| **前端體驗層** | Next.js / Vanilla JS<br>＋ SVG 畫布 ＋ SSE 接收端 | 相機畫面疊加 AR 標籤。當用戶點擊「回饋錯誤」時，介面轉換為對話框，接收並如打字機般顯示客服 Agent 的串流安撫文字。 |
| **智慧分流中樞** | Vercel Serverless Functions | 靜默判定 GPS 經緯度，將圖片分發給台灣或日本規則的 Vision Agent 進行推理與 JSON 結構化輸出。 |
| **回饋收集網 (Multi-Agents)** | LangGraph + Vercel Edge Runtime | 接收用戶糾錯訊號。將任務分叉為：[節點 A] 即時生成對話文字；[節點 B] 萃取圖片與正解存檔。 |
| **雲端資料庫 (DB)** | Supabase / Firebase | 儲存用戶回饋的「錯題本」（包含：原圖片、AI 誤判結果、用戶正解、GPS 定位），作為未來優化知識庫的基底。 |

## 3. 核心功能技術工作流：杯麵大魔王與回饋機制

### 3.1 材質解構與防呆避雷針 (以杯麵為例)
當相機對準複合材質（如未清洗的杯麵）時，系統不會給出單一「紙類」答案，而是輸出多節點 JSON：
* **殘留湯汁：** 標示為「廚餘/可燃垃圾」，提示必須先倒除。
* **油膩杯身：** 觸發防呆警告：「🚨注意！受污染紙杯不可丟一般紙類」，在日本標示為「可燃垃圾」，在台灣標示為「紙容器」。
* **塑膠封膜：** 標示為「一般垃圾」或日本的「プラ」。

### 3.2 Multi-Agents 串流回饋機制 (SSE Streaming Envoy)
若 AI 判斷錯誤（例如把紙杯錯認為塑膠杯），用戶點擊介面上的「報錯」按鈕並輸入正解，將觸發以下並行流程：

> **🔄 LangGraph 狀態分支平行處理：**
> * **Agent 1 (客服安撫特派員 - 前台)：** 透過 Vercel Edge Functions 建立 SSE 連線。AI 立刻串流產出溫暖的對話：「太感謝你了！原來這個杯麵的材質在新宿區有特殊規定，我已經做筆記了...」，前端以打字機效果即時顯示，零卡頓感。
> * **Agent 2 (記錄建檔專員 - 後台)：** 在背景默默將 `imageBase64`、`error_label`、`user_correct_label` 以及 `region` 打包，透過 API 安穩地寫入 Supabase 資料庫，不影響前端 UI 的流暢度。

## 4. 擴充目錄結構與資料庫 Schema 設計

### 4.1 GitHub Repo 目錄結構 (新增回饋模組)
```text
ecolens/
├── api/
│   ├── classify.js        # 核心分流大腦 (處理影像、台日切換)
│   └── feedback.js        # Vercel Edge Function: 處理 SSE 串流安撫與呼叫 DB
├── db/
│   └── supabaseClient.js  # 資料庫連線設定
├── src/
│   ├── index.html         # 前端相機與 AR 畫布
│   ├── app.js             # 前端邏輯 (呼叫相機、解析 JSON)
│   └── feedbackUI.js      # 接收 SSE 串流文字的打字機效果組件
└── package.json
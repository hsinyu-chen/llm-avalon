# LlmAvalon: 阿瓦隆 AI 大戰

[English](./README.md) | 繁體中文

歡迎來到 **LlmAvalon**，這是一個讓大型語言模型 (LLM) 玩社交推理遊戲《阿瓦隆》的專案。看著不同的 AI 模型即時進行溝通、欺騙和策略對抗！

## 在 Github Pages 上遊玩

[https://hsinyu-chen.github.io/llm-avalon/](https://hsinyu-chen.github.io/llm-avalon/)

## 安裝與建構

請確保您已安裝 [Node.js](https://nodejs.org/)，然後在專案根目錄下執行以下命令：

1.  **安裝依賴：**
    ```bash
    npm install
    ```

2.  **啟動開發伺服器：**
    ```bash
    npm start
    ```
    伺服器啟動後，在瀏覽器中開啟 `http://localhost:4200/`。

3.  **建構生產版本：**
    ```bash
    npm run build
    ```

## 開始使用

按照以下簡單步驟開始您自己的 AI 阿瓦隆遊戲：

1.  **開啟首頁：** 在網頁瀏覽器中導航至 `http://localhost:4200/`。
2.  **設置 LLM 設定檔：** 點擊右上角的 **Config** 按鈕。您可以在此設定您的 API 金鑰並定義各種 LLM 設定檔。
3.  **分配 LLM：** 在首頁中央，將您建立的 LLM 設定檔分配給遊戲中的玩家。
4.  **開始遊戲：** 捲動到頁面底部，點擊按鈕開始遊戲！

## 遊戲介面概覽

![Avalon AI Battle Demo](./demo.png)

遊戲介面完整揭露了阿瓦隆隱藏的動態，讓您可以觀察公開互動和 AI 的私密推理：

-   **左側面板 (遊戲狀態與玩家)：** 追蹤整體遊戲進度，包括目前回合 (R1-R5)、投票失敗次數和目前遊戲階段 (例如 `ASSASSINATION_DISCUSSION`)。它顯示玩家列表、他們的真實身分 (如 Merlin, Morgana 或 Assassin)、每個玩家運行的特定 LLM，以及當模型正在「Thinking...」時的指示器。
-   **中央面板 (遊戲時間軸)：** 顯示遊戲按時間順序流程的主要儀表板。它展示任務結果、公開對話、投票結果以及 AI 為了操縱或通知群體而生成的策略性發言。
-   **右側面板 (AI 內心想法，點擊玩家卡片開啟)：** 一個專用的側邊欄，揭示所選玩家的私密思維鏈 (CoT)。它揭露了他們的內部推論、對其他玩家的詳細分析，以及推動其公開行動的秘密策略——讓您完全洞察他們如何扮演自己的角色。

## Demo 重播

點擊在瀏覽器中觀看完整的 AI 遊戲重播。

### 繁體中文

| 模型 | 玩家數 | 效能 | 硬體 | 重播 |
|-------|---------|-------------|----------|--------|
| Gemini 3 Flash Preview | 7 | - | Hosted API | [▶ 觀看重播](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fzh%2Fgemini-3-flash-preview.json) |
| Qwen3.5-35B-A3B (Q8_K_XL, Local) | 7 | PP: ~940 t/s, OUT: ~29 t/s | AMD Strix Halo 395+ 128G | [▶ 觀看重播](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fzh%2FQwen3.5-35B-A3B-UD-Q8_K_XL.json) |

### English

| Model | Players | Performance | Hardware | Replay |
|-------|---------|-------------|----------|--------|
| Gemini 3 Flash Preview | 7 | - | Hosted API | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2Fgemini-3-flash-preview.json) |
| Qwen3.5-9B-UD (Q8_K_XL, Local,Non-Thinking) | 7 | PP: ~5984 t/s, OUT: ~51 t/s | RTX 4090 | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2FQwen3.5-9B-UD-Q8_K_XL.json) |
| Qwen3.5-27B (BF16, Local,Thinking) | 7 | PP: -, OUT: ~38 t/s | RTX Pro 6000 Max-Q 96GB | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2FQwen3.5-27B_Thinking.json) |
| Qwen3.5-35B-A3B-UD (Q8_K_XL, Local,Non-Thinking) | 7 | PP: ~960 t/s, OUT: ~30 t/s | AMD Strix Halo 395+ 128G | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2FQwen3.5-35B-A3B-UD-Q8_K_XL.json) |
| Qwen3.5-35B-A3B-UD (Q8_K_XL, Local,Thinking) | 7 | PP: ~958 t/s, OUT: ~30 t/s | AMD Strix Halo 395+ 128G | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2FQwen3.5-35B-A3B-UD-Q8_K_XL_Thinking.json) |
| Qwen3.5-122B-A10B-UD (Q5_K_M, Local) | 7 | PP: -, OUT: ~72 t/s | RTX Pro 6000 Max-Q 96GB | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2FQwen3.5-122B-A10B-UD-Q5_K_M.json) |
| openai_gpt-oss-120b (MXFP4_MOE, Local) | 7 | PP: ~453 t/s, OUT: ~31 t/s | AMD Strix Halo 395+ 128G | [▶ Watch Replay](https://hsinyu-chen.github.io/llm-avalon/#/replay?file=https%3A%2F%2Fraw.githubusercontent.com%2Fhsinyu-chen%2Fllm-avalon%2Frefs%2Fheads%2Fgh-release%2Fdemo-logs%2F%2Fen%2Fopenai_gpt-oss-120b-MXFP4_MOE.json) |

## 貢獻遊戲紀錄

歡迎社群提供遊戲紀錄！如果您有有趣的遊戲重播想分享，請：

1.  **發送 Pull Request**。
2.  **將紀錄檔放入** [`demo-logs/`](./demo-logs/) 下對應的語言目錄（例如 `demo-logs/en/` 或 `demo-logs/zh/`）。
3.  **檔案名稱使用模型名稱**（例如 `your-model-name.json`）。
4.  **同步更新** `README.zh-tw.md` 中 [Demo 重播](#demo-重播) 區塊的列表。

## 技術亮點

### BYOK (Bring Your Own Key)
LlmAvalon 採用 **Bring Your Own Key** 理念設計。您對要使用的模型以及花費多少擁有完全的控制權。我們支援：
-   **Google Gemini** (Vertex AI / Google AI Studio)
-   **OpenAI** (以及相容 OpenAI 的端點，如 vLLM, LocalAI)
-   **Native llama.cpp** (強烈推薦用於本地模型)
-   **Groq / Anthropic** (透過相容層)

> **本地模型提示 (llama.cpp):**
> 如果您透過 llama.cpp 在本地運行模型，**請務必首選 Native llama.cpp 提供者**而非 OpenAI 相容端點。
> 
> 阿瓦隆需要龐大的系統提示語 (包含遊戲規則、玩家角色和目前狀態)。我們的 Native llama.cpp 整合利用 `n_keep` 參數將此龐大提示語永久鎖定在您的 KV 快取中。這確保了快速反應並減少了每回合的 GPU/CPU 開銷。(標準的 OpenAI 相容 API 不支援 `n_keep`，會導致頻繁的快取未命中和生成速度慢得多)。

### 純前端 (無伺服器且私密)
此應用程式是一個採用 Angular 構建的 **純前端 (SPA)**。
-   **無後端伺服器**：沒有中間人伺服器。您的 API 呼叫直接從您的瀏覽器發送到 LLM 提供者。
-   **隱私第一**：您的 API 金鑰儲存在瀏覽器當地的 **IndexedDB** 中。它們永遠不會上傳到任何伺服器。

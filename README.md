# TE-NOTER 🎓 | 極致高密度簡報大抄排版器

> **150~200 頁簡報極限微縮 ‧ 考試紙本大抄最佳化 ‧ 100% 瀏覽器本地端隱私**

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform: GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-success.svg)
![Tech: Pure HTML+CSS+JS](https://img.shields.io/badge/Tech-Vanilla%20JS%20%7C%20HTML5%20%7C%20CSS3-orange.svg)

---

## 💡 為什麼需要 TE-NOTER？

許多大學與研究所考試允許帶「紙本大抄」（Cheat Sheet / Open Book Notes），然而教授每單元的簡報動輒 **150～200 頁**：
1. **影印費昂貴**：一般每面印 4～6 頁投影片，一本講義印下來需要 30～50 張紙，雙面依然厚重且花費高昂。
2. **翻找極難**：考試時間分秒必爭，紙張太多根本翻不到考題在第幾張。
3. **資訊密度過低**：傳統簡報轉印邊界浪費過多白邊，字體微縮比例不當。

**TE-NOTER** 專門為極限省紙與考場高速查閱而生：
- **直式 A4 印 4:3 簡報**：直向 3 欄 × 6 列 = **單面 18 張**（雙面 36 張，經典黃金密度）。
- **直式 A4 印 16:9 簡報**：直向 3 欄 × 7 列 = **單面 21 張**（雙面 42 張，垂直上下空間完美吃滿，省紙與閱讀兼顧的最佳解！）。

---

## 📋 六步驟問卷嚮導流程 (Step-by-Step Wizard)

系統仿照問卷引導體驗，右側具備動態進度條，依序帶您完成極限大抄：
1. **步驟 1：匯入檔案** — 拖放 150～200+ 頁簡報 PDF，100% 瀏覽器本地解析，零資料外傳。
2. **步驟 2：預覽自動排版** — 依比例自動適配（4:3 套用直式 3×6，16:9 套用直式 3×7），一鍵剔除無用封面與過場頁。
3. **步驟 3：AI 英文單字表** — 自動萃取專有名詞與縮寫，或複製專屬 Prompt 請外部 AI 翻譯，生成末頁單字速查清單。
4. **步驟 4：逐頁考點查表** — 依投影片標題與核心公式建立速查目錄，考試秒翻定位頁碼。
5. **步驟 5：外部筆記整合** — 貼入已請 ChatGPT/Claude 整理好的考前精華筆記，自動排版為 3 欄式微縮印刷頁。
6. **步驟 6：最終成果與導出** — 全覽整合後之完整 A4 大抄，提供一鍵列印與 PDF 另存按鈕（⌘P / Ctrl+P）。

---

## 📐 直式 A4 自動排版規格表

以標準直式 A4 紙張（$210 \times 297\text{ mm}$）為基準，系統全自動辨識就近分類套用：

| 辨識分類 | 判定標準 | 自動套用直向網格 | 單面張數 | 單張尺寸 (約) | 排版特色 |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **4:3 傳統簡報** | 比例接近 $1.33$ | **直向 3 欄 × 6 列** ⭐ | **18 張** | $65.7 \times 49.3\text{ mm}$ | **4:3 黃金密度**：文字圖表極度清晰好讀 |
| **16:9 寬螢幕** | 比例接近 $1.78$ | **直向 3 欄 × 7 列** ⭐ | **21 張** | $64.0 \times 36.0\text{ mm}$ | **16:9 最強實測解**：垂直上下完美填滿無多餘白邊 |
| **特殊/自訂比例** | 比對與 4:3 及 16:9 之絕對距離 | **自動就近歸類為 3×6 或 3×7** | 18 或 21 張 | 自適應等比微縮 | 零手動繁瑣設定，匯入即秒速排版完成 |

---

## 🛠️ 本地開發與使用

此專案為純靜態架構，無須安裝 Node.js 或建置編譯工具：

1. **複製本儲存庫**：
   ```bash
   git clone https://github.com/your-username/TE-NOTER.git
   cd TE-NOTER
   ```
2. **在本地啟動預覽**：
   - 使用 VS Code 的 **Live Server** 擴充套件，右鍵點擊 `index.html` 選擇 `Open with Live Server`。
   - 或使用 Python 內建輕量伺服器：
     ```bash
     python3 -m http.server 8080
     ```
   - 瀏覽器開啟 `http://localhost:8080` 即可開始使用！

---

## 🌐 部署至 GitHub Pages（一鍵開源上線）

1. 將本專案推送至您的 GitHub Repository：
   ```bash
   git init
   git add .
   git commit -m "feat: 初版發布 TE-NOTER 極致大抄排版器"
   git branch -M main
   git remote add origin https://github.com/<您的帳號>/TE-NOTER.git
   git push -u origin main
   ```
2. 進入 GitHub 倉庫的 **Settings** -> **Pages**。
3. 在 **Build and deployment** 下方的 **Branch** 選擇 `main` 分支與根目錄 `/ (root)`，點擊 **Save**。
4. 稍等 1~2 分鐘，即可透過 `https://<您的帳號>.github.io/TE-NOTER/` 隨時隨地免費使用！

---

## 📄 授權條款 (License)

本專案採用 [MIT License](LICENSE) 開源授權，歡迎自由修改、分享或貢獻程式碼！

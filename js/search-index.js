/**
 * TE-NOTER - 專有名詞單字萃取、逐頁考點摘要與全文檢索引擎 (search-index.js)
 * 支援本機智慧英文專有名詞提取、逐頁重點擷取、外部 AI Prompt 生成與末頁附錄排版
 */

export class SearchIndexEngine {
  constructor() {
    this.cachedIndex = new Map(); // keyword -> Set of slide numbers
  }

  /**
   * 建立全文檢索與關鍵字索引樹
   */
  buildIndex(slides) {
    this.cachedIndex.clear();
    
    // 常見無實質意義之停用詞
    const stopWords = new Set([
      'the', 'is', 'at', 'which', 'on', 'in', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'with',
      'this', 'that', 'from', 'by', 'as', 'are', 'be', 'we', 'you', 'it', 'can', 'has', 'have',
      'not', 'all', 'any', 'but', 'how', 'when', 'where', 'who', 'why', 'then', 'into', 'each',
      '的', '了', '和', '與', '在', '是', '為', '及', '等', '之', '將', '以', '對', '於', '上', '個'
    ]);

    slides.forEach(slide => {
      if (!slide.text) return;

      // 提取英文專有名詞、大寫縮寫 (如 TCP, BFS, FIFO, RSA, O(n)) 及中文詞彙 (2~5 字)
      const tokens = slide.text.match(/[A-Za-z0-9_+-]{2,}|\b[A-Z]{2,}\b|[\u4e00-\u9fa5]{2,5}/g) || [];
      
      tokens.forEach(token => {
        const cleanToken = token.trim();
        const lowerToken = cleanToken.toLowerCase();
        
        if (stopWords.has(lowerToken) || cleanToken.length < 2) return;
        if (/^\d+$/.test(cleanToken)) return;

        if (!this.cachedIndex.has(cleanToken)) {
          this.cachedIndex.set(cleanToken, new Set());
        }
        this.cachedIndex.get(cleanToken).add(slide.originalIndex);
      });
    });

    return this.cachedIndex;
  }

  /**
   * 從投影片文字中自動萃取「核心英文專有名詞與縮寫單字」
   */
  extractVocabulary(slides, maxTerms = 60) {
    const vocabMap = new Map(); // term -> { count, pages: Set }

    slides.forEach(slide => {
      if (!slide.text || slide.excluded) return;

      // 優先匹配大寫縮寫 (如 TCP, UDP, CPU, RAM, FIFO, LRU, BST, RSA) 與首字大寫英文名詞
      const acronyms = slide.text.match(/\b[A-Z]{2,6}\b/g) || [];
      const titleWords = slide.text.match(/\b[A-Z][a-z]{2,15}\b/g) || [];

      [...acronyms, ...titleWords].forEach(word => {
        const w = word.trim();
        // 排除一般常見單字
        const commonWords = new Set(['Chapter', 'Slide', 'Page', 'Introduction', 'Summary', 'Example', 'Overview', 'Part', 'Section', 'Figure', 'Table', 'Lecture', 'Notes']);
        if (commonWords.has(w) || w.length < 2) return;

        if (!vocabMap.has(w)) {
          vocabMap.set(w, { term: w, count: 0, pages: new Set() });
        }
        const item = vocabMap.get(w);
        item.count += 1;
        item.pages.add(slide.originalIndex);
      });
    });

    // 依專有名詞特性排序後取前 maxTerms 筆，再依英文字母 A ~ Z 排序
    const sorted = Array.from(vocabMap.values())
      .filter(item => item.pages.size >= 1 && item.pages.size <= 15)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxTerms);

    return sorted.map(item => ({
      term: item.term,
      pages: Array.from(item.pages).sort((a, b) => a - b)
    })).sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base', numeric: true }));
  }

  /**
   * 從每一頁投影片中擷取標題與核心考點
   */
  extractSlideKeyPoints(slides) {
    return slides.map(slide => {
      if (!slide.text) {
        return { slideNum: slide.originalIndex, title: '(無文字頁面)', isExcluded: slide.excluded };
      }

      // 抓取第一行文字或前 100 字作為標題摘要 (保留完整文字供多行折行換行)
      const cleanText = slide.text.replace(/\s+/g, ' ').trim();
      const firstLine = cleanText.split(/[\n]/)[0] || cleanText.substring(0, 80);
      const title = firstLine.trim();

      return {
        slideNum: slide.originalIndex,
        title: title || `Slide #${slide.originalIndex}`,
        isExcluded: slide.excluded
      };
    });
  }

  /**
   * 產生給外部大模型 (ChatGPT / Claude / Gemini) 的全簡報深度分析 Prompt
   * 自帶整份簡報所有文字，讓外部 AI 自主研讀脈絡、深度挖掘專業名詞(英美對照)與逐頁核心考點
   * @param {Array} slides 活躍投影片列表 [{ originalIndex, text }]
   */
  /**
   * 產生給外部大模型 (ChatGPT / Claude / Gemini) 的全簡報深度分析 Prompt
   * 自帶整份簡報所有文字，請外部 AI 自主挖掘簡報中真實出現之英文字(純中英對照，無名詞解釋)與逐頁核心考點
   * @param {Array} slides 活躍投影片列表 [{ originalIndex, text }]
   */
  generateFullSlidesAIPrompt(slides) {
    if (!slides || slides.length === 0) return '';

    const slidesContent = slides.map(s => {
      const text = (s.text || '').replace(/\s+/g, ' ').trim();
      return `【第 ${s.originalIndex} 頁】\n${text || '(此頁為無文字圖表/封面)'}`;
    }).join('\n\n');

    return `你是一位資深學術考試大抄整理專家。以下是本次考試的完整簡報課堂內文（共 ${slides.length} 頁）。
請仔細研讀全文，完成以下兩大核心任務：

【任務一：考前專用中英對照單字表（不用名詞解釋）】
1. 嚴格限定：必須是簡報內文中「實際出現過」的英文專有名詞、詞彙、縮寫或關鍵術語（請勿自行聯想簡報中根本沒出現過的生字！）。
2. 純粹中英對照：只需要精確的「英文詞彙 ↔ 繁體中文翻譯」，絕不要長篇大論的名詞解釋、概念說明或考點句子！
3. 英美標記原則：只有當簡報內文「同時出現/並列英式與美式兩種用法」時（例如簡報原文寫 Railway (Railroad) 或 Carriage / Car），才需要標記 [英] 與 [美]；若簡報只有單一英文，就直接給出該詞的中英對照即可，絕不要自行硬湊未出現的用法！

【任務二：高效率章節速查與關鍵考點目錄 (不用逐頁輸出！)】
請勿為每一頁都輸出流水帳！請依據內容脈絡提煉兩類重點（整份簡報約 25~45 筆即可，方便考場秒翻定位）：
1. 主題章節跨度（大綱骨架）：標註主題所涵蓋的頁碼範圍（例如 1-8、9-23）。
2. 核心必考精確頁（亮點標記）：標記含有「核心公式推導」、「觀念對照表/比較」、「關鍵流程圖/架構圖」或「必背定理定義」的精確單一頁碼，並在開頭加上 [公式]、[比較]、[圖解]、[必考] 等標籤。

【輸出格式規範 (請嚴格遵守以下格式，方便一鍵貼回系統自動匯入)】
請務必分成 [VOCAB] 與 [KEYPOINTS] 兩大區塊，一行一筆，欄位間以 | 隔開，請勿輸出額外的開頭寒暄、結尾問候或 Markdown 標題代碼塊：

[VOCAB]
英文詞彙 | 繁體中文
範例：
TCP | 傳輸控制協定
Turnout | 道岔
Interlocking | 聯鎖
Railway [英] / Railroad [美] | 鐵路 (僅在簡報同時出現兩者時才標記)

[KEYPOINTS]
頁碼或區間 | 核心章節主題或考點標題
範例：
1-8 | 軌道結構四大元件（鋼軌、軌枕、道碴、路基）功能與承載力比較
9-21 | 鋼軌規格、受力破壞與波浪磨耗機制
14 | [公式] 鋼軌熱應力與無縫軌道伸縮計算式
22-35 | 道岔構造、幾何線形與轉轍器動作原理
29 | [比較] 繼電聯鎖 vs 電腦聯鎖優缺點對照表
42 | [圖解] 閉塞分區軌道電路動作狀態與號誌時序圖

==================================================
【以下為簡報完整內文】
==================================================
${slidesContent}`;
  }

  /**
   * 產生給外部大模型 (ChatGPT / Claude / Gemini) 的終極期末考大抄整理 Prompt
   * 專供使用者複製後，連同簡報檔案 (PDF/PPT) 一同上傳給 AI 進行全方位深度解析
   */
  generateNotesAIPrompt() {
    return this.getNotesPromptTemplate();
  }

  /**
   * 取得通用終極大抄 Prompt（專為搭配簡報附件設計）
   */
  getNotesPromptTemplate() {
    return `你是一位具備多年命題經驗的大學教授與頂級應試學霸。請仔細研讀我所上傳的簡報教材檔案，製作一份專門用於期末考試帶入考場的【極限高密度、終極紙本大抄 (Cheat Sheet)】。

【大抄核心目標】
這份大抄將被排版在 A4 紙本末頁附錄（採用 3 欄緊湊印刷），每一毫米空間都至關重要。
請「去蕪存菁、杜絕任何廢話」，只保留最硬核、最容易考、最容易遺忘、最常設陷阱的關鍵內容！

【內容四大維度規範（請依章節主題結構化輸出）】
1. 📌【核心定義與前提條件 (Definitions & Preconditions)】
   - 拒絕冗長描述，用一句話點破核心本質。
   - 務必特別標註「定理或公式成立的前提假設、適用邊界與限制條件」（考題最愛出的扣分陷阱！）。

2. 📐【重要公式矩陣與解題速記 (Formula Matrix & Shortcuts)】
   - 必須使用標準嚴謹的 LaTeX 語法（行內公式用 \`$公式$\`，獨立大公式用 \`$$公式$$\`）。
   - 標明各變數物理/數學意義、單位或常用經驗常數。
   - 附上推導極限結論、化簡速算公式或解題 SOP 步驟。

3. ⚖️【關鍵性質與對比矩陣 (Comparison Matrices)】
   - 對於容易混淆的概念、演算法、協定或架構，請使用「緊湊 Markdown 表格」進行兩兩對比（包含：核心指標、優點、缺點、時間/空間複雜度、適用場景）。

4. ⚠️【考點地雷與避坑指南 (Exam Traps & Exceptions)】
   - 標記考試最常被扣分的細節、反例（Counterexamples）、極端特例（Edge Cases）與常見計算盲區。

【排版格式硬性要求】
- 格式：嚴格採用標準 GitHub Markdown 語法（## 章節主題、- **關鍵詞**：緊湊說明、| 表格 |）。
- 數學公式：公式務必使用 LaTeX（例如 \`$O(n \\log n)$\`、\`$\\int f(x)dx$\`），嚴禁使用程式碼代碼區塊（\`\`\`）包覆公式！
- 風格：高密度、短句、條列式，多使用「➔、>、≠」等符號對比。
- 零廢話：完全禁止前言客套話（如「好的，以下為您整理...」）或結尾問候，直接輸出大抄 Markdown 正文！`;
  }

  /**
   * 舊版相容介面
   */
  generateAIPromptForVocab(vocabList, slides = null) {
    if (slides && slides.length > 0) {
      return this.generateFullSlidesAIPrompt(slides);
    }
    const termNames = (vocabList || []).map(v => v.term).join(', ');
    return `請幫我將以下專業詞彙整理成繁體中文純中英對照：\n${termNames}`;
  }

  /**
   * 解析外部 AI 貼回之自訂文字 (支援 [VOCAB] / [KEYPOINTS] 綜合區塊、頁碼區間如 1-8、標籤如 [公式])
   */
  /**
   * 解析外部 AI 貼回之自訂文字 (完整支援 Markdown 表格、[VOCAB] / [KEYPOINTS] 區塊、頁碼區間如 1-8、標籤如 [公式])
   */
  parseFullAIResponse(text) {
    if (!text || text.trim() === '') return { terms: [], keypoints: [] };
    const raw = text.trim();

    // 檢查是否有 VOCAB 或 KEYPOINTS 分段 (支援 [VOCAB], **[VOCAB]**, # [VOCAB], 【VOCAB】 及不分大小寫)
    const vocabRegex = /(?:^|\n)\s*(?:#+\s*)?(?:\*\*|__)?(?:\[|【)?(?:VOCAB|單字表|詞彙表)(?:\]|】)?(?:\*\*|__)?\s*/i;
    const keypointsRegex = /(?:^|\n)\s*(?:#+\s*)?(?:\*\*|__)?(?:\[|【)?(?:KEYPOINTS|考點目錄|章節目錄|重點目錄)(?:\]|】)?(?:\*\*|__)?\s*/i;

    const hasVocab = vocabRegex.test(raw);
    const hasKeypoints = keypointsRegex.test(raw);

    if (hasVocab || hasKeypoints) {
      let vocabText = '';
      let keypointsText = '';

      if (hasVocab && hasKeypoints) {
        const vocabMatch = raw.match(vocabRegex);
        const kpMatch = raw.match(keypointsRegex);
        if (vocabMatch.index < kpMatch.index) {
          vocabText = raw.substring(vocabMatch.index + vocabMatch[0].length, kpMatch.index);
          keypointsText = raw.substring(kpMatch.index + kpMatch[0].length);
        } else {
          keypointsText = raw.substring(kpMatch.index + kpMatch[0].length, vocabMatch.index);
          vocabText = raw.substring(vocabMatch.index + vocabMatch[0].length);
        }
      } else if (hasVocab) {
        const vocabMatch = raw.match(vocabRegex);
        vocabText = raw.substring(vocabMatch.index + vocabMatch[0].length);
      } else {
        const kpMatch = raw.match(keypointsRegex);
        keypointsText = raw.substring(kpMatch.index + kpMatch[0].length);
      }

      const terms = this.parseCustomPastedVocab(vocabText);
      const keypoints = [];

      keypointsText.split('\n').map(l => l.trim()).filter(l => l.length > 0).forEach(line => {
        // 排除表頭分隔線 (如 |---|---| 或 ---) 與範例說明
        if (/^\s*\|?[\s\-:]+\|\s*$/.test(line) || /^\s*[-=]{3,}\s*$/.test(line)) return;
        if (line.includes('頁碼') && line.includes('主題')) return;
        if (line.startsWith('範例') || line.startsWith('註：') || line.startsWith('說明')) return;

        // 清理 Markdown 表格首尾的 '|' 符號，解決開頭包含 '|' 導致 parts[0] 為空字串之嚴重 Bug
        const cleanLine = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').trim();

        if (cleanLine.includes('|')) {
          const parts = cleanLine.split('|').map(p => p.trim());
          const rawPage = parts[0] || '';
          const rawTitle = parts.slice(1).join(' ') || '';

          // 排除表頭行
          if (/^(?:頁碼|頁數|Slide|Page|Pages|No\.?)$/i.test(rawPage)) return;

          // 提取頁碼與區間 (例如: 1-8, 1~8, P.1-8, P.14, 14, #14)
          const rangeMatch = rawPage.match(/(\d+)\s*[-~至到—]\s*(\d+)/);
          const singleMatch = rawPage.match(/(\d+)/);

          let pageStr = '';
          let sortKey = 0;
          let isSpan = false;

          if (rangeMatch) {
            const startP = parseInt(rangeMatch[1], 10);
            const endP = parseInt(rangeMatch[2], 10);
            pageStr = `P.${startP}-${endP}`;
            sortKey = startP;
            isSpan = true;
          } else if (singleMatch) {
            const singleP = parseInt(singleMatch[1], 10);
            pageStr = `P.${singleP}`;
            sortKey = singleP;
            isSpan = false;
          }

          // 提取標題中的標籤 [公式], [比較], [圖解], [必考] 等
          let tag = '';
          let title = rawTitle;
          const tagMatch = rawTitle.match(/^\[(.*?)\]\s*(.*)$/);
          if (tagMatch) {
            tag = tagMatch[1];
            title = tagMatch[2];
          }

          if (pageStr && (title || rawTitle)) {
            keypoints.push({
              pageStr,
              sortKey,
              isSpan,
              tag,
              title: title || rawTitle,
              fullTitle: rawTitle,
              slideNum: sortKey, // 向下相容
              isExcluded: false
            });
          }
        }
      });

      // 按照頁碼自動由小到大排序 (主題與考點自然對齊)
      keypoints.sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        return a.isSpan ? -1 : 1;
      });

      return { terms, keypoints };
    }

    // 若無分段標記，作為純單字表解析
    return {
      terms: this.parseCustomPastedVocab(text),
      keypoints: []
    };
  }

  /**
   * 解析外部 AI 貼回之自訂單字文字 (完整支援 Markdown 表格、"|" 分隔、冒號分隔、JSON 陣列，專注中英對照)
   */
  parseCustomPastedVocab(text) {
    if (!text || text.trim() === '') return [];
    const trimmed = text.trim();

    // 1. 嘗試解析 JSON 陣列
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return arr.map(item => ({
            term: (item.term || item.en || item.intl || '').trim(),
            zh: (item.zh || item.translation || item.cn || '').trim(),
            pages: item.pages || []
          })).filter(item => item.term || item.zh);
        }
      } catch (_) {}
    }

    // 2. 解析每行文本 (支援 Markdown 表格 "|" 或 ":" 分隔)
    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedList = [];

    lines.forEach(line => {
      // 排除表格分隔線 (如 |---|---| 或 ---)
      if (/^\s*\|?[\s\-:]+\|\s*$/.test(line) || /^\s*[-=]{3,}\s*$/.test(line)) return;
      if (line.includes('英文詞彙') && line.includes('中文')) return;
      if (line.startsWith('#') || line.startsWith('範例')) return;

      // 清理 Markdown 表格首尾的 '|' 符號
      const cleanLine = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').trim();
      if (/^[\s\-:|]+$/.test(cleanLine)) return;

      // 檢查 "|" 分隔 (英文詞彙 | 繁體中文)
      if (cleanLine.includes('|')) {
        const parts = cleanLine.split('|').map(p => p.trim());
        const term = parts[0] || '';
        const zh = parts.slice(1).join(' ') || '';
        if (/^(?:英文|詞彙|單字|Term|Vocabulary)$/i.test(term)) return;
        if (term.replace(/[-:]/g, '').trim() === '') return;
        if (term || zh) {
          parsedList.push({ term, zh, pages: [] });
          return;
        }
      }

      // 檢查冒號分隔 (例如: "TCP: 傳輸控制協定" 或 "Railway [英] / Railroad [美] : 鐵路")
      const colonMatch = cleanLine.match(/^([^:：]+)[:：](.+)$/);
      if (colonMatch) {
        const term = colonMatch[1].trim();
        const zh = colonMatch[2].trim();
        if (term || zh) {
          parsedList.push({ term, zh, pages: [] });
          return;
        }
      }
    });

    // 3. 去重與標準化處理 (相同詞彙合併繁中釋義)
    const termMap = new Map();
    parsedList.forEach(item => {
      const cleanTerm = (item.term || '').trim();
      if (!cleanTerm) return;
      const lower = cleanTerm.toLowerCase();
      if (!termMap.has(lower)) {
        termMap.set(lower, {
          term: cleanTerm,
          zh: (item.zh || '').trim(),
          pages: item.pages || []
        });
      } else {
        const existing = termMap.get(lower);
        if (!existing.zh && item.zh) {
          existing.zh = item.zh.trim();
        } else if (existing.zh && item.zh && !existing.zh.includes(item.zh)) {
          existing.zh = `${existing.zh} / ${item.zh.trim()}`;
        }
      }
    });

    const deduped = Array.from(termMap.values());

    // 4. 嚴格依照英文字母 A ~ Z (不分大小寫) 排序
    deduped.sort((a, b) => {
      const termA = (a.term || '').trim();
      const termB = (b.term || '').trim();
      return termA.localeCompare(termB, 'en', { sensitivity: 'base', numeric: true });
    });

    return deduped;
  }

  /**
   * 搜尋投影片文字
   */
  search(query, slides) {
    if (!query || query.trim() === '') return [];
    
    const term = query.trim().toLowerCase();
    const results = [];

    slides.forEach(slide => {
      if (!slide.text) return;
      const textLower = slide.text.toLowerCase();
      const matchPos = textLower.indexOf(term);

      if (matchPos !== -1) {
        const start = Math.max(0, matchPos - 30);
        const end = Math.min(slide.text.length, matchPos + term.length + 50);
        let snippet = slide.text.substring(start, end);
        
        const reg = new RegExp(`(${query})`, 'gi');
        snippet = snippet.replace(reg, '<mark>$1</mark>');

        results.push({
          slideNum: slide.originalIndex,
          snippet: (start > 0 ? '...' : '') + snippet + (end < slide.text.length ? '...' : ''),
          isExcluded: slide.excluded
        });
      }
    });

    return results;
  }

  /**
   * 產生大抄末頁實體列印專用「英文單字表附錄」A4 紙張節點 (支援多頁自動分頁)
   */
  createVocabularyPrintSheets(vocabList, customPastedText = '') {
    // 若有自訂貼入的外部內容，優先擷取其中的單字部分，絕不混入考點
    let activeList = vocabList;
    if (customPastedText && customPastedText.trim() !== '') {
      const parsed = this.parseFullAIResponse(customPastedText);
      activeList = (parsed.terms && parsed.terms.length > 0) ? parsed.terms : vocabList;
    }

    if (!activeList || activeList.length === 0) return [];
    // 確保單字 100% 依英文字母 A ~ Z (不分大小寫) 排序
    activeList = [...activeList].sort((a, b) => (a.term || '').localeCompare(b.term || '', 'en', { sensitivity: 'base', numeric: true }));
    // 採用寬幅 3 欄式排版，每欄 35 筆，每頁 105 筆，欄寬達 62mm，長詞自然折行完整呈現不截斷
    const itemsPerPage = 105;
    const resultWrappers = [];
    const totalPages = Math.ceil(activeList.length / itemsPerPage);

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pageVocabs = activeList.slice(pIdx * itemsPerPage, (pIdx + 1) * itemsPerPage);
      const sheet = document.createElement('div');
      sheet.className = 'a4-sheet print-page appendix-print-sheet portrait';

      const pageLabel = totalPages > 1 ? ` (${pIdx + 1}/${totalPages})` : '';
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 3mm;">
          <h2 style="font-size: 11pt; margin: 0; font-weight: bold;">TE-NOTER 考場專有名詞與英文單字表附錄${pageLabel}</h2>
          <span style="font-family: monospace; font-size: 7.5pt; color: #334155;">共收錄 ${activeList.length} 核心詞彙</span>
        </div>
      `;
      sheet.appendChild(header);

      // 寬幅 3 欄式排版，文字呼吸感好，長詞中英文自然折行全部呈現
      const cols = document.createElement('div');
      cols.className = 'appendix-columns-3';

      pageVocabs.forEach(v => {
        const item = document.createElement('div');
        item.className = 'appendix-term-item';

        // 智慧標註 [英] 與 [美] 標籤
        let displayTerm = v.term || '';
        displayTerm = displayTerm.replace(/\[(?:英|UK)\]/gi, '<span style="color:#d97706; font-size:6.2pt; font-weight:700; background:#fef3c7; padding:0 2px; border-radius:2px; margin:0 1px;">[英]</span>');
        displayTerm = displayTerm.replace(/\[(?:美|US)\]/gi, '<span style="color:#2563eb; font-size:6.2pt; font-weight:700; background:#dbeafe; padding:0 2px; border-radius:2px; margin:0 1px;">[美]</span>');

        let zhSpan = '';
        if (v.zh) {
          zhSpan = `<span style="color:#334155; font-size:6.8pt; margin-left:3px;">: ${v.zh}</span>`;
        }

        let pageBadge = '';
        if (v.pages && v.pages.length > 0) {
          pageBadge = `<span class="item-page-tag" style="color:#64748b; font-size:6pt; margin-left:auto;">P.${v.pages[0]}</span>`;
        }

        item.innerHTML = `
          <span class="item-title-text"><strong style="font-size: 7.2pt; color:#0f172a;">${displayTerm}</strong>${zhSpan}</span>
          ${pageBadge}
        `;
        cols.appendChild(item);
      });
      sheet.appendChild(cols);

      const wrapper = document.createElement('div');
      wrapper.className = 'print-page-wrapper';
      const indicator = document.createElement('div');
      indicator.className = 'page-indicator-badge no-print';
      indicator.textContent = `A4 單字表附錄${pageLabel}`;
      wrapper.appendChild(indicator);
      wrapper.appendChild(sheet);
      resultWrappers.push(wrapper);
    }

    return resultWrappers;
  }

  createVocabularyPrintSheet(vocabList, customPastedText = '') {
    const list = this.createVocabularyPrintSheets(vocabList, customPastedText);
    return list[0] || null;
  }

  /**
   * 產生大抄末頁實體列印專用「章節速查與關鍵考點目錄」A4 紙張節點 (支援跨度區間、關鍵標籤與寬幅3欄式排版)
   */
  createQuickRefPrintSheets(keypointsList) {
    const activePoints = keypointsList.filter(p => !p.isExcluded);
    if (activePoints.length === 0) return [];

    // 確保考點目錄 100% 依投影片頁碼由小到大嚴格排序 (起始頁相同時主題跨度排在前面)
    activePoints.sort((a, b) => {
      const keyA = typeof a.sortKey === 'number' ? a.sortKey : (a.slideNum || 0);
      const keyB = typeof b.sortKey === 'number' ? b.sortKey : (b.slideNum || 0);
      if (keyA !== keyB) return keyA - keyB;
      return a.isSpan ? -1 : 1;
    });

    // 高飽滿度 3 欄排版：每欄 38 筆，每頁 114 筆，縱向高度充分利用達 90%
    const itemsPerPage = 114;
    const totalPages = Math.ceil(activePoints.length / itemsPerPage);
    const resultWrappers = [];

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pagePoints = activePoints.slice(pIdx * itemsPerPage, (pIdx + 1) * itemsPerPage);
      const sheet = document.createElement('div');
      sheet.className = 'a4-sheet print-page appendix-print-sheet portrait';

      const pageLabel = totalPages > 1 ? ` (${pIdx + 1}/${totalPages})` : '';

      const header = document.createElement('div');
      header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 2.5mm;">
          <h2 style="font-size: 11pt; margin: 0; font-weight: bold;">TE-NOTER 章節速查與關鍵考點目錄${pageLabel}</h2>
          <span style="font-family: monospace; font-size: 7.5pt; color: #334155;">共收錄 ${activePoints.length} 個章節主題與核心考點 (3 欄速查排版)</span>
        </div>
      `;
      sheet.appendChild(header);

      const cols = document.createElement('div');
      cols.className = 'appendix-columns-3';

      pagePoints.forEach(kp => {
        const item = document.createElement('div');
        const isSpan = kp.isSpan || (kp.pageStr && kp.pageStr.includes('-'));
        item.className = `appendix-quickref-item ${isSpan ? 'quickref-span-item' : ''}`;

        const pageDisplay = kp.pageStr || (kp.slideNum ? `#${kp.slideNum}` : '');

        // 標籤樣式對應
        let tagHtml = '';
        if (kp.tag) {
          const t = kp.tag.trim();
          let tagClass = 'tag-default';
          if (t.includes('公式') || t.includes('計算')) tagClass = 'tag-formula';
          else if (t.includes('比較') || t.includes('對照')) tagClass = 'tag-compare';
          else if (t.includes('圖解') || t.includes('架構') || t.includes('流程')) tagClass = 'tag-diagram';
          else if (t.includes('必考') || t.includes('重點')) tagClass = 'tag-formula';
          tagHtml = `<span class="quickref-tag ${tagClass}">[${t}]</span>`;
        }

        const titleText = kp.title || kp.fullTitle || '';

        item.innerHTML = `
          <span class="quickref-num ${isSpan ? 'num-span' : ''}">${pageDisplay}</span>
          <span class="quickref-title" title="${titleText}">${tagHtml}${titleText}</span>
        `;
        cols.appendChild(item);
      });

      sheet.appendChild(cols);

      const wrapper = document.createElement('div');
      wrapper.className = 'print-page-wrapper';
      const indicator = document.createElement('div');
      indicator.className = 'page-indicator-badge no-print';
      indicator.textContent = `A4 考點速查目錄附錄${pageLabel}`;
      wrapper.appendChild(indicator);
      wrapper.appendChild(sheet);

      resultWrappers.push(wrapper);
    }

    return resultWrappers;
  }

  createQuickRefPrintSheet(keypointsList) {
    const list = this.createQuickRefPrintSheets(keypointsList);
    return list[0] || null;
  }

  /**
   * 智慧修復 OCR 雜訊、字元間空格、破損 LaTeX 下標與反斜線，並自動標註未包裹之數學公式
   * @param {string} raw 
   * @returns {string} 修復正規化後的 Markdown & LaTeX 文字
   */
  /**
   * 智慧修復 OCR 雜訊、字元間空格、破損 LaTeX 下標與反斜線，並自動標註未包裹之數學公式與 Markdown 清單/表格
   * @param {string} raw 
   * @returns {string} 修復正規化後的 Markdown & LaTeX 文字
   */
  cleanAndNormalizeMathNotes(raw) {
    if (!raw || typeof raw !== 'string') return '';
    // 0. Unicode NFKC 歸一化
    let text = raw.normalize('NFKC');

    // 1. 全形/OCR 標點符號標準化
    text = text.replace(/｡/g, '。');
    // 清理無意義的 LaTeX 百分號轉義
    text = text.replace(/\\%/g, '%');

    // 2. 修復中文字元之間被誤插的空格 (只匹配空格與全形空格，絕不破壞 Tab 分隔符或換行符)
    for (let i = 0; i < 4; i++) {
      text = text.replace(/([\u4e00-\u9fa5\u3400-\u4dbf\u2e80-\u2eff\u2f00-\u2fdf])[ \u3000]+([\u4e00-\u9fa5\u3400-\u4dbf\u2e80-\u2eff\u2f00-\u2fdf])/g, '$1$2');
    }

    // 3. 修復小數點數字周邊空格與大寫 O 誤植
    text = text.replace(/\b([0-9O])\s*\.\s*([0-9]+)\s*([0-9]+)?\b/gi, (m, a, b, c) => {
      const lead = a.toUpperCase() === 'O' ? '0' : a;
      return lead + '.' + b + (c ? c : '');
    });

    // 4. 收攏常見被拆開的單詞空格
    text = text.replace(/\bt\s*e\s*x\s*t\b/gi, 'text');
    text = text.replace(/\bm\s*u\b/gi, 'mu');
    text = text.replace(/\bs\s*i\s*m\b/gi, 'sim');
    text = text.replace(/\ba\s*p\s*p\s*r\s*o\s*x\b/gi, 'approx');
    text = text.replace(/\ba\s*d\b/gi, 'ad');
    text = text.replace(/\b(?:a|d)\s*r\s*i\s*v\s*e\s*r\b/gi, 'driver');
    text = text.replace(/\bt\s*r\s*a\s*c\s*t\s*i\s*o\s*n\b/gi, 'traction');

    // 5. 修復反斜線誤辨與空格
    text = text.replace(/\\\s*([a-zA-Z]+)/g, '\\$1');
    text = text.replace(/\b(?:l\s*approx|lapprox)\b/gi, '\\approx');
    text = text.replace(/(?:\|\s*sim\b|\|\s*s\s*i\s*m\b)/gi, ' \\sim ');
    text = text.replace(/\(\s*sim\s*/gi, '(\\sim ');
    text = text.replace(/\\approx\s*\n\s*([\d\.]+)/g, '\\approx $1');

    // 6. 清單項目符號標準化：將每行開頭的 ⚬ (U+26AC) 智慧轉換為標準 Markdown 清單符號 - 
    text = text.replace(/^(\s*)⚬\s+/gm, '$1- ');

    // 7. TSV (Tab 分隔表格) 智慧轉換為 GitHub Flavored Markdown (GFM) 表格
    const rawLines = text.split('\n');
    const mergedLines = [];
    for (let i = 0; i < rawLines.length; i++) {
      const cur = rawLines[i];
      const next = rawLines[i + 1];
      if (next && next.startsWith('\t') && cur.includes('\t')) {
        mergedLines.push(cur);
      } else if (cur.trim() !== '' && !cur.includes('\t') && !cur.startsWith('#') && !cur.startsWith('-') && !cur.startsWith('*') && !/^表\s*\d+/i.test(cur.trim()) && next && /^\([A-Za-z0-9\s]+\)\t/.test(next.trim())) {
        // 單元格換行如「支撐\n(Support)\t...」合併為單行
        rawLines[i + 1] = cur.trim() + ' ' + next.trim();
      } else {
        mergedLines.push(cur);
      }
    }

    const formattedLines = [];
    let tableRows = [];
    const flushTable = () => {
      if (tableRows.length === 0) return;
      if (tableRows.length >= 2) {
        const colCount = Math.max(...tableRows.map(r => r.length));
        const header = '| ' + tableRows[0].map(c => c.trim()).concat(Array(colCount - tableRows[0].length).fill('')).join(' | ') + ' |';
        const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
        formattedLines.push(header);
        formattedLines.push(sep);
        for (let k = 1; k < tableRows.length; k++) {
          const row = '| ' + tableRows[k].map(c => c.trim()).concat(Array(colCount - tableRows[k].length).fill('')).join(' | ') + ' |';
          formattedLines.push(row);
        }
      } else {
        tableRows.forEach(r => formattedLines.push(r.join('\t')));
      }
      tableRows = [];
    };

    for (let i = 0; i < mergedLines.length; i++) {
      const line = mergedLines[i];
      if (line.includes('\t')) {
        tableRows.push(line.split('\t'));
      } else {
        flushTable();
        formattedLines.push(line);
      }
    }
    flushTable();
    text = formattedLines.join('\n');

    // 8. 漸進式 Token 抽取保護機制 (使用無底線純中文括號標籤，徹底杜絕正則誤匹配與 $ 轉義)
    const mathTokens = [];
    const addToken = (expr, isBlock = false) => {
      const cleanExpr = expr.trim();
      if (!cleanExpr || cleanExpr.includes('【KATEXTOKEN')) return '';
      const token = `【KATEXTOKEN${mathTokens.length}】`;
      const wrapped = isBlock ? `$$${cleanExpr}$$` : `$${cleanExpr}$`;
      mathTokens.push({ token, expr: wrapped });
      return token;
    };

    // 8.1 先保護原先合法的 $$ ... $$、\[ ... \]、\( ... \)、$ ... $
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (m, g1) => addToken(g1, true));
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (m, g1) => addToken(g1, true));
    text = text.replace(/\$([^\$\n]+?)\$/g, (m, g1) => addToken(g1, false));
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (m, g1) => addToken(g1, false));

    // 8.2 連貫數學表達式自動識別
    // A) 帶有 \propto 開頭的式子 (遇到中文標點、括號或空白自然結尾，如 \propto W(車重)、\propto W \cdot V)
    text = text.replace(/(\\propto\s+[^\s，。；：！？\(\)（）]+(?:\s*(?:[+\-·=]|\\cdot)\s*[^\s，。；：！？\(\)（）]+)*)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // B) 完整連貫表達式 (等式、不等式、運算串接、含相鄰隱式乘積如 C = 0.5 \rho C_d A_{\text{front}}、\frac{R}{W} = \frac{A}{W} + B \cdot V + \frac{C}{W} \cdot V^2)
    const atom = '(?:\\\\frac\\{[^}]*\\}\\{[^}]*\\}|\\\\[a-zA-Z]+(?:\\{[^}]*\\})*(?:_\\{(?:[^{}]*|\\{[^{}]*\\})*\\}|_[a-zA-Z0-9]+)?|[A-Za-z](?:_\\{(?:[^{}]*|\\{[^{}]*\\})*\\}|_[a-zA-Z0-9])?(?:\\^\\{?[0-9a-zA-Z+-]+\\}?)?|\\d+(?:\\.\\d+)?(?:\\^\\{?[0-9a-zA-Z+-]+\\}?)?)';
    const op = '(?::?[-+=<>~≈≥≤·×]|\\\\(?:cdot|times|propto|approx|sim|le|ge|leq|geq|ll|gg|pm|equiv))';
    const exprPattern = new RegExp(`(${atom}(?:\\s*(?:${op}|)\\s*${atom})*)`, 'g');

    text = text.replace(exprPattern, (m, g1) => {
      if (g1.includes('【KATEXTOKEN') || m.includes('【KATEXTOKEN')) return m;
      if (/\\|[_^]/.test(g1)) {
        if (/\\[a-zA-Z]+|_\{\\text\{|_[a-zA-Z0-9]\b|\^[0-9{]/.test(g1)) {
          return addToken(g1);
        }
      }
      return m;
    });

    // C) 孤立的 \frac{...}{...} (如 \frac{1}{40})
    text = text.replace(/(\\frac\{[^}]*\}\{[^}]*\})/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // D) 條件與比較關係式：如 V > 250\text{ km/h}、V > 40\text{ mph}、V_{\max} \ge 250\text{ km/h}
    text = text.replace(/([A-Za-z](?:_\\{(?:[^{}]*|\\{[^{}]*\\})*\\}|_[a-zA-Z0-9])?\\s*(?:[><≥≤]=?|\\(?:geq|leq|gg|ll))\\s*\\d+(?:\\.\\d+)?(?:\\s*\\text\\{[^}]*\\})?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(\\(?:le|ge|leq|geq)\s*\d+(?:\.\d+)?(?:\\%|%|\b))/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // E) 區間與近似表示：如 \approx 1 \sim 1.5\text{ cm}^2、\approx 0.25 \sim 0.35、25\% \sim 48\%、90 \sim 120\text{ s}、0.8 \sim 1.5\text{ km}
    text = text.replace(/((?:\\approx\s*)?\d+(?:\.\d+)?(?:\\%|%)?\s*\\sim\s*\d+(?:\.\d+)?(?:\\%|%)?(?:\s*\\text\{[^}]*\}(?:\^\{?[0-9]+\}?)?)?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(\\approx\s*\d+(?:\.\d+)?(?:\s*\\sim\s*\d+(?:\.\d+)?)?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // F) 孤立的希臘字母、下標變數與特徵指數：如 \mu_{\text{ad}}、W_{\text{driver}}、10^9\text{ 延人公里}、C_d
    text = text.replace(/(\\(?:mu|alpha|beta|gamma|theta|sigma|omega|delta|lambda|pi|rho|tau|phi|psi|epsilon)(?:_\\{(?:[^{}]*|\\{[^{}]*\\})*\\}|_[a-zA-Z0-9]+)?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(\b[A-Za-z]_\\{(?:[^{}]*|\\{[^{}]*\\})*\\})/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(\b[A-Za-z]_[a-zA-Z0-9]\b)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(10\^9(?:\s*\\text\{[^}]*\})?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });
    text = text.replace(/(\\text\{[^}]*\}(?:\^\{?[0-9]+\}?)?)/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // G) 孤立的比較/運算符號 (如 2.5 \ll 汽車 16.333 \ll 航空 352 中的 \ll)
    text = text.replace(/(\\(?:ll|gg))/g, (m, g1) => {
      if (g1.includes('【KATEXTOKEN')) return m;
      return addToken(g1);
    });

    // 8.3 安全還原暫存的公式 Token (使用 split.join 徹底杜絕 $ 字符轉義 bug)
    mathTokens.forEach(item => {
      text = text.split(item.token).join(item.expr);
    });

    // 9. 括號與標點修飾 (只在行內修飾空格，不破壞 Tab 分隔符號與換行符號)
    text = text.replace(/\([ \u3000]+/g, '(');
    text = text.replace(/[ \u3000]+\)/g, ')');
    text = text.replace(/[ \u3000]+([，。；：！？、])/g, '$1');
    text = text.replace(/([，。；：！？、])[ \u3000]+([\u4e00-\u9fa5])/g, '$1$2');

    return text;
  }

  /**
   * 智慧解析 Markdown 與 LaTeX 數學公式為高美感 HTML
   * 透過 Token 保護機制避免 LaTeX 底線與星號被 Markdown 解析器破壞
   * @param {string} rawText 
   * @returns {string} 渲染後的 HTML 字串
   */
  renderMarkdownAndLatexToHtml(rawText) {
    if (!rawText || rawText.trim() === '') return '';

    // 0. 前置智慧正規化：修復 OCR 雜訊與破損 LaTeX 語法、轉換清單與表格
    const normalizedText = this.cleanAndNormalizeMathNotes(rawText);

    // 1. 抽取並保護 LaTeX 公式 (避免底線 _ 或星號 * 被 Markdown 當作斜體/粗體語法)
    const mathTokens = [];
    let text = normalizedText;

    // 獨立區塊公式: $$ ... $$ 或 \[ ... \]
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
      const token = `KATEXBLOCKTOKEN${mathTokens.length}ENDTOKEN`;
      mathTokens.push({ type: 'block', formula: formula.trim() });
      return `\n\n${token}\n\n`;
    });
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      const token = `KATEXBLOCKTOKEN${mathTokens.length}ENDTOKEN`;
      mathTokens.push({ type: 'block', formula: formula.trim() });
      return `\n\n${token}\n\n`;
    });

    // 行內公式: $ ... $ 或 \( ... \)
    text = text.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
      const token = `KATEXINLINETOKEN${mathTokens.length}ENDTOKEN`;
      mathTokens.push({ type: 'inline', formula: formula.trim() });
      return token;
    });
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      const token = `KATEXINLINETOKEN${mathTokens.length}ENDTOKEN`;
      mathTokens.push({ type: 'inline', formula: formula.trim() });
      return token;
    });

    // 2. 解析 Markdown
    let html = '';
    if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
      try {
        window.marked.setOptions({
          gfm: true,
          breaks: true,
        });
        html = window.marked.parse(text);
      } catch (err) {
        console.warn('Marked 解析警告:', err);
        html = text.replace(/\n/g, '<br>');
      }
    } else {
      // 降級純文字轉換
      html = text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/\n/gim, '<br>');
    }

    // 3. 還原並渲染 KaTeX 公式 (含容錯自我修復)
    mathTokens.forEach((item, idx) => {
      const token = item.type === 'block' ? `KATEXBLOCKTOKEN${idx}ENDTOKEN` : `KATEXINLINETOKEN${idx}ENDTOKEN`;
      let renderedMath = '';
      if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
        let formula = item.formula;
        try {
          renderedMath = window.katex.renderToString(formula, {
            displayMode: item.type === 'block',
            throwOnError: false,
          });
        } catch (e) {
          // 自我容錯：若為 \propto 等關係符號開頭，補上空分組 {}
          try {
            if (/^\\(?:propto|sim|approx|ge|le|leq|geq)/.test(formula)) {
              renderedMath = window.katex.renderToString('{} ' + formula, {
                displayMode: item.type === 'block',
                throwOnError: false,
              });
            } else {
              renderedMath = `<code class="katex-error">${formula}</code>`;
            }
          } catch (e2) {
            renderedMath = `<code class="katex-error">${formula}</code>`;
          }
        }
      } else {
        renderedMath = item.type === 'block' ? `$$${item.formula}$$` : `$${item.formula}$`;
      }
      html = html.split(token).join(renderedMath);
    });

    return html;
  }

  /**
   * 產生大抄末頁實體列印專用「外部 AI 自訂筆記」A4 紙張節點 (支援多頁自動分頁、Markdown & LaTeX 與手寫備忘網格)
   * @param {string} notesText 筆記原始文字
   * @param {Object} options 配置參數 { cols: 3, enableMemoGrid: true }
   * @returns {Array<HTMLElement>}
   */
  createCustomNotesPrintSheets(notesText, options = {}) {
    if (!notesText || notesText.trim() === '') return [];

    const cols = parseInt(options.cols, 10) || 2;
    const enableMemoGrid = options.enableMemoGrid !== false;

    const fullHtml = this.renderMarkdownAndLatexToHtml(notesText);

    // 解析出頂層 DOM 元素以進行版面高度分組
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = fullHtml;
    const childNodes = Array.from(tempContainer.children);

    const rawBlocks = childNodes.length > 0 ? childNodes : [tempContainer];

    // 細粒度元素拆分：
    // 1. 若 ul/ol 包含超過 4 個 li，以 3 個為一組拆分
    // 2. 若 table 超過 8 列 tr，以 5 列為一組拆分 (保留 thead)，確保跨欄與分頁平滑自然
    const blocks = [];
    rawBlocks.forEach(b => {
      const tag = b.tagName ? b.tagName.toLowerCase() : '';
      if ((tag === 'ul' || tag === 'ol') && b.children.length > 4) {
        const lis = Array.from(b.children);
        const chunkSize = 3;
        for (let i = 0; i < lis.length; i += chunkSize) {
          const subList = document.createElement(tag);
          lis.slice(i, i + chunkSize).forEach(li => subList.appendChild(li.cloneNode(true)));
          blocks.push(subList);
        }
      } else if (tag === 'table') {
        const thead = b.querySelector('thead');
        const trs = Array.from(b.querySelectorAll('tbody tr') || b.querySelectorAll('tr'));
        if (trs.length > 8) {
          const chunkSize = 5;
          for (let i = 0; i < trs.length; i += chunkSize) {
            const subTable = document.createElement('table');
            if (thead) subTable.appendChild(thead.cloneNode(true));
            const subTbody = document.createElement('tbody');
            trs.slice(i, i + chunkSize).forEach(tr => subTbody.appendChild(tr.cloneNode(true)));
            subTable.appendChild(subTbody);
            blocks.push(subTable);
          }
        } else {
          blocks.push(b);
        }
      } else {
        blocks.push(b);
      }
    });

    // 依據欄數計算每行字數容量與單頁安全高度上限 (mm)
    // A4 297mm - 邊距 8mm - 頁首 11mm = 278mm 可用高度
    let charsPerLine = 24;
    let lineHeightMm = 3.5;
    let maxPageUnits = 790; // 3 欄標準：3 * 270mm = 810mm，設定 790mm 緊湊且滿版

    if (cols === 4) {
      charsPerLine = 18;
      lineHeightMm = 3.2;
      maxPageUnits = 1040; // 4 欄極限：4 * 270mm = 1080mm，設定 1040mm
    } else if (cols === 2) {
      charsPerLine = 36;
      lineHeightMm = 3.8;
      maxPageUnits = 530; // 2 欄舒適：2 * 270mm = 540mm，設定 530mm
    }

    // 精準視覺高度精算器 (剔除 KaTeX 標籤灌水，還原真實文字行數與公式實體尺寸)
    const estimateNodeUnits = (block) => {
      const tag = block.tagName ? block.tagName.toLowerCase() : 'p';

      let units = 5;
      if (tag === 'h1') units = 8.0;
      else if (tag === 'h2') units = 6.8;
      else if (tag === 'h3') units = 5.8;
      else if (tag === 'h4') units = 4.8;
      else if (tag === 'hr') units = 2.5;
      else if (tag === 'pre') {
        const text = block.textContent || '';
        const lineCount = (text.match(/\n/g) || []).length + 1;
        units = Math.max(14, lineCount * 3.8 + 4);
      } else if (tag === 'table') {
        const rows = block.querySelectorAll ? block.querySelectorAll('tr').length : 1;
        units = Math.max(12, rows * 4.6 + 3);
      } else if (tag === 'ul' || tag === 'ol') {
        const lis = block.querySelectorAll ? Array.from(block.querySelectorAll('li')) : [];
        if (lis.length > 0) {
          let listTotal = 1.2;
          lis.forEach(li => {
            // 分離 li 內的 KaTeX
            const clone = li.cloneNode(true);
            const kDisplays = clone.querySelectorAll ? clone.querySelectorAll('.katex-display') : [];
            const kDisplaysCount = kDisplays.length;
            const kAll = clone.querySelectorAll ? clone.querySelectorAll('.katex') : [];
            const kInlineCount = Math.max(0, kAll.length - kDisplaysCount);
            kAll.forEach(k => k.remove ? k.remove() : null);
            const plain = (clone.textContent || '').replace(/\s+/g, ' ').trim();
            const effLen = plain.length + (kInlineCount * 6);
            const liLines = Math.max(1, Math.ceil(effLen / (charsPerLine - 1)));
            listTotal += liLines * lineHeightMm + 0.8 + (kDisplaysCount * 10);
          });
          units = listTotal;
        } else {
          units = 8;
        }
      } else {
        // 段落與公式
        const clone = block.cloneNode(true);
        const kDisplays = clone.querySelectorAll ? clone.querySelectorAll('.katex-display') : [];
        const kDisplaysCount = kDisplays.length;
        const kAll = clone.querySelectorAll ? clone.querySelectorAll('.katex') : [];
        const kInlineCount = Math.max(0, kAll.length - kDisplaysCount);
        kAll.forEach(k => k.remove ? k.remove() : null);
        const plain = (clone.textContent || '').replace(/\s+/g, ' ').trim();
        const effLen = plain.length + (kInlineCount * 6);
        const estLines = Math.max(1, Math.ceil(effLen / charsPerLine));
        units = estLines * lineHeightMm + 1.2 + (kDisplaysCount * 11);
      }

      block._estimatedUnits = units;
      return units;
    };

    const pagesGroups = [];
    let currentBlocks = [];
    let currentUnits = 0;

    blocks.forEach(block => {
      const units = estimateNodeUnits(block);

      // 若目前頁面加上此元素已超過單頁上限，且目前已有內容，則切至新的一頁
      if (currentUnits + units > maxPageUnits && currentBlocks.length > 0) {
        // 孤兒標題保護 (Orphan Heading Protection)
        let carriedHeader = null;
        if (currentBlocks.length > 1) {
          const lastBlock = currentBlocks[currentBlocks.length - 1];
          const lastTag = lastBlock.tagName ? lastBlock.tagName.toLowerCase() : '';
          if (/^h[1-6]$/.test(lastTag)) {
            carriedHeader = currentBlocks.pop();
            currentUnits -= (carriedHeader._estimatedUnits || 6);
          }
        }

        pagesGroups.push({ blocks: currentBlocks, units: currentUnits });

        currentBlocks = carriedHeader ? [carriedHeader] : [];
        currentUnits = carriedHeader ? (carriedHeader._estimatedUnits || 6) : 0;
      }

      currentBlocks.push(block);
      currentUnits += units;
    });

    if (currentBlocks.length > 0) {
      pagesGroups.push({ blocks: currentBlocks, units: currentUnits });
    }

    const totalPages = pagesGroups.length;
    const resultWrappers = [];

    pagesGroups.forEach((group, pIdx) => {
      const isLastPage = pIdx === totalPages - 1;
      const sheet = document.createElement('div');
      sheet.className = 'a4-sheet print-page appendix-print-sheet portrait';

      const pageLabel = totalPages > 1 ? ` (${pIdx + 1}/${totalPages})` : '';
      const colLabel = cols === 4 ? '4 欄極限微縮' : (cols === 2 ? '2 欄舒適排版' : '3 欄標準高密度');

      const header = document.createElement('div');
      header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 3mm;">
          <h2 style="font-size: 11pt; margin: 0; font-weight: bold;">TE-NOTER 外部 AI 重點精華筆記${pageLabel}</h2>
          <span style="font-family: monospace; font-size: 7.5pt; color: #334155;">Markdown & LaTeX ${colLabel}</span>
        </div>
      `;
      sheet.appendChild(header);

      // 判斷是否需要末頁手寫備忘網格
      const remainingUnits = maxPageUnits - group.units;
      const shouldAddMemo = isLastPage && enableMemoGrid && (remainingUnits >= 120 || group.units < maxPageUnits * 0.82);

      const content = document.createElement('div');
      let colClass = '';
      if (cols === 4) colClass = 'cols-4';
      else if (cols === 2) colClass = 'cols-2';

      // 若非最後一頁，強制套用 is-full-sheet 保證整頁高度由左至右填滿，杜絕底下空一大塊
      const fullSheetClass = !isLastPage || (!shouldAddMemo && group.units >= maxPageUnits * 0.85) ? 'is-full-sheet' : '';
      content.className = `appendix-markdown-content ${colClass} ${shouldAddMemo ? 'has-memo' : 'full-page'} ${fullSheetClass}`.trim();

      group.blocks.forEach(b => {
        content.appendChild(b.cloneNode(true));
      });

      sheet.appendChild(content);

      // 若符合條件，在最後一頁底部填補精美手寫備忘點陣區
      if (shouldAddMemo) {
        const memoBox = document.createElement('div');
        memoBox.className = 'appendix-memo-box';
        memoBox.innerHTML = `
          <div class="appendix-memo-header">
            <div class="appendix-memo-title">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
              <span>考前手寫補充 / 專屬公式備忘區 (Exam Quick Notes & Scratch Pad)</span>
            </div>
            <span class="appendix-memo-hint">✎ 預留考場速記、突發重點與公式手寫區 (極限省紙不留白)</span>
          </div>
          <div class="appendix-memo-grid"></div>
        `;
        sheet.appendChild(memoBox);
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'print-page-wrapper';
      const indicator = document.createElement('div');
      indicator.className = 'page-indicator-badge no-print';
      indicator.textContent = `A4 自訂筆記附錄${pageLabel}`;
      wrapper.appendChild(indicator);
      wrapper.appendChild(sheet);

      resultWrappers.push(wrapper);
    });

    return resultWrappers;
  }

  createCustomNotesPrintSheet(notesText) {
    const list = this.createCustomNotesPrintSheets(notesText);
    return list[0] || null;
  }
}


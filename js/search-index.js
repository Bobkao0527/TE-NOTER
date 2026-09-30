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

    // 依出現頻率與專有名詞特性排序
    const sorted = Array.from(vocabMap.values())
      .filter(item => item.pages.size >= 1 && item.pages.size <= 15)
      .sort((a, b) => b.count - a.count)
      .slice(0, maxTerms);

    return sorted.map(item => ({
      term: item.term,
      pages: Array.from(item.pages).sort((a, b) => a - b)
    }));
  }

  /**
   * 從每一頁投影片中擷取標題與核心考點
   */
  extractSlideKeyPoints(slides) {
    return slides.map(slide => {
      if (!slide.text) {
        return { slideNum: slide.originalIndex, title: '(無文字頁面)', isExcluded: slide.excluded };
      }

      // 抓取第一行文字或前 60 字作為標題摘要
      const cleanText = slide.text.replace(/\s+/g, ' ').trim();
      const firstLine = cleanText.split(/[.!?\n]/)[0] || cleanText.substring(0, 45);
      const title = firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;

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

【任務二：逐頁核心考點查對表】
為每一頁簡報提煉一句 15~30 字的核心考點標題（一眼看懂該頁重點題目，方便考場秒翻定位）。

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
頁碼 | 核心考點標題
範例：
1 | 軌道結構四大元件（鋼軌、軌枕、道碴、路基）功能與承載力比較
2 | 號誌閉塞區間原理與列車防追撞機制

==================================================
【以下為簡報完整內文】
==================================================
${slidesContent}`;
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
   * 解析外部 AI 貼回之自訂文字 (支援 [VOCAB] / [KEYPOINTS] 綜合區塊、"|" 分隔、冒號分隔、JSON 陣列)
   */
  parseFullAIResponse(text) {
    if (!text || text.trim() === '') return { terms: [], keypoints: [] };
    const trimmed = text.trim();

    // 檢查是否有 [VOCAB] 或 [KEYPOINTS] 分段
    if (trimmed.includes('[VOCAB]') || trimmed.includes('[KEYPOINTS]')) {
      const vocabText = trimmed.includes('[VOCAB]')
        ? (trimmed.split('[VOCAB]')[1]?.split('[KEYPOINTS]')[0] || '')
        : '';
      const keypointsText = trimmed.includes('[KEYPOINTS]')
        ? (trimmed.split('[KEYPOINTS]')[1] || '')
        : '';

      const terms = this.parseCustomPastedVocab(vocabText);
      const keypoints = [];

      keypointsText.split('\n').map(l => l.trim()).filter(l => l.length > 0).forEach(line => {
        if (line.includes('頁碼') || line.includes('---')) return;
        if (line.includes('|')) {
          const parts = line.split('|').map(p => p.trim());
          const pNum = parseInt(parts[0], 10);
          const title = parts.slice(1).join(' ') || '';
          if (pNum && title) {
            keypoints.push({ slideNum: pNum, title });
          }
        }
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
   * 解析外部 AI 貼回之自訂單字文字 (支援 "|" 分隔、冒號分隔、JSON 陣列，專注中英對照)
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

    // 2. 解析每行文本 (支援 "|" 或 ":" 分隔)
    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedList = [];

    lines.forEach(line => {
      if (line.includes('英文詞彙') || line.includes('---') || line.startsWith('#')) return;

      // 檢查 "|" 分隔 (英文詞彙 | 繁體中文)
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        const term = parts[0] || '';
        const zh = parts.slice(1).join(' ') || '';
        if (term || zh) {
          parsedList.push({ term, zh, pages: [] });
          return;
        }
      }

      // 檢查冒號分隔 (例如: "TCP: 傳輸控制協定" 或 "Railway [英] / Railroad [美] : 鐵路")
      const colonMatch = line.match(/^([^:：]+)[:：](.+)$/);
      if (colonMatch) {
        const term = colonMatch[1].trim();
        const zh = colonMatch[2].trim();
        if (term || zh) {
          parsedList.push({ term, zh, pages: [] });
          return;
        }
      }

      // 一般單行
      parsedList.push({ term: line, zh: '', pages: [] });
    });

    return parsedList;
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
   * 產生大抄末頁實體列印專用「逐頁考點快速查對表」A4 紙張節點 (寬幅3欄式，高飽滿度，徹底杜絕下半部空白浪費)
   */
  createQuickRefPrintSheets(keypointsList) {
    const activePoints = keypointsList.filter(p => !p.isExcluded);
    if (activePoints.length === 0) return [];

    // 高飽滿度 3 欄排版：每欄 38 筆，每頁 114 筆，縱向高度充分利用達 90%，不再空大半張紙！
    const itemsPerPage = 114;
    const totalPages = Math.ceil(activePoints.length / itemsPerPage);
    const resultWrappers = [];

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pagePoints = activePoints.slice(pIdx * itemsPerPage, (pIdx + 1) * itemsPerPage);
      const sheet = document.createElement('div');
      sheet.className = 'a4-sheet print-page appendix-print-sheet portrait';

      const pageLabel = totalPages > 1 ? ` (${pIdx + 1}/${totalPages})` : '';
      const rangeLabel = `#${pagePoints[0].slideNum} ~ #${pagePoints[pagePoints.length - 1].slideNum}`;

      const header = document.createElement('div');
      header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 2.5mm;">
          <h2 style="font-size: 11pt; margin: 0; font-weight: bold;">TE-NOTER 逐頁考點與章節速查目錄${pageLabel}</h2>
          <span style="font-family: monospace; font-size: 7.5pt; color: #334155;">本頁收錄 ${rangeLabel}（共 ${activePoints.length} 頁考點）</span>
        </div>
      `;
      sheet.appendChild(header);

      const cols = document.createElement('div');
      cols.className = 'appendix-columns-3';

      pagePoints.forEach(kp => {
        const item = document.createElement('div');
        item.className = 'appendix-quickref-item';
        item.innerHTML = `
          <span class="quickref-num">#${kp.slideNum}</span>
          <span class="quickref-title" title="${kp.title}">${kp.title}</span>
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
   * 產生大抄末頁實體列印專用「外部自訂 AI 筆記」A4 紙張節點 (支援多頁自動分頁)
   */
  createCustomNotesPrintSheets(notesText) {
    if (!notesText || notesText.trim() === '') return [];
    const lines = notesText.split('\n').filter(l => l.trim().length > 0);
    const linesPerPage = 65;
    const totalPages = Math.ceil(lines.length / linesPerPage);
    const resultWrappers = [];

    for (let pIdx = 0; pIdx < totalPages; pIdx++) {
      const pageLines = lines.slice(pIdx * linesPerPage, (pIdx + 1) * linesPerPage);
      const sheet = document.createElement('div');
      sheet.className = 'a4-sheet print-page appendix-print-sheet portrait';

      const pageLabel = totalPages > 1 ? ` (${pIdx + 1}/${totalPages})` : '';
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom: 1.5pt solid #000; padding-bottom: 2mm; margin-bottom: 3mm;">
          <h2 style="font-size: 11pt; margin: 0; font-weight: bold;">TE-NOTER 外部 AI 重點精華筆記${pageLabel}</h2>
          <span style="font-family: monospace; font-size: 7.5pt; color: #334155;">高密度微縮 3 欄式印刷</span>
        </div>
      `;
      sheet.appendChild(header);

      const cols = document.createElement('div');
      cols.className = 'appendix-columns-3';

      pageLines.forEach(line => {
        const trimmed = line.trim();
        const p = document.createElement('div');
        p.style.marginBottom = '1.5mm';
        p.style.breakInside = 'avoid';

        if (trimmed.startsWith('## ')) {
          p.innerHTML = `<strong style="font-size:9pt; color:#000; border-bottom:0.5pt solid #000; display:block; margin:1.5mm 0 1mm 0;">${trimmed.substring(3)}</strong>`;
        } else if (trimmed.startsWith('# ')) {
          p.innerHTML = `<strong style="font-size:10pt; color:#000; border-bottom:1pt solid #000; display:block; margin:2mm 0 1mm 0;">${trimmed.substring(2)}</strong>`;
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          p.innerHTML = `• ${trimmed.substring(2)}`;
        } else {
          p.textContent = trimmed;
        }

        cols.appendChild(p);
      });

      sheet.appendChild(cols);

      const wrapper = document.createElement('div');
      wrapper.className = 'print-page-wrapper';
      const indicator = document.createElement('div');
      indicator.className = 'page-indicator-badge no-print';
      indicator.textContent = `A4 自訂筆記附錄${pageLabel}`;
      wrapper.appendChild(indicator);
      wrapper.appendChild(sheet);

      resultWrappers.push(wrapper);
    }

    return resultWrappers;
  }

  createCustomNotesPrintSheet(notesText) {
    const list = this.createCustomNotesPrintSheets(notesText);
    return list[0] || null;
  }
}

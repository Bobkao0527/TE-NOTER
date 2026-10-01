/**
 * TE-NOTER - 排版幾何計算與網格引擎 (layout-engine.js)
 * 精確試算 A4 (直式/橫式) 幾何邊界、填滿率、單張投影片實體尺寸與分頁生成
 */

export class LayoutEngine {
  constructor() {
    // A4 標準規格 (單位: mm)
    this.A4_PORTRAIT = { width: 210, height: 297 };
    this.A4_LANDSCAPE = { width: 297, height: 210 };

    // 常用預設排版組合
    this.PRESETS = {
      // 4:3 比例預設
      '4:3': [
        { id: '43-p-3x6', name: '直向 3×6 (18張)', cols: 3, rows: 6, orientation: 'portrait', desc: '4:3 經典高密度黃金比例' },
        { id: '43-p-3x7', name: '直向 3×7 (21張)', cols: 3, rows: 7, orientation: 'portrait', desc: '極限微縮 21 張/面' },
        { id: '43-l-4x4', name: '橫向 4×4 (16張)', cols: 4, rows: 4, orientation: 'landscape', desc: '4:3 橫式清晰閱讀' },
        { id: '43-l-5x4', name: '橫向 5×4 (20張)', cols: 5, rows: 4, orientation: 'landscape', desc: '4:3 橫式高密度' },
      ],
      // 16:9 比例預設 (專注直向 A4 最佳化)
      '16:9': [
        { id: '169-p-3x7', name: '直向 3×7 (21張) ⭐', cols: 3, rows: 7, orientation: 'portrait', desc: '16:9 最佳直向排版，上下空間完美吃滿' }
      ]
    };
  }

  /**
   * 取得指定紙張方向的尺寸
   */
  getPaperDimensions(orientation) {
    return orientation === 'landscape' ? this.A4_LANDSCAPE : this.A4_PORTRAIT;
  }

  /**
   * 根據長寬比字串取得數值比例 (寬 / 高)
   */
  parseAspectRatio(ratioStr, detectedRatio = null) {
    if (ratioStr === 'auto' && detectedRatio) {
      return detectedRatio;
    }
    if (ratioStr === '16:9') return 16 / 9;
    return 4 / 3; // 預設 4:3
  }

  /**
   * 計算排版幾何資訊與紙張利用率
   */
  calculateMetrics({ orientation, cols, rows, marginMm, gapMm, ratioStr, detectedRatio, totalSlidesCount }) {
    const paper = this.getPaperDimensions(orientation);
    const ratio = this.parseAspectRatio(ratioStr, detectedRatio);

    const availableWidth = paper.width - (2 * marginMm);
    const availableHeight = paper.height - (2 * marginMm);

    // 每個格子的可用最大邊界
    const totalGapsX = (cols - 1) * gapMm;
    const totalGapsY = (rows - 1) * gapMm;
    const cellWidth = Math.max(1, (availableWidth - totalGapsX) / cols);
    const cellHeight = Math.max(1, (availableHeight - totalGapsY) / rows);

    // 根據投影片長寬比計算實際大小（保持等比例縮放）
    let itemWidth = cellWidth;
    let itemHeight = cellWidth / ratio;

    if (itemHeight > cellHeight) {
      itemHeight = cellHeight;
      itemWidth = cellHeight * ratio;
    }

    const itemsPerSheet = cols * rows;
    const totalSingleSheets = Math.ceil(totalSlidesCount / itemsPerSheet) || 1;
    const totalDoubleSheets = Math.ceil(totalSingleSheets / 2);

    // 空間利用率計算 (所有投影片面積佔全紙面積百分比)
    const usedArea = itemsPerSheet * (itemWidth * itemHeight);
    const paperArea = paper.width * paper.height;
    const fillRate = Math.min(100, (usedArea / paperArea) * 100);

    return {
      paperWidth: paper.width,
      paperHeight: paper.height,
      cellWidth,
      cellHeight,
      itemWidth,
      itemHeight,
      itemsPerSheet,
      totalSingleSheets,
      totalDoubleSheets,
      fillRate: fillRate.toFixed(1)
    };
  }

  /**
   * 更新「📐 匡線排版示意圖」
   */
  renderWireframe(containerEl, metrics, { cols, rows, marginMm, gapMm, orientation, showBorder }) {
    const paperEl = document.getElementById('wireframePaper');
    const tagWidth = document.getElementById('tagWidth');
    const tagHeight = document.getElementById('tagHeight');

    // 切換紙張方向類別
    paperEl.classList.remove('portrait', 'landscape');
    paperEl.classList.add(orientation);

    tagWidth.textContent = `寬: ${metrics.paperWidth} mm`;
    tagHeight.textContent = `高: ${metrics.paperHeight} mm`;

    // 清空現有網格
    containerEl.innerHTML = '';
    containerEl.style.padding = `${marginMm}mm`;
    containerEl.style.gap = `${gapMm}mm`;
    containerEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    containerEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    // 生成示意線框格子
    for (let i = 1; i <= metrics.itemsPerSheet; i++) {
      const slot = document.createElement('div');
      slot.className = 'wireframe-slot';
      if (!showBorder) {
        slot.style.borderStyle = 'none';
      }

      const indexBadge = document.createElement('span');
      indexBadge.className = 'slot-index';
      indexBadge.textContent = `#${i}`;

      const dimBadge = document.createElement('span');
      dimBadge.className = 'slot-dim';
      dimBadge.textContent = `${metrics.itemWidth.toFixed(1)} × ${metrics.itemHeight.toFixed(1)}mm`;

      slot.appendChild(indexBadge);
      slot.appendChild(dimBadge);
      containerEl.appendChild(slot);
    }
  }

  /**
   * 產生實體列印 A4 頁面節點結構
   */
  generatePrintPages(containerEl, slidesList, config, metrics) {
    containerEl.innerHTML = '';
    if (!slidesList || slidesList.length === 0) return;

    const { cols, rows, marginMm, gapMm, orientation, showBadge, showBorder } = config;
    const itemsPerPage = metrics.itemsPerSheet;
    const totalPages = Math.ceil(slidesList.length / itemsPerPage);

    // 依序建立每一張實體 A4
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'print-page-wrapper';

      // 頁面編號提示 (非列印時可見)
      const indicator = document.createElement('div');
      indicator.className = 'page-indicator-badge no-print';
      indicator.textContent = `A4 第 ${pageIdx + 1} 頁 (共 ${totalPages} 頁)`;
      pageWrapper.appendChild(indicator);

      // A4 紙張實體
      const sheet = document.createElement('div');
      sheet.className = `a4-sheet print-page ${orientation}`;

      // 內部網格容器
      const grid = document.createElement('div');
      grid.className = 'real-print-grid';
      grid.style.padding = `${marginMm}mm`;
      grid.style.gap = `${gapMm}mm`;
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

      const startIdx = pageIdx * itemsPerPage;
      const endIdx = Math.min(startIdx + itemsPerPage, slidesList.length);

      for (let i = startIdx; i < endIdx; i++) {
        const slide = slidesList[i];
        const item = document.createElement('div');
        item.className = 'print-slide-item';
        if (showBorder) item.classList.add('bordered');

        // 嵌入投影片 Canvas 或快取圖片
        if (slide.canvas) {
          // 複製一份或直接建立圖片，避免同一 canvas 被重複掛載
          const img = document.createElement('img');
          img.src = slide.imageUrl || slide.canvas.toDataURL('image/jpeg', 0.92);
          slide.imageUrl = img.src; // 快取避免重複序列化
          img.alt = `Slide ${slide.originalIndex}`;
          item.appendChild(img);
        } else if (slide.imageUrl) {
          const img = document.createElement('img');
          img.src = slide.imageUrl;
          img.alt = `Slide ${slide.originalIndex}`;
          item.appendChild(img);
        }

        // 頁碼角標 (原投影片頁碼)
        if (showBadge) {
          const badge = document.createElement('div');
          badge.className = 'print-slide-badge';
          badge.textContent = `#${slide.originalIndex}`;
          item.appendChild(badge);
        }

        grid.appendChild(item);
      }

      sheet.appendChild(grid);
      pageWrapper.appendChild(sheet);
      containerEl.appendChild(pageWrapper);
    }
  }

  /**
   * 使用純前端 PDF-Lib 引擎將原始投影片以 100% 原始向量畫質合成為標準 A4 PDF
   * 內建 5mm 安全邊距，杜絕印表機遮邊與裁切
   * @param {ArrayBuffer} sourceArrayBuffer - 原始 PDF 檔案資料
   * @param {Array} slidesList - 已篩選並選取的投影片陣列（含 originalIndex）
   * @param {Object} config - { cols, rows, showBadge, showBorder, marginMm, gapMm }
   * @param {Array} appendixSheets - 附錄頁的 DOM 元素陣列
   * @param {Function} onProgress - (current, total, statusText)
   * @returns {Blob} 產生的 PDF Blob
   */
  async exportVectorPdf(sourceArrayBuffer, slidesList, config, appendixSheets = [], onProgress = null) {
    if (!window.PDFLib) {
      throw new Error('PDF-lib 函式庫尚未載入完成，請確認網路連線');
    }

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const newPdfDoc = await PDFDocument.create();

    // A4 點數標準 (1 pt = 1/72 inch, 1 mm = 2.83464567 pt)
    const MM_TO_PT = 2.83464567;
    const a4W = 210 * MM_TO_PT; // 595.28 pt
    const a4H = 297 * MM_TO_PT; // 841.89 pt

    // 安全邊距與間距 (預設 5mm 安全邊距，杜絕印表機切邊)
    const marginMm = config.marginMm || 5;
    const gapMm = config.gapMm || 1;
    const marginPt = marginMm * MM_TO_PT;
    const gapPt = gapMm * MM_TO_PT;

    const cols = config.cols || 3;
    const rows = config.rows || 6;
    const showBorder = config.showBorder !== false;
    const showBadge = config.showBadge !== false;

    // 可用繪製空間
    const availW = a4W - (2 * marginPt) - ((cols - 1) * gapPt);
    const availH = a4H - (2 * marginPt) - ((rows - 1) * gapPt);
    const cellW = availW / cols;
    const cellH = availH / rows;

    const itemsPerPage = cols * rows;
    const totalPages = Math.ceil(slidesList.length / itemsPerPage);

    // 取得欲嵌入投影片之 0-based 頁碼索引
    const targetIndices = slidesList.map(s => s.originalIndex - 1);
    const uniqueIndices = [...new Set(targetIndices)];

    if (onProgress) onProgress(0, totalPages, '正在解析並嵌入原始高畫質向量頁面...');
    const embeddedPagesList = await newPdfDoc.embedPdf(sourceArrayBuffer, uniqueIndices);

    // 建立索引對照表
    const embeddedMap = new Map();
    uniqueIndices.forEach((origIdx, idx) => {
      embeddedMap.set(origIdx, embeddedPagesList[idx]);
    });

    const font = await newPdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 依序產生每一張實體 A4 頁面
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (onProgress) {
        onProgress(pageIdx + 1, totalPages, `正在排版第 ${pageIdx + 1} / ${totalPages} 頁 A4...`);
      }

      const page = newPdfDoc.addPage([a4W, a4H]);

      const startIdx = pageIdx * itemsPerPage;
      const endIdx = Math.min(startIdx + itemsPerPage, slidesList.length);

      for (let i = startIdx; i < endIdx; i++) {
        const slide = slidesList[i];
        const slotIdx = i - startIdx;
        const col = slotIdx % cols;
        const row = Math.floor(slotIdx / cols);

        // PDF 座標系統 Y=0 在左下角，頂部為 a4H
        const slotX = marginPt + col * (cellW + gapPt);
        const slotY = a4H - marginPt - (row + 1) * cellH - row * gapPt;

        // 裁切外框線 (清晰灰框)
        if (showBorder) {
          page.drawRectangle({
            x: slotX,
            y: slotY,
            width: cellW,
            height: cellH,
            borderColor: rgb(0.8, 0.84, 0.88),
            borderWidth: 0.5,
          });
        }

        // 嵌入原生向量頁面
        const emb = embeddedMap.get(slide.originalIndex - 1);
        if (emb) {
          // 等比例置中縮放 (Fit inside cell)
          const scale = Math.min(cellW / emb.width, cellH / emb.height);
          const drawW = emb.width * scale;
          const drawH = emb.height * scale;
          const offsetX = (cellW - drawW) / 2;
          const offsetY = (cellH - drawH) / 2;

          page.drawPage(emb, {
            x: slotX + offsetX,
            y: slotY + offsetY,
            width: drawW,
            height: drawH,
          });
        }

        // 投影片原頁碼標籤 (右上角)
        if (showBadge) {
          const badgeText = `#${slide.originalIndex}`;
          const badgeFontSize = 7;
          const textWidth = font.widthOfTextAtSize(badgeText, badgeFontSize);
          const badgePadding = 2;
          const badgeW = textWidth + badgePadding * 2;
          const badgeH = badgeFontSize + badgePadding * 2;
          const badgeX = slotX + cellW - badgeW - 1.5;
          const badgeY = slotY + cellH - badgeH - 1.5;

          // 黑色背景底塊
          page.drawRectangle({
            x: badgeX,
            y: badgeY,
            width: badgeW,
            height: badgeH,
            color: rgb(0.08, 0.1, 0.16),
            opacity: 0.85,
          });

          // 白色頁碼文字
          page.drawText(badgeText, {
            x: badgeX + badgePadding,
            y: badgeY + badgePadding,
            size: badgeFontSize,
            font: font,
            color: rgb(1, 1, 1),
          });
        }
      }
    }

    // 附錄頁處理 (若有附錄頁元素)
    if (appendixSheets && appendixSheets.length > 0) {
      for (let aIdx = 0; aIdx < appendixSheets.length; aIdx++) {
        const sheetEl = appendixSheets[aIdx];
        if (onProgress) {
          onProgress(totalPages + aIdx + 1, totalPages + appendixSheets.length, `正在嵌入第 ${aIdx + 1} 頁附錄查表...`);
        }
        const pngBytes = await this.renderElementToHighResPng(sheetEl);
        if (pngBytes) {
          const pngImage = await newPdfDoc.embedPng(pngBytes);
          const appendixPage = newPdfDoc.addPage([a4W, a4H]);
          appendixPage.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: a4W,
            height: a4H,
          });
        }
      }
    }

    const pdfBytes = await newPdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }

  /**
   * 使用純 Canvas 2D 繪製高解析度 (300 DPI: 2480x3508) 附錄頁，100% 穩定且避開瀏覽器 SVG 安全性阻擋
   * @param {HTMLElement} wrapperEl 
   * @returns {Uint8Array|null}
   */
  async renderElementToHighResPng(wrapperEl) {
    try {
      const sheet = wrapperEl.querySelector('.appendix-print-sheet') || wrapperEl;
      const width = 2480;
      const height = 3508;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // 背景純白色
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // 提取標題與副標題
      const h2 = sheet.querySelector('h2');
      const titleText = h2 ? h2.textContent.trim() : 'TE-NOTER 附錄頁';
      const subSpan = sheet.querySelector('span[style*="monospace"], .appendix-header-row span');
      const subText = subSpan ? subSpan.textContent.trim() : '';

      // 1. 繪製頁首 (Header)
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
      ctx.fillText(titleText, 110, 160);

      if (subText) {
        ctx.fillStyle = '#475569';
        ctx.font = '500 28px "JetBrains Mono", monospace';
        const subW = ctx.measureText(subText).width;
        ctx.fillText(subText, width - 110 - subW, 160);
      }

      // 標題分隔黑線
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(110, 185);
      ctx.lineTo(width - 110, 185);
      ctx.stroke();

      // 2. 判斷版面類型並繪製內容
      const isQuickRef = sheet.querySelector('.appendix-quickref-item');
      const isTermSheet = sheet.querySelector('.appendix-term-item');

      if (isQuickRef) {
        // === 考點速查表 (支援 3 欄滿版或 2 欄排版) ===
        const items = sheet.querySelectorAll('.appendix-quickref-item');
        const numItems = items.length;
        const is3Col = !sheet.querySelector('.appendix-columns-2');
        const colsCount = is3Col ? 3 : 2;
        const itemsPerCol = Math.ceil(numItems / colsCount);
        const colWidth = is3Col ? 730 : 1080;
        const colStartX = is3Col ? [110, 880, 1650] : [110, 1290];
        const startY = 220;
        const rowHeight = is3Col ? 78 : 92;

        items.forEach((item, idx) => {
          const colIdx = Math.min(colsCount - 1, Math.floor(idx / itemsPerCol));
          const rowIdx = idx % itemsPerCol;
          const x = colStartX[colIdx];
          const y = startY + rowIdx * rowHeight;

          const numEl = item.querySelector('.quickref-num');
          const titleEl = item.querySelector('.quickref-title');
          const numStr = numEl ? numEl.textContent.trim() : `#${idx + 1}`;
          const titleStr = titleEl ? titleEl.textContent.trim() : item.textContent.trim();

          const isSpan = numStr.includes('-');

          // 測量頁碼寬度
          ctx.font = 'bold 26px "JetBrains Mono", monospace';
          const numWidth = ctx.measureText(numStr).width;
          const titleOffsetX = Math.max(120, Math.ceil(numWidth) + 14);

          // 考點標題多行折行計算 (100% 完整換行呈現，絕不草率截斷成 ...)
          const maxTitleWidth = colWidth - titleOffsetX - 8;
          let fontSize = 23;
          ctx.font = `${isSpan ? 'bold' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif`;

          const chars = Array.from(titleStr);
          let line1 = '';
          let line2 = '';

          for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            if (!line2 && ctx.measureText(line1 + char).width <= maxTitleWidth) {
              line1 += char;
            } else {
              line2 += char;
            }
          }

          // 若第二行文字極長，動態微調字型以保證容納全部內容
          if (line2 && ctx.measureText(line2).width > maxTitleWidth) {
            fontSize = 20;
            ctx.font = `${isSpan ? 'bold' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif`;
            line1 = '';
            line2 = '';
            for (let i = 0; i < chars.length; i++) {
              const char = chars[i];
              if (!line2 && ctx.measureText(line1 + char).width <= maxTitleWidth) {
                line1 += char;
              } else {
                line2 += char;
              }
            }

            // 極限情況下 (如超過 55 字) 使用 18px 容納
            if (line2 && ctx.measureText(line2).width > maxTitleWidth) {
              fontSize = 18;
              ctx.font = `${isSpan ? 'bold' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif`;
              line1 = '';
              line2 = '';
              for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                if (!line2 && ctx.measureText(line1 + char).width <= maxTitleWidth) {
                  line1 += char;
                } else {
                  line2 += char;
                }
              }
            }
          }

          const hasLine2 = Boolean(line2 && line2.trim().length > 0);
          const firstLineBaseline = hasLine2 ? y + 29 : y + 43;

          // 繪製頁碼標籤 (若是跨度區間則加上加深底色標籤)
          if (isSpan) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(x - 4, firstLineBaseline - 24, numWidth + 8, 30);
            ctx.fillStyle = '#0f172a';
          } else {
            ctx.fillStyle = '#1e40af';
          }
          ctx.font = 'bold 25px "JetBrains Mono", monospace';
          ctx.fillText(numStr, x, firstLineBaseline);

          // 繪製考點標題 (第一行與折行之第二行)
          ctx.fillStyle = isSpan ? '#000000' : '#1e293b';
          ctx.font = `${isSpan ? 'bold' : '500'} ${fontSize}px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif`;
          ctx.fillText(line1, x + titleOffsetX, firstLineBaseline);

          if (hasLine2) {
            ctx.fillText(line2, x + titleOffsetX, y + 57);
          }

          // 底部細點線 (留給兩行充足空間，置於 y + 70)
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, y + 70);
          ctx.lineTo(x + colWidth, y + 70);
          ctx.stroke();
          ctx.setLineDash([]);
        });

      } else if (isTermSheet) {
        // === 單字表附錄 (寬幅 3 欄排版，中英文 100% 完整呈現，絕不截斷成 ...) ===
        const items = sheet.querySelectorAll('.appendix-term-item');
        const numItems = items.length;
        const is4Col = sheet.querySelector('.appendix-columns-4');
        const colsCount = is4Col ? 4 : 3;
        const itemsPerCol = Math.ceil(numItems / colsCount);
        const colWidth = is4Col ? 530 : 730;
        const colStartX = is4Col ? [110, 680, 1250, 1820] : [110, 880, 1650];
        const startY = 220;
        const rowHeight = 84;

        items.forEach((item, idx) => {
          const colIdx = Math.min(colsCount - 1, Math.floor(idx / itemsPerCol));
          const rowIdx = idx % itemsPerCol;
          const x = colStartX[colIdx];
          const y = startY + rowIdx * rowHeight;

          const text = item.textContent.replace(/\s+/g, ' ').trim();
          ctx.fillStyle = '#0f172a';
          ctx.font = '500 25px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';

          // 若文字較長，分成兩行繪製，杜絕變成 "..."
          if (ctx.measureText(text).width > colWidth - 10) {
            let line1 = '';
            let line2 = '';
            const chars = text.split('');
            for (let c of chars) {
              if (!line2 && ctx.measureText(line1 + c).width < colWidth - 15) {
                line1 += c;
              } else {
                line2 += c;
              }
            }
            ctx.fillText(line1, x, y + 28);
            if (line2) {
              ctx.fillStyle = '#334155';
              ctx.font = '400 22px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
              ctx.fillText(line2, x + 15, y + 54);
            }
          } else {
            ctx.fillText(text, x, y + 36);
          }

          // 底部細點線
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, y + 68);
          ctx.lineTo(x + colWidth, y + 68);
          ctx.stroke();
          ctx.setLineDash([]);
        });

      } else {
        // === 外部自訂筆記 (支援 Markdown & KaTeX 公式 3 欄排版) ===
        let renderedSuccessfully = false;

        // 優先使用 html2canvas 進行 100% 原始 DOM 精確截圖 (避開 SVG 沙盒 Tainted Canvas 限制)
        if (typeof window !== 'undefined' && window.html2canvas) {
          try {
            // 暫時將 sheet 掛載至 document.body (不可見區域) 以保證取得真實 CSS 樣式與 KaTeX 公式幾何
            const sandbox = document.createElement('div');
            sandbox.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:210mm; min-height:297mm; z-index:-9999; background:#ffffff; opacity:0; pointer-events:none;';
            const cloneSheet = sheet.cloneNode(true);
            sandbox.appendChild(cloneSheet);
            document.body.appendChild(sandbox);

            // 使用 html2canvas 渲染高解析度 (scale: 3 約 300DPI 印刷畫質)
            const renderedCanvas = await window.html2canvas(cloneSheet, {
              scale: 3,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff',
            });

            if (sandbox.parentNode) {
              sandbox.parentNode.removeChild(sandbox);
            }

            if (renderedCanvas) {
              ctx.drawImage(renderedCanvas, 0, 0, width, height);
              renderedSuccessfully = true;
            }
          } catch (h2cErr) {
            console.warn('html2canvas 渲染提示，改用 Native Canvas Fallback:', h2cErr);
            renderedSuccessfully = false;
          }
        }

        // 若 html2canvas 未成功，使用純原生 Canvas 2D 逐區塊無失真排版
        if (!renderedSuccessfully) {
          const blocks = sheet.querySelectorAll('.appendix-markdown-content > *');
          const colWidth = 720;
          const colStartX = [110, 875, 1640];
          const startY = 240;
          let curCol = 0;
          let curY = startY;

          blocks.forEach(p => {
            const tag = p.tagName ? p.tagName.toLowerCase() : '';
            const isH1 = tag === 'h1' || p.querySelector('strong[style*="font-size:10pt"]');
            const isH2 = tag === 'h2' || p.querySelector('strong[style*="font-size:9pt"]');
            const isH3 = tag === 'h3';
            const isPre = tag === 'pre';
            const text = p.textContent.trim();

            ctx.font = isH1 ? 'bold 36px sans-serif' : (isH2 ? 'bold 30px sans-serif' : (isH3 ? 'bold 26px sans-serif' : (isPre ? '400 22px monospace' : '400 24px sans-serif')));
            ctx.fillStyle = isH1 || isH2 ? '#000000' : (isPre ? '#0f172a' : '#1e293b');

            const words = text.split('');
            let line = '';
            const pLines = [];
            for (let char of words) {
              if (ctx.measureText(line + char).width < colWidth) {
                line += char;
              } else {
                pLines.push(line);
                line = char;
              }
            }
            if (line) pLines.push(line);

            const lineHeight = isPre ? 30 : 34;
            const blockHeight = pLines.length * lineHeight + (isH1 || isH2 ? 22 : 12);
            if (curY + blockHeight > height - 140) {
              curCol++;
              curY = startY;
            }

            if (curCol < 3) {
              const x = colStartX[curCol];
              pLines.forEach(l => {
                ctx.fillText(l, x, curY + 24);
                curY += lineHeight;
              });
              curY += (isH1 || isH2 ? 16 : 8);
            }
          });
        }
      }

      // 轉換為 PNG 二進位陣列
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      const binary = atob(dataUrl.split(',')[1]);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      return array;
    } catch (err) {
      console.error('Canvas 2D 附錄渲染失敗:', err);
      return null;
    }
  }
}


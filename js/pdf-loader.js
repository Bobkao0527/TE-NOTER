/**
 * TE-NOTER - 本地 PDF 解析器與投影片渲染引擎 (pdf-loader.js)
 * 100% 瀏覽器本地執行，無需上傳伺服器。支援文字萃取、高清 Canvas 渲染與長寬比自動偵測。
 */

export class PDFLoader {
  constructor() {
    this.slides = []; // [{ originalIndex, canvas, imageUrl, text, width, height, excluded: false, hasNotes: false }]
    this.detectedRatio = null; // 寬 / 高 數值
    this.detectedRatioType = '4:3'; // '4:3' 或 '16:9'
    this.originalArrayBuffer = null; // 保存原始 ArrayBuffer 供向量直出使用
    this.pdfDoc = null; // 保存 PDF.js Document 實例供按需高清渲染使用
    this.hasHandwritingNotes = false; // 是否偵測到手寫或標註筆記
    this.fileName = ''; // 原始檔名
  }

  /**
   * 載入並解析使用者上傳的 PDF 檔案
   * @param {File} file 
   * @param {Function} onProgress (current, total, statusText)
   */
  async loadPDF(file, onProgress) {
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 函式庫尚未載入完成，請確認網路連線');
    }

    this.fileName = file.name;
    const rawBuffer = await file.arrayBuffer();
    // 關鍵修復：製作獨立深層副本，避免被 PDF.js Worker transfer 導致 Buffer detached
    this.originalArrayBuffer = rawBuffer.slice(0);
    const pdfDoc = await window.pdfjsLib.getDocument({ data: rawBuffer }).promise;
    this.pdfDoc = pdfDoc;
    const totalPages = pdfDoc.numPages;

    this.slides = [];
    this.hasHandwritingNotes = false;
    let ratioSum = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress(pageNum, totalPages, `正在解析第 ${pageNum} / ${totalPages} 頁...`);
      }

      const page = await pdfDoc.getPage(pageNum);
      
      // 取出文字內容以供檢索
      const textContent = await page.getTextContent();
      const extractedText = textContent.items.map(item => item.str).join(' ');

      // 檢查此頁面是否含有手寫或繪圖註釋 (Ink, Highlight, FreeText, Line, etc.)
      let pageHasNotes = false;
      try {
        const annotations = await page.getAnnotations();
        if (annotations && annotations.length > 0) {
          pageHasNotes = annotations.some(annot => {
            const subtype = annot.subtype || annot.type;
            return ['Ink', 'Highlight', 'FreeText', 'Line', 'Square', 'Circle', 'Stamp', 'Polygon', 'PolyLine', 'Underline', 'StrikeOut'].includes(subtype);
          });
        }
      } catch (annotErr) {
        console.warn(`檢查第 ${pageNum} 頁註釋失敗:`, annotErr);
      }

      if (pageHasNotes) {
        this.hasHandwritingNotes = true;
      }

      // 畫面縮圖與預覽渲染設定 (scale: 1.0 提供適度清晰度並大幅降低 60% 記憶體佔用，防範 200 頁 OOM)
      const viewport = page.getViewport({ scale: 1.0 });
      const currentRatio = viewport.width / viewport.height;
      ratioSum += currentRatio;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      this.slides.push({
        originalIndex: pageNum,
        canvas: canvas,
        imageUrl: null, // 延遲序列化省記憶體
        text: extractedText,
        width: viewport.width,
        height: viewport.height,
        hasNotes: pageHasNotes,
        excluded: false
      });
    }

    // 計算平均長寬比並比對最接近 4:3 還是 16:9
    const avgRatio = ratioSum / totalPages;
    this.detectedRatio = avgRatio;

    const ratio43 = 4 / 3;   // 約 1.3333
    const ratio169 = 16 / 9; // 約 1.7778
    const distTo43 = Math.abs(avgRatio - ratio43);
    const distTo169 = Math.abs(avgRatio - ratio169);

    const isCloserTo43 = distTo43 < distTo169;
    this.detectedRatioType = isCloserTo43 ? '4:3' : '16:9';
    const isStandard = (distTo43 < 0.06) || (distTo169 < 0.06);

    return {
      slides: this.slides,
      totalPages: totalPages,
      detectedRatio: this.detectedRatio,
      detectedRatioType: this.detectedRatioType,
      isStandardRatio: isStandard,
      rawRatioStr: `${avgRatio.toFixed(2)}:1`,
      hasHandwritingNotes: this.hasHandwritingNotes
    };
  }

  /**
   * 按需將指定頁面渲染為高畫質 JPEG ArrayBuffer（用於導出時保留手寫筆記）
   * @param {number} pageNum - 1-based 頁碼
   * @param {number} targetWidth - 目標寬度像素（預設 1800px，提供 300+ DPI 印刷畫質）
   * @returns {Promise<Uint8Array>} JPEG 影像位元資料
   */
  async renderPageHighResJpeg(pageNum, targetWidth = 1800) {
    if (!this.pdfDoc) {
      throw new Error('PDF 尚未載入完成');
    }
    const page = await this.pdfDoc.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    // 計算最適 scale，使寬度達到約 1800px，維持銳利邊緣且節省記憶體
    const scale = Math.max(1.5, Math.min(3.0, targetWidth / unscaledViewport.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    // 填入純白背景避免透明背景造成印表機疊印或黑底
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    }).promise;

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error(`第 ${pageNum} 頁高畫質渲染失敗`));
          return;
        }
        blob.arrayBuffer().then(buf => {
          // 清理 Canvas 避免記憶體滯留
          canvas.width = 0;
          canvas.height = 0;
          resolve(new Uint8Array(buf));
        }).catch(reject);
      }, 'image/jpeg', 0.92);
    });
  }
}

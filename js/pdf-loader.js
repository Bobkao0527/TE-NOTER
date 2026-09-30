/**
 * TE-NOTER - 本地 PDF 解析器與投影片渲染引擎 (pdf-loader.js)
 * 100% 瀏覽器本地執行，無需上傳伺服器。支援文字萃取、高清 Canvas 渲染與長寬比自動偵測。
 */

export class PDFLoader {
  constructor() {
    this.slides = []; // [{ originalIndex, canvas, imageUrl, text, width, height, excluded: false }]
    this.detectedRatio = null; // 寬 / 高 數值
    this.detectedRatioType = '4:3'; // '4:3' 或 '16:9'
    this.originalArrayBuffer = null; // 保存原始 ArrayBuffer 供向量直出使用
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
    const totalPages = pdfDoc.numPages;

    this.slides = [];
    let ratioSum = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress(pageNum, totalPages, `正在解析第 ${pageNum} / ${totalPages} 頁...`);
      }

      const page = await pdfDoc.getPage(pageNum);
      
      // 取出文字內容以供檢索
      const textContent = await page.getTextContent();
      const extractedText = textContent.items.map(item => item.str).join(' ');

      // 高清渲染設定 (scale: 1.6 提供列印時銳利的小字清晰度)
      const viewport = page.getViewport({ scale: 1.6 });
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
      rawRatioStr: `${avgRatio.toFixed(2)}:1`
    };
  }
}

/**
 * TE-NOTER - 向導問卷式流程主控制器 (app.js)
 * 完整實現 6 大步驟向導式流程、右側垂直時間軸進度條、上一步/下一步導航、單字表、考點查表與最終 PDF 導出
 */

import { LayoutEngine } from './layout-engine.js';
import { PDFLoader } from './pdf-loader.js';
import { SearchIndexEngine } from './search-index.js';

class TENoterWizardApp {
  constructor() {
    this.layoutEngine = new LayoutEngine();
    this.pdfLoader = new PDFLoader();
    this.searchEngine = new SearchIndexEngine();

    // 嚮導步驟狀態
    this.currentStep = 1;
    this.maxUnlockedStep = 1;

    // 核心大抄設定
    this.state = {
      ratio: '4:3',
      orientation: 'portrait',
      cols: 3,
      rows: 6,
      marginMm: 4.0,
      gapMm: 1.5,
      showBadge: true,
      showBorder: true,
      inkSaver: false,
      enableVocab: true,
      enableQuickRef: true,
      enableCustomNotes: false,
      customNotesText: '',
      notesCols: 2,
      enableNotesMemoGrid: true,
      vocabList: [],
      keyPointsList: [],
      fileName: null
    };

    this.initElements();
    this.bindEvents();
    this.updateTimelineUI();
    this.updateNavButtons();
  }

  initElements() {
    // 頂部導航
    this.btnQuickExport = document.getElementById('btnQuickExport') || document.getElementById('btnQuickPrint');

    // 步驟視圖面板
    this.stepPanes = {
      1: document.getElementById('step1'),
      2: document.getElementById('step2'),
      3: document.getElementById('step3'),
      4: document.getElementById('step4'),
      5: document.getElementById('step5'),
      6: document.getElementById('step6')
    };

    // 底部導航
    this.btnPrevStep = document.getElementById('btnPrevStep');
    this.btnNextStep = document.getElementById('btnNextStep');
    this.footerStepIndicator = document.getElementById('footerStepIndicator');

    // 右側時間軸
    this.timelineItems = document.querySelectorAll('.timeline-item');
    this.sideStatSlides = document.getElementById('sideStatSlides');
    this.sideStatPapers = document.getElementById('sideStatPapers');
    this.sideStatLayout = document.getElementById('sideStatLayout');
    this.sideStatFillBar = document.getElementById('sideStatFillBar');
    this.sideStatSavingsBadge = document.getElementById('sideStatSavingsBadge');
    this.sideStatPercentText = document.getElementById('sideStatPercentText');
    this.timelineStep1Sub = document.getElementById('timelineStep1Sub');

    // STEP 1 元素
    this.dropZone = document.getElementById('dropZone');
    this.pdfFileInput = document.getElementById('pdfFileInput');
    this.fileLoadedCard = document.getElementById('fileLoadedCard');
    this.loadedFileName = document.getElementById('loadedFileName');
    this.loadedFilePages = document.getElementById('loadedFilePages');
    this.loadedFileRatio = document.getElementById('loadedFileRatio');
    this.loadedFileGrid = document.getElementById('loadedFileGrid');
    this.btnReupload = document.getElementById('btnReupload');

    // STEP 2 元素
    this.slideSelectorGrid = document.getElementById('slideSelectorGrid');
    this.step2SummaryText = document.getElementById('step2SummaryText');
    this.step2LayoutText = document.getElementById('step2LayoutText');
    this.slideFilterInput = document.getElementById('slideFilterInput');
    this.btnSelectAll = document.getElementById('btnSelectAll');
    this.btnDeselectAll = document.getElementById('btnDeselectAll');
    this.btnInvertSelect = document.getElementById('btnInvertSelect');

    // STEP 3 元素 (單字表)
    this.chkEnableVocab = document.getElementById('chkEnableVocab');
    this.vocabConfigArea = document.getElementById('vocabConfigArea');
    this.vocabModeButtons = document.querySelectorAll('.ai-mode-tabs .btn-toggle');
    this.vocabLocalArea = document.getElementById('vocabLocalArea');
    this.vocabPromptArea = document.getElementById('vocabPromptArea');
    this.vocabCount = document.getElementById('vocabCount');
    this.vocabTagsFlow = document.getElementById('vocabTagsFlow');
    this.btnRefreshVocab = document.getElementById('btnRefreshVocab');
    this.btnCopyVocabPrompt = document.getElementById('btnCopyVocabPrompt');
    this.vocabPasteInput = document.getElementById('vocabPasteInput');

    // STEP 4 元素 (逐頁速查)
    this.chkEnableQuickRef = document.getElementById('chkEnableQuickRef');
    this.quickRefConfigArea = document.getElementById('quickRefConfigArea');
    this.quickRefPreviewContainer = document.getElementById('quickRefPreviewContainer');
    this.btnRefreshQuickRef = document.getElementById('btnRefreshQuickRef');
    this.quickRefCount = document.getElementById('quickRefCount');

    // STEP 5 元素 (外部筆記)
    this.chkEnableCustomNotes = document.getElementById('chkEnableCustomNotes');
    this.customNotesArea = document.getElementById('customNotesArea');
    this.customNotesInput = document.getElementById('customNotesInput');
    this.customNotesCharCount = document.getElementById('customNotesCharCount');
    this.btnCopyNotesPrompt = document.getElementById('btnCopyNotesPrompt');
    this.chkNotesMemoGrid = document.getElementById('chkNotesMemoGrid');
    this.selectNotesColumns = document.getElementById('selectNotesColumns');

    // STEP 6 元素 (最終成果)
    this.btnExportVectorPdf = document.getElementById('btnExportVectorPdf');
    this.finalPrintContainer = document.getElementById('finalPrintContainer');
    this.pdfScrollContainer = document.getElementById('pdfScrollContainer');
    this.chkFinalBadge = document.getElementById('chkFinalBadge');
    this.chkFinalBorder = document.getElementById('chkFinalBorder');
    this.chkFinalInkSaver = document.getElementById('chkFinalInkSaver');
    this.finalZoomSlider = document.getElementById('finalZoomSlider');
    this.finalZoomVal = document.getElementById('finalZoomVal');

    // 狀態追蹤
    this.isCustomVocab = false;
    this.isCustomKeypoints = false;
    this.slidesSelectionDirty = false;

    // Toast
    this.toastNotification = document.getElementById('toastNotification');
  }

  bindEvents() {
    // 底部導航按鈕
    this.btnPrevStep.addEventListener('click', () => this.goToPrevStep());
    this.btnNextStep.addEventListener('click', () => this.goToNextStep());

    // 向量 PDF 導出按鈕
    if (this.btnExportVectorPdf) {
      this.btnExportVectorPdf.addEventListener('click', () => this.handleExportVectorPdf());
    }
    if (this.btnQuickExport) {
      this.btnQuickExport.addEventListener('click', () => this.handleExportVectorPdf());
    }

    // 右側時間軸點選跳轉
    this.timelineItems.forEach(item => {
      item.addEventListener('click', () => {
        const step = parseInt(item.dataset.step, 10);
        if (step <= this.maxUnlockedStep) {
          this.goToStep(step);
        } else {
          this.showToast('⚠️ 請先完成前面的步驟');
        }
      });
    });

    // STEP 1: 檔案上傳
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    this.pdfFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    this.btnReupload.addEventListener('click', () => {
      this.pdfFileInput.click();
    });

    // STEP 2: 縮圖挑選按鈕
    this.btnSelectAll.addEventListener('click', () => this.setAllSlidesExcluded(false));
    this.btnDeselectAll.addEventListener('click', () => this.setAllSlidesExcluded(true));
    this.btnInvertSelect.addEventListener('click', () => this.invertSlidesExcluded());
    this.slideFilterInput.addEventListener('input', (e) => this.filterSlideCards(e.target.value));

    // STEP 3: 單字表設定
    this.chkEnableVocab.addEventListener('change', (e) => {
      this.state.enableVocab = e.target.checked;
      this.vocabConfigArea.classList.toggle('hidden', !this.state.enableVocab);
      this.updateStats();
    });

    this.vocabModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.vocabModeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.vmode;
        if (this.vocabLocalArea) this.vocabLocalArea.classList.toggle('hidden', mode !== 'local');
        if (this.vocabPromptArea) this.vocabPromptArea.classList.toggle('hidden', mode !== 'prompt');
      });
    });

    this.btnRefreshVocab.addEventListener('click', () => {
      const activeSlides = this.getActiveSlides();
      this.state.vocabList = this.searchEngine.extractVocabulary(activeSlides, 70);
      this.isCustomVocab = false;
      this.renderVocabTags();
      this.compileFinalDocument();
      this.showToast('✅ 已重新依目前選取之投影片萃取詞彙！');
    });
    this.btnCopyVocabPrompt.addEventListener('click', () => this.copyVocabPrompt());

    // STEP 3: 輸入防抖
    const debouncedVocabPaste = this.debounce((val) => this.handleVocabPasteInput(val), 350);
    this.vocabPasteInput.addEventListener('input', (e) => debouncedVocabPaste(e.target.value));

    // STEP 4: 逐頁速查表設定
    this.chkEnableQuickRef.addEventListener('change', (e) => {
      this.state.enableQuickRef = e.target.checked;
      this.quickRefConfigArea.classList.toggle('hidden', !this.state.enableQuickRef);
      this.updateStats();
    });

    if (this.btnRefreshQuickRef) {
      this.btnRefreshQuickRef.addEventListener('click', () => {
        const activeSlides = this.getActiveSlides();
        this.state.keyPointsList = this.searchEngine.extractSlideKeyPoints(activeSlides);
        this.isCustomKeypoints = false;
        this.renderQuickRefPreview();
        this.compileFinalDocument();
        this.showToast('✅ 已重新依目前選取之投影片萃取考點目錄！');
      });
    }

    // STEP 5: 外部筆記設定
    this.chkEnableCustomNotes.addEventListener('change', (e) => {
      this.state.enableCustomNotes = e.target.checked;
      this.customNotesArea.classList.toggle('hidden', !this.state.enableCustomNotes);
      this.updateStats();
      this.compileFinalDocument();
    });

    if (this.btnCopyNotesPrompt) {
      this.btnCopyNotesPrompt.addEventListener('click', () => this.copyNotesPrompt());
    }

    // STEP 5: 輸入防抖 (即時更新字數統計，防抖編譯 A4 預覽)
    const debouncedCompileNotes = this.debounce(() => {
      this.updateStats();
      this.compileFinalDocument();
    }, 350);

    this.customNotesInput.addEventListener('input', (e) => {
      this.state.customNotesText = e.target.value;
      const count = this.state.customNotesText.length;
      const estPages = Math.max(count > 0 ? 1 : 0, Math.ceil(count / 1800));
      this.customNotesCharCount.textContent = `共 ${count} 字元 (預估約佔 ${estPages} 頁 A4，完整支援 Markdown & LaTeX 公式)`;
      debouncedCompileNotes();
    });

    // STEP 5: 外部筆記排版設定 (備忘網格與欄數)
    if (this.chkNotesMemoGrid) {
      this.chkNotesMemoGrid.addEventListener('change', (e) => {
        this.state.enableNotesMemoGrid = e.target.checked;
        this.compileFinalDocument();
      });
    }

    if (this.selectNotesColumns) {
      this.selectNotesColumns.addEventListener('change', (e) => {
        this.state.notesCols = parseInt(e.target.value, 10) || 2;
        this.updateStats();
        this.compileFinalDocument();
      });
    }

    // STEP 6: 列印選項微調
    this.chkFinalBadge.addEventListener('change', (e) => {
      this.state.showBadge = e.target.checked;
      this.compileFinalDocument();
    });

    this.chkFinalBorder.addEventListener('change', (e) => {
      this.state.showBorder = e.target.checked;
      this.compileFinalDocument();
    });

    this.chkFinalInkSaver.addEventListener('change', (e) => {
      this.state.inkSaver = e.target.checked;
      document.body.classList.toggle('ink-saver-active', this.state.inkSaver);
      if (this.state.inkSaver) {
        this.showToast('💡 已套用黑白高對比預覽模式');
      }
    });

    // STEP 6: A4 預覽縮放滑桿 (採用幾何縮放與負 margin 補償，完全杜絕 CSS 多欄跑版)
    if (this.finalZoomSlider && this.finalZoomVal) {
      this.finalZoomSlider.addEventListener('input', (e) => {
        const zoom = parseFloat(e.target.value);
        this.finalZoomVal.textContent = `${Math.round(zoom * 100)}%`;
        this.updatePreviewZoom(zoom);
      });
    }

    // STEP 6: 預覽視窗觸控板雙指開闔縮放 (Pinch-to-zoom) 與 Ctrl + 滾輪縮放支援
    if (this.pdfScrollContainer && this.finalZoomSlider) {
      this.pdfScrollContainer.addEventListener('wheel', (e) => {
        // macOS 觸控板雙指開闔捏合時，瀏覽器會觸發 wheel 事件且 e.ctrlKey === true
        if (e.ctrlKey) {
          e.preventDefault(); // 阻止瀏覽器默認全視窗放大縮小
          const currentZoom = parseFloat(this.finalZoomSlider.value) || 0.75;
          // deltaY 在雙指張開(放大)時為負，捏合(縮小)時為正
          const delta = -e.deltaY;
          const zoomDelta = delta * 0.005;
          let nextZoom = Math.min(Math.max(currentZoom + zoomDelta, 0.35), 1.5);
          nextZoom = Math.round(nextZoom * 100) / 100;

          this.finalZoomSlider.value = nextZoom;
          if (this.finalZoomVal) {
            this.finalZoomVal.textContent = `${Math.round(nextZoom * 100)}%`;
          }
          this.updatePreviewZoom(nextZoom);
        }
      }, { passive: false });
    }

    // 鍵盤快速鍵 (⌘P / Ctrl+P 或 ⌘S / Ctrl+S 統一導出 PDF，輸入文字時防衝突)
    window.addEventListener('keydown', (e) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

      if (key === 'p') {
        e.preventDefault();
        this.handleExportVectorPdf();
      } else if (key === 's') {
        e.preventDefault();
        if (!isTyping) {
          this.handleExportVectorPdf();
        }
      }
    });
  }

  /**
   * 輕量防抖工具函式
   */
  debounce(fn, delay = 350) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * 切換到指定步驟
   */
  goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 6) return;

    this.currentStep = stepNumber;
    if (stepNumber > this.maxUnlockedStep) {
      this.maxUnlockedStep = stepNumber;
    }

    // 切換面板顯示
    Object.keys(this.stepPanes).forEach(num => {
      this.stepPanes[num].classList.toggle('active', parseInt(num, 10) === stepNumber);
    });

    // 更新底部與右側 UI
    this.updateTimelineUI();
    this.updateNavButtons();

    // 觸發該步驟專屬渲染
    if (stepNumber === 2) {
      this.renderSlideSelector();
    } else if (stepNumber === 3) {
      // 若在 STEP 2 變更過投影片挑選且尚未手動貼上外部 AI，自動依最新挑選重新萃取
      if (this.slidesSelectionDirty && !this.isCustomVocab) {
        const activeSlides = this.getActiveSlides();
        this.state.vocabList = this.searchEngine.extractVocabulary(activeSlides, 70);
        this.renderVocabTags();
      } else {
        this.generateVocabularyList();
      }
    } else if (stepNumber === 4) {
      // 若在 STEP 2 變更過挑選且尚未手動貼上外部 AI，自動依最新挑選重新萃取
      if (this.slidesSelectionDirty && !this.isCustomKeypoints) {
        const activeSlides = this.getActiveSlides();
        this.state.keyPointsList = this.searchEngine.extractSlideKeyPoints(activeSlides);
        this.renderQuickRefPreview();
        this.slidesSelectionDirty = false;
      } else {
        this.generateQuickRefList();
      }
    } else if (stepNumber === 6) {
      this.compileFinalDocument();
    }
  }

  goToNextStep() {
    if (this.currentStep === 1 && !this.state.fileName) {
      this.showToast('⚠️ 請先匯入課程簡報 PDF 檔案');
      return;
    }

    if (this.currentStep === 6) {
      // 在最後一步點擊下一步直接導出高畫質向量 PDF
      this.handleExportVectorPdf();
      return;
    }

    this.goToStep(this.currentStep + 1);
  }

  goToPrevStep() {
    if (this.currentStep > 1) {
      this.goToStep(this.currentStep - 1);
    }
  }

  /**
   * 更新底部按鈕與狀態提示
   */
  updateNavButtons() {
    this.btnPrevStep.disabled = (this.currentStep === 1);

    const stepTitles = {
      1: '步驟 1 / 6：匯入檔案',
      2: '步驟 2 / 6：預覽自動排版與剔除',
      3: '步驟 3 / 6：AI 英文單字表',
      4: '步驟 4 / 6：逐頁考點查表',
      5: '步驟 5 / 6：外部筆記整合',
      6: '步驟 6 / 6：預覽成果與導出 PDF'
    };
    this.footerStepIndicator.textContent = stepTitles[this.currentStep] || '';

    if (this.currentStep === 6) {
      this.btnNextStep.innerHTML = `
        <span>導出高畫質 PDF</span>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      `;
    } else {
      this.btnNextStep.innerHTML = `
        <span>下一步</span>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"></polyline></svg>
      `;
    }
  }

  /**
   * 更新右側時間軸進度條 UI
   */
  updateTimelineUI() {
    this.timelineItems.forEach(item => {
      const step = parseInt(item.dataset.step, 10);
      item.classList.remove('active', 'completed');

      if (step === this.currentStep) {
        item.classList.add('active');
        item.querySelector('.marker-dot').textContent = step;
      } else if (step < this.currentStep) {
        item.classList.add('completed');
        item.querySelector('.marker-dot').textContent = '✓';
      } else {
        item.querySelector('.marker-dot').textContent = step;
      }
    });

    this.updateStats();
  }

  /**
   * 更新右側統計卡片
   */
  updateStats() {
    const activeCount = this.getActiveSlides().length;
    this.sideStatSlides.textContent = `${activeCount} 頁`;

    if (activeCount === 0) {
      this.sideStatPapers.textContent = `0 面 (0 張雙面)`;
      if (this.sideStatSavingsBadge) this.sideStatSavingsBadge.textContent = `省紙 0%`;
      if (this.sideStatFillBar) this.sideStatFillBar.style.width = `0%`;
      if (this.sideStatPercentText) this.sideStatPercentText.textContent = `省紙 0%`;
      return;
    }

    const itemsPerSheet = this.state.cols * this.state.rows;
    const slideSheets = Math.ceil(activeCount / itemsPerSheet) || 0;
    let appendixSheetsCount = 0;

    // 附錄頁數累加 (精確對應多頁拆分)
    if (this.state.enableVocab && this.state.vocabList.length > 0) {
      appendixSheetsCount += Math.ceil(this.state.vocabList.length / 105);
    }
    if (this.state.enableQuickRef && this.state.keyPointsList.length > 0) {
      appendixSheetsCount += Math.ceil(this.state.keyPointsList.length / 114);
    }
    if (this.state.enableCustomNotes && this.state.customNotesText.trim().length > 0) {
      appendixSheetsCount += this.searchEngine.createCustomNotesPrintSheets(this.state.customNotesText, {
        cols: this.state.notesCols || 2,
        enableMemoGrid: this.state.enableNotesMemoGrid !== false
      }).length;
    }

    const totalSheets = slideSheets + appendixSheetsCount;
    const doubleSheets = Math.ceil(totalSheets / 2);

    this.sideStatPapers.textContent = `${totalSheets} 面 (${doubleSheets} 張雙面)`;
    this.sideStatLayout.textContent = `直式 ${this.state.cols}×${this.state.rows}`;

    // 省紙效益計算：原始簡報雙面列印張數 vs 紙本資料雙面列印張數
    const originalDoubleSheets = Math.ceil(activeCount / 2);
    const savedSheets = Math.max(0, originalDoubleSheets - doubleSheets);
    const savingsRatio = originalDoubleSheets > 0 ? (savedSheets / originalDoubleSheets) : 0;
    const savingsPct = Math.min(99, Math.round(savingsRatio * 100));

    if (this.sideStatSavingsBadge) {
      this.sideStatSavingsBadge.textContent = `省紙 ${savingsPct}%`;
      this.sideStatSavingsBadge.title = `原本需印 ${originalDoubleSheets} 張雙面紙，大抄僅需 ${doubleSheets} 張雙面紙，節省了 ${savedSheets} 張紙！`;
    }

    if (this.sideStatPercentText) {
      this.sideStatPercentText.textContent = `節省 ${savingsPct}% (少印 ${savedSheets} 張紙)`;
    }

    if (this.sideStatFillBar) {
      this.sideStatFillBar.style.width = `${savingsPct}%`;
    }
  }

  /**
   * STEP 1: 處理 PDF 上傳與智慧自動適配
   */
  async handleFileUpload(file) {
    if (!file || file.type !== 'application/pdf') {
      this.showToast('⚠️ 請選擇合法的 PDF 投影片檔案');
      return;
    }

    this.showToast(`正在載入並解析 ${file.name}...`);
    this.state.fileName = file.name;

    try {
      const result = await this.pdfLoader.loadPDF(file, (curr, total, status) => {
        this.showToast(`${status} (${Math.round((curr / total) * 100)}%)`);
      });

      // 辨識比例並套用最佳直向排版
      const type = result.detectedRatioType; // '4:3' 或 '16:9'
      this.state.ratio = type;
      if (type === '16:9') {
        this.state.cols = 3;
        this.state.rows = 7;
      } else {
        this.state.cols = 3;
        this.state.rows = 6;
      }

      // 更新 STEP 1 卡片
      this.fileLoadedCard.classList.remove('hidden');
      this.loadedFileName.textContent = file.name;
      this.loadedFilePages.textContent = `${result.totalPages} 頁`;
      this.loadedFileRatio.textContent = result.isStandardRatio ? `${type} 比例` : `接近 ${type} (${result.rawRatioStr})`;
      this.loadedFileGrid.textContent = `直式 ${this.state.cols}×${this.state.rows} (${this.state.cols * this.state.rows}張/面)`;

      // 更新時間軸
      this.timelineStep1Sub.textContent = `${file.name.substring(0, 16)}... (${result.totalPages}頁)`;

      this.maxUnlockedStep = Math.max(this.maxUnlockedStep, 2);
      this.showToast(`🎉 成功載入！已為您自動適配直式 ${this.state.cols}×${this.state.rows} 排版`);

      // 自動跳轉至 STEP 2 進行預覽與篩選
      setTimeout(() => {
        this.goToStep(2);
      }, 500);

    } catch (err) {
      console.error(err);
      this.showToast(`❌ 解析失敗: ${err.message}`);
    }
  }

  getActiveSlides() {
    return this.pdfLoader.slides.filter(s => !s.excluded);
  }

  /**
   * STEP 2: 渲染投影片挑選剔除面板
   */
  renderSlideSelector() {
    this.slideSelectorGrid.innerHTML = '';
    const slides = this.pdfLoader.slides;
    if (slides.length === 0) return;

    slides.forEach(slide => {
      const card = document.createElement('div');
      card.className = `slide-card ${slide.excluded ? 'excluded' : ''}`;
      card.dataset.pageNum = slide.originalIndex;

      const preview = document.createElement('div');
      preview.className = 'slide-card-preview';

      const img = document.createElement('img');
      img.src = slide.imageUrl || (slide.canvas ? slide.canvas.toDataURL('image/jpeg', 0.8) : '');
      slide.imageUrl = img.src;
      preview.appendChild(img);

      const footer = document.createElement('div');
      footer.className = 'slide-card-footer';
      footer.innerHTML = `
        <span class="slide-card-num">#${slide.originalIndex}</span>
        <span class="slide-card-action">${slide.excluded ? '點擊加入' : '點擊剔除'}</span>
      `;

      card.appendChild(preview);
      card.appendChild(footer);

      card.addEventListener('click', () => {
        slide.excluded = !slide.excluded;
        card.classList.toggle('excluded', slide.excluded);
        card.querySelector('.slide-card-action').textContent = slide.excluded ? '點擊加入' : '點擊剔除';
        this.slidesSelectionDirty = true;
        this.syncExcludedWithKeypoints();
        this.updateStep2Summary();
        this.updateStats();
      });

      this.slideSelectorGrid.appendChild(card);
    });

    this.updateStep2Summary();
  }

  setAllSlidesExcluded(excluded) {
    this.pdfLoader.slides.forEach(s => s.excluded = excluded);
    this.slidesSelectionDirty = true;
    this.syncExcludedWithKeypoints();
    this.renderSlideSelector();
    this.updateStats();
  }

  invertSlidesExcluded() {
    this.pdfLoader.slides.forEach(s => s.excluded = !s.excluded);
    this.slidesSelectionDirty = true;
    this.syncExcludedWithKeypoints();
    this.renderSlideSelector();
    this.updateStats();
  }

  syncExcludedWithKeypoints() {
    if (!this.state.keyPointsList || this.state.keyPointsList.length === 0) return;
    const excludedSet = new Set(this.pdfLoader.slides.filter(s => s.excluded).map(s => s.originalIndex));
    this.state.keyPointsList.forEach(kp => {
      if (!kp.isSpan && kp.slideNum && excludedSet.has(kp.slideNum)) {
        kp.isExcluded = true;
      } else {
        kp.isExcluded = false;
      }
    });
  }

  filterSlideCards(query) {
    const term = query.trim().toLowerCase();
    const cards = this.slideSelectorGrid.querySelectorAll('.slide-card');
    this.pdfLoader.slides.forEach((slide, idx) => {
      const card = cards[idx];
      if (!card) return;
      const match = !term || (slide.text && slide.text.toLowerCase().includes(term));
      card.style.display = match ? 'block' : 'none';
    });
  }

  updateStep2Summary() {
    const total = this.pdfLoader.slides.length;
    const active = this.getActiveSlides().length;
    this.step2SummaryText.textContent = `已選取 ${active} / ${total} 頁 (剔除 ${total - active} 頁)`;
    this.step2LayoutText.textContent = `直式 ${this.state.cols}×${this.state.rows} (${this.state.cols * this.state.rows}張/面)`;
  }



  /**
   * STEP 3: 本地單字與專有名詞萃取
   */
  generateVocabularyList() {
    const activeSlides = this.getActiveSlides();
    if (activeSlides.length === 0) return;

    if (!this.state.vocabList || this.state.vocabList.length === 0) {
      this.state.vocabList = this.searchEngine.extractVocabulary(activeSlides, 70);
    }
    this.renderVocabTags();
  }

  renderVocabTags() {
    if (!this.vocabCount || !this.vocabTagsFlow) return;
    this.vocabCount.textContent = this.state.vocabList.length;
    this.vocabTagsFlow.innerHTML = '';

    this.state.vocabList.forEach((item, index) => {
      const chip = document.createElement('span');
      chip.className = 'vocab-chip';

      let displayTerm = item.term || '';
      displayTerm = displayTerm.replace(/\[(?:英|UK)\]/gi, '<span style="color:#d97706; font-size:0.75em; font-weight:700; background:#fef3c7; padding:0 2px; border-radius:2px; margin:0 1px;">[英]</span>');
      displayTerm = displayTerm.replace(/\[(?:美|US)\]/gi, '<span style="color:#2563eb; font-size:0.75em; font-weight:700; background:#dbeafe; padding:0 2px; border-radius:2px; margin:0 1px;">[美]</span>');

      let zhLabel = '';
      if (item.zh) {
        zhLabel = `<span style="color:#059669; font-size:0.85em; margin-left:4px;">: ${item.zh}</span>`;
      }

      const pageStr = (item.pages && item.pages.length > 0) ? `<span class="chip-pages">P.${item.pages.slice(0, 3).join(',')}</span>` : '';

      chip.innerHTML = `
        <strong>${displayTerm}</strong>
        ${zhLabel}
        ${pageStr}
        <button class="btn-del-chip" title="刪除此詞彙">✕</button>
      `;

      chip.querySelector('.btn-del-chip').addEventListener('click', (e) => {
        e.stopPropagation();
        this.state.vocabList.splice(index, 1);
        chip.remove();
        this.vocabCount.textContent = this.state.vocabList.length;
        this.compileFinalDocument();
      });

      this.vocabTagsFlow.appendChild(chip);
    });
  }

  copyVocabPrompt() {
    const activeSlides = this.getActiveSlides();
    if (activeSlides.length === 0) {
      this.showToast('⚠️ 尚未載入投影片文字');
      return;
    }

    const prompt = this.searchEngine.generateFullSlidesAIPrompt(activeSlides);
    navigator.clipboard.writeText(prompt).then(() => {
      this.showToast(`📋 已複製全簡報文字 (${activeSlides.length} 頁) 與深度分析 Prompt！請直接貼給 ChatGPT / Claude`);

      // 按鈕即時狀態視覺反饋
      if (this.btnCopyVocabPrompt) {
        this.btnCopyVocabPrompt.classList.add('copied');
        const main = this.btnCopyVocabPrompt.querySelector('.btn-copy-main');
        const badge = this.btnCopyVocabPrompt.querySelector('.btn-copy-badge');
        const origMain = main ? main.textContent : '';
        const origBadge = badge ? badge.textContent : '';

        if (main) main.textContent = '✅ 已成功複製全簡報 Prompt 到剪貼簿！';
        if (badge) badge.textContent = '已複製 ✓';

        setTimeout(() => {
          this.btnCopyVocabPrompt.classList.remove('copied');
          if (main) main.textContent = origMain;
          if (badge) badge.textContent = origBadge;
        }, 2800);
      }
    }).catch(() => {
      this.showToast('⚠️ 複製失敗，請手動選取');
    });
  }

  /**
   * 複製專屬期末考大抄 AI 整理 Prompt (專為搭配簡報檔案附件上傳設計)
   */
  copyNotesPrompt() {
    const prompt = this.searchEngine.getNotesPromptTemplate();

    navigator.clipboard.writeText(prompt).then(() => {
      this.showToast('📋 已複製終極考前大抄 Prompt！請連同簡報檔案 (PDF) 一同貼給 ChatGPT / Claude');

      if (this.btnCopyNotesPrompt) {
        this.btnCopyNotesPrompt.classList.add('copied');
        const main = this.btnCopyNotesPrompt.querySelector('.btn-copy-main');
        const badge = this.btnCopyNotesPrompt.querySelector('.btn-copy-badge');
        const origMain = main ? main.textContent : '';
        const origBadge = badge ? badge.textContent : '';

        if (main) main.textContent = '✅ 已成功複製 Prompt！請連同簡報檔案一起貼給 AI';
        if (badge) badge.textContent = '已複製 ✓';

        setTimeout(() => {
          this.btnCopyNotesPrompt.classList.remove('copied');
          if (main) main.textContent = origMain;
          if (badge) badge.textContent = origBadge;
        }, 2800);
      }
    }).catch(() => {
      this.showToast('⚠️ 複製失敗，請手動選取');
    });
  }

  /**
   * 智慧處理外部 AI 貼回之文字 (若含 [VOCAB] 與 [KEYPOINTS]，同步自動更新單字表與考點目錄)
   */
  handleVocabPasteInput(text) {
    if (!text || text.trim() === '') {
      this.compileFinalDocument();
      return;
    }

    const parsed = this.searchEngine.parseFullAIResponse(text);

    // 若解析到單字 (確保 A ~ Z 字母不分大小寫排序)
    if (parsed.terms && parsed.terms.length > 0) {
      parsed.terms.sort((a, b) => (a.term || '').localeCompare(b.term || '', 'en', { sensitivity: 'base', numeric: true }));
      this.state.vocabList = parsed.terms;
      this.isCustomVocab = true;
      this.renderVocabTags();
    }

    // 若解析到考點 (確保按頁碼由小到大嚴格排序)
    if (parsed.keypoints && parsed.keypoints.length > 0) {
      parsed.keypoints.sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        return a.isSpan ? -1 : 1;
      });
      this.state.keyPointsList = parsed.keypoints;
      this.isCustomKeypoints = true;
      this.syncExcludedWithKeypoints();
      this.renderQuickRefPreview();
      this.showToast(`🎉 已自動同步辨識：${parsed.terms.length} 個詞彙 (A-Z排序) + ${parsed.keypoints.length} 條考點 (頁碼排序)！`);
    }

    this.updateStats();
    this.compileFinalDocument();
  }

  /**
   * STEP 4: 逐頁考點快速查對表生成
   */
  generateQuickRefList() {
    const activeSlides = this.getActiveSlides();
    if (activeSlides.length === 0) return;

    if (!this.state.keyPointsList || this.state.keyPointsList.length === 0) {
      this.state.keyPointsList = this.searchEngine.extractSlideKeyPoints(activeSlides);
      this.isCustomKeypoints = false;
    }
    this.syncExcludedWithKeypoints();
    this.renderQuickRefPreview();
  }

  renderQuickRefPreview() {
    if (!this.quickRefPreviewContainer) return;
    this.quickRefPreviewContainer.innerHTML = '';

    if (this.quickRefCount) {
      const activeCount = this.state.keyPointsList.filter(k => !k.isExcluded).length;
      this.quickRefCount.textContent = activeCount;
    }

    this.state.keyPointsList.forEach(kp => {
      // 若該單一投影片已在 STEP 2 被剔除，預覽加上半透明標籤以直觀反饋
      const row = document.createElement('div');
      const isSpan = kp.isSpan || (kp.pageStr && kp.pageStr.includes('-'));
      row.className = `quick-ref-row ${isSpan ? 'quick-ref-span-row' : ''} ${kp.isExcluded ? 'quickref-excluded-row' : ''}`;
      if (kp.isExcluded) {
        row.style.opacity = '0.4';
        row.title = '此頁面已在步驟 2 剔除，不會輸出於最終 A4 附錄中';
      }

      const pageDisplay = kp.pageStr || (kp.slideNum ? `#${kp.slideNum}` : '');

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

      const excludedBadge = kp.isExcluded ? '<span style="font-size:0.7em; color:#ef4444; margin-left:4px;">(已剔除)</span>' : '';

      row.innerHTML = `
        <span class="quick-ref-page" style="${isSpan ? 'font-weight:bold; color:#0f172a;' : ''}">${pageDisplay}</span>
        <span class="quick-ref-title" style="${isSpan ? 'font-weight:600;' : ''}">${tagHtml}${kp.title || kp.fullTitle}${excludedBadge}</span>
      `;
      this.quickRefPreviewContainer.appendChild(row);
    });
  }

  /**
   * STEP 6: 編譯組裝最終成果全覽
   */
  compileFinalDocument() {
    this.finalPrintContainer.innerHTML = '';
    const activeSlides = this.getActiveSlides();
    if (activeSlides.length === 0) return;

    // 同步剔除狀態
    this.syncExcludedWithKeypoints();

    // 套用目前設定之縮放比例
    const currentZoom = this.finalZoomSlider ? parseFloat(this.finalZoomSlider.value) : 0.75;
    this.finalPrintContainer.style.setProperty('--preview-zoom', currentZoom);

    // 1. 簡報實體高密度網格頁 (3x6 或 3x7)
    const metrics = this.layoutEngine.calculateMetrics({
      orientation: 'portrait',
      cols: this.state.cols,
      rows: this.state.rows,
      marginMm: this.state.marginMm,
      gapMm: this.state.gapMm,
      ratioStr: this.state.ratio,
      detectedRatio: this.pdfLoader.detectedRatio,
      totalSlidesCount: activeSlides.length
    });

    this.layoutEngine.generatePrintPages(this.finalPrintContainer, activeSlides, {
      cols: this.state.cols,
      rows: this.state.rows,
      marginMm: this.state.marginMm,
      gapMm: this.state.gapMm,
      orientation: 'portrait',
      showBadge: this.state.showBadge,
      showBorder: this.state.showBorder
    }, metrics);

    // 2. 附錄：AI 英文單字表 (如果啟用，支援多頁)
    if (this.state.enableVocab && this.state.vocabList.length > 0) {
      const vocabSheets = this.searchEngine.createVocabularyPrintSheets(this.state.vocabList);
      vocabSheets.forEach(sheet => this.finalPrintContainer.appendChild(sheet));
    }

    // 3. 附錄：逐頁考點速查目錄 (如果啟用，支援多頁自動分頁防溢出，排除剔除頁)
    if (this.state.enableQuickRef && this.state.keyPointsList.length > 0) {
      const quickRefSheets = this.searchEngine.createQuickRefPrintSheets(this.state.keyPointsList);
      quickRefSheets.forEach(sheet => this.finalPrintContainer.appendChild(sheet));
    }

    // 4. 附錄：外部 AI 自訂筆記 (如果啟用且有內容，支援多頁自動分頁與備忘網格)
    const customNotes = (this.customNotesInput ? this.customNotesInput.value : this.state.customNotesText || '').trim();
    if (this.state.enableCustomNotes && customNotes !== '') {
      const notesSheets = this.searchEngine.createCustomNotesPrintSheets(customNotes, {
        cols: this.state.notesCols || 2,
        enableMemoGrid: this.state.enableNotesMemoGrid !== false
      });
      notesSheets.forEach(sheet => this.finalPrintContainer.appendChild(sheet));
    }

    // 5. 確保套用縮放比例與邊界補償
    this.updatePreviewZoom(currentZoom);
  }

  /**
   * 更新 A4 預覽縮放比例並補償容器高度
   * 使用 transform: scale 實現純 GPU 幾何縮放，徹底避免 CSS 欄位與排版 Reflow 跑版
   * 同時動態調整 margin-bottom 負值以消除縮放帶來的留白或溢出
   * @param {number} zoom 縮放比例 (例如 0.75)
   */
  updatePreviewZoom(zoom) {
    if (!this.finalPrintContainer) return;
    this.finalPrintContainer.style.setProperty('--preview-zoom', zoom);

    // 計算未縮放佈局高度並以 margin-bottom 補償外層滾動條
    requestAnimationFrame(() => {
      if (!this.finalPrintContainer) return;
      const naturalHeight = this.finalPrintContainer.offsetHeight;
      if (naturalHeight > 0) {
        const heightDifference = naturalHeight * (zoom - 1);
        this.finalPrintContainer.style.marginBottom = `${heightDifference}px`;
      }
    });
  }

  /**
   * 觸發 PDF 導出
   */
  triggerPrint() {
    this.handleExportVectorPdf();
  }

  /**
   * 匯出標準高畫質向量 PDF 檔案（防切邊、100% 原始解析度）
   */
  async handleExportVectorPdf() {
    if (!this.pdfLoader.originalArrayBuffer) {
      this.showToast('⚠️ 尚未載入 PDF 檔案');
      return;
    }

    const activeSlides = this.getActiveSlides();
    if (activeSlides.length === 0) {
      this.showToast('⚠️ 未選取任何投影片');
      return;
    }

    // 同步剔除狀態
    this.syncExcludedWithKeypoints();

    const btn = this.btnExportVectorPdf;
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle>
        </svg>
        <span>正在排版高畫質向量 PDF...</span>
      `;
    }

    this.showToast('🚀 正在合成標準向量 PDF，保留原生畫質並預留安全邊距...');

    try {
      // 收集附錄 DOM (若有啟用，支援多頁)
      const appendixSheets = [];
      if (this.state.enableVocab && this.state.vocabList.length > 0) {
        const customPasted = this.vocabPasteInput.value;
        const vSheets = this.searchEngine.createVocabularyPrintSheets(this.state.vocabList, customPasted);
        appendixSheets.push(...vSheets);
      }
      if (this.state.enableQuickRef && this.state.keyPointsList.length > 0) {
        const qSheets = this.searchEngine.createQuickRefPrintSheets(this.state.keyPointsList);
        appendixSheets.push(...qSheets);
      }
      const customNotes = (this.customNotesInput ? this.customNotesInput.value : this.state.customNotesText || '').trim();
      if (this.state.enableCustomNotes && customNotes !== '') {
        const nSheets = this.searchEngine.createCustomNotesPrintSheets(customNotes, {
          cols: this.state.notesCols || 2,
          enableMemoGrid: this.state.enableNotesMemoGrid !== false
        });
        appendixSheets.push(...nSheets);
      }

      const pdfBlob = await this.layoutEngine.exportVectorPdf(
        this.pdfLoader.originalArrayBuffer.slice(0),
        activeSlides,
        {
          cols: this.state.cols,
          rows: this.state.rows,
          marginMm: this.state.marginMm || 4.0, // 與預覽保持 100% 絕對一致
          gapMm: this.state.gapMm || 1.5,       // 與預覽保持 100% 絕對一致
          showBadge: this.state.showBadge,
          showBorder: this.state.showBorder
        },
        appendixSheets,
        (current, total, statusText) => {
          this.showToast(`📄 ${statusText}`);
        }
      );

      // 觸發瀏覽器下載
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      const baseName = (this.pdfLoader.fileName || '簡報紙本資料').replace(/\.[^/.]+$/, '');
      a.href = url;
      a.download = `${baseName}_高密度紙本資料_TE-NOTER.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('🎉 標準向量 PDF 導出成功！已自動下載！');
    } catch (err) {
      console.error('匯出向量 PDF 失敗:', err);
      this.showToast(`❌ 導出失敗: ${err.message || '請確認檔案內容'}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  showToast(message) {
    if (!this.toastNotification) return;
    this.toastNotification.textContent = message;
    this.toastNotification.classList.remove('hidden');

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastNotification.classList.add('hidden');
    }, 3200);
  }
}

// 初始化向導應用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TENoterWizardApp();
});

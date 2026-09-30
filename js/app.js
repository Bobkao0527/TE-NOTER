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
    this.btnQuickPrint = document.getElementById('btnQuickPrint');

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

    // STEP 5 元素 (外部筆記)
    this.chkEnableCustomNotes = document.getElementById('chkEnableCustomNotes');
    this.customNotesArea = document.getElementById('customNotesArea');
    this.customNotesInput = document.getElementById('customNotesInput');
    this.customNotesCharCount = document.getElementById('customNotesCharCount');

    // STEP 6 元素 (最終成果)
    this.btnExportVectorPdf = document.getElementById('btnExportVectorPdf');
    this.btnFinalPrint = document.getElementById('btnFinalPrint');
    this.finalPrintContainer = document.getElementById('finalPrintContainer');
    this.pdfScrollContainer = document.getElementById('pdfScrollContainer');
    this.chkFinalBadge = document.getElementById('chkFinalBadge');
    this.chkFinalBorder = document.getElementById('chkFinalBorder');
    this.chkFinalInkSaver = document.getElementById('chkFinalInkSaver');
    this.finalZoomSlider = document.getElementById('finalZoomSlider');
    this.finalZoomVal = document.getElementById('finalZoomVal');

    // Toast
    this.toastNotification = document.getElementById('toastNotification');
  }

  bindEvents() {
    // 底部導航按鈕
    this.btnPrevStep.addEventListener('click', () => this.goToPrevStep());
    this.btnNextStep.addEventListener('click', () => this.goToNextStep());

    // 向量 PDF 匯出與列印按鈕
    if (this.btnExportVectorPdf) {
      this.btnExportVectorPdf.addEventListener('click', () => this.handleExportVectorPdf());
    }
    this.btnQuickPrint.addEventListener('click', () => this.triggerPrint());
    this.btnFinalPrint.addEventListener('click', () => this.triggerPrint());

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
      this.renderVocabTags();
      this.compileFinalDocument();
    });
    this.btnCopyVocabPrompt.addEventListener('click', () => this.copyVocabPrompt());
    this.vocabPasteInput.addEventListener('input', (e) => this.handleVocabPasteInput(e.target.value));

    // STEP 4: 逐頁速查表設定
    this.chkEnableQuickRef.addEventListener('change', (e) => {
      this.state.enableQuickRef = e.target.checked;
      this.quickRefConfigArea.classList.toggle('hidden', !this.state.enableQuickRef);
      this.updateStats();
    });

    // STEP 5: 外部筆記設定
    this.chkEnableCustomNotes.addEventListener('change', (e) => {
      this.state.enableCustomNotes = e.target.checked;
      this.customNotesArea.classList.toggle('hidden', !this.state.enableCustomNotes);
      this.updateStats();
    });

    this.customNotesInput.addEventListener('input', (e) => {
      this.state.customNotesText = e.target.value;
      const count = this.state.customNotesText.length;
      const estPages = Math.ceil(count / 1400) || (count > 0 ? 1 : 0);
      this.customNotesCharCount.textContent = `共 ${count} 字元 (預估約佔 ${estPages} 頁 A4)`;
      this.updateStats();
    });

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
    });

    // STEP 6: A4 預覽縮放滑桿
    if (this.finalZoomSlider && this.finalZoomVal) {
      this.finalZoomSlider.addEventListener('input', (e) => {
        const zoom = parseFloat(e.target.value);
        this.finalZoomVal.textContent = `${Math.round(zoom * 100)}%`;
        if (this.finalPrintContainer) {
          this.finalPrintContainer.style.setProperty('--preview-zoom', zoom);
        }
      });
    }

    // 鍵盤快速鍵 (⌘P / Ctrl+P)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        this.triggerPrint();
      }
    });
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
      this.generateVocabularyList();
    } else if (stepNumber === 4) {
      this.generateQuickRefList();
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
      // 在最後一步點擊下一步直接列印
      this.triggerPrint();
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
        <span>立即列印 / 另存 PDF</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
      `;
    } else {
      this.btnNextStep.innerHTML = `
        <span>下一步</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
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
      appendixSheetsCount += Math.ceil(this.state.vocabList.length / 140);
    }
    if (this.state.enableQuickRef && this.state.keyPointsList.length > 0) {
      appendixSheetsCount += Math.ceil(this.state.keyPointsList.length / 64);
    }
    if (this.state.enableCustomNotes && this.state.customNotesText.trim().length > 0) {
      const lines = this.state.customNotesText.split('\n').filter(l => l.trim().length > 0);
      appendixSheetsCount += Math.ceil(lines.length / 65);
    }

    const totalSheets = slideSheets + appendixSheetsCount;
    const doubleSheets = Math.ceil(totalSheets / 2);

    this.sideStatPapers.textContent = `${totalSheets} 面 (${doubleSheets} 張雙面)`;
    this.sideStatLayout.textContent = `直式 ${this.state.cols}×${this.state.rows}`;

    // 省紙效益計算：原始簡報雙面列印張數 vs 大抄雙面列印張數
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
        this.updateStep2Summary();
        this.updateStats();
      });

      this.slideSelectorGrid.appendChild(card);
    });

    this.updateStep2Summary();
  }

  setAllSlidesExcluded(excluded) {
    this.pdfLoader.slides.forEach(s => s.excluded = excluded);
    this.renderSlideSelector();
    this.updateStats();
  }

  invertSlidesExcluded() {
    this.pdfLoader.slides.forEach(s => s.excluded = !s.excluded);
    this.renderSlideSelector();
    this.updateStats();
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

    // 若解析到單字
    if (parsed.terms && parsed.terms.length > 0) {
      this.state.vocabList = parsed.terms;
      this.renderVocabTags();
    }

    // 若解析到考點
    if (parsed.keypoints && parsed.keypoints.length > 0) {
      this.state.keyPointsList = parsed.keypoints;
      this.renderQuickRefPreview();
      this.showToast(`🎉 已自動同步辨識：${parsed.terms.length} 個詞彙 + ${parsed.keypoints.length} 條考點目錄！`);
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
    }
    this.renderQuickRefPreview();
  }

  renderQuickRefPreview() {
    if (!this.quickRefPreviewContainer) return;
    this.quickRefPreviewContainer.innerHTML = '';

    this.state.keyPointsList.forEach(kp => {
      const row = document.createElement('div');
      row.className = 'quick-ref-row';
      row.innerHTML = `
        <span class="quick-ref-page">#${kp.slideNum}</span>
        <span class="quick-ref-title">${kp.title}</span>
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

    // 3. 附錄：逐頁考點速查目錄 (如果啟用，支援多頁自動分頁防溢出)
    if (this.state.enableQuickRef && this.state.keyPointsList.length > 0) {
      const quickRefSheets = this.searchEngine.createQuickRefPrintSheets(this.state.keyPointsList);
      quickRefSheets.forEach(sheet => this.finalPrintContainer.appendChild(sheet));
    }

    // 4. 附錄：外部 AI 自訂筆記 (如果啟用且有內容，支援多頁)
    if (this.state.enableCustomNotes && this.state.customNotesText.trim() !== '') {
      const notesSheets = this.searchEngine.createCustomNotesPrintSheets(this.state.customNotesText);
      notesSheets.forEach(sheet => this.finalPrintContainer.appendChild(sheet));
    }
  }

  /**
   * 觸發列印或另存為 PDF
   */
  triggerPrint() {
    this.compileFinalDocument();
    window.print();
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
      if (this.state.enableCustomNotes && this.state.customNotesText.trim() !== '') {
        const nSheets = this.searchEngine.createCustomNotesPrintSheets(this.state.customNotesText);
        appendixSheets.push(...nSheets);
      }

      const pdfBlob = await this.layoutEngine.exportVectorPdf(
        this.pdfLoader.originalArrayBuffer.slice(0),
        activeSlides,
        {
          cols: this.state.cols,
          rows: this.state.rows,
          marginMm: 5, // 5mm 安全邊距，杜絕印表機遮邊
          gapMm: this.state.gapMm || 1,
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
      const baseName = (this.pdfLoader.fileName || '簡報大抄').replace(/\.[^/.]+$/, '');
      a.href = url;
      a.download = `${baseName}_高密度大抄_TE-NOTER.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('🎉 標準向量 PDF 導出成功！已自動下載，可直接列印零裁切！');
    } catch (err) {
      console.error('匯出向量 PDF 失敗:', err);
      this.showToast(`❌ 匯出失敗: ${err.message || '請改用系統列印'}`);
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

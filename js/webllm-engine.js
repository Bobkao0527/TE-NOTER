/**
 * TE-NOTER - WebLLM 瀏覽器本地推論引擎 (webllm-engine.js)
 * 100% 透過 WebGPU 於本機端執行 Qwen3.5-2B-q4f16_1-MLC
 * 支援分批防 OOM、Temperature=0.0 零隨機性輸出、英美英文差異比對與考點深化
 */

export class WebLLMEngine {
  constructor() {
    this.engine = null;
    this.selectedModel = 'Qwen3.5-2B-q4f16_1-MLC';
    this.isInitializing = false;
    this.isProcessing = false;
    this.webllmLib = null;
  }

  /**
   * 檢查本機瀏覽器是否支援 WebGPU
   */
  async checkWebGPUSupport() {
    if (!navigator.gpu) {
      return { supported: false, reason: '您的瀏覽器或設備不支援 WebGPU（請使用最新 Chrome / Edge / Safari 並開啟硬體加速）' };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { supported: false, reason: '無法取得 GPU 介面卡，請確認顯示卡驅動或瀏覽器硬體加速設定' };
      }
      return { supported: true, adapterInfo: await adapter.requestAdapterInfo?.() };
    } catch (err) {
      return { supported: false, reason: `WebGPU 請求失敗: ${err.message}` };
    }
  }

  /**
   * 動態載入 WebLLM ESM 庫
   */
  async loadWebLLMLibrary() {
    if (this.webllmLib) return this.webllmLib;
    try {
      // 優先使用 esm.run，備用 jsdelivr
      const lib = await import('https://esm.run/@mlc-ai/web-llm');
      this.webllmLib = lib;
      return lib;
    } catch (e1) {
      console.warn('esm.run 載入失敗，嘗試備用 CDN...', e1);
      const lib = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm');
      this.webllmLib = lib;
      return lib;
    }
  }

  /**
   * 初始化並下載/快取 Qwen3.5-2B-q4f16_1-MLC 模型
   * @param {string} modelId 
   * @param {Function} onProgress ({ text, progress })
   */
  async initModel(modelId = 'Qwen3.5-2B-q4f16_1-MLC', onProgress = null) {
    if (this.engine && this.selectedModel === modelId) {
      return this.engine;
    }

    this.selectedModel = modelId;
    this.isInitializing = true;

    const webllm = await this.loadWebLLMLibrary();

    const progressCallback = (report) => {
      if (onProgress) {
        onProgress({
          text: report.text || '正在載入模型權重...',
          progress: report.progress || 0
        });
      }
    };

    try {
      this.engine = await webllm.CreateMLCEngine(this.selectedModel, {
        initProgressCallback: progressCallback,
      });
      this.isInitializing = false;
      return this.engine;
    } catch (err) {
      this.isInitializing = false;
      throw new Error(`載入模型 ${modelId} 失敗: ${err.message}`);
    }
  }

  /**
   * 分批/逐頁將投影片文字發送給 Qwen3.5-2B 進行結構化萃取
   * 每次推論前後強制 resetChat() 清空 KV Cache，杜絕長上下文退化與複讀機停不下來的問題
   * @param {Array} slidesList 活躍投影片列表 [{ originalIndex, text, ... }]
   * @param {Object} options { batchSize, temperature, onBatchProgress }
   */
  async analyzeSlidesInBatches(slidesList, options = {}) {
    if (!this.engine) {
      throw new Error('WebLLM 引擎尚未初始化，請先載入模型');
    }

    const batchSize = Math.max(1, parseInt(options.batchSize, 10) || 1); // 預設單頁快速處理
    const temperature = options.temperature ?? 0.0; // 0.0 極致確定性
    const onBatchProgress = options.onBatchProgress || null;

    this.isProcessing = true;

    // 將投影片依 batchSize 切分
    const batches = [];
    for (let i = 0; i < slidesList.length; i += batchSize) {
      batches.push(slidesList.slice(i, i + batchSize));
    }

    const aggregatedTerms = new Map();
    const aggregatedKeypoints = [];
    const totalBatches = batches.length;

    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
      const batch = batches[bIdx];
      const startPage = batch[0].originalIndex;
      const endPage = batch[batch.length - 1].originalIndex;

      // 組合此批次的投影片文字 (每頁限制前 450 字，維持超輕量 context)
      const batchText = batch.map(s => {
        const text = (s.text || '').replace(/\s+/g, ' ').trim().substring(0, 450);
        return `【P.${s.originalIndex}】${text}`;
      }).join('\n');

      const rawCombinedText = batch.map(s => (s.text || '').trim()).join(' ');

      // 檢查是否完全無字 (純圖表)
      if (rawCombinedText.length === 0) {
        batch.forEach(s => {
          aggregatedKeypoints.push({
            slideNum: s.originalIndex,
            title: `Slide #${s.originalIndex} (圖表/架構圖)`
          });
        });
        continue;
      }

      // 檢查是否含有英文字母 (至少 2 個相連英文字母，如 IP, TCP, RAM, Signal 等)
      const hasEnglish = /[a-zA-Z]{2,}/.test(rawCombinedText);

      // 【策略 A】：純中文頁面 (完全沒有英文字) -> 專注快速提取查表重點 title，不浪費 token 抓單字
      if (!hasEnglish) {
        // 如果中文文字很簡短 (<= 35 字，如章節標題、結論大綱)，直接取用作為考點查表 title，完全免呼叫 LLM
        if (rawCombinedText.length <= 35) {
          aggregatedKeypoints.push({
            slideNum: startPage,
            title: rawCombinedText
          });
          continue;
        }

        // 中文文字較長時，專門請 LLM 提煉 1 句考點 (超精簡 prompt，極速輸出)
        if (onBatchProgress) {
          onBatchProgress({
            currentBatch: bIdx + 1,
            totalBatches,
            startPage,
            endPage,
            statusText: `Qwen3.5 正在提煉第 ${startPage} 頁中文考點查表摘要...`
          });
        }

        try {
          if (typeof this.engine.resetChat === 'function') {
            await this.engine.resetChat();
          }

          const reply = await this.engine.chat.completions.create({
            messages: [
              { role: 'system', content: '你是大抄整理專家。這頁簡報為純中文，請提煉一句 15~30 字核心考點查表標題。嚴格輸出 JSON: {"keypoint":"核心重點"}' },
              { role: 'user', content: batchText }
            ],
            temperature: temperature,
            top_p: 0.1,
            max_tokens: 80,
            stop: ["}\n\n", "```\n", "<|im_end|>"]
          });

          const parsed = this.cleanAndParseJSON(reply.choices[0]?.message?.content || '');
          const summary = (parsed?.keypoint || '').trim();
          aggregatedKeypoints.push({
            slideNum: startPage,
            title: summary || rawCombinedText.substring(0, 30)
          });
        } catch (err) {
          aggregatedKeypoints.push({
            slideNum: startPage,
            title: rawCombinedText.substring(0, 30)
          });
        } finally {
          if (typeof this.engine.resetChat === 'function') {
            try { await this.engine.resetChat(); } catch (_) {}
          }
        }
        continue;
      }

      // 【策略 B】：含有英文 (哪怕字數很少、只有縮寫或單一名詞) -> 深度提取英美對照單字表 + 考點精華
      if (onBatchProgress) {
        onBatchProgress({
          currentBatch: bIdx + 1,
          totalBatches,
          startPage,
          endPage,
          statusText: batchSize === 1
            ? `Qwen3.5 正在萃取第 ${startPage} 頁英文術語(英美對照)與考點...`
            : `Qwen3.5 正在分析第 ${startPage} ~ ${endPage} 頁...`
        });
      }

      const isSinglePage = batch.length === 1;
      const systemPrompt = `你是一位專業考試大抄整理專家。請從簡報文字提煉：
1. 重要的專業英文名詞與縮寫，若有英式(UK)與美式(US)差異請指出(如 Railway vs Railroad)。
2. 本頁核心考點摘要(15~35字內)。
嚴格輸出 JSON 格式如下，禁止其他任何解說：
{"terms":[{"intl":"英文名詞","us":"美式(選填)","zh":"繁中翻譯","page":${startPage}}],"keypoint":"本頁核心重點精華"}`;

      try {
        if (typeof this.engine.resetChat === 'function') {
          await this.engine.resetChat();
        }

        const reply = await this.engine.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `簡報內容：\n${batchText}` }
          ],
          temperature: temperature,
          top_p: 0.1,
          max_tokens: isSinglePage ? 240 : 400,
          stop: ["}\n\n", "```\n", "<|im_end|>", "<|endoftext|>"]
        });

        const rawContent = reply.choices[0]?.message?.content || '';
        const parsed = this.cleanAndParseJSON(rawContent);

        if (parsed) {
          // 整理名詞 (英美對照與中文釋義)
          if (Array.isArray(parsed.terms)) {
            parsed.terms.forEach(t => {
              const mainTerm = (t.intl || t.us || '').trim();
              if (!mainTerm) return;
              const key = mainTerm.toLowerCase();
              const pageNum = parseInt(t.page, 10) || startPage;

              if (aggregatedTerms.has(key)) {
                const existing = aggregatedTerms.get(key);
                if (!existing.pages.includes(pageNum)) existing.pages.push(pageNum);
                if (!existing.us_term && t.us) existing.us_term = t.us;
                if (!existing.zh && t.zh) existing.zh = t.zh;
              } else {
                aggregatedTerms.set(key, {
                  term: t.intl || t.us,
                  us_term: t.us || '',
                  zh: t.zh || '',
                  diff: t.diff || '',
                  pages: [pageNum]
                });
              }
            });
          }

          // 整理考點 (支援單頁 keypoint 或多頁 keypoints)
          if (parsed.keypoint && typeof parsed.keypoint === 'string') {
            aggregatedKeypoints.push({
              slideNum: startPage,
              title: parsed.keypoint.trim()
            });
          } else if (Array.isArray(parsed.keypoints)) {
            parsed.keypoints.forEach(kp => {
              const pNum = parseInt(kp.page, 10) || startPage;
              const summary = (kp.summary || kp.title || '').trim();
              if (summary) {
                aggregatedKeypoints.push({ slideNum: pNum, title: summary });
              }
            });
          } else {
            const fallbackTitle = batch[0].text ? batch[0].text.replace(/\s+/g, ' ').trim().substring(0, 35) : `Slide #${startPage}`;
            aggregatedKeypoints.push({ slideNum: startPage, title: fallbackTitle });
          }
        }
      } catch (batchErr) {
        console.warn(`第 ${startPage} 頁分析異常，跳過繼續下一頁:`, batchErr);
      } finally {
        // 【核心優化 2】：推論完成後再次釋放 KV 快取，確保記憶體持續歸零
        if (typeof this.engine.resetChat === 'function') {
          try { await this.engine.resetChat(); } catch (_) {}
        }
      }
    }

    this.isProcessing = false;
    aggregatedKeypoints.sort((a, b) => a.slideNum - b.slideNum);

    return {
      terms: Array.from(aggregatedTerms.values()),
      keypoints: aggregatedKeypoints
    };
  }

  /**
   * 安全清理並解析 LLM 產生的 JSON 字串 (具備自動補全截斷括號能力)
   */
  cleanAndParseJSON(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const firstBrace = cleaned.indexOf('{');
      if (firstBrace === -1) return null;
      let jsonSub = cleaned.substring(firstBrace);

      const lastBrace = jsonSub.lastIndexOf('}');
      if (lastBrace !== -1) {
        jsonSub = jsonSub.substring(0, lastBrace + 1);
      } else {
        // 若被 token 上限截斷缺少閉合括號，嘗試自動補全
        if (jsonSub.includes('[') && !jsonSub.includes(']')) jsonSub += ']';
        jsonSub += '}';
      }

      return JSON.parse(jsonSub);
    } catch (e) {
      console.warn('JSON 自動解析失敗，嘗試正則提取:', e);
      return null;
    }
  }
}

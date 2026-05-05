import { getApiKey, getPreferredLanguage, streamLLM, summarizePrompt, translatePrompt, qaPrompt, rewritePrompt } from '../utils/api.js';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  // Load Settings
  const apiKeyInput = document.getElementById('api-key-input');
  const languageSelect = document.getElementById('language-select');
  const summaryLangSelect = document.getElementById('summary-lang-select');
  
  getApiKey().then(key => {
    if (key) apiKeyInput.value = key;
  });
  getPreferredLanguage().then(lang => {
    if (lang) {
      languageSelect.value = lang;
      summaryLangSelect.value = lang;
    }
  });

  // Save Settings — also sync the summary dropdown
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const lang = languageSelect.value;
    
    // Sync summary dropdown to match settings
    summaryLangSelect.value = lang;
    
    chrome.storage.local.set({ geminiApiKey: key, preferredLanguage: lang }, () => {
      const status = document.getElementById('settings-status');
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 2000);
    });
  });

  // Helper to get active tab content
  async function getActiveTabContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "get-page-content" });
      return { content: response.content, url: tab.url };
    } catch (e) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      const response = await chrome.tabs.sendMessage(tab.id, { action: "get-page-content" });
      return { content: response.content, url: tab.url };
    }
  }

  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/- (.*?)<br>/g, '<ul><li>$1</li></ul>')
      .replace(/<\/ul><ul>/g, '');
  }

  // Summarize
  const summarizeBtn = document.getElementById('summarize-btn');
  const summarizeLoading = document.getElementById('summarize-loading');
  const summarizeResultContainer = document.getElementById('summarize-result-container');
  const summarizeResult = document.getElementById('summarize-result');

  summarizeBtn.addEventListener('click', async () => {
    summarizeBtn.disabled = true;
    summarizeLoading.classList.remove('hidden');
    summarizeResultContainer.classList.add('hidden');

    try {
      const { content, url } = await getActiveTabContent();
      if (!content || content.length < 50) {
        throw new Error("Could not extract enough content from this page.");
      }

      // FIX: Read language DIRECTLY from the dropdown (no storage dependency)
      const lang = summaryLangSelect.value;

      // FIX: Cache key now includes language so switching languages always re-fetches
      const cacheKey = `summary_${lang}_${url}`;
      const cached = await new Promise(resolve => chrome.storage.local.get([cacheKey], res => resolve(res[cacheKey])));
      
      if (cached) {
        summarizeResult.innerHTML = formatMarkdown(cached);
        summarizeLoading.classList.add('hidden');
        summarizeResultContainer.classList.remove('hidden');
        summarizeBtn.disabled = false;
        return;
      }

      const prompts = summarizePrompt(content, lang);
      const stream = streamLLM(prompts.system, prompts.user);
      
      let fullText = "";
      for await (const chunk of stream) {
        if (fullText === "") {
          summarizeLoading.classList.add('hidden');
          summarizeResultContainer.classList.remove('hidden');
        }
        fullText += chunk;
        summarizeResult.innerHTML = formatMarkdown(fullText);
      }
      
      // Save to language-specific cache
      chrome.storage.local.set({ [cacheKey]: fullText });

    } catch (error) {
      summarizeResult.innerHTML = `<span style="color: red;">Error: ${error.message}</span>`;
      summarizeResultContainer.classList.remove('hidden');
      if (error.message.includes('API Key')) {
        document.querySelector('[data-target="tab-settings"]').click();
      }
    } finally {
      summarizeBtn.disabled = false;
      summarizeLoading.classList.add('hidden');
    }
  });

// Copy Summary
  document.getElementById('summarize-copy-btn').addEventListener('click', () => {
    const text = document.getElementById('summarize-result').innerText;
    const btn = document.getElementById('summarize-copy-btn');
    
    navigator.clipboard.writeText(text).then(() => {
      // Add success state
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Copied!';
      
      // Add ripple effect to result card
      const resultCard = document.querySelector('.result-card');
      if (resultCard) {
        resultCard.style.animation = 'none';
        setTimeout(() => {
          resultCard.style.animation = 'copySuccess 0.6s ease';
        }, 10);
      }
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Failed';
      setTimeout(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
      }, 2000);
    });
  });

  // Translate functionality
  const translateBtn = document.getElementById('translate-btn');
  const translateLoading = document.getElementById('translate-loading');
  const translateResultContainer = document.getElementById('translate-result-container');
  const translateResult = document.getElementById('translate-result');
  const translateInput = document.getElementById('translate-input');
  const sourceLangSelect = document.getElementById('source-lang-select');
  const targetLangSelect = document.getElementById('target-lang-select');

  translateBtn.addEventListener('click', async () => {
    const text = translateInput.value.trim();
    if (!text) {
      alert('Please enter text to translate');
      return;
    }

    translateBtn.disabled = true;
    translateLoading.classList.remove('hidden');
    translateResultContainer.classList.add('hidden');

    try {
      const sourceLang = sourceLangSelect.value;
      const targetLang = targetLangSelect.value;
      const prompts = translatePrompt(text, targetLang, sourceLang);
      const stream = streamLLM(prompts.system, prompts.user);
      
      let fullText = "";
      for await (const chunk of stream) {
        if (fullText === "") {
          translateLoading.classList.add('hidden');
          translateResultContainer.classList.remove('hidden');
        }
        fullText += chunk;
        translateResult.innerText = fullText;
      }
    } catch (error) {
      translateResult.innerHTML = `<span style="color: var(--error);">Error: ${error.message}</span>`;
      translateResultContainer.classList.remove('hidden');
    } finally {
      translateBtn.disabled = false;
      translateLoading.classList.add('hidden');
    }
  });

  // Copy translation
  document.getElementById('translate-copy-btn').addEventListener('click', () => {
    const text = translateResult.innerText;
    copyToClipboard(text, 'translate-copy-btn');
  });

  // Q&A functionality
  const qaBtn = document.getElementById('qa-btn');
  const qaLoading = document.getElementById('qa-loading');
  const qaResultContainer = document.getElementById('qa-result-container');
  const qaResult = document.getElementById('qa-result');
  const qaQuestion = document.getElementById('qa-question');

  qaBtn.addEventListener('click', async () => {
    const question = qaQuestion.value.trim();
    if (!question) {
      alert('Please enter a question');
      return;
    }

    qaBtn.disabled = true;
    qaLoading.classList.remove('hidden');
    qaResultContainer.classList.add('hidden');

    try {
      const { content } = await getActiveTabContent();
      if (!content || content.length < 50) {
        throw new Error("Could not extract enough content from this page.");
      }

      const lang = await getPreferredLanguage();
      const prompts = qaPrompt(content, question, lang);
      const stream = streamLLM(prompts.system, prompts.user);
      
      let fullText = "";
      for await (const chunk of stream) {
        if (fullText === "") {
          qaLoading.classList.add('hidden');
          qaResultContainer.classList.remove('hidden');
        }
        fullText += chunk;
        qaResult.innerText = fullText;
      }
    } catch (error) {
      qaResult.innerHTML = `<span style="color: var(--error);">Error: ${error.message}</span>`;
      qaResultContainer.classList.remove('hidden');
    } finally {
      qaBtn.disabled = false;
      qaLoading.classList.add('hidden');
    }
  });

  // Copy Q&A result
  document.getElementById('qa-copy-btn').addEventListener('click', () => {
    const text = qaResult.innerText;
    copyToClipboard(text, 'qa-copy-btn');
  });

  // Rewrite functionality
  const rewriteBtn = document.getElementById('rewrite-btn');
  const rewriteLoading = document.getElementById('rewrite-loading');
  const rewriteResultContainer = document.getElementById('rewrite-result-container');
  const rewriteResult = document.getElementById('rewrite-result');
  const rewriteInput = document.getElementById('rewrite-input');
  const rewriteStyleSelect = document.getElementById('rewrite-style-select');

  rewriteBtn.addEventListener('click', async () => {
    const text = rewriteInput.value.trim();
    if (!text) {
      alert('Please enter text to rewrite');
      return;
    }

    rewriteBtn.disabled = true;
    rewriteLoading.classList.remove('hidden');
    rewriteResultContainer.classList.add('hidden');

    try {
      const style = rewriteStyleSelect.value;
      const lang = await getPreferredLanguage();
      const prompts = rewritePrompt(text, style, lang);
      const stream = streamLLM(prompts.system, prompts.user);
      
      let fullText = "";
      for await (const chunk of stream) {
        if (fullText === "") {
          rewriteLoading.classList.add('hidden');
          rewriteResultContainer.classList.remove('hidden');
        }
        fullText += chunk;
        rewriteResult.innerText = fullText;
      }
    } catch (error) {
      rewriteResult.innerHTML = `<span style="color: var(--error);">Error: ${error.message}</span>`;
      rewriteResultContainer.classList.remove('hidden');
    } finally {
      rewriteBtn.disabled = false;
      rewriteLoading.classList.add('hidden');
    }
  });

  // Copy rewrite result
  document.getElementById('rewrite-copy-btn').addEventListener('click', () => {
    const text = rewriteResult.innerText;
    copyToClipboard(text, 'rewrite-copy-btn');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to submit current active form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      const activeTab = document.querySelector('.tab-content.active');
      
      if (activeTab && activeTab.id === 'tab-summarize') {
        summarizeBtn.click();
      } else if (activeTab && activeTab.id === 'tab-translate') {
        translateBtn.click();
      } else if (activeTab && activeTab.id === 'tab-qa') {
        qaBtn.click();
      } else if (activeTab && activeTab.id === 'tab-rewrite') {
        rewriteBtn.click();
      }
    }
    
    // Ctrl/Cmd + Shift + C to copy current result
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      const activeTab = document.querySelector('.tab-content.active');
      let copyBtn = null;
      
      if (activeTab && activeTab.id === 'tab-summarize') {
        copyBtn = document.getElementById('summarize-copy-btn');
      } else if (activeTab && activeTab.id === 'tab-translate') {
        copyBtn = document.getElementById('translate-copy-btn');
      } else if (activeTab && activeTab.id === 'tab-qa') {
        copyBtn = document.getElementById('qa-copy-btn');
      } else if (activeTab && activeTab.id === 'tab-rewrite') {
        copyBtn = document.getElementById('rewrite-copy-btn');
      }
      
      if (copyBtn && !copyBtn.classList.contains('hidden')) {
        copyBtn.click();
      }
    }
    
    // Alt + 1-5 for tab switching
    if (e.altKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const tabIndex = parseInt(e.key) - 1;
      const tabBtn = document.querySelectorAll('.tab-btn')[tabIndex];
      if (tabBtn) {
        tabBtn.click();
      }
    }
    
    // Escape to close popup
    if (e.key === 'Escape') {
      window.close();
    }
  });

  // Helper function for copy functionality
  function copyToClipboard(text, buttonId) {
    const btn = document.getElementById(buttonId);
    
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Copied!';
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Failed';
      setTimeout(() => {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy';
      }, 2000);
    });
  }
});

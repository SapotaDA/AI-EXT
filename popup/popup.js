import { getApiKey, getPreferredLanguage, streamLLM, summarizePrompt } from '../utils/api.js';

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
});

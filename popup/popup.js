import { getApiKey, getPreferredLanguage, streamLLM, summarizePrompt, qaPrompt } from '../utils/api.js';

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
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('summarize-copy-btn');
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = "Copy", 2000);
  });

  // Chat
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatContainer = document.getElementById('chat-container');
  let pageContentCache = null;

  async function handleChat() {
    const question = chatInput.value.trim();
    if (!question) return;

    appendMessage(question, 'user-msg');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    const loadingId = appendMessage('Thinking...', 'system-msg');

    try {
      if (!pageContentCache) {
        const { content } = await getActiveTabContent();
        pageContentCache = content;
      }

      // FIX: Read language from settings dropdown directly (works instantly, no save needed)
      const lang = languageSelect.value;
      const prompts = qaPrompt(pageContentCache, question, lang);
      const stream = streamLLM(prompts.system, prompts.user);
      
      let fullText = "";
      for await (const chunk of stream) {
        fullText += chunk;
        updateMessage(loadingId, formatMarkdown(fullText));
      }

    } catch (error) {
      updateMessage(loadingId, `<span style="color: red;">Error: ${error.message}</span>`);
    } finally {
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  chatSendBtn.addEventListener('click', handleChat);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
  });

  function appendMessage(text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = className === 'user-msg' ? '👤' : '🤖';
    
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = text;
    
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    
    const id = 'msg-' + Date.now();
    msgDiv.id = id;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return id;
  }

  function updateMessage(id, text) {
    const msgDiv = document.getElementById(id);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.msg-bubble');
      if (bubble) {
        bubble.innerHTML = text;
      } else {
        msgDiv.innerHTML = text;
      }
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
});

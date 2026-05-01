import { getApiKey, callLLM, summarizePrompt, qaPrompt } from '../utils/api.js';

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
  getApiKey().then(key => {
    if (key) apiKeyInput.value = key;
  });

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      const status = document.getElementById('settings-status');
      status.classList.remove('hidden');
      setTimeout(() => status.classList.add('hidden'), 2000);
    });
  });

  // Helper to get active tab content
  async function getActiveTabContent() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject content script if not already injected
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "get-page-content" });
      return response.content;
    } catch (e) {
      // Content script might not be injected yet
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      const response = await chrome.tabs.sendMessage(tab.id, { action: "get-page-content" });
      return response.content;
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
      const content = await getActiveTabContent();
      if (!content || content.length < 50) {
        throw new Error("Could not extract enough content from this page.");
      }

      const prompts = summarizePrompt(content);
      const result = await callLLM(prompts.system, prompts.user);
      
      summarizeResult.innerHTML = formatMarkdown(result);
      summarizeResultContainer.classList.remove('hidden');
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

    // Add user message
    appendMessage(question, 'user-msg');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    // Add loading message
    const loadingId = appendMessage('Thinking...', 'system-msg');

    try {
      if (!pageContentCache) {
        pageContentCache = await getActiveTabContent();
      }

      const prompts = qaPrompt(pageContentCache, question);
      const answer = await callLLM(prompts.system, prompts.user);
      
      updateMessage(loadingId, formatMarkdown(answer));
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
    msgDiv.innerHTML = text;
    const id = 'msg-' + Date.now();
    msgDiv.id = id;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return id;
  }

  function updateMessage(id, text) {
    const msgDiv = document.getElementById(id);
    if (msgDiv) {
      msgDiv.innerHTML = text;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
});

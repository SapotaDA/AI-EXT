// content.js

let floatingUI = null;

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "show-floating-ui") {
    createFloatingUI(request.text);
    updateFloatingUIState("loading", "Thinking...");
  } else if (request.action === "update-floating-ui") {
    updateFloatingUIState(request.status, request.result);
  } else if (request.action === "get-page-content") {
    sendResponse({ content: extractPageContent() });
  }
});

function createFloatingUI(selectedText) {
  // Remove existing floating UI and clean up event listeners
  if (floatingUI) {
    const closeBtn = document.getElementById('ai-close-btn');
    const copyBtn = document.getElementById('ai-copy-btn');
    if (closeBtn) closeBtn.removeEventListener('click', closeHandler);
    if (copyBtn) copyBtn.removeEventListener('click', copyHandler);
    floatingUI.remove();
    floatingUI = null;
  }

  floatingUI = document.createElement('div');
  floatingUI.id = "ai-research-floating-ui";
  floatingUI.innerHTML = `
    <div class="ai-header">
      <span>AI Assistant</span>
      <button id="ai-close-btn">&times;</button>
    </div>
    <div class="ai-content">
      <div id="ai-loading" class="ai-hidden">
        <div class="ai-spinner"></div>
        <span>Analyzing...</span>
      </div>
      <div id="ai-result" class="ai-markdown"></div>
    </div>
    <div class="ai-footer">
      <button id="ai-copy-btn" class="ai-hidden">Copy</button>
    </div>
  `;

  document.body.appendChild(floatingUI);

  // Position near selection
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    floatingUI.style.top = `${window.scrollY + rect.bottom + 10}px`;
    floatingUI.style.left = `${window.scrollX + rect.left}px`;
  }

  // Define event handlers to enable proper cleanup
  const closeHandler = () => {
    if (floatingUI) {
      floatingUI.remove();
      floatingUI = null;
    }
  };

  const copyHandler = () => {
    const text = document.getElementById('ai-result').innerText;
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy text:', err);
    });
    const btn = document.getElementById('ai-copy-btn');
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = "Copy", 2000);
  };

  // Close button event
  document.getElementById('ai-close-btn').addEventListener('click', closeHandler);

  // Copy button event
  document.getElementById('ai-copy-btn').addEventListener('click', copyHandler);
}

function updateFloatingUIState(status, text) {
  if (!floatingUI) return;

  const loadingEl = document.getElementById('ai-loading');
  const resultEl = document.getElementById('ai-result');
  const copyBtn = document.getElementById('ai-copy-btn');

  if (status === "loading") {
    loadingEl.classList.remove('ai-hidden');
    resultEl.classList.add('ai-hidden');
    copyBtn.classList.add('ai-hidden');
  } else {
    loadingEl.classList.add('ai-hidden');
    resultEl.classList.remove('ai-hidden');
    
    // Simple markdown to HTML conversion for bold and line breaks
    let formattedText = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
      
    if (status === "error") {
      resultEl.innerHTML = `<span style="color: red;">Error: ${formattedText}</span>`;
    } else {
      resultEl.innerHTML = formattedText;
      copyBtn.classList.remove('ai-hidden');
    }
  }
}

function extractPageContent() {
  // Basic content extraction, removing script/style tags
  const clone = document.cloneNode(true);
  const elementsToRemove = clone.querySelectorAll('script, style, nav, footer, header, noscript, iframe');
  elementsToRemove.forEach(el => el.remove());
  
  // Try to find the main article if it exists
  const article = clone.querySelector('article') || clone.querySelector('main') || clone.body;
  return article.innerText.trim().replace(/\s+/g, ' ');
}

// Cleanup floating UI when page unloads
window.addEventListener('beforeunload', () => {
  if (floatingUI) {
    floatingUI.remove();
    floatingUI = null;
  }
});

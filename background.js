// background.js
import { explainPrompt, callLLM } from './utils/api.js';

// Setup Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "explain-ai",
    title: "Explain with AI",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "explain-simple",
    parentId: "explain-ai",
    title: "Explain simply",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "explain-eli5",
    parentId: "explain-ai",
    title: "Explain like I'm 5",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "explain-bullets",
    parentId: "explain-ai",
    title: "Convert to bullet points",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !info.parentMenuItemId === "explain-ai" && info.menuItemId !== "explain-ai") return;

  const text = info.selectionText;
  let mode = "default";
  
  if (info.menuItemId === "explain-simple") mode = "simple";
  if (info.menuItemId === "explain-eli5") mode = "eli5";
  if (info.menuItemId === "explain-bullets") mode = "bullets";

  // Send message to content script to show loading UI
  chrome.tabs.sendMessage(tab.id, { 
    action: "show-floating-ui", 
    text: text,
    status: "loading" 
  });

  try {
    const prompts = explainPrompt(text, mode);
    const result = await callLLM(prompts.system, prompts.user);
    
    // Send result to content script
    chrome.tabs.sendMessage(tab.id, { 
      action: "update-floating-ui", 
      result: result,
      status: "success"
    });
  } catch (error) {
    chrome.tabs.sendMessage(tab.id, { 
      action: "update-floating-ui", 
      result: error.message,
      status: "error"
    });
  }
});

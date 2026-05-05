import { explainPrompt, streamLLM, getPreferredLanguage } from './utils/api.js';

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
  if (!info.selectionText || (info.parentMenuItemId !== "explain-ai" && info.menuItemId !== "explain-ai")) return;

  const text = info.selectionText;
  let mode = "default";
  
  if (info.menuItemId === "explain-simple") mode = "simple";
  if (info.menuItemId === "explain-eli5") mode = "eli5";
  if (info.menuItemId === "explain-bullets") mode = "bullets";

  // Send message to content script to show loading UI
  try {
    await chrome.tabs.sendMessage(tab.id, { 
      action: "show-floating-ui", 
      text: text,
      status: "loading" 
    });
  } catch (error) {
    console.error("Failed to send message to content script:", error);
    return;
  }

  try {
    const lang = await getPreferredLanguage();
    const prompts = explainPrompt(text, mode, lang);
    const stream = streamLLM(prompts.system, prompts.user);
    
    let fullText = "";
    for await (const chunk of stream) {
      fullText += chunk;
      // Send partial result to content script
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: "update-floating-ui", 
          result: fullText,
          status: "success"
        });
      } catch (error) {
        console.error("Failed to send update to content script:", error);
        break;
      }
    }
  } catch (error) {
    try {
      await chrome.tabs.sendMessage(tab.id, { 
        action: "update-floating-ui", 
        result: error.message,
        status: "error"
      });
    } catch (msgError) {
      console.error("Failed to send error message to content script:", msgError);
    }
  }
});

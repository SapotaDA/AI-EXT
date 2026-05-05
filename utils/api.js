// utils/api.js
// Utility functions to interact with Google Gemini API (Free Tier)

export async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || null);
    });
  });
}

// Cache the model name so we don't waste API quota on ListModels every time
let cachedModelName = null;

async function getModelName(apiKey) {
  if (cachedModelName) return cachedModelName;

  const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const modelsData = await modelsRes.json();
  if (!modelsRes.ok) throw new Error(modelsData.error?.message || "Failed to list models.");
  if (!modelsData.models || modelsData.models.length === 0) throw new Error("No models available.");

  const validModels = modelsData.models.filter(m => m.supportedGenerationMethods?.includes("generateContent"));
  const flash = validModels.find(m => m.name.includes("flash"));
  const pro = validModels.find(m => m.name.includes("pro"));
  
  if (flash) cachedModelName = flash.name;
  else if (pro) cachedModelName = pro.name;
  else if (validModels.length > 0) cachedModelName = validModels[0].name;
  else throw new Error("No compatible models found.");

  return cachedModelName;
}

export async function* streamLLM(systemInstruction, userPrompt) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key not found. Please set your free Gemini API key in the extension settings.");
  }

  const modelName = await getModelName(apiKey);
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `System Instructions: ${systemInstruction}\n\nUser Input: ${userPrompt}` }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  if (response.status === 429 || !response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errMsg = errorData.error?.message || `HTTP Error ${response.status}`;
    if (response.status === 429 || errMsg.includes("quota") || errMsg.includes("rate") || errMsg.includes("demand")) {
      throw new Error("⏳ Rate limited! Free tier allows 15 requests/min. Please wait 30 seconds and try again.");
    }
    throw new Error(errMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const dataStr = line.replace("data: ", "").trim();
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (data.candidates && data.candidates.length > 0) {
            yield data.candidates[0].content.parts[0].text;
          }
        } catch (e) {
          // ignore incomplete JSON
        }
      }
    }
  }
}

export async function getPreferredLanguage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['preferredLanguage'], (result) => {
      resolve(result.preferredLanguage || 'English');
    });
  });
}

// Prompt functions
export const explainPrompt = (text, mode, lang = "English") => {
  let instruction = "Explain the following text clearly and concisely.";
  if (mode === "simple") instruction = "Explain the following text in very simple terms, avoiding jargon.";
  if (mode === "eli5") instruction = "Explain the following text as if I am 5 years old. Use an analogy if helpful.";
  if (mode === "bullets") instruction = "Summarize the following text using 3-5 key bullet points.";
  
  return {
    system: `You are a highly intelligent and helpful AI research assistant. IMPORTANT: You MUST respond entirely in ${lang}. If the language is "Simple English", use extremely basic vocabulary.`,
    user: `${instruction}\n\nText: "${text}"`
  };
};

export const translatePrompt = (text, targetLang, sourceLang = 'auto') => {
  return {
    system: `You are a professional translator. Translate the given text accurately while preserving the original meaning, tone, and context. If the text is already in the target language, return it as-is. IMPORTANT: Respond ONLY with the translated text, no explanations or notes.`,
    user: `Source Language: ${sourceLang}\nTarget Language: ${targetLang}\nText to translate: "${text}"`
  };
};

export const qaPrompt = (context, question, lang = "English") => {
  return {
    system: `You are an intelligent AI assistant. Answer the user's question based on the provided context. If the context doesn't contain the answer, say so clearly. Be concise but thorough. IMPORTANT: You MUST respond entirely in ${lang}.`,
    user: `Context:\n${context.substring(0, 8000)}\n\nQuestion: ${question}`
  };
};

export const rewritePrompt = (text, style, lang = "English") => {
  const styleInstructions = {
    formal: "Rewrite this text in a formal, professional tone suitable for business communication.",
    casual: "Rewrite this text in a casual, conversational tone suitable for social media or informal messages.",
    simple: "Rewrite this text using simple words and short sentences for easy understanding.",
    creative: "Rewrite this text in a creative, engaging style with vivid descriptions.",
    academic: "Rewrite this text in an academic, scholarly tone with proper terminology."
  };
  
  return {
    system: `You are a skilled writer. ${styleInstructions[style] || styleInstructions.formal} Maintain the original meaning while improving clarity and flow. IMPORTANT: You MUST respond entirely in ${lang}.`,
    user: `Original text: "${text}"`
  };
};

export const codePrompt = (code, language, task, lang = "English") => {
  const taskInstructions = {
    explain: "Explain what this code does in detail, including its purpose and how it works.",
    optimize: "Optimize this code for better performance and suggest improvements.",
    debug: "Identify potential bugs or issues in this code and suggest fixes.",
    convert: "Convert this code to a different programming language as requested.",
    document: "Add comprehensive comments and documentation to this code."
  };
  
  return {
    system: `You are an expert software developer. ${taskInstructions[task] || taskInstructions.explain} Provide clear, actionable advice. IMPORTANT: You MUST respond entirely in ${lang}.`,
    user: `Language: ${language}\nCode:\n\n\`\`\`${language}\n${code}\n\`\`\``
  };
};

export const summarizePrompt = (content, lang = "English") => {
  return {
    system: `You are an expert reading comprehension AI and content summarizer. IMPORTANT: You MUST respond entirely in ${lang}. If the language is "Simple English", use extremely basic vocabulary.`,
    user: `Please thoroughly analyze and summarize the following webpage content. 
Structure your response exactly like this:
**Short Summary**: A 2-3 sentence overview.
**Key Takeaways**:
- Point 1
- Point 2
- Point 3
**Insights**: One or two interesting observations or implications from the text.

Content: ${content.substring(0, 8000)}` 
  };
};


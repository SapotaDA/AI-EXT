// utils/api.js
// Utility functions to interact with Google Gemini API (Free Tier)

export async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || null);
    });
  });
}

export async function* streamLLM(systemInstruction, userPrompt) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API Key not found. Please set your free Gemini API key in the extension settings.");
  }

  const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const modelsData = await modelsRes.json();
  if (!modelsRes.ok) throw new Error(modelsData.error?.message || "Failed to list models.");
  if (!modelsData.models || modelsData.models.length === 0) throw new Error("No models available.");

  let selectedModelName = "";
  const validModels = modelsData.models.filter(m => m.supportedGenerationMethods?.includes("generateContent"));
  const flashModel = validModels.find(m => m.name.includes("gemini-1.5-flash"));
  const proModel = validModels.find(m => m.name.includes("gemini-1.5-pro"));
  
  if (flashModel) selectedModelName = flashModel.name;
  else if (proModel) selectedModelName = proModel.name;
  else if (validModels.length > 0) selectedModelName = validModels[0].name;
  else throw new Error("No compatible models found.");

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/${selectedModelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
  
  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `System Instructions: ${systemInstruction}\n\nUser Input: ${userPrompt}` }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `HTTP Error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // Keep incomplete line

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
          // ignore incomplete JSON chunks that might be sent
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

Content: ${content.substring(0, 15000)}` 
  };
};

export const qaPrompt = (context, question, lang = "English") => {
  return {
    system: `You are a strict AI assistant reading a specific document. Answer ONLY using the provided context. If the context does not contain the answer, say 'I cannot find the answer to this question in the page content.' Do not use outside knowledge. IMPORTANT: You MUST respond entirely in ${lang}. If the language is "Simple English", use extremely basic vocabulary.`,
    user: `Context:\n${context.substring(0, 15000)}\n\nQuestion: ${question}`
  };
};

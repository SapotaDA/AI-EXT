# AI Research Assistant

A production-ready Chrome Extension (Manifest V3) that provides AI-powered tools on any webpage.

## Features
1. **Highlight → Explain**: Select any text on a webpage, right-click, and choose "Explain with AI" (or simpler variants).
2. **Full Page Summarizer**: Click the extension icon to summarize the current webpage's main content.
3. **Ask Questions About Page**: Use the Chat tab to ask specific questions based on the webpage's content (RAG-lite).

## Setup Instructions

1. **Get an OpenAI API Key**: 
   - Sign up at [OpenAI Platform](https://platform.openai.com/).
   - Generate a new secret API key.

2. **Load the Extension in Chrome**:
   - Open Google Chrome and go to `chrome://extensions/`.
   - Enable **"Developer mode"** in the top right corner.
   - Click **"Load unpacked"**.
   - Select the `d:\Ai Extension` folder containing these files.

3. **Configure the Extension**:
   - Click the extension icon in the Chrome toolbar.
   - Go to the **Settings** tab.
   - Paste your OpenAI API Key and click **Save Settings**.

## Usage
- **Context Menu**: Highlight text, right-click -> `Explain with AI` -> View the floating response.
- **Summarize**: Click the extension icon -> `Summarize Current Page`.
- **Chat**: Click the extension icon -> `Chat` -> Ask questions about the page content.

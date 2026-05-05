# AI Research Assistant - Feature Implementation Plan

## Features to Add:

### 1. Translation Feature
- Add new "Translate" tab in popup
- Dropdown to select target language
- Translate selected text or full page
- Use Gemini API for translation

### 2. History Panel
- Store summaries in chrome.storage
- Display list of past summaries with timestamps
- Click to view/re-copy previous results
- Clear history option

### 3. Dark Mode Toggle
- Add toggle in Settings tab
- Persist preference in storage
- CSS variables for dark/light themes

### 4. Keyboard Shortcuts
- Add commands in manifest.json
- Ctrl+Shift+S: Summarize
- Ctrl+Shift+T: Translate
- Ctrl+Shift+H: History

### 5. Text-to-Speech
- Use Web Speech API
- Play/pause controls in Summarize tab
- Read summary aloud

## Files to Modify:
- popup/popup.html - Add new tabs
- popup/popup.js - Add functionality
- popup/popup.css - Add styles
- manifest.json - Add shortcuts
- utils/api.js - Add translation prompt

## UI Improvements:
- Modern card-based design
- Smooth animations
- Better spacing
- Icon enhancements

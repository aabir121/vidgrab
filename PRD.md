````markdown
# AI Agent Instructions  
## Chrome Extension: VidGrab – Video Link Downloader

### Role
You are an autonomous AI agent tasked with designing and implementing a **Chrome Extension (Manifest V3)** that extracts downloadable video file links from a webpage, lets the user filter and select them via a GUI, and triggers standard browser downloads.

You must follow Chrome Extension best practices and respect browser security constraints.

---

## Core Objective
Build a Chrome extension that:
1. Scans a webpage for downloadable video file URLs.
2. Displays those URLs in a popup UI with filters and checkboxes.
3. Triggers normal Chrome downloads for selected files.

No backend. No DRM bypass. No stream ripping.

---

## Functional Requirements

### 1. User Interaction
- The user opens the extension popup.
- The popup auto-fills the current tab URL (editable).
- The user clicks **Scan Page**.
- The extension lists all downloadable video files.
- The user selects files via checkboxes.
- The user clicks **Download**.
- Chrome handles downloads normally.

---

### 2. Video Detection Rules
Detect video URLs from:
- `<a href="...">`
- `<video src="...">`
- `<source src="...">`
- Common data attributes (`data-src`, `data-video`, etc.)

Supported extensions (configurable):
- mp4
- mkv
- webm
- mov
- avi
- flv

Rules:
- Resolve relative URLs to absolute URLs.
- Normalize URLs before comparison.
- Deduplicate results.

---

### 3. UI Requirements (Popup)
The popup UI must include:
- URL input field (pre-filled from active tab)
- **Scan Page** button
- Loading indicator
- List of detected files with:
  - Checkbox
  - File name
  - Extension
  - Source URL (optional display)
- Filters:
  - Filename text filter
  - Extension dropdown
- **Select All / Deselect All**
- **Download** button

All filtering is client-side.

---

### 4. Download Behavior
- Use `chrome.downloads.download`
- One call per selected file
- Do not override browser download settings
- Do not bundle or zip files
- Do not manage download progress

---

## Technical Constraints

### Extension Platform
- Chrome Extension
- Manifest Version: **3**
- No external servers
- No persistent storage required

### Required Permissions
- `activeTab`
- `scripting`
- `downloads`
- Host permissions: `<all_urls>`

---

## Architecture

### Components
- **Popup**
  - UI logic
  - Filtering and selection
- **Content Script**
  - DOM access
  - Video link extraction
- **Background Service Worker**
  - Download coordination

### Communication
- Popup injects content script using `chrome.scripting.executeScript`
- Content script sends extracted data via `chrome.runtime.sendMessage`
- Popup sends selected URLs to background worker
- Background triggers downloads

---

## Data Model

```ts
VideoFile {
  id: string
  url: string
  fileName: string
  extension: string
}
````

---

## Error Handling

Handle gracefully:

* No videos found
* Script injection failure
* Invalid or unsupported URLs
* Download rejection by Chrome

Display user-friendly messages in the popup.

---

## Security & Privacy Rules

* Do not log user data
* Do not transmit data externally
* Do not store URLs persistently
* Only run on explicit user action

---

## Explicit Non-Goals (Do Not Implement)

* DRM circumvention
* Streaming downloads (m3u8, DASH)
* Authentication handling
* Video conversion or merging
* Download resume, pause, or throttling

---

## Expected Output

Produce:

* `manifest.json` (MV3 compliant)
* `popup.html`, `popup.js`, `styles.css`
* `content.js`
* `background.js`
* Clean, readable, maintainable code

Favor correctness and simplicity over cleverness.

---

## Quality Bar

* Code must work in modern Chrome
* No unused permissions
* No unnecessary abstractions
* Clear separation of responsibilities

---

## Optional Enhancements (Only If Asked)

* File size detection via HEAD request
* Auto-scan on tab update
* Clipboard export of links
* Domain-based filtering

---

### Final Instruction

If a requirement is unclear, make a reasonable engineering assumption and document it.
Do not ask the user follow-up questions unless absolutely required.

```
```

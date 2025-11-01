
KINO FEATURE - COMPREHENSIVE ENGINEERING IMPLEMENTATION PLAN

 🎯 EXECUTIVE SUMMARY

 Goal: Integrate "Kino" - Real-Time Video Intelligence & Accessibility Engine into the AI Browser Co-pilot as a powerful video analysis feature.

 Vision: Transform passive video watching into active, intelligent interaction with real-time AI analysis, live transcription, and accessibility features for
 visually impaired users.

 Integration Strategy: Leverage existing Firebase/Gemini infrastructure, add new chrome.tabCapture API, create Web Worker for video frame processing, and implement
 hybrid AI approach (cloud-based initially, with path to on-device when Chrome Built-in AI APIs become widely available).

 Timeline: 2-3 weeks (modified from original 4-week plan due to existing infrastructure)

 Core Innovation: First-of-its-kind real-time video Q&A + accessibility audio descriptions in a browser extension.

 ---
 ⚠️ CRITICAL TECHNICAL CONSIDERATION

 Chrome Built-in AI Prompt API Status:
 - 🔄 Currently: Early Preview Program - requires Chrome Canary/Dev + Origin Trial
 - 🎯 Our Approach: Start with cloud-based Gemini for immediate functionality
 - 🚀 Future: Easy migration to on-device when Prompt API is GA

 Implementation Path:
 1. Phase 1-3: Use existing Firebase + Gemini 2.5 Flash (works now, production-ready)
 2. Phase 4: Add on-device Prompt API integration (when available)

 This ensures we have a working demo today while being architecturally ready for on-device upgrade.

 ---
 📐 ARCHITECTURE INTEGRATION

 Existing Infrastructure to Leverage:

 ✅ Firebase backend with Vertex AI (Gemini 2.5 Flash)✅ React 19 + TypeScript✅ Service worker (background.ts)✅ Sidebar navigation✅ Firebase authentication✅
 Build system (esbuild)✅ Message passing patterns

 New Infrastructure Needed:

 🆕 chrome.tabCapture permission for video streams🆕 Web Worker for frame processing (performance)🆕 MediaStreamTrackProcessor for VideoFrame extraction🆕 Video URL
  summarization with Gemini🆕 Live transcript display🆕 Audio description with speechSynthesis🆕 Frame sampling and ImageBitmap conversion

 ---
 🗂️ FILE STRUCTURE & NEW COMPONENT

 extension/
 ├── components/
 │   ├── KinoView.tsx                   [NEW] - Main video analysis UI
 │   ├── VideoControlPanel.tsx          [NEW] - Start/stop capture controls
 │   ├── LiveTranscriptPanel.tsx        [NEW] - Real-time transcript display
 │   ├── VideoQAPanel.tsx               [NEW] - Conversational video Q&A
 │   ├── VideoSummaryPanel.tsx          [NEW] - Deep analysis results
 │   └── icons.tsx                      [MODIFY] - Add video/film icon
 ├── workers/
 │   └── frame-processor.ts             [NEW] - Web Worker for video processing
 ├── utils/
 │   ├── video-frame-utils.ts           [NEW] - Frame conversion utilities
 │   └── speech-utils.ts                [NEW] - Audio description helpers
 ├── types.ts                           [MODIFY] - Add Kino types
 ├── background.ts                      [MODIFY] - Add video capture handlers
 ├── manifest.json                      [MODIFY] - Add tabCapture permission
 └── App.tsx                            [MODIFY] - Add Kino view

 ---
 📅 PHASE-BY-PHASE IMPLEMENTATION PLAN

 PHASE 1: Foundation & Video Stream Capture (2-3 days)

 Tasks:

 1. Update manifest.json
   - Add tabCapture permission
   - Verify storage permission for settings
 2. Update types.ts
   - Add 'kino' to ViewMode
   - Create Kino-specific types:
   export interface VideoStreamState {
   active: boolean;
   tabId: number | null;
   stream: MediaStream | null;
   startTime: number;
 }

 export interface VideoFrame {
   timestamp: number;
   dataUrl: string;
   analysis?: string;
 }

 export interface VideoTranscript {
   timestamp: number;
   text: string;
   confidence?: number;
 }

 export interface VideoSummary {
   outline: Array<{time: string, topic: string}>;
   insights: string[];
   concepts: Record<string, string>;
 }
 3. Create KinoView.tsx skeleton
   - 4-tab interface:
       - Live Analysis (real-time Q&A)
     - Transcript (live text)
     - Video Summary (URL-based deep analysis)
     - Settings (frame rate, auto-description)
   - Video preview area (optional)
   - Start/Stop capture button
   - Status indicators
 4. Add video capture to background.ts
 let videoStreamState: {
   stream: MediaStream | null,
   tabId: number | null,
   worker: Worker | null
 } = { stream: null, tabId: null, worker: null };

 async function handleStartVideoCapture() {
   const [tab] = await chrome.tabs.query({active: true});
   const stream = await chrome.tabCapture.capture({
     video: true,
     audio: true
   });
   videoStreamState = { stream, tabId: tab.id, worker: null };
   // Initialize frame processing
 }

 function handleStopVideoCapture() {
   if (videoStreamState.stream) {
     videoStreamState.stream.getTracks().forEach(t => t.stop());
   }
   // Cleanup
 }
 5. Update Sidebar & App.tsx
   - Add Kino navigation button
   - Add Kino view case

 Deliverable: Kino view accessible, can start/stop video capture, stream object created.

 ---
 PHASE 2: Frame Processing & Sampling (3-4 days)

 Tasks:

 1. Create frame-processor.ts Web Worker
 // Web Worker for off-thread video processing

 let processor: MediaStreamTrackProcessor | null = null;
 let reader: ReadableStreamDefaultReader | null = null;
 let frameRate = 1; // 1 fps default

 self.onmessage = async (e) => {
   if (e.data.action === 'start') {
     const track = e.data.videoTrack;
     processor = new MediaStreamTrackProcessor({ track });
     reader = processor.readable.getReader();
     processFrames();
   }
 };

 async function processFrames() {
   let lastFrameTime = 0;
   const interval = 1000 / frameRate;

   while (true) {
     const { done, value } = await reader.read();
     if (done) break;

     const now = Date.now();
     if (now - lastFrameTime >= interval) {
       // Process this frame
       const bitmap = await createImageBitmap(value);
       const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
       const ctx = canvas.getContext('2d');
       ctx.drawImage(bitmap, 0, 0);
       const blob = await canvas.convertToBlob();
       const base64 = await blobToBase64(blob);

       self.postMessage({
         type: 'frame',
         data: base64,
         timestamp: now
       });

       lastFrameTime = now;
     }

     value.close(); // Important: release VideoFrame
   }
 }
 2. Create video-frame-utils.ts
 export async function videoFrameToDataUrl(frame: VideoFrame): Promise<string> {
   // Convert VideoFrame → ImageBitmap → Canvas → DataURL
 }

 export async function blobToBase64(blob: Blob): Promise<string> {
   // Utility for blob conversion
 }

 export function calculateFrameRate(quality: 'high' | 'medium' | 'low'): number {
   // high: 2fps, medium: 1fps, low: 0.5fps
 }
 3. Wire Worker to background.ts
 async function handleStartVideoCapture() {
   // ... capture stream ...

   // Create worker
   const worker = new Worker('workers/frame-processor.js');
   const videoTrack = stream.getVideoTracks()[0];

   worker.postMessage({
     action: 'start',
     videoTrack: videoTrack
   }, [videoTrack]); // Transfer track

   worker.onmessage = (e) => {
     if (e.data.type === 'frame') {
       handleVideoFrame(e.data.data, e.data.timestamp);
     }
   };
 }
 4. Implement frame handler
 async function handleVideoFrame(frameData: string, timestamp: number) {
   // Send frame to Kino view for display/analysis
   chrome.runtime.sendMessage({
     type: 'kino-frame',
     frame: frameData,
     timestamp: timestamp
   });
 }

 Deliverable: Video frames extracted at 1fps, sent to UI, visible in KinoView.

 ---
 PHASE 3: AI Video Analysis (Cloud-Based) (3-4 days)

 Tasks:

 1. Implement live frame analysis
 async function analyzeVideoFrame(frameData: string, userQuery: string) {
   const imagePart = {
     inlineData: {
       data: frameData.split(',')[1],
       mimeType: 'image/jpeg'
     }
   };

   const prompt = `You are analyzing a video frame. ${userQuery}
   
   Provide a brief, clear answer based on what you see in this frame.`;

   const result = await model.generateContent([prompt, imagePart]);
   return result.response.text();
 }
 2. Implement video URL summarization
 async function summarizeVideoUrl(videoUrl: string) {
   const prompt = `Analyze this video and provide:
   1. Hierarchical outline with timestamps
   2. 5-7 key insights
   3. Main concepts explained
   
   Video URL: ${videoUrl}
   
   Respond in JSON format.`;

   // Note: Gemini 2.5 Flash supports YouTube URL analysis
   const result = await model.generateContent(prompt);
   return JSON.parse(result.response.text());
 }
 3. Create VideoQAPanel.tsx
   - Chat-style interface for asking questions
   - Current frame display
   - Live Q&A responses
   - Question history
   - Pre-filled quick questions:
       - "What's happening in this video?"
     - "Describe the main subject"
     - "What text is visible?"
 4. Create VideoSummaryPanel.tsx
   - URL input field
   - "Summarize Video" button
   - Hierarchical outline display with timestamps
   - Key insights cards
   - Concept definitions
   - Export summary as markdown

 Deliverable: Working video Q&A and URL summarization features.

 ---
 PHASE 4: Accessibility Features (2-3 days)

 Tasks:

 1. Implement live transcription
   - Option 1: Web Speech API (browser native, works offline)
   - Option 2: Send audio chunks to Gemini (more accurate)
   - Display in scrolling transcript panel
   - Auto-scroll to latest
   - Timestamps for each segment
 2. Create LiveTranscriptPanel.tsx
   - Scrolling transcript display
   - Timestamps
   - Export transcript button
   - Search within transcript
   - Copy segments
 3. Implement audio descriptions (Accessibility Mode)
 let accessibilityMode = false;

 async function generateAudioDescription(frameData: string) {
   const prompt = `Describe what's visually happening in this video frame 
   for a visually impaired person. Be concise and focus on important 
   visual changes, actions, or text that appears.`;

   const result = await model.generateContent([prompt, {inlineData: {data: frameData}}]);
   const description = result.response.text();

   // Speak aloud
   const utterance = new SpeechSynthesisUtterance(description);
   speechSynthesis.speak(utterance);

   return description;
 }
 4. Create speech-utils.ts
 export function speak(text: string, options?: SpeechSynthesisOptions) {
   const utterance = new SpeechSynthesisUtterance(text);
   utterance.rate = options?.rate || 1.0;
   utterance.pitch = options?.pitch || 1.0;
   utterance.volume = options?.volume || 1.0;
   speechSynthesis.speak(utterance);
 }

 export function stopSpeaking() {
   speechSynthesis.cancel();
 }
 5. Add Settings Panel
   - Frame sampling rate (0.5fps, 1fps, 2fps)
   - Auto-description toggle
   - Voice settings (rate, pitch, volume)
   - Save to chrome.storage.local

 Deliverable: Full accessibility mode with audio descriptions for visually impaired users.

 ---
 PHASE 5: Polish & Optimization (2-3 days)

 Tasks:

 1. Performance optimization
   - Memory management (release VideoFrames immediately)
   - Worker cleanup on stop
   - Frame queue limits (prevent memory leak)
   - Debounce AI requests
 2. UI/UX refinement
   - Visual feedback when capturing
   - Live frame preview (small thumbnail)
   - Recording indicator
   - Transcript auto-scroll
   - Clear status messages
 3. Error handling
   - DRM-protected video detection
   - Permission denied handling
   - Tab closed during capture
   - Worker crashes
   - API rate limits
 4. Settings persistence
   - Save user preferences
   - Restore on reload
   - Export/import settings
 5. Documentation
   - Usage instructions
   - Accessibility benefits
   - Technical architecture
   - API requirements

 Deliverable: Production-ready, polished Kino feature.

 ---
 🔧 TECHNICAL SPECIFICATIONS

 New Dependencies:

 {
   "dependencies": {
     // No new npm packages needed!
     // Using browser APIs: tabCapture, MediaStreamTrackProcessor, speechSynthesis
   }
 }

 Manifest Changes:

 {
   "permissions": [
     "sidePanel",
     "scripting",
     "identity",
     "storage",
     "debugger",
     "activeTab",
     "tabCapture"  // ← NEW for video capture
   ]
 }

 Build Configuration:

 {
   "build-workers": "npx esbuild workers/frame-processor.ts --bundle --outdir=dist/workers --format=iife",
   "build": "npm run clean && npm run build-content-scripts && npm run build-workers && ..."
 }

 ---
 🎬 KINO FEATURE CAPABILITIES

 1. Live Video Q&A

 User watches YouTube tutorial on React
 User asks: "What hook is being used here?"
 AI analyzes current frame → "This frame shows the useState hook being imported"

 User asks: "What's the syntax?"
 AI: "const [state, setState] = useState(initialValue)"

 2. Live Transcription

 Video plays: "Welcome to this tutorial on TypeScript..."
 Transcript panel updates in real-time with timestamps:
 [00:05] Welcome to this tutorial on TypeScript
 [00:12] Today we'll cover interfaces and types
 [00:18] Let's start with a basic example

 3. Audio Descriptions (Accessibility)

 Accessibility Mode ON
 Frame shows: Code editor with TypeScript interface
 AI generates: "Screen shows code editor. TypeScript interface being defined with three properties."
 speechSynthesis speaks it aloud
 Visually impaired user understands what's happening

 4. Video URL Summarization

 User inputs: https://youtube.com/watch?v=example
 AI analyzes entire video:

 Outline:
 [00:00] Introduction to React Hooks
 [02:15] useState Hook Explained
 [05:30] useEffect Hook Deep Dive
 [10:45] Custom Hooks Best Practices
 [15:00] Conclusion

 Key Insights:
 1. Hooks enable functional components to have state
 2. useEffect replaces lifecycle methods
 3. Custom hooks promote code reuse
 ...

 ---
 ⚠️ TECHNICAL CHALLENGES & SOLUTIONS

 | Challenge                             | Risk   | Solution                                                           |
 |---------------------------------------|--------|--------------------------------------------------------------------|
 | Chrome Built-in AI not available      | HIGH   | Use cloud Gemini initially, architectural path to on-device later  |
 | High CPU/memory from video processing | HIGH   | Web Worker offloads from main thread, configurable frame rate      |
 | DRM-protected video                   | MEDIUM | Detect and show helpful error, focus demo on YouTube/non-DRM       |
 | tabCapture quality                    | MEDIUM | Accept varying quality, works well for YouTube/educational content |
 | API rate limits                       | LOW    | Debounce requests, queue frames, user-controlled sampling          |

 ---
 🎯 WEB WORKER ARCHITECTURE

 Main Thread (background.ts)
     ↓
 chrome.tabCapture.capture()
     ↓
 MediaStream (video + audio)
     ↓
 Transfer videoTrack to Worker
     ↓
 Web Worker (frame-processor.ts)
     ↓
 MediaStreamTrackProcessor
     ↓
 ReadableStream<VideoFrame>
     ↓
 Sample at 1fps
     ↓
 Convert to ImageBitmap → Canvas → Base64
     ↓
 postMessage back to Main Thread
     ↓
 Send to Gemini for Analysis
     ↓
 Display in KinoView UI

 ---
 🧪 TESTING STRATEGY

 Phase 1 Testing:

 - ✅ Kino view renders
 - ✅ tabCapture permission granted
 - ✅ Video stream captured from tab
 - ✅ Stream object logged to console

 Phase 2 Testing:

 - ✅ Worker created and communicates
 - ✅ Frames extracted (console log frame data)
 - ✅ Frame sampling rate adjustable
 - ✅ Memory usage stable (<200MB)

 Phase 3 Testing:

 - ✅ Frame sent to Gemini, response received
 - ✅ Video URL summarization works (YouTube)
 - ✅ Q&A responses relevant to frame content
 - ✅ Response time acceptable (<3s)

 Phase 4 Testing:

 - ✅ Transcription displays in real-time
 - ✅ Audio descriptions speak aloud
 - ✅ Accessibility mode helps understanding
 - ✅ Settings persist across sessions

 ---
 🚀 INNOVATIVE USE CASES

 1. Educational Accessibility

 Blind student watching lecture video
 Kino provides real-time audio descriptions:
 "Professor writing equation on whiteboard"
 "Diagram showing three connected nodes"
 "Chart displaying upward trend"

 Result: Makes visual content accessible

 2. Video Content Research

 Researcher watching 20 tech talks
 Uses Kino to:
 - Generate summary of each (5 min → 30 sec read)
 - Ask specific questions ("What database did they use?")
 - Search transcripts for keywords
 - Export insights as markdown

 Result: 10x faster research

 3. Live Tutorial Learning

 Developer following coding tutorial
 Pauses video, asks:
 "What library is this?"
 "Why did they use async here?"
 "What's the alternative approach?"

 Kino analyzes frame and provides context

 Result: Interactive learning, no context switching

 ---
 📊 SUCCESS METRICS

 - Functional: Video capture, frame processing, Q&A, summarization, transcription all working
 - Performance: <200MB memory, smooth at 1fps, <3s AI response
 - Accuracy: Relevant answers to 90%+ of questions
 - Accessibility: Audio descriptions helpful for visually impaired users
 - UX: One-click start, clear status, intuitive controls

 ---
 🎯 SIMPLIFIED FIRST VERSION (MVP)

 To accelerate development, start with:

 Core Features:
 1. ✅ Video stream capture (chrome.tabCapture)
 2. ✅ Frame extraction (Web Worker + MediaStreamTrackProcessor)
 3. ✅ Live Q&A (send frames to cloud Gemini)
 4. ✅ Basic transcript display (Web Speech API)

 Defer to V2:
 - Audio descriptions (can add later)
 - Video URL summarization (can add later)
 - Advanced settings (can add later)

 Estimated MVP Time: 1 week

 ---
 🔄 MIGRATION PATH TO ON-DEVICE AI

 When Chrome Prompt API becomes available:

 // Phase 3: Replace cloud call
 // Before (cloud):
 const result = await model.generateContent([prompt, image]);

 // After (on-device):
 const session = await ai.createPromptSession();
 const result = await session.prompt(prompt, { image: imageBlob });

 // Benefit: Zero latency, offline, privacy, no API costs

 Architecture is designed for easy swap - same interfaces, different backend.

 ---
 This plan integrates Kino as a natural evolution of your co-pilot, adding real-time video intelligence while maintaining the hybrid AI strategy and leveraging your
  existing Firebase/Gemini infrastructure.


Here is the comprehensive, deep technical engineering plan for building and implementing "Kino," your winning entry for the Google Chrome Built-in AI Challenge.

# Engineering Plan: "Kino" — The Real-Time Video Intelligence & Accessibility Engine

## 1\. Executive Summary

**Project Vision:** "Kino" is a Chrome extension that transforms passive video consumption into an active, intelligent, and accessible experience. Operating within the browser's side panel, Kino attaches to any video stream playing in a tab, providing a suite of real-time, on-device AI analyses. It enables users to conversationally query visual information, receive live transcriptions, and generate audio descriptions for visual events, all while ensuring user privacy. For deeper, post-hoc analysis, Kino employs a hybrid architecture to leverage powerful cloud-based models.

**Core Objective:** To win the "Best Multimodal AI Application" and "Best Hybrid AI Application" categories by creating a novel, high-impact tool that showcases a sophisticated and purposeful use of the entire specified technology stack. The project's strong accessibility focus—providing real-time descriptions for the visually impaired—is designed to resonate with the "Most Impactful" judging criterion, a common thread in past winning projects.[1, 2, 3]

**Technology Stack:**

  * **Frontend (Chrome Extension):**
      * **Manifest:** Manifest V3
      * **UI:** `chrome.sidePanel` API, HTML, CSS, TypeScript (with Vite for bundling)
      * **Core Logic:** `chrome.tabCapture`, `chrome.scripting`, `chrome.runtime`, `chrome.storage` APIs
      * **Video Processing:** WebCodecs API (`MediaStreamTrackProcessor`, `VideoFrame`), Canvas API, ImageCapture API [4, 5, 6]
      * **On-Device AI:** Chrome Built-in `Prompt API` (multimodal image and audio) [7, 8, 9]
  * **Backend (Serverless Analysis):**
      * **Compute:** Cloud Functions for Firebase (2nd Gen) [10]
      * **AI Model Access:** Firebase AI Logic SDK [11, 12, 13, 14, 15, 16, 17, 18]
      * **Cloud AI Models:** Gemini 2.5 Pro or Flash (for full video URL analysis)
      * **Data Persistence:** Cloud Firestore for storing user settings and cached summaries [19]

## 2\. Project Phasing & Timeline (4-Week Hackathon Sprint)

This plan is structured as an aggressive sprint, prioritizing a functional Minimum Viable Product (MVP) and then iterating on advanced features.

| Phase | Duration | Key Objectives & Deliverables |
| :--- | :--- | :--- |
| **Phase 1: Foundation & Stream Capture** | **Week 1** | • **Setup:** Initialize project structure (monorepo with `/extension` and `/firebase` folders), Firebase project, and GitHub repo. <br> • **Manifest & UI:** Create `manifest.json` with `sidePanel`, `tabCapture`, and `scripting` permissions. Build the basic side panel UI with a chat interface, control buttons, and a display area.[20] <br> • **Video Stream Capture:** Implement the core logic in the service worker to use `chrome.tabCapture.capture()` to obtain a `MediaStream` from the active tab upon user action.[21] <br> • **Frame Extraction Proof-of-Concept:** Use `MediaStreamTrackProcessor` to extract individual `VideoFrame` objects from the stream and log them to the console to validate the capture pipeline.[6] |
| **Phase 2: On-Device Intelligence** | **Week 2** | • **Frame-to-Image Conversion:** Implement a robust pipeline (ideally in a Web Worker) to convert `VideoFrame` objects into a format compatible with the Prompt API (e.g., `ImageBitmap` or a base64-encoded PNG from a canvas). <br> • **On-Device Visual Q\&A:** Integrate the on-device `Prompt API`'s multimodal image capability. Send sampled frames and a user's text query to Gemini Nano and display the text response in the side panel.[7, 8, 9] <br> • **Live Transcription:** Simultaneously process the audio track from the `MediaStream` using the on-device `Prompt API`'s audio input to generate a live, scrolling transcript.[7] |
| **Phase 3: Hybrid Backend & Accessibility** | **Week 3** | • **Firebase Backend Setup:** Create a callable Cloud Function (`onCall`) as the secure API endpoint. Configure it with the Firebase AI Logic SDK to access the full Gemini API.[11, 12, 13, 14, 15, 16, 17, 18] <br> • **Full Video Summarization:** Implement the feature to send a video URL (e.g., YouTube) to the backend. The Cloud Function will use the Gemini API's native video URL processing to generate a comprehensive summary with timestamps. <br> • **Live Audio Description (Accessibility MVP):** Implement the "Accessibility Mode." The extension will continuously send frames to the on-device `Prompt API` with a specialized prompt to generate descriptions of visual events. Use the `window.speechSynthesis` API to read these descriptions aloud. |
| **Phase 4: Advanced Features & Polish** | **Week 4** | • **Chart & Diagram Extraction:** Enhance the on-device analysis to specifically detect charts or diagrams. When detected, use a more detailed prompt to extract the visual information into structured text or a table, a known capability of advanced multimodal models.[22] <br> • **UI/UX Refinement:** Polish the side panel UI, add clear loading states, handle errors gracefully, and implement a settings panel (stored in `chrome.storage.local`) to control features like frame sampling rate and auto-description. <br> • **Submission Prep:** Record a compelling demo video highlighting the real-time Q\&A and the powerful accessibility feature. Write the project description and finalize the public GitHub repository. |

## 3\. Architectural Design

Kino is built on a purposeful hybrid AI architecture that aligns task complexity with the appropriate processing environment. This design maximizes privacy and real-time responsiveness while retaining access to powerful cloud capabilities for complex, long-form analysis.[23, 24, 25, 26, 27, 28]

\!([https://i.imgur.com/example.png](https://www.google.com/search?q=https://i.imgur.com/example.png)) *(Conceptual Diagram)*

1.  **On-Device Loop (Real-Time Intelligence):**

      * The `chrome.tabCapture` API creates a live `MediaStream` of the target tab.[21]
      * A `MediaStreamTrackProcessor` breaks the video track into a stream of `VideoFrame` objects.[6] This processing occurs within a Web Worker to avoid blocking the main UI thread.
      * At a set interval (e.g., once per second), a frame is converted to an `ImageBitmap` and sent to the on-device `Prompt API` along with a user's query or a standing instruction (e.g., "describe what is happening").
      * The audio track is simultaneously streamed to a separate on-device `Prompt API` session for live transcription.
      * This entire loop is self-contained within the browser, ensuring maximum privacy, zero latency, and offline capability.

2.  **Cloud Path (Deep Analysis):**

      * For tasks that exceed the on-device model's capabilities (e.g., summarizing a full-length video), the user explicitly triggers a cloud request.
      * The extension sends minimal, non-sensitive data (like a public video URL) to a Firebase Cloud Function.
      * The Cloud Function uses the secure Firebase AI Logic SDK to call a powerful cloud model (Gemini 2.5 Pro/Flash) capable of processing entire video files or URLs directly.
      * The structured result (e.g., a JSON summary) is returned to the extension for display.

## 4\. Component Breakdown & Technical Specifications

### 4.1. Chrome Extension

#### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Kino - Video Intelligence Engine",
  "version": "1.0",
  "description": "Real-time AI analysis and accessibility for any video in your browser.",
  "permissions":,
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "service-worker.js"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Open Kino"
  }
}
```

#### `service-worker.js` (Service Worker)

  * **Responsibilities:** The central orchestrator.
      * Manages the lifecycle of the `MediaStream` from `chrome.tabCapture`. Starts the stream on user action and stops it gracefully (`stream.getVideoTracks().stop()`).[29]
      * Creates and manages the Web Worker (`frame-processor.js`) responsible for handling the video frames.
      * Acts as a message broker between the side panel, the Web Worker, and the Firebase backend.
      * Initializes the side panel behavior to open on action click.[20]

#### `frame-processor.js` (Web Worker)

  * **Responsibilities:** Handles the performance-intensive task of processing the video stream off the main thread.
      * Receives the `MediaStreamTrack` from the service worker.
      * Initializes a `MediaStreamTrackProcessor` to create a `ReadableStream` of `VideoFrame`s.[6]
      * Enters a loop (`while(true)`) to read frames from the stream.
      * Implements a throttling mechanism (e.g., using `setTimeout`) to sample frames at a configurable rate (e.g., 1 frame per second).
      * For each sampled frame, it converts the `VideoFrame` to an `ImageBitmap` using `createImageBitmap()`.
      * Posts the `ImageBitmap` back to the service worker for AI processing.

#### `sidepanel.js` & `sidepanel.html`

  * **Responsibilities:** The user interface and interaction logic.
      * Provides buttons to "Start/Stop Analysis" on the current tab's video.
      * Contains a chat input for users to ask questions about the video content.
      * Displays the live transcript and the on-device AI's responses to visual queries.
      * Renders the comprehensive summary received from the cloud backend.
      * Includes a toggle for "Accessibility Mode" (live audio description). When enabled, it uses `window.speechSynthesis.speak()` to voice the descriptions generated by the on-device AI.

### 4.2. Firebase Backend

#### `index.ts` (Cloud Function)

  * **Trigger:** An HTTPS Callable Function (`onCall`) provides a secure endpoint for the extension.[10]
  * **Security:** Integrates with Firebase App Check to ensure requests originate only from the legitimate Chrome extension.[14]
  * **AI Logic:**
      * Uses the Firebase AI Logic SDK to initialize a generative model instance pointing to a powerful cloud model like `gemini-2.5-pro`.
      * Receives a video URL in the request payload.
      * Calls the Gemini API, passing the URL directly in the prompt. The Gemini API handles the fetching and processing of the video content from supported sources like YouTube.
      * **Prompt Engineering for Summarization:** The prompt will be highly structured to elicit a detailed, useful summary.
        ```
        Act as an expert analyst. For the video at the provided URL, perform the following analysis and return the result as a single JSON object:
        1.  **Hierarchical Outline:** Generate a detailed, hierarchical outline of the video's structure with timestamps (HH:MM:SS).
        2.  **Core Insights:** Distill the 5-7 most critical insights or key takeaways.
        3.  **Key Concepts:** Identify and define the main concepts discussed in the video.
        ```

## 5\. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **High CPU/Memory Usage from Real-Time Frame Processing** | High | High | **Primary:** All video processing (`MediaStreamTrackProcessor`, frame reading, and conversion) will be offloaded to a Web Worker to prevent blocking the main UI thread. **Secondary:** Implement a user-configurable frame sampling rate in the settings, allowing users on lower-end hardware to reduce the processing frequency (e.g., from 1fps to 0.2fps). |
| **On-Device Model (Gemini Nano) Accuracy Limitations** | Medium | Medium | **Prompt Engineering:** Design simple, direct prompts for on-device tasks (e.g., "Describe this image in one sentence" instead of a complex multi-part query). **User Expectation Management:** The UI will clearly label real-time features as "On-Device AI" and deep analysis as "Cloud-Powered," setting user expectations about the capabilities of each mode. |
| **`chrome.tabCapture` API Limitations** | Medium | Medium | The `tabCapture` API can sometimes produce a lower-resolution stream or have issues with DRM-protected content.[29] The plan will focus the demo on non-DRM content (YouTube, educational sites). The UI will gracefully handle capture failures by displaying an informative error message to the user. |
| **Latency in Cloud-Based Summarization** | Low | Low | The Gemini API's direct URL processing is highly optimized. To further enhance user experience, the Cloud Function will use streaming responses to send back parts of the summary (e.g., the outline first, then key concepts) as they are generated, providing incremental updates to the UI rather than making the user wait for the full result.[30] |
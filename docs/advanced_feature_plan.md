# Engineering Plan: Advanced Feature Implementation (V2 Architecture)

**Objective:** To integrate real-time video analysis and CDP-based network analysis into the current Firebase-powered (V2) architecture of the AI Browser Co-pilot.

This plan outlines the steps to re-introduce these advanced features, adapting them to the secure, client-centric design of the V2 system.

---

## Phase 1: Real-time Video Analysis (Top Priority)

This phase re-implements the video analysis feature, replacing the old service-worker-based logic with a direct client-to-Firebase implementation.

### Step 1: Re-integrate the UI Components

We will start by adding the necessary UI elements back into the application.

1.  **Create `VideoAnalysisView.tsx`:**
    *   Create a new file at `extension/components/VideoAnalysisView.tsx`.
    *   This component will contain the UI for displaying the webcam feed, a "Start/Stop Analysis" button, and the area for the AI's output.

2.  **Update `Sidebar.tsx`:**
    *   Open `extension/components/Sidebar.tsx`.
    *   Import the `VideoIcon`.
    *   Add a new `NavButton` for "Webcam Analysis" to the navigation section.

3.  **Update `App.tsx`:**
    *   Open `extension/App.tsx`.
    *   Import the new `VideoAnalysisView` component.
    *   Add a `'video'` case to the `switch` statement inside the `ActiveView` memo, which will render the `VideoAnalysisView` component.

4.  **Update `types.ts`:**
    *   Open `extension/types.ts` and add `'video'` back to the `ViewMode` type:
        ```typescript
        export type ViewMode = 'chat' | 'tab' | 'video';
        ```

### Step 2: Implement Core Video Logic

This involves capturing and processing the webcam feed directly in the React component.

1.  **In `VideoAnalysisView.tsx`:**
    *   Use `useRef` to get references to the `<video>` and `<canvas>` elements.
    *   Use `useState` to manage the `MediaStream`, analysis results, and loading/error states.
    *   Use `useEffect` to request camera access via `navigator.mediaDevices.getUserMedia` when the component mounts and to clean up the stream when it unmounts.

### Step 3: Integrate with Firebase AI Vision Model

This is the key adaptation for the V2 architecture.

1.  **In `VideoAnalysisView.tsx`:**
    *   Import the shared `model` instance from `../firebase`.
    *   Create a function `captureAndAnalyze`. This function will:
        1.  Draw the current frame from the `<video>` element onto the hidden `<canvas>`.
        2.  Get a `base64` encoded JPEG image from the canvas using `canvas.toDataURL('image/jpeg')`.
        3.  Construct a prompt for the Gemini model. The prompt must include both text and the image data.
            ```javascript
            const prompt = {
              text: "Describe what is happening in this image from a webcam in a single, concise sentence.",
              image: {
                inlineData: {
                  data: base64ImageData, // The string from toDataURL, without the "data:image/jpeg;base64," prefix
                  mimeType: 'image/jpeg'
                }
              }
            };
            ```
        4.  Call `model.generateContent(prompt)` to send the data to the Firebase backend for analysis.
        5.  Display the returned text in the UI.
    *   The "Start/Stop Analysis" button will use `setInterval` to call `captureAndAnalyze` periodically (e.g., every 5 seconds).

### Step 4: Testing Plan

1.  Run `npm run build` and reload the extension.
2.  Navigate to the "Webcam Analysis" view.
3.  The browser should prompt you for camera permission. Grant it.
4.  Your webcam feed should appear in the video element.
5.  Click "Start Analysis".
6.  **Expected Result:** Every few seconds, the "AI Output" section should update with a new description of what the webcam sees.

---

## Phase 2: Network Analysis via Chrome Debugger API (CDP)

This phase implements a network analysis feature. It is crucial to understand that we will **not** use the old Native Host. Instead, we will use the `chrome.debugger` API, which is the official, secure method for a Manifest V3 extension to interact with the Chrome DevTools Protocol.

**Architectural Note & UX Trade-off:** The `chrome.debugger` API provides immense power, but for security reasons, Chrome will display a prominent warning banner at the top of the tab being debugged (e.g., *"AI Co-pilot" started debugging this browser*). This is a mandatory security feature that cannot be disabled. This plan proceeds with the understanding that this UX trade-off is acceptable.

### Step 1: Update `manifest.json`

1.  Open `extension/manifest.json`.
2.  Add the `"debugger"` permission to the `permissions` array. This is required to use the `chrome.debugger` API.

### Step 2: Create the UI

1.  **Create `NetworkAnalysisView.tsx`:**
    *   Create a new file at `extension/components/NetworkAnalysisView.tsx`.
    *   This component will have a simple UI: a button to "Start/Stop Network Analysis" and a text area to display the final AI-generated report.
    *   Add this view to `App.tsx`, `Sidebar.tsx`, and `types.ts`, just as you did for the video analysis view.

### Step 3: Implement the Debugger Logic in the Service Worker (`background.ts`)

The core logic for managing the debugger connection must live in the service worker to ensure it persists even if the side panel is closed.

1.  **In `background.ts`:**
    *   Add a message listener for `"start-network-analysis"`. When this message is received from the UI:
        1.  Get the `tabId` of the active tab.
        2.  Call `chrome.debugger.attach({ tabId }, "1.3", () => { ... })`.
        3.  In the callback, enable the Network domain: `chrome.debugger.sendCommand({ tabId }, "Network.enable")`.
        4.  Add a listener for debugger events: `chrome.debugger.onEvent.addListener(handleNetworkEvent)`.
    *   Create the `handleNetworkEvent` function. This function will check for `Network.responseReceived` events and collect the relevant data (URL, status, MIME type) into a temporary array.
    *   Add a message listener for `"stop-network-analysis"`. When this is received:
        1.  Remove the `onEvent` listener.
        2.  Call `chrome.debugger.detach({ tabId })`.
        3.  Send the collected array of network data back to the `NetworkAnalysisView.tsx` component.

### Step 4: Generate the AI Report on the Client

1.  **In `NetworkAnalysisView.tsx`:**
    *   The "Start" button will send the `"start-network-analysis"` message to the background script.
    *   The "Stop" button will send the `"stop-network-analysis"` message.
    *   Create a message listener to receive the final array of network data from the background script.
    *   When the data is received:
        1.  Format the raw network data into a clear, human-readable prompt.
        2.  Import the shared `model` from `../firebase`.
        3.  Call `model.generateContent()` with the prompt.
        4.  Display the AI's report in the text area.

### Step 5: Testing Plan

1.  Run `npm run build` and reload the extension.
2.  Navigate to any website.
3.  Open the side panel and go to the "Network Analysis" view.
4.  Click "Start Network Analysis".
5.  **Expected Result:** The security warning banner should immediately appear at the top of the main web page.
6.  Reload the main web page to generate network traffic.
7.  Click "Stop Network Analysis".
8.  **Expected Result:** The warning banner should disappear, and the "AI Output" in the side panel should populate with a detailed report from Gemini analyzing the network requests that occurred.

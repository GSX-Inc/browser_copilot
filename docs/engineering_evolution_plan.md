# Engineering Plan: Evolving to a Hybrid AI Architecture

**Objective:** To evolve the existing "AI Browser Co-pilot" Chrome Extension into a next-generation hybrid AI assistant by implementing the architecture and features outlined in `docs/evolution_plan.md`.

This plan details the necessary steps to transition from the current architecture (React frontend + Native Host) to the target architecture (React frontend + Firebase Backend), focusing on integrating Firebase AI Logic, secure authentication, and text-based contextual analysis while deprecating legacy components.

---

## Phase 0: Project Restructuring and Firebase Setup

This foundational phase prepares the project for the new architecture by setting up the backend and reorganizing the codebase.

1.  **Set Up Firebase Project:**
    *   Create a new project in the Firebase Console.
    *   Enable **Authentication** and configure the **Google** provider.
    *   Enable **Firebase AI Logic**, link your Google Cloud project, enable the Gemini API, and securely store the API key in the Firebase backend.
    *   Enable **App Check** with the reCAPTCHA v3 provider and register the Chrome Extension's ID to secure the backend.

2.  **Update Dependencies:**
    *   In `extension/package.json`, remove the `@google/genai` dependency.
    *   Add the required Firebase SDKs: `firebase`.

3.  **Create Firebase Configuration:**
    *   Create a new file `extension/firebaseConfig.js` to store the Firebase project configuration keys.
    *   **Crucially, add `firebaseConfig.js` to `.gitignore`** to prevent committing sensitive keys.

4.  **Codebase Reorganization:**
    *   Identify all code related to the Native Host, including the `native-host/` directory and the `DebuggingView.tsx` component. These will be removed in a later phase but should be mentally marked for deprecation.
    *   Similarly, the `VideoAnalysisView.tsx` is not part of the new plan and should be marked for deprecation.

## Phase 1: Core UI, Authentication, and Manifest Updates

This phase focuses on adapting the user-facing components to support authentication and the new feature set.

1.  **Refactor `extension/manifest.json`:**
    *   Add the `"identity"` and `"storage"` permissions.
    *   Add the `"oauth2"` key with the `client_id` from your Firebase project and initial scopes (`userinfo.email`, `userinfo.profile`).
    *   Rename the background script from `"service_worker": "service-worker.js"` to `"service_worker": "background.js"` to match the evolution plan's naming convention.

2.  **Implement Authentication Flow:**
    *   Create a new component or modify `App.tsx` to manage the application's state (e.g., `signedIn` vs. `signedOut`).
    *   When a user is not signed in, display a "Sign In with Google" button.
    *   On click, use the `chrome.identity.getAuthToken` API to get an OAuth token and then use `signInWithCredential` from the `firebase/auth` SDK to authenticate the user with Firebase.

3.  **Update UI Components:**
    *   Modify `extension/components/Sidebar.tsx` to remove the navigation buttons for "Debugger" and "Webcam Analysis".
    *   The main `App.tsx` should now conditionally render the main chat interface or the "Sign In" view based on the user's authentication state.

## Phase 2: Migrating to Firebase AI Logic

This is the core technical migration, replacing the direct API calls with the hybrid model SDK.

1.  **Refactor AI Interaction in `ChatView.tsx`:**
    *   Remove the existing `chrome.runtime.sendMessage` logic used for streaming chat.
    *   Import `getAI` and `getGenerativeModel` from the `firebase/ai` SDK.
    *   Initialize the model with `inferenceMode: InferenceMode.HYBRID` and `modelName: "gemini-pro"`.
    *   Update the `handleSend` function to call the Firebase AI model directly from the client-side component. The SDK will handle the secure routing to the backend.

2.  **Simplify the Service Worker (`service-worker.ts` -> `background.js`):**
    *   Rename `extension/service-worker.ts` to `extension/background.ts`.
    *   Remove all Gemini AI initialization (`@google/genai`) and message handling logic (`handleStreamChat`, `handleAnalyzeImage`, `handleDebugPage`).
    *   The service worker's primary roles will now be:
        1.  Opening the side panel on action click (already implemented).
        2.  Acting as a message router for contextual data handling (to be built in the next phase).

3.  **Remove Build-Time API Key:**
    *   Update the `esbuild` script to remove the `--define:process.env.API_KEY=...` flag. The API key is no longer needed on the client.

## Phase 3: Implementing Text-Based Context Handling

This phase replaces the screenshot-based analysis with the planned text-scraping mechanism.

1.  **Create Content Script (`extension/content.js`):**
    *   Create a new file `extension/content.js` that listens for a `getPageContent` message and responds with `document.body.innerText`.

2.  **Implement the Message-Passing Flow:**
    *   **Side Panel (`TabAnalysisView.tsx`):** Refactor this component. Instead of capturing a screenshot, it will now send a `readPage` message to the background script when the user clicks the "Share this tab" button.
    *   **Background Script (`background.js`):**
        *   Create a message listener for the `readPage` action.
        *   Upon receiving the message, use the `chrome.scripting.executeScript` API to inject `content.js` into the active tab.
        *   After injection, send a `getPageContent` message to the tab.
        *   In the callback, receive the page content and forward it back to the side panel via a `pageContentResult` message.
    *   **Side Panel (Listener):** Create a `chrome.runtime.onMessage` listener in the main React app to receive the `pageContentResult`, construct the final prompt (context + user query), and send it to the Firebase AI model.

## Phase 4: Deprecation and Cleanup

This phase formalizes the removal of obsolete code to finalize the migration.

1.  **Delete Unused Files and Directories:**
    *   Delete the entire `native-host/` directory.
    *   Delete `extension/components/DebuggingView.tsx`.
    *   Delete `extension/components/VideoAnalysisView.tsx`.
    *   Delete any other related utility files or types that are no longer needed.

2.  **Update Documentation:**
    *   Update `README.md` and `docs/plan.md` to remove all setup instructions related to the Native Host.
    *   Update the project description to reflect the new Firebase-powered architecture and features.

## Phase 5: Future Work (Advanced Integrations)

Once the core migration is complete and stable, the following features from the evolution plan can be implemented.

1.  **"Go Live" Voice Mode:**
    *   Integrate the Web Speech API (`SpeechRecognition` and `SpeechSynthesis`) into the `ChatView.tsx` component to enable voice input and output.

2.  **Google Workspace Integration:**
    *   Expand the OAuth scopes in `manifest.json`.
    *   Implement data fetching logic in the background script to call Google APIs (like Calendar) using the user's auth token.
    *   Create a mechanism to inject this data into prompts, similar to the page context system.

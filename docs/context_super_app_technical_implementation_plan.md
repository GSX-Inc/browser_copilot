 Engineering Plan: Integrating the "Context" Super App Functionality

  Objective: To evolve the AI Browser Co-pilot into an intelligent, agentic co-pilot capable of understanding and synthesizing information across
  multiple browser tabs, and performing multi-step actions based on natural language commands, leveraging a hybrid AI architecture.

  Strategic Alignment: This plan directly integrates the core vision of the "Context" Super App, building upon our existing V2 Firebase-powered
  Chrome Extension.

  ---

  1. Architectural Overview (V2 + Context Super App)

  The system will maintain its hybrid AI architecture, with the Chrome Extension acting as the client and Firebase (potentially with Genkit) as the
  backend.

   * Client (Chrome Extension):
       * UI: chrome.sidePanel (React/TypeScript/Tailwind).
       * Core Logic: background.ts (service worker) for orchestration, content.js for scraping, firebase.ts for shared Firebase services.
       * New Capabilities: Multi-tab content scraping, client-side action execution.
   * Backend (Firebase):
       * AI Logic: Firebase AI Logic (Vertex AI SDK) with Gemini 1.5 Pro/Flash.
       * New Capabilities: Potentially Genkit Framework for agentic orchestration, Cloud Firestore for session state.

  ---

  2. Project Phasing & Detailed Engineering Plan

  This plan is structured to incrementally add the "Context" Super App features, prioritizing foundational capabilities first.

  Phase 1: Multi-Tab Context Gathering & Synthesis (Core "Context" Feature)

  Objective: Enable the user to select multiple open tabs, scrape their content, and send it to the AI for a synthesized summary. This is the
  foundational "understanding" layer.

  1.1. UI Integration: "Context Builder" View

   1. Create `ContextBuilderView.tsx`:
       * Create a new component file: extension/components/ContextBuilderView.tsx.
       * This component will display a list of currently open tabs (fetched via chrome.tabs.query).
       * It will allow the user to select multiple tabs using checkboxes.
       * It will have an input field for the user's prompt (e.g., "Summarize these pages," "Compare X and Y").
       * A "Synthesize" button will trigger the content scraping and AI analysis.

   2. Update `Sidebar.tsx`:
       * Add a new NavButton for "Context" (you can use TabIcon or create a new icon).
       * Update types.ts to include a new ViewMode: 'context-builder'.

   3. Update `App.tsx`:
       * Import ContextBuilderView.tsx.
       * Add a new case for 'context-builder' in the ActiveView memo.
       * Add state variables in App.tsx to temporarily hold the selected tab IDs and the user's prompt, which will be passed to ContextBuilderView.

  1.2. Service Worker Logic (background.ts): Orchestrating Multi-Tab Scraping

   1. New Message Listener:
       * Add a new chrome.runtime.onMessage.addListener for an action like "synthesize-multi-tab". This message will carry the selectedTabIds and the
         userPrompt.

   2. Multi-Tab Content Scraping:
       * Inside the new listener, iterate through selectedTabIds.
       * For each tabId, use chrome.scripting.executeScript to inject our existing content.js script.
       * After injection, send a getPageContent message to each tab.
       * Crucially: Collect all the returned content strings into an array. This will be an asynchronous operation, so use Promise.all to wait for all
         content to be scraped.

   3. AI Synthesis:
       * Once all content is collected, aggregate it into a single, large string (e.g., --- Document [URL] ---\n[Content]\n\n---).
       * Construct a comprehensive prompt for the AI, including the userPrompt and the aggregatedContent.
       * Send this prompt to the AI model (via model.generateContentStream()) and stream the response back to the ContextBuilderView.

  1.3. content.js Enhancements (Optional, but Recommended)

   1. Integrate `Readability.js`:
       * For more accurate content extraction (especially from complex SPAs or news articles), consider bundling a library like Mozilla's
         Readability.js into content.js.
       * This would replace document.body.innerText with a more intelligent content parser.

  Phase 2: Basic Agentic Capabilities (Client-Side Tools)

  Objective: Introduce the concept of the AI suggesting and executing simple client-side actions (e.g., "open a new tab to Google"). This is a
  stepping stone to full agentic behavior.

  2.1. Define Client-Side Tools

   1. In `background.ts`:
       * Define a simple set of "client-side tools" that the AI can "call." These will be functions that interact with Chrome APIs.
       * Example tools:
           * openTab(url: string): Uses chrome.tabs.create({ url }).
           * closeTab(tabId: number): Uses chrome.tabs.remove(tabId).
           * navigateTab(tabId: number, url: string): Uses chrome.tabs.update(tabId, { url }).

  2.2. AI Prompting for Tool Use

   1. Modify AI Prompting Logic:
       * In background.ts (or a new dedicated AI service module), when sending a prompt to the AI, include a clear instruction set for how the AI can
         "call" these client-side tools.
       * The AI should be instructed to output a specific JSON format if it decides to use a tool (e.g., { "tool_call": { "name": "openTab", "params": 
         { "url": "https://google.com" } } }).

   2. Tool Execution Logic:
       * After receiving a response from the AI, the service worker will parse it.
       * If the response contains a tool_call object, it will execute the corresponding client-side tool using the provided parameters.
       * The result of the tool execution (e.g., the new tabId) can then be fed back to the AI in the next turn of the conversation.

  2.3. UI Feedback

   1. In `ContextBuilderView.tsx` (or a new `AgentChatView`):
       * Display a message to the user when the AI decides to use a tool (e.g., "AI is opening a new tab...").

  Phase 3: Genkit Framework Integration (Full Agentic Backend)

  Objective: Migrate the complex AI orchestration to a Genkit backend, enabling server-side tools (like Google Search) and more sophisticated agentic
   loops. This is a significant backend project.

   1. Genkit Project Setup:
       * Initialize a new Genkit project within our monorepo (e.g., in a new firebase/functions directory).
       * Configure genkit.config.js with Firebase and Google AI plugins.

   2. Cloud Function for Genkit:
       * Create a callable Cloud Function (onCallGenkit) that serves as the secure API endpoint for the extension. This function will invoke the Genkit
          flows.

   3. Define Genkit Flows:
       * `multiTabSynthesizer` Flow: Re-implement the multi-tab synthesis logic within Genkit. This flow will take aggregated text as input and use
         Gemini 1.5 Pro for synthesis.
       * `agenticTaskExecutor` Flow: Define this complex flow within Genkit. It will:
           * Manage conversation history (potentially with Firestore).
           * Define server-side tools (e.g., googleSearch using an external API).
           * Use Gemini 1.5 Flash for function calling.
           * Implement the planning and tool-use loop.

   4. Firestore Integration:
       * Set up Cloud Firestore to store conversation history for stateful interactions. The Genkit flows will read from and write to Firestore.

   5. Refactor Client-Side AI Calls:
       * Modify ContextBuilderView.tsx (and any other components making AI calls) to send requests to the new Genkit Cloud Function endpoint instead of
          directly to model.generateContentStream().

  Phase 4: On-Device AI (Gemini Nano) Integration (Optimization/Privacy)

  Objective: Integrate Chrome's built-in AI APIs (Summarizer, Prompt API) for faster, more private on-device tasks where applicable.

   1. Feature Detection:
       * In background.ts or ContextBuilderView.tsx, implement checks for window.ai.canCreateTextSession() to determine if Gemini Nano is available.

   2. Conditional AI Routing:
       * For simple, single-tab summarization or Q&A tasks, if Gemini Nano is available, use the Chrome Built-in Summarizer API or Prompt API directly.
       * If Gemini Nano is not available, fall back to our existing Firebase AI Logic (Gemini 1.5 Pro/Flash).

   3. User Feedback:
       * Provide UI feedback to the user indicating when an on-device model is being used (e.g., "Summarizing on device for privacy").

  ---

  3. Build & Deployment Considerations

   * Monorepo Structure: Maintain the /extension and /firebase (for Genkit/Cloud Functions) directories.
   * `package.json` Updates: Ensure esbuild commands are updated to include all new .tsx and .ts files.
   * Firebase CLI: Use firebase deploy --only functions for backend deployment.

  ---give me 

  This plan provides a clear roadmap for integrating the powerful "Context" Super App functionality into our existing architecture. It prioritizes
  foundational features and builds towards the more complex agentic capabilities.
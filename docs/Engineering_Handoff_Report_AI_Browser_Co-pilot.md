Engineering Handoff Report: AI Browser Co-pilot

  Date: October 31, 2025
  Project Status: V2 Architecture Implemented, Advanced Features in Progress

  1. Executive Summary

  This document provides a comprehensive overview of the AI Browser Co-pilot project for a smooth transition to the next engineer. The project has
  successfully undergone a critical architectural evolution from an insecure V1 prototype to a robust, scalable, and secure V2 architecture powered
  by a Firebase backend.

  The core foundation is now stable. We have successfully implemented and tested:
   * Secure User Authentication via Firebase and Google Sign-In.
   * Core Chat Functionality with the Gemini 2.5 Pro model.
   * Real-time Screen Analysis using the getDisplayMedia API.
   * Advanced Network Analysis using the chrome.debugger API.
   * A Conversational Debugging Interface for follow-up questions.

  The primary remaining challenge is a stubborn, architecturally nuanced bug related to Chrome's host permissions that is preventing the "Context
  Builder" (multi-tab synthesis) feature from working reliably.

  This document will detail the current architecture, the work completed, the nature of the final bug, and a definitive, step-by-step plan to resolve
   it and complete the project.

  2. Current System Architecture (V2)

  The current architecture is a modern, hybrid AI system.

   * Client (Chrome Extension):
       * Manifest V3: Enforces a secure environment.
       * UI: React 18 with TypeScript, displayed in the chrome.sidePanel.
       * Core Logic: A central service worker (background.ts) orchestrates complex tasks like permissions and browser API interactions.
       * Firebase Services: A dedicated module (firebase.ts) initializes Firebase once and provides shared instances of auth and the Gemini model.
       * Permissions: Uses optional_host_permissions to request access to websites at runtime, which is a modern security best practice.

   * Backend (Firebase):
       * Authentication: Securely manages users via Google Sign-In.
       * AI Logic: Uses the Vertex AI for Firebase SDK. This is a critical component: it allows the client to make AI calls without ever possessing the
          secret API key. The SDK sends the prompt to the Firebase backend, which then securely uses its server-side key to call the Gemini API.

  3. Feature Implementation Status


  ┌──────────────────────────────┬────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────
  ┐
  │ Feature                      │ Status         │ Description
  │
  ├──────────────────────────────┼────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────
  ┤
  │ User Authentication          │ ✅ **Complete... │ Users can sign in securely with their Google account. Sessions are persisted.
    │
  │ Chat View                    │ ✅ **Complete... │ Direct, streaming chat with the Gemini 1.5 Pro model is fully functional.
    │
  │ Screen Analysis              │ ✅ **Complete... │ Users can share their screen or a tab for real-time frame-by-frame analysis by the AI. The
  pe... │
  │ Network Analysis             │ ✅ **Complete... │ The chrome.debugger API is used to capture detailed network data (including timing and
  size),... │
  │ Conversational Debugging     │ ✅ **Complete... │ Users can ask follow-up questions about captured network data in a stateful chat session.
    │
  │ **Context Builder (Multi-Ta... │ ⚠️ Blocked     │ This is the feature currently in development. It is blocked by a persistent host permission
  e... │
  └──────────────────────────────┴────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────
  ┘


  4. The "Context Builder" Bug: A Deep Dive

  This is the primary challenge the next engineer will need to solve.

   * The Goal: The user selects multiple tabs, grants permission, and the extension scrapes the content of those tabs to send to the AI for a
     synthesized summary.
   * The Bug: Even after the user grants permission, the chrome.scripting.executeScript call in the service worker fails with the error: Cannot access 
     contents of the page. Extension manifest must request permission to access the respective host.
   * Root Cause Analysis: This is a subtle but critical architectural issue related to Chrome's security model for extensions.
       1. The permission request is initiated from the service worker's context by opening a new permissions.html tab.
       2. The user grants permission in that new tab.
       3. The permissions.html tab then sends a message (permissions-granted) back to the service worker.
       4. The Problem: The service worker, upon receiving the message, immediately tries to scrape the content. However, there appears to be a race
          condition or a context-switching issue where the service worker's context does not yet have the newly granted permissions fully registered,
          causing the executeScript call to fail.

  5. Definitive Next Steps: A Step-by-Step Engineering Plan

  The previous attempts to fix this involved using sendMessage and connect ports, but these did not solve the core context issue. The following is a
  definitive, architecturally sound plan to resolve this bug.

  The Strategy: We will simplify the flow and eliminate the inter-context communication race condition. The permission request and the subsequent
  scraping will be chained together and orchestrated from a single, persistent context: the side panel itself.

  Step 1: Move the Orchestration Logic to the Client

  The service worker is proving unreliable for this specific, chained asynchronous flow. We will move the orchestration logic into the
  ContextBuilderView.tsx component.

   1. In `ContextBuilderView.tsx`:
       * The handleSynthesize function will be rewritten to perform the entire sequence:
           1. Call chrome.permissions.request directly from the side panel.
           2. If permission is granted, it will then directly call chrome.runtime.sendMessage with the synthesize-multi-tab action.
       * This ensures the permission is granted and active in the client context right before the message is sent.

   2. In `background.ts`:
       * The handleMultiTabSynthesis function will be simplified. It will no longer check for permissions or open the permissions tab. It will assume
         that by the time it receives the message, the permissions have already been granted.
       * Remove the synthesisRequest state variable and the permissions-granted message listener, as they are no longer needed.

  Step 2: Re-implement the Fix (Step-by-Step)

  Here is the exact sequence of actions for the next engineer:

   1. Refactor `ContextBuilderView.tsx`:
       * Open extension/components/ContextBuilderView.tsx.
       * Replace the existing handleSynthesize function with this new, improved version:

    1         const handleSynthesize = async () => {
    2           if (selectedTabs.size === 0 || !userPrompt.trim()) {
    3             setError("Please select at least one tab and enter a prompt.");
    4             return;
    5           }
    6 
    7           const selectedTabObjects = tabs.filter(tab => selectedTabs.has(tab.id));
    8           const origins = Array.from(new Set(selectedTabObjects.map(tab => new URL(tab.url).origin + '/*')));
    9 
   10           try {
   11             const granted = await chrome.permissions.request({ origins });
   12             if (granted) {
   13               setLoading(true);
   14               setError(null);
   15               setResult(null);
   16               // Now that permissions are granted in our context, send the message.
   17               chrome.runtime.sendMessage({
   18                 action: 'synthesize-multi-tab',
   19                 tabIds: Array.from(selectedTabs),
   20                 userPrompt: userPrompt,
   21               });
   22             } else {
   23               setError("Permission to access tabs was denied.");
   24             }
   25           } catch (err) {
   26             setError(`An error occurred while requesting permissions: ${(err as Error).message}`);
   27           }
   28         };

   2. Refactor `background.ts`:
       * Open extension/background.ts.
       * Delete the synthesisRequest variable at the top of the file.
       * Modify the main onMessage listener to remove the permissions-granted case and simplify the synthesize-multi-tab call:

   1         // --- Event Listeners ---
   2         chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   3           console.log('[Service Worker V2] Message received:', request);
   4 
   5           if (request.action === 'synthesize-multi-tab') {
   6             handleMultiTabSynthesis(request.tabIds, request.userPrompt);
   7           }
   8           // ... other else if blocks
   9         });
       * Replace the entire handleMultiTabSynthesis function with this simpler version that no longer handles the permission logic:

    1         async function handleMultiTabSynthesis(tabIds: number[], userPrompt: string) {
    2           try {
    3             const scrapePromises = tabIds.map(scrapeTabContent);
    4             const scrapedContents = await Promise.all(scrapePromises);
    5 
    6             let aggregatedContent = '';
    7             for (const item of scrapedContents) {
    8               aggregatedContent += `--- Document (from ${item.url}) ---\n${item.content}\n\n`;
    9             }
   10 
   11             const fullPrompt = `You are an AI assistant. Based on the following documents, please answer the user's question.
   12 
   13         User's Question: "${userPrompt}"
   14 
   15         ---
   16         Provided Documents:
   17         ${aggregatedContent.substring(0, 10000)}
   18         ---
   19 
   20         Begin your synthesized response now.`;
   21 
   22             const resultStream = await model.generateContentStream(fullPrompt);
   23 
   24             for await (const chunk of resultStream.stream) {
   25               chrome.runtime.sendMessage({ type: 'synthesis_chunk', chunk: chunk.text() });
   26             }
   27 
   28             chrome.runtime.sendMessage({ type: 'synthesis_end' });
   29 
   30           } catch (e) {
   31             console.error("Multi-tab synthesis error:", e);
   32             chrome.runtime.sendMessage({ type: 'synthesis_error', error: (e as Error).message });
   33           }
   34         }

   3. Remove Obsolete Files:
       * Delete extension/permissions.html.
       * Delete extension/permissions.js.
       * Update the build script in package.json to remove these files from the copy step.

  Step 3: Final Build and Test

   1. Run `npm run build` in the extension directory.
   2. Reload the unpacked extension in chrome://extensions.
   3. Test the Context Builder flow. The permission prompt should now appear correctly, and upon granting it, the synthesis should proceed without the
      "Cannot access" error.

  This plan provides a clear path forward. By moving the permission request into the same context that initiates the action, we align with Chrome's
  security model and should definitively resolve this final bug.
import { model } from './firebase';

  // --- Chrome Extension Lifecycle ---

  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setOptions({
        path: 'index.html',
        enabled: true
    });
  });

  // This listener opens the side panel when the user clicks the extension's action icon.
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  // --- State Management ---

  const debugState: {
    target: chrome.debugger.Debuggee | null,
    requests: Map<string, any>,
    mode: 'generic' | 'verifier' | null,
    verificationTarget: any | null,
  } = {
    target: null,
    requests: new Map(),
    mode: null,
    verificationTarget: null,
  };

  // --- Handler Functions ---

  function handleReadPage() {
    // This function is currently not used in the new architecture,
    // as TabAnalysisView now directly scrapes content.
    // Keeping it for potential future use or refactoring.
  }

  async function handleStartNetworkAnalysis() {
    try {
      debugState.mode = 'generic';

      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.id || !tab.url) {
        console.error("[Network Analysis] No active tab found");
        chrome.runtime.sendMessage({
          action: "networkAnalysisResult",
          data: null,
          error: "No active tab found. Please navigate to a website first."
        });
        return;
      }

      // Don't attach to Chrome internal pages
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          action: "networkAnalysisResult",
          data: null,
          error: "Cannot analyze Chrome internal pages. Please navigate to a regular website."
        });
        return;
      }

      console.log("[Network Analysis] Starting analysis on current tab:", tab.url);

      // Attach debugger to current tab
      attachDebugger({ tabId: tab.id });

    } catch (error) {
      console.error("[Network Analysis] Error:", error);
      chrome.runtime.sendMessage({
        action: "networkAnalysisResult",
        data: null,
        error: "Failed to start network analysis"
      });
    }
  }

  function handleStartVerification(targetConfig: any) {
    debugState.mode = 'verifier';
    debugState.verificationTarget = targetConfig;
    // For verification, we create the tab ourselves to guarantee we get the right one
    chrome.tabs.create({ url: targetConfig.loginUrl, active: true }, (tab) => {
      if (!tab || !tab.id) {
        console.error("[Verifier] Could not create verification tab.");
        return;
      }
      attachDebugger({ tabId: tab.id });
    });
  }

  function attachDebugger(target: chrome.debugger.Debuggee) {
    debugState.target = target;
    debugState.requests.clear();

    chrome.debugger.attach(target, "1.3", () => {
      if (chrome.runtime.lastError) {
        console.error("Debugger attach error:", chrome.runtime.lastError.message);
        return;
      }
      console.log("Debugger attached to tab:", target.tabId);
      chrome.debugger.sendCommand(target, "Network.enable", {}, () => {
        if (chrome.runtime.lastError) {
          console.error("Failed to enable network:", chrome.runtime.lastError.message);
        } else {
          console.log("Network domain enabled.");
        }
      });
      chrome.debugger.onEvent.addListener(handleDebuggerEvent);
    });
  }

  function handleStopNetworkAnalysis() {
    if (!debugState.target) return;

    chrome.debugger.detach(debugState.target, () => {
      chrome.debugger.onEvent.removeListener(handleDebuggerEvent);
      chrome.runtime.sendMessage({
        action: "networkAnalysisResult",
        data: Array.from(debugState.requests.values())
      });
      debugState.target = null;
      debugState.requests.clear();
    });
  }

  function handleDebuggerEvent(source: chrome.debugger.Debuggee, method: string, params: any) {
    // Handle Aegis mode separately (uses different target)
    if (aegisState.active && aegisState.target && source.tabId === aegisState.target.tabId) {
      if (method === 'Fetch.requestPaused') {
        handleFetchRequestPaused(params);
      }
      return; // Aegis handles its own events
    }

    if (!debugState.target || source.tabId !== debugState.target.tabId) {
      return;
    }

    if (debugState.mode === 'generic') {
      const { requestId, request, response, timing, encodedDataLength } = params;
      if (!debugState.requests.has(requestId)) {
        debugState.requests.set(requestId, {});
      }
      const requestData = debugState.requests.get(requestId);

      if (method === "Network.requestWillBeSent") {
        requestData.url = request.url;
        requestData.method = request.method;
        requestData.initialPriority = request.initialPriority;
      } else if (method === "Network.responseReceived") {
        requestData.status = response.status;
        requestData.mimeType = response.mimeType;
        requestData.headers = response.headers;
        requestData.timing = timing;
      } else if (method === "Network.loadingFinished") {
        requestData.encodedDataLength = encodedDataLength;
      }
    } else if (debugState.mode === 'verifier') {
      if (method === "Network.responseReceived") {
        const url = params.response.url.toLowerCase();
        const status = params.response.status;

        console.log(`[Verifier] Response received: ${status} ${url}`);

        const targetUrl = debugState.verificationTarget.url_contains.toLowerCase();

        if (url.includes(targetUrl) && status === 200) {
          console.log(`[Verifier] Target URL found! Request ID: ${params.requestId}`);
          chrome.debugger.sendCommand(
            debugState.target,
            "Network.getResponseBody",
            { requestId: params.requestId },
            (result: any) => {
              if (chrome.runtime.lastError || !result || !result.body) {
                const errorMsg = `Could not read response body. Error: ${chrome.runtime.lastError?.message}`;
                console.error(`[Verifier] ${errorMsg}`);
                chrome.runtime.sendMessage({ action: "verification-error", error: errorMsg });
              } else {
                try {
                  console.log("[Verifier] Got response body:", result.body);
                  const body = JSON.parse(result.body);
                  const token = body[debugState.verificationTarget.token_name];
                  if (token) {
                    console.log("[Verifier] Token extracted successfully!");
                    chrome.runtime.sendMessage({
                      action: "verification-success",
                      data: {
                        tokenName: debugState.verificationTarget.token_name,
                        tokenValue: token,
                      },
                    });
                    chrome.debugger.detach(debugState.target!);
                  } else {
                     console.error("[Verifier] Token not found in response body.");
                     chrome.runtime.sendMessage({ action: "verification-error", error: "Verification successful, but token not found in response." });
                  }
                } catch (e) {
                  const errorMsg = `Failed to parse response JSON. Error: ${(e as Error).message}`;
                  console.error(`[Verifier] ${errorMsg}`);
                  chrome.runtime.sendMessage({ action: "verification-error", error: errorMsg });
                }
              }
            }
          );
        }
      }
    }
  }

  // --- Content Scraping Logic ---

  async function scrapeTabContent(tabId: number): Promise<{ url: string, content: string }> {
    try {
      // This function will be executed in the context of the target page
      const getInnerText = () => document.body.innerText;

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId },
        func: getInnerText,
      });

      if (injectionResults && injectionResults[0] && injectionResults[0].result) {
        const tab = await chrome.tabs.get(tabId);
        return { url: tab.url || `Tab ${tabId}`, content: injectionResults[0].result };
      }
      const tab = await chrome.tabs.get(tabId);
      return { url: tab.url || `Tab ${tabId}`, content: "Could not scrape content from this tab." };
    } catch (e) {
      console.error(`Failed to scrape tab ${tabId}:`, e);
      const tab = await chrome.tabs.get(tabId);
      return { url: tab.url || `Tab ${tabId}`, content: `Failed to access content. Error: ${(e as Error).message}` };
    }
  }

  // --- Multi-Tab Synthesis Logic ---

  async function handleMultiTabSynthesis(tabIds: number[], userPrompt: string, origins: string[]) {
    try {
      // Verify permissions are available in service worker context
      const hasPermissions = await chrome.permissions.contains({ origins });

      if (!hasPermissions) {
        console.error("Permissions not available in service worker context");
        chrome.runtime.sendMessage({
          type: 'synthesis_error',
          error: 'Permission check failed. Please try again.'
        });
        return;
      }

      console.log(`[Context Builder] Verified permissions for ${origins.length} origins, scraping ${tabIds.length} tabs`);

      const scrapePromises = tabIds.map(scrapeTabContent);
      const scrapedContents = await Promise.all(scrapePromises);

      let aggregatedContent = '';
      for (const item of scrapedContents) {
        aggregatedContent += `--- Document (from ${item.url}) ---\n${item.content}\n\n`;
      }

      // BUILT-IN AI: Try on-device summarization first for quick summary
      try {
        const quickSummaryResult = await chrome.scripting.executeScript({
          target: { tabId: tabIds[0] },
          func: async (content: string, question: string) => {
            try {
              // Check if Summarizer API is available
              if (typeof window !== 'undefined' && 'ai' in window && (window as any).ai?.summarizer) {
                console.log('[Context Builder] Using on-device Summarizer API');

                const summarizer = await (window as any).ai.summarizer.create({
                  type: 'key-points',
                  format: 'markdown',
                  length: 'medium'
                });

                // Summarize the aggregated content
                const summary = await summarizer.summarize(content.substring(0, 4000)); // API limit

                return {
                  hasBuiltInAI: true,
                  quickSummary: summary
                };
              }
              return { hasBuiltInAI: false };
            } catch (e) {
              console.error('[Context Builder] On-device summarization error:', e);
              return { hasBuiltInAI: false };
            }
          },
          args: [aggregatedContent, userPrompt]
        });

        // Send quick summary if available (on-device)
        if (quickSummaryResult && quickSummaryResult[0] && quickSummaryResult[0].result?.hasBuiltInAI) {
          console.log('[Context Builder] On-device summary generated');
          chrome.runtime.sendMessage({
            type: 'synthesis_quick_summary',
            summary: quickSummaryResult[0].result.quickSummary,
            source: 'on-device'
          });
        } else {
          console.log('[Context Builder] Built-in AI not available, using cloud only');
        }
      } catch (summaryError) {
        console.log('[Context Builder] On-device summary failed, continuing with cloud:', summaryError);
      }

      // CLOUD: Deep comprehensive synthesis (always runs)
      const fullPrompt = `You are an AI assistant. Based on the following documents, please answer the user's question.

  User's Question: "${userPrompt}"

  ---
  Provided Documents:
  ${aggregatedContent.substring(0, 10000)}
  ---

  Begin your synthesized response now.`;

      const resultStream = await model.generateContentStream(fullPrompt);

      for await (const chunk of resultStream.stream) {
        chrome.runtime.sendMessage({ type: 'synthesis_chunk', chunk: chunk.text() });
      }

      chrome.runtime.sendMessage({ type: 'synthesis_end' });

    } catch (e) {
      console.error("Multi-tab synthesis error:", e);
      chrome.runtime.sendMessage({ type: 'synthesis_error', error: (e as Error).message });
    }
  }

  chrome.debugger.onDetach.addListener((source, reason) => {
    if (debugState.target && source.tabId === debugState.target.tabId) {
      console.log("Debugger detached for reason:", reason);
      // Only send error if it was an unexpected detach for generic debugging
      if (debugState.mode === 'generic') {
        chrome.runtime.sendMessage({
          action: "networkAnalysisResult",
          data: null,
          error: "Debugger was detached unexpectedly. The user may have closed the warning banner."
        });
      } else if (debugState.mode === 'verifier') {
          // For verifier mode, detachment is expected on success, or handled by specific errors
          chrome.runtime.sendMessage({
              action: "verification-error",
              error: `Verification session ended unexpectedly: ${reason}`
          });
      }
      debugState.target = null;
      debugState.requests.clear();
      debugState.mode = null;
      debugState.verificationTarget = null;
    }
  });

  // --- Kino Feature (Video Intelligence) ---

  // Video stream state
  const kinoState: {
    stream: MediaStream | null,
    tabId: number | null,
    startTime: number,
    frameCount: number,
    intervalId: any
  } = {
    stream: null,
    tabId: null,
    startTime: 0,
    frameCount: 0,
    intervalId: null
  };

  async function handleStartVideoCapture() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        chrome.runtime.sendMessage({ type: 'kino-error', error: 'No active tab found' });
        return;
      }

      // Check if tab has video content (heuristic)
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          type: 'kino-error',
          error: 'Cannot capture Chrome internal pages. Please open a video (YouTube, etc.)'
        });
        return;
      }

      console.log('[Kino] Starting video capture from tab:', tab.url);
      console.log('[Kino] Checking API availability...');
      console.log('[Kino] chrome.tabCapture:', chrome.tabCapture);
      console.log('[Kino] chrome.tabCapture.capture:', chrome.tabCapture ? chrome.tabCapture.capture : 'undefined');

      // APPROACH 1: Try tabCapture API (native Chrome API)
      if (chrome.tabCapture && chrome.tabCapture.capture) {
        console.log('[Kino] Using chrome.tabCapture API');

        chrome.tabCapture.capture(
          {
            video: true,
            audio: true
          },
          (stream) => {
            if (chrome.runtime.lastError || !stream) {
              const errorMsg = chrome.runtime.lastError?.message || 'Failed to capture';
              console.error('[Kino] tabCapture failed:', errorMsg);
              // Try fallback approach
              tryGetDisplayMediaFallback(tab.id!);
              return;
            }

            console.log('[Kino] tabCapture successful!', stream);
            initializeVideoStream(stream, tab.id!);
          }
        );
      } else {
        // APPROACH 2: Fallback to getDisplayMedia via content script
        console.log('[Kino] tabCapture not available, using getDisplayMedia fallback');
        tryGetDisplayMediaFallback(tab.id!);
      }

    } catch (error) {
      console.error('[Kino] Video capture error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Video capture failed: ${(error as Error).message}`
      });
    }
  }

  async function tryGetDisplayMediaFallback(tabId: number) {
    try {
      console.log('[Kino] Injecting live video capturer content script...');

      // Inject the live video capturer script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content-scripts/live-video-capturer.js']
      });

      console.log('[Kino] Live capturer script injected, sending start command...');

      // Send message to content script to start capture
      chrome.tabs.sendMessage(tabId, { action: 'kino-start-live-capture' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Kino] Message send error:', chrome.runtime.lastError);
          chrome.runtime.sendMessage({
            type: 'kino-error',
            error: 'Failed to communicate with capture script'
          });
        } else if (response && response.success) {
          console.log('[Kino] Content script confirmed capture started');
          kinoState.tabId = tabId;
          kinoState.startTime = Date.now();
          kinoState.frameCount = 0;
          // Note: kino-capture-started message will come from content script
        } else {
          console.error('[Kino] Content script reported failure:', response);
          chrome.runtime.sendMessage({
            type: 'kino-error',
            error: response?.error || 'Capture initialization failed'
          });
        }
      });

    } catch (error) {
      console.error('[Kino] Fallback error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Could not capture video: ${(error as Error).message}`
      });
    }
  }

  function startFrameExtraction(stream: MediaStream) {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.error('[Kino] No video track found in stream');
      return;
    }

    // Create video element to capture frames
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    // Capture frames at specified interval (1fps default)
    kinoState.intervalId = setInterval(() => {
      captureCurrentFrame(video);
    }, 1000); // 1 second interval

    console.log('[Kino] Frame extraction started at 1fps');
  }

  function captureCurrentFrame(video: HTMLVideoElement) {
    try {
      // Create canvas to capture current frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      kinoState.frameCount++;

      // Send frame to Kino view
      chrome.runtime.sendMessage({
        type: 'kino-frame',
        frame: dataUrl,
        timestamp: Date.now(),
        frameNumber: kinoState.frameCount
      });

    } catch (error) {
      console.error('[Kino] Frame capture error:', error);
    }
  }

  function handleStopVideoCapture() {
    try {
      console.log('[Kino] Stopping video capture...');

      // If using content script approach, send stop message
      if (kinoState.tabId) {
        chrome.tabs.sendMessage(kinoState.tabId, { action: 'kino-stop-live-capture' }, () => {
          // Ignore errors if tab is closed
          if (chrome.runtime.lastError) {
            console.log('[Kino] Tab may be closed:', chrome.runtime.lastError.message);
          }
        });
      }

      // Stop interval if running in background
      if (kinoState.intervalId) {
        clearInterval(kinoState.intervalId);
        kinoState.intervalId = null;
      }

      // Stop stream if we have it in background
      if (kinoState.stream) {
        kinoState.stream.getTracks().forEach(track => {
          track.stop();
          console.log('[Kino] Stopped track:', track.kind);
        });
      }

      // Reset state
      kinoState.stream = null;
      kinoState.tabId = null;
      kinoState.frameCount = 0;

      console.log('[Kino] Video capture stopped');

      chrome.runtime.sendMessage({ type: 'kino-capture-stopped' });

    } catch (error) {
      console.error('[Kino] Stop capture error:', error);
    }
  }

  async function handleKinoQuickAnalysis(payload: any) {
    try {
      const { videoUrl, question } = payload;

      console.log('[Kino] Quick analysis - URL:', videoUrl, 'Question:', question);

      // Analyze video URL with specific question
      const prompt = `Analyze this video and answer the following question:

Video URL: ${videoUrl}

Question: ${question}

Provide a clear, specific, helpful answer based on the video content. Be concise but thorough.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const answer = response.text();

      console.log('[Kino] Quick analysis complete');

      chrome.runtime.sendMessage({
        type: 'kino-qa-response',
        question: question,
        answer: answer,
        frameTimestamp: Date.now()
      });

    } catch (error) {
      console.error('[Kino] Quick analysis error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Analysis failed: ${(error as Error).message}`
      });
    }
  }

  async function handleKinoAnalyzeFrame(payload: any) {
    try {
      const { frame, question, timestamp } = payload;

      console.log('[Kino] Analyzing frame with question:', question);

      // Convert frame to Gemini format
      const base64Data = frame.split(',')[1];
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      };

      // Prompt for video frame analysis
      const prompt = `You are analyzing a frame from a video. The user asks: "${question}"

Provide a brief, clear, specific answer based on what you see in this video frame.
Focus on being helpful and accurate.`;

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const answer = response.text();

      console.log('[Kino] Frame analysis complete');

      chrome.runtime.sendMessage({
        type: 'kino-qa-response',
        question: question,
        answer: answer,
        frameTimestamp: timestamp
      });

    } catch (error) {
      console.error('[Kino] Frame analysis error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Analysis failed: ${(error as Error).message}`
      });
    }
  }

  async function handleKinoSummarizeVideo(payload: any) {
    try {
      const { videoUrl } = payload;

      console.log('[Kino] Summarizing video:', videoUrl);

      // Note: Gemini 2.5 Pro supports direct video URL analysis
      const prompt = `Analyze this video and provide a comprehensive summary.

Video URL: ${videoUrl}

Please provide your response in the following JSON format:
{
  "outline": [
    {"time": "00:00", "topic": "Introduction"},
    {"time": "02:15", "topic": "Main concept explained"}
  ],
  "insights": [
    "First key insight",
    "Second key insight"
  ],
  "concepts": {
    "Concept Name": "Clear definition"
  },
  "duration": "15:30"
}

Focus on extracting actionable information and key learning points.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let responseText = response.text().trim();

      // Clean markdown if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let summary;
      try {
        summary = JSON.parse(responseText);
        summary.videoUrl = videoUrl;
      } catch (parseError) {
        // Fallback if JSON parsing fails
        summary = {
          outline: [{ time: '00:00', topic: 'Analysis in progress' }],
          insights: [responseText],
          concepts: {},
          videoUrl: videoUrl
        };
      }

      console.log('[Kino] Video summarization complete');

      chrome.runtime.sendMessage({
        type: 'kino-summary-complete',
        summary: summary
      });

    } catch (error) {
      console.error('[Kino] Video summarization error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Summarization failed: ${(error as Error).message}`
      });
    }
  }

  async function handleKinoExtractTranscript(payload: any) {
    try {
      const { videoUrl } = payload;

      console.log('[Kino] Extracting transcript from:', videoUrl);

      const prompt = `Extract and format the transcript from this video.

Video URL: ${videoUrl}

Provide the transcript as a series of timestamped segments. Focus on accuracy and readability.

Return the transcript in a natural, readable format with approximate timestamps.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const transcriptText = response.text();

      // Parse into segments (simple approach)
      const segments = transcriptText.split('\n').filter(line => line.trim()).map((line, i) => ({
        timestamp: Date.now() + (i * 1000),
        text: line.trim(),
        confidence: 0.95
      }));

      console.log('[Kino] Transcript extraction complete, segments:', segments.length);

      // Send transcript in chunks for display
      segments.forEach(segment => {
        chrome.runtime.sendMessage({
          type: 'kino-transcript-chunk',
          timestamp: segment.timestamp,
          text: segment.text,
          confidence: segment.confidence
        });
      });

    } catch (error) {
      console.error('[Kino] Transcript extraction error:', error);
      chrome.runtime.sendMessage({
        type: 'kino-error',
        error: `Transcript extraction failed: ${(error as Error).message}`
      });
    }
  }

  // --- Nexus Feature (Agentic Performance Engineer) ---

  async function handleNexusAnalyzePerformance() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        chrome.runtime.sendMessage({ type: 'nexus-error', error: 'No active tab found' });
        return;
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          type: 'nexus-error',
          error: 'Cannot analyze Chrome internal pages'
        });
        return;
      }

      console.log('[Nexus] Starting performance analysis for:', tab.url);
      chrome.runtime.sendMessage({ type: 'nexus-analysis-started' });

      // Inject performance measurement script
      const perfResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Measure performance using Performance API
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const paint = performance.getEntriesByType('paint');
          const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

          // Get LCP if available
          let lcp = null;
          if ('PerformanceObserver' in window) {
            try {
              const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
              if (lcpEntries.length > 0) {
                lcp = (lcpEntries[lcpEntries.length - 1] as any).renderTime || (lcpEntries[lcpEntries.length - 1] as any).loadTime;
              }
            } catch (e) {
              console.log('LCP not available');
            }
          }

          // Get FCP
          const fcp = paint.find(p => p.name === 'first-contentful-paint');

          // Analyze resources for bottlenecks
          const renderBlockingResources = resources.filter(r =>
            (r.name.endsWith('.css') || r.name.endsWith('.js')) &&
            r.startTime < 1000 // Loaded early
          );

          const largeImages = resources.filter(r =>
            (r.initiatorType === 'img' || r.name.match(/\.(jpg|jpeg|png|gif|webp)/i)) &&
            r.transferSize > 100000 // > 100KB
          );

          return {
            navigation: {
              domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
              loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
              ttfb: navigation.responseStart - navigation.requestStart,
            },
            lcp: lcp,
            fcp: fcp ? fcp.startTime : null,
            renderBlockingResources: renderBlockingResources.map(r => ({
              url: r.name,
              duration: r.duration,
              size: r.transferSize,
              type: r.name.endsWith('.css') ? 'css' : 'js'
            })),
            largeImages: largeImages.map(r => ({
              url: r.name,
              size: r.transferSize,
              duration: r.duration
            })),
            allResources: resources.length
          };
        }
      });

      if (!perfResults || !perfResults[0] || !perfResults[0].result) {
        chrome.runtime.sendMessage({
          type: 'nexus-error',
          error: 'Failed to collect performance data'
        });
        return;
      }

      const perfData = perfResults[0].result;
      console.log('[Nexus] Performance data collected:', perfData);

      // Analyze with AI
      await analyzePerformanceWithAI(perfData, tab.url);

    } catch (error) {
      console.error('[Nexus] Performance analysis error:', error);
      chrome.runtime.sendMessage({
        type: 'nexus-error',
        error: `Analysis failed: ${(error as Error).message}`
      });
    }
  }

  async function analyzePerformanceWithAI(perfData: any, pageUrl: string) {
    try {
      // Build analysis prompt
      const prompt = `You are a senior frontend performance engineer analyzing a webpage.

Page: ${pageUrl}

Performance Data:
- LCP (Largest Contentful Paint): ${perfData.lcp ? `${Math.round(perfData.lcp)}ms` : 'Not measured'}
- FCP (First Contentful Paint): ${perfData.fcp ? `${Math.round(perfData.fcp)}ms` : 'Not measured'}
- TTFB (Time to First Byte): ${perfData.navigation.ttfb}ms
- DOM Content Loaded: ${perfData.navigation.domContentLoaded}ms

Render-Blocking Resources (${perfData.renderBlockingResources.length}):
${perfData.renderBlockingResources.slice(0, 5).map((r: any) => `- ${r.type.toUpperCase()}: ${r.url} (${Math.round(r.duration)}ms, ${Math.round(r.size/1024)}KB)`).join('\n')}

Large Images (${perfData.largeImages.length}):
${perfData.largeImages.slice(0, 3).map((img: any) => `- ${img.url} (${Math.round(img.size/1024)}KB)`).join('\n')}

Task: Identify the PRIMARY bottleneck affecting page load performance.

Respond with JSON:
{
  "bottleneck": {
    "type": "render-blocking-css" | "render-blocking-js" | "large-image" | "slow-network",
    "severity": "critical" | "major" | "minor",
    "description": "Brief description",
    "impact": "Specific impact on performance",
    "element": "URL or identifier"
  },
  "reasoning": "Step-by-step explanation of why this is the primary bottleneck",
  "metrics": {
    "lcp": ${perfData.lcp || 0},
    "fcp": ${perfData.fcp || 0},
    "cls": 0,
    "ttfb": ${perfData.navigation.ttfb},
    "score": 0-100
  }
}`;

      console.log('[Nexus] Sending to AI for analysis...');
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let responseText = response.text().trim();

      // Clean markdown
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let analysisData;
      try {
        analysisData = JSON.parse(responseText);
      } catch (e) {
        // Fallback
        analysisData = {
          bottleneck: {
            type: 'render-blocking-css',
            severity: 'major',
            description: 'Performance issues detected',
            impact: 'May affect page load speed',
            element: pageUrl
          },
          reasoning: responseText,
          metrics: {
            lcp: perfData.lcp || 0,
            fcp: perfData.fcp || 0,
            cls: 0,
            ttfb: perfData.navigation.ttfb,
            score: 70
          }
        };
      }

      console.log('[Nexus] AI analysis complete');

      // Only generate code fix if there are actual issues to fix
      let codeFix = null;

      // Check if there are real bottlenecks (not just theoretical ones)
      const hasRealBottlenecks = perfData.renderBlockingResources.length > 0 ||
                                 perfData.largeImages.length > 0 ||
                                 (perfData.lcp && perfData.lcp > 2500) ||
                                 analysisData.bottleneck.severity === 'critical' ||
                                 analysisData.bottleneck.severity === 'major';

      if (hasRealBottlenecks) {
        console.log('[Nexus] Real bottlenecks found, generating code fix...');
        codeFix = await generateCodeFix(analysisData.bottleneck, perfData);
      } else {
        console.log('[Nexus] Performance is excellent, no code fix needed');
        // Add a message explaining the good performance
        analysisData.bottleneck.description = analysisData.metrics.score >= 90
          ? 'No significant performance issues detected - site is well optimized!'
          : analysisData.bottleneck.description;
      }

      const analysis = {
        ...analysisData,
        codeFix,
        timestamp: Date.now(),
        status: 'complete'
      };

      console.log('[Nexus] Analysis complete with code fix');

      chrome.runtime.sendMessage({
        type: 'nexus-analysis-complete',
        analysis
      });

    } catch (error) {
      console.error('[Nexus] AI analysis error:', error);
      chrome.runtime.sendMessage({
        type: 'nexus-error',
        error: `AI analysis failed: ${(error as Error).message}`
      });
    }
  }

  async function generateCodeFix(bottleneck: any, perfData?: any): Promise<any> {
    try {
      let fixPrompt = '';

      // Extract actual resource URLs if available
      const actualCSS = perfData?.renderBlockingResources?.find((r: any) => r.type === 'css');
      const actualJS = perfData?.renderBlockingResources?.find((r: any) => r.type === 'js');
      const actualImage = perfData?.largeImages?.[0];

      if (bottleneck.type === 'render-blocking-css') {
        const resourceUrl = actualCSS?.url || bottleneck.element || 'styles.css';
        fixPrompt = `Generate a SPECIFIC, ACTIONABLE code fix for render-blocking CSS.

Resource: ${resourceUrl}

Provide ONLY the specific HTML tag needed, not a full page template.
Use the EXACT URL provided above.

Respond with JSON:
{
  "language": "html",
  "code": "Single optimized link tag using the exact URL",
  "explanation": "Concise explanation (2-3 sentences max)"
}

Example format:
{
  "language": "html",
  "code": "<link rel=\\"preload\\" href=\\"${resourceUrl}\\" as=\\"style\\" onload=\\"this.rel='stylesheet'\\">",
  "explanation": "Preloads CSS asynchronously to eliminate render-blocking while ensuring styles apply after download."
}`;
      } else if (bottleneck.type === 'render-blocking-js') {
        const resourceUrl = actualJS?.url || bottleneck.element || 'script.js';
        fixPrompt = `Generate a SPECIFIC code fix for render-blocking JavaScript.

Resource: ${resourceUrl}

Provide ONLY the specific script tag, using the EXACT URL.

Respond with JSON:
{
  "language": "html",
  "code": "<script defer src=\\"${resourceUrl}\\"></script>",
  "explanation": "Why defer attribute eliminates render-blocking (2-3 sentences)"
}`;
      } else if (bottleneck.type === 'large-image') {
        const imageUrl = actualImage?.url || bottleneck.element || 'image.jpg';
        fixPrompt = `Generate a SPECIFIC code fix for large unoptimized image.

Image: ${imageUrl}

Provide ONLY the specific img tag with optimizations.

Respond with JSON:
{
  "language": "html",
  "code": "<img src=\\"${imageUrl}\\" loading=\\"lazy\\" decoding=\\"async\\" alt=\\"...\\" />",
  "explanation": "How lazy loading improves performance (2-3 sentences)"
}`;
      } else {
        fixPrompt = `Generate a SPECIFIC, ACTIONABLE performance optimization.

Issue: ${bottleneck.description}

Provide ONLY the specific code snippet needed, not explanatory text or templates.

Respond with JSON:
{
  "language": "html" | "css" | "javascript",
  "code": "Specific code fix",
  "explanation": "Brief explanation (2-3 sentences)"
}`;
      }

      const result = await model.generateContent(fixPrompt);
      const response = await result.response;
      let responseText = response.text().trim();

      console.log('[Nexus] Raw code fix response:', responseText);

      // Clean markdown
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/```html\n?/g, '').trim();

      // Try to extract JSON if wrapped in other text
      const jsonMatch = responseText.match(/\{[\s\S]*"code"[\s\S]*\}/);
      if (jsonMatch) {
        responseText = jsonMatch[0];
      }

      let fix;
      try {
        fix = JSON.parse(responseText);
        fix.preview = false;

        // BUILT-IN AI: Try Writer API to enhance code explanation
        try {
          const writerResult = await chrome.scripting.executeScript({
            target: { tabId: (await chrome.tabs.query({active: true}))[0].id! },
            func: async (code: string, explanation: string) => {
              try {
                if (typeof window !== 'undefined' && 'ai' in window && (window as any).ai?.writer) {
                  console.log('[Nexus] Using Writer API to enhance explanation');
                  const writer = await (window as any).ai.writer.create({ tone: 'professional' });
                  const enhanced = await writer.write(
                    `Explain this performance optimization code in simple terms: ${code}. Current explanation: ${explanation}`
                  );
                  await writer.destroy();
                  return { hasWriterAPI: true, enhanced };
                }
                return { hasWriterAPI: false };
              } catch (e) {
                return { hasWriterAPI: false };
              }
            },
            args: [fix.code, fix.explanation]
          });

          if (writerResult && writerResult[0]?.result?.hasWriterAPI) {
            fix.aiEnhancedExplanation = writerResult[0].result.enhanced;
            console.log('[Nexus] Writer API enhanced explanation');
          }
        } catch (writerError) {
          console.log('[Nexus] Writer API not available');
        }

        // Ensure code is concise (if it's too long, likely a template)
        if (fix.code && fix.code.length > 500) {
          console.warn('[Nexus] Code fix too long, extracting relevant part...');
          // Try to extract just the link/script tag
          const tagMatch = fix.code.match(/<(link|script|img)[^>]*>/i);
          if (tagMatch) {
            fix.code = tagMatch[0];
          }
        }
      } catch (e) {
        console.error('[Nexus] JSON parse failed, using fallback');
        // Smart fallback based on bottleneck type
        if (bottleneck.type === 'render-blocking-css' && actualCSS) {
          fix = {
            language: 'html',
            code: `<link rel="preload" href="${actualCSS.url}" as="style" onload="this.rel='stylesheet'">`,
            explanation: 'Preloads CSS asynchronously to eliminate render-blocking',
            preview: false
          };
        } else if (bottleneck.type === 'render-blocking-js' && actualJS) {
          fix = {
            language: 'html',
            code: `<script defer src="${actualJS.url}"></script>`,
            explanation: 'Defer attribute prevents render-blocking while maintaining execution order',
            preview: false
          };
        } else {
          fix = {
            language: 'html',
            code: '<!-- Performance optimization code -->',
            explanation: 'General performance improvement recommended',
            preview: false
          };
        }
      }

      return fix;

    } catch (error) {
      console.error('[Nexus] Code fix generation error:', error);
      return {
        language: 'html',
        code: '<!-- Code fix generation failed -->',
        explanation: 'Unable to generate fix',
        preview: false
      };
    }
  }

  async function handleNexusPreviewFix(payload: any) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const { fix } = payload;

      console.log('[Nexus] Previewing fix:', fix.language);

      if (fix.language === 'css') {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          css: fix.code
        });
      } else if (fix.language === 'html') {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (htmlCode) => {
            const container = document.createElement('div');
            container.id = 'nexus-preview-container';
            container.innerHTML = htmlCode;
            document.head.appendChild(container);
          },
          args: [fix.code]
        });
      } else if (fix.language === 'javascript') {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (jsCode) => {
            try {
              eval(jsCode);
            } catch (e) {
              console.error('[Nexus Preview] JS execution error:', e);
            }
          },
          args: [fix.code]
        });
      }

      console.log('[Nexus] Preview applied');
      chrome.runtime.sendMessage({ type: 'nexus-preview-active' });

    } catch (error) {
      console.error('[Nexus] Preview error:', error);
      chrome.runtime.sendMessage({
        type: 'nexus-error',
        error: `Preview failed: ${(error as Error).message}`
      });
    }
  }

  async function handleNexusRevertPreview() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      // Reload page to remove all injected code
      await chrome.tabs.reload(tab.id);

      chrome.runtime.sendMessage({ type: 'nexus-preview-reverted' });

    } catch (error) {
      console.error('[Nexus] Revert error:', error);
    }
  }

  // --- Aegis Feature (AI Security & Resilience Agent) ---

  // Aegis state management
  const aegisState: {
    active: boolean;
    target: chrome.debugger.Debuggee | null;
    mockRules: Map<string, any>;
    interceptedRequests: any[];
    blockedDomains: Set<string>;
    requestIdMap: Map<string, any>;
    autoFollow: boolean; // Auto-follow active tab
  } = {
    active: false,
    target: null,
    mockRules: new Map(),
    interceptedRequests: [],
    blockedDomains: new Set(['malicious-site.com', 'evil-cdn.tk']), // Example blocked domains
    requestIdMap: new Map(),
    autoFollow: true // Enable auto-follow by default
  };

  // Listen for tab activation (user switches tabs)
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    if (aegisState.active && aegisState.autoFollow) {
      console.log('[Aegis] Tab switched, following to new tab:', activeInfo.tabId);

      // Get the new tab details
      const tab = await chrome.tabs.get(activeInfo.tabId);

      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        console.log('[Aegis] Skipping Chrome internal page');
        return;
      }

      // Switch monitoring to new tab
      await switchAegisToTab(activeInfo.tabId, tab.url);
    }
  });

  async function switchAegisToTab(tabId: number, tabUrl: string) {
    try {
      // Detach from old tab (if attached)
      if (aegisState.target) {
        console.log('[Aegis] Detaching from old tab:', aegisState.target.tabId);
        chrome.debugger.sendCommand(aegisState.target, "Fetch.disable", {}, () => {
          chrome.debugger.detach(aegisState.target!, () => {
            console.log('[Aegis] Detached from old tab');
          });
        });
      }

      const target = { tabId };

      // Attach to new tab
      chrome.debugger.attach(target, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error('[Aegis] Failed to attach to new tab:', chrome.runtime.lastError);
          return;
        }

        // Enable Fetch domain
        chrome.debugger.sendCommand(target, "Fetch.enable", {
          patterns: [{ urlPattern: '*', requestStage: 'Request' }]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Aegis] Failed to enable Fetch on new tab:', chrome.runtime.lastError);
            chrome.debugger.detach(target);
            return;
          }

          aegisState.target = target;

          console.log('[Aegis] Now monitoring new tab:', tabUrl);

          // Notify UI of tab switch
          chrome.runtime.sendMessage({
            type: 'aegis-tab-switched',
            tabUrl: tabUrl
          });
        });
      });

    } catch (error) {
      console.error('[Aegis] Tab switch error:', error);
    }
  }

  async function handleAegisActivate() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        chrome.runtime.sendMessage({ type: 'aegis-error', error: 'No active tab found' });
        return;
      }

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          type: 'aegis-error',
          error: 'Cannot monitor Chrome internal pages'
        });
        return;
      }

      console.log('[Aegis] Activating security agent for:', tab.url);

      const target = { tabId: tab.id };

      // Attach debugger
      chrome.debugger.attach(target, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error('[Aegis] Attach failed:', chrome.runtime.lastError);
          chrome.runtime.sendMessage({
            type: 'aegis-error',
            error: `Failed to attach debugger: ${chrome.runtime.lastError.message}`
          });
          return;
        }

        console.log('[Aegis] Debugger attached, enabling Fetch domain...');

        // Enable Fetch domain to intercept network requests
        chrome.debugger.sendCommand(target, "Fetch.enable", {
          patterns: [
            {
              urlPattern: '*',
              requestStage: 'Request'
            }
          ]
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Aegis] Fetch.enable failed:', chrome.runtime.lastError);
            chrome.runtime.sendMessage({
              type: 'aegis-error',
              error: 'Failed to enable request interception'
            });
            chrome.debugger.detach(target);
            return;
          }

          aegisState.active = true;
          aegisState.target = target;

          console.log('[Aegis] Request interception active - all requests will be monitored');

          // CRITICAL: Attach the event listener for Aegis
          // This will catch Fetch.requestPaused events which are already handled in handleDebuggerEvent
          chrome.debugger.onEvent.addListener(handleDebuggerEvent);

          chrome.runtime.sendMessage({
            type: 'aegis-activated',
            tabUrl: tab.url
          });

          // Load saved mock rules AND blocked domains
          chrome.storage.local.get(['aegisMockRules', 'aegisBlockedDomains'], (result) => {
            // Load mock rules
            if (result.aegisMockRules && Array.isArray(result.aegisMockRules)) {
              result.aegisMockRules.forEach((rule: any) => {
                aegisState.mockRules.set(rule.id, rule);
              });
              console.log('[Aegis] Loaded', result.aegisMockRules.length, 'saved mock rules');

              // Send loaded rules to UI
              result.aegisMockRules.forEach((rule: any) => {
                chrome.runtime.sendMessage({
                  type: 'aegis-mock-created',
                  mockRule: rule
                });
              });
            }

            // Load blocked domains
            if (result.aegisBlockedDomains && Array.isArray(result.aegisBlockedDomains)) {
              result.aegisBlockedDomains.forEach((domain: string) => {
                aegisState.blockedDomains.add(domain.toLowerCase());
                // Send to UI
                chrome.runtime.sendMessage({
                  type: 'aegis-domain-blocked',
                  domain: domain
                });
              });
              console.log('[Aegis] Loaded', result.aegisBlockedDomains.length, 'blocked domains');
            }
          });
        });
      });

    } catch (error) {
      console.error('[Aegis] Activation error:', error);
      chrome.runtime.sendMessage({
        type: 'aegis-error',
        error: `Activation failed: ${(error as Error).message}`
      });
    }
  }

  function handleAegisDeactivate() {
    try {
      console.log('[Aegis] Deactivating security agent...');

      if (aegisState.target) {
        // Remove event listener (important to prevent conflicts)
        chrome.debugger.onEvent.removeListener(handleDebuggerEvent);

        // Disable Fetch domain
        chrome.debugger.sendCommand(aegisState.target, "Fetch.disable", {}, () => {
          // Detach debugger
          chrome.debugger.detach(aegisState.target!, () => {
            aegisState.active = false;
            aegisState.target = null;
            aegisState.requestIdMap.clear();

            console.log('[Aegis] Deactivated successfully');
            chrome.runtime.sendMessage({ type: 'aegis-deactivated' });
          });
        });
      } else {
        aegisState.active = false;
        chrome.runtime.sendMessage({ type: 'aegis-deactivated' });
      }

    } catch (error) {
      console.error('[Aegis] Deactivation error:', error);
    }
  }

  function handleFetchRequestPaused(params: any) {
    const { requestId, request } = params;

    console.log('[Aegis] Request intercepted:', request.method, request.url);

    // Store request details
    aegisState.requestIdMap.set(requestId, request);

    // Check if there's a matching mock rule
    const mockRule = findMatchingMockRule(request.url, request.method);
    if (mockRule) {
      console.log('[Aegis] Applying mock rule for:', request.url);
      applyMockRule(requestId, mockRule);
      return;
    }

    // Quick threat check
    const threatLevel = quickThreatCheck(request.url);

    if (threatLevel === 'malicious') {
      console.log('[Aegis] Blocking malicious request:', request.url);
      blockRequest(requestId, request, 'Blocked by security agent - malicious domain');
      return;
    }

    // Log and allow
    const interceptedReq = {
      id: requestId,
      url: request.url,
      method: request.method,
      resourceType: request.resourceType,
      timestamp: Date.now(),
      status: threatLevel === 'suspicious' ? 'suspicious' : 'allowed',
      threatLevel: threatLevel
    };

    chrome.runtime.sendMessage({
      type: 'aegis-request-intercepted',
      request: interceptedReq
    });

    // Continue request
    chrome.debugger.sendCommand(aegisState.target!, "Fetch.continueRequest", {
      requestId
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Aegis] Continue request error:', chrome.runtime.lastError);
      }
    });

    // If suspicious, escalate to AI for deep analysis (async, doesn't block request)
    if (threatLevel === 'suspicious') {
      console.log('[Aegis] Escalating suspicious request to AI:', request.url);
      analyzeThreatWithAI(request, requestId);
    }
  }

  async function analyzeThreatWithAI(request: any, requestId: string) {
    try {
      console.log('[Aegis AI] Analyzing suspicious request:', request.url);

      const prompt = `You are a cybersecurity expert analyzing a potentially suspicious network request.

Request Details:
- URL: ${request.url}
- Method: ${request.method}
- Resource Type: ${request.resourceType || 'unknown'}

Analyze this request and determine:
1. Is it likely malicious, suspicious, or safe?
2. What type of threat does it represent (if any)?
3. Should it be blocked or allowed?
4. What's your confidence level?

Consider:
- URL patterns (eval, cmd, shell parameters)
- Domain reputation (suspicious TLDs, unknown domains)
- Request patterns (XSS, SQLi, command injection attempts)
- Context (is this a known CDN, API endpoint, etc.)

Respond with JSON:
{
  "verdict": "malicious" | "suspicious" | "safe",
  "threatType": "xss" | "sqli" | "malware" | "phishing" | "none",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "recommendation": "block" | "allow" | "monitor"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // Clean markdown
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      const jsonMatch = text.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }

      const analysis = JSON.parse(text);

      console.log('[Aegis AI] Threat analysis complete:', analysis);

      // Send alert to UI if threat is confirmed
      if (analysis.verdict === 'malicious' && analysis.confidence > 0.7) {
        chrome.runtime.sendMessage({
          type: 'aegis-threat-detected',
          alert: {
            severity: 'critical',
            type: analysis.threatType || 'suspicious',
            description: `AI Analysis: ${analysis.reasoning}`,
            url: request.url,
            timestamp: Date.now(),
            action: 'flagged'
          }
        });
      } else if (analysis.verdict === 'suspicious') {
        chrome.runtime.sendMessage({
          type: 'aegis-threat-detected',
          alert: {
            severity: 'medium',
            type: analysis.threatType || 'suspicious',
            description: `AI flagged as suspicious: ${analysis.reasoning}`,
            url: request.url,
            timestamp: Date.now(),
            action: 'allowed'
          }
        });
      }

    } catch (error) {
      console.error('[Aegis AI] Threat analysis error:', error);
    }
  }

  function quickThreatCheck(url: string): 'safe' | 'suspicious' | 'malicious' {
    try {
      const hostname = new URL(url).hostname.toLowerCase();

      // Check blocked domains FIRST
      if (aegisState.blockedDomains.has(hostname)) {
        console.log('[Aegis] Blocked domain detected:', hostname);
        return 'malicious';
      }

      // Suspicious TLDs (commonly used for malware)
      const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.win'];
      if (suspiciousTLDs.some(tld => hostname.endsWith(tld))) {
        return 'suspicious';
      }

      // Suspicious patterns in URL
      const suspiciousUrlPatterns = [
        /eval\(/i,
        /exec\(/i,
        /malware/i,
        /phishing/i,
        /backdoor/i,
        /cmd=/i,
        /shell=/i,
        /exec=/i
      ];

      if (suspiciousUrlPatterns.some(pattern => pattern.test(url))) {
        return 'suspicious';
      }

      // Suspicious domain patterns (gibberish, ad trackers)
      const suspiciousDomainPatterns = [
        /^[a-z]{12,}\.com$/i, // Very long random domain (coptiksihuserg.com)
        /^[a-z]{10,}abauns\.com$/i, // Pattern like bobapsoabauns
        /fleraprt|tzegilo|oucouksirt/i, // Known shady trackers
        /tracker|adserv|clickserv/i, // Common ad server patterns
        /-cdn\d+\./i // Suspicious CDN patterns
      ];

      if (suspiciousDomainPatterns.some(pattern => pattern.test(hostname))) {
        console.log('[Aegis] Suspicious domain pattern detected:', hostname);
        return 'suspicious';
      }

      // Ad tracking patterns (be conservative, many legitimate)
      if (hostname.includes('track') || hostname.includes('analytic') || hostname.includes('pixel')) {
        // But exclude known legitimate ones
        if (!hostname.includes('google') && !hostname.includes('cloudflare')) {
          return 'suspicious';
        }
      }

      // Known safe CDNs and services
      const safeDomains = [
        'googleapis.com',
        'gstatic.com',
        'cloudflare.com',
        'jsdelivr.net',
        'unpkg.com',
        'cdnjs.cloudflare.com',
        'github.com',
        'githubusercontent.com',
        'wikipedia.org',
        'youtube.com',
        'ytimg.com',
        'amazon',
        'microsoft',
        'apple'
      ];

      if (safeDomains.some(domain => hostname.includes(domain))) {
        return 'safe';
      }

      // If we got here and it's not explicitly safe, be cautious
      // Flag as suspicious if it has characteristics of ad trackers
      if (url.includes('impression') || url.includes('beacon') || url.includes('/ct?')) {
        return 'suspicious';
      }

      return 'safe'; // Default to safe
    } catch (e) {
      return 'safe';
    }
  }

  function blockRequest(requestId: string, request: any, reason: string) {
    // Fulfill with blocked response
    chrome.debugger.sendCommand(aegisState.target!, "Fetch.fulfillRequest", {
      requestId,
      responseCode: 403,
      responseHeaders: [
        { name: 'Content-Type', value: 'text/plain' }
      ],
      body: btoa(`Blocked by Aegis Security Agent\n\nReason: ${reason}`)
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Aegis] Block request error:', chrome.runtime.lastError);
      }
    });

    // Log blocked request
    const interceptedReq = {
      id: requestId,
      url: request.url,
      method: request.method,
      timestamp: Date.now(),
      status: 'blocked',
      threatLevel: 'malicious'
    };

    chrome.runtime.sendMessage({
      type: 'aegis-request-intercepted',
      request: interceptedReq
    });

    // Send threat alert
    chrome.runtime.sendMessage({
      type: 'aegis-threat-detected',
      alert: {
        severity: 'critical',
        type: 'malware',
        description: reason,
        url: request.url,
        timestamp: Date.now(),
        action: 'blocked'
      }
    });
  }

  function applyMockRule(requestId: string, mockRule: any) {
    console.log('[Aegis] Applying mock rule:', mockRule.urlPattern, '→', mockRule.responseCode);

    const responseHeaders = mockRule.responseHeaders ?
      Object.entries(mockRule.responseHeaders).map(([name, value]) => ({ name, value: value as string })) :
      [{ name: 'Content-Type', value: 'application/json' }];

    chrome.debugger.sendCommand(aegisState.target!, "Fetch.fulfillRequest", {
      requestId,
      responseCode: mockRule.responseCode,
      responseHeaders,
      body: mockRule.responseBody || btoa(JSON.stringify({ mocked: true }))
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[Aegis] Mock fulfill error:', chrome.runtime.lastError);
      }
    });

    // Log mocked request
    chrome.runtime.sendMessage({
      type: 'aegis-request-intercepted',
      request: {
        id: requestId,
        url: 'Matched: ' + mockRule.urlPattern,
        method: mockRule.method || 'ANY',
        timestamp: Date.now(),
        status: 'mocked',
        responseCode: mockRule.responseCode
      }
    });
  }

  function findMatchingMockRule(url: string, method: string): any | null {
    for (const rule of aegisState.mockRules.values()) {
      if (!rule.enabled) continue;

      // Check URL pattern match
      const urlMatch = rule.urlPattern === '*' ||
                       url.includes(rule.urlPattern) ||
                       new RegExp(rule.urlPattern.replace(/\*/g, '.*')).test(url);

      if (urlMatch) {
        // Check method if specified
        if (!rule.method || rule.method === method || rule.method === 'ANY') {
          return rule;
        }
      }
    }
    return null;
  }

  async function handleAegisCreateMock(payload: any) {
    try {
      const { command } = payload;

      console.log('[Aegis] Parsing mock command:', command);

      const prompt = `Parse this API mocking command into structured data.

Command: "${command}"

Extract:
- URL pattern (the endpoint to mock, can include wildcards like /api/*)
- HTTP method (GET, POST, PUT, DELETE) if mentioned, otherwise null
- Response code (404, 500, 200, 401, etc.)
- Response body (if a specific response is mentioned)

Common examples:
- "Mock /api/users with 404" → 404 error with {"error": "Not Found"}
- "Return 500 for /api/data" → 500 error with {"error": "Internal Server Error"}
- "Mock /api/products with empty array" → 200 with []
- "Return 401 unauthorized for /api/auth" → 401 with {"error": "Unauthorized"}

Respond with JSON:
{
  "urlPattern": "/api/users",
  "method": "GET" or null,
  "responseCode": 404,
  "responseBody": {"error": "Not Found"} or [] or null
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      console.log('[Aegis] AI mock parse response:', text);

      // Clean markdown
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Extract JSON if wrapped
      const jsonMatch = text.match(/\{[\s\S]*"urlPattern"[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }

      const parsed = JSON.parse(text);

      // Create mock rule
      const mockRule = {
        id: `mock-${Date.now()}`,
        urlPattern: parsed.urlPattern || '/api/*',
        method: parsed.method || null,
        responseCode: parsed.responseCode || 404,
        responseBody: parsed.responseBody ? btoa(JSON.stringify(parsed.responseBody)) : btoa(JSON.stringify({ error: 'Mocked by Aegis' })),
        responseHeaders: { 'Content-Type': 'application/json', 'X-Mocked-By': 'Aegis' },
        enabled: true,
        createdAt: Date.now()
      };

      // Store in state
      aegisState.mockRules.set(mockRule.id, mockRule);

      // Save to storage
      chrome.storage.local.set({
        aegisMockRules: Array.from(aegisState.mockRules.values())
      });

      console.log('[Aegis] Mock rule created:', mockRule);

      chrome.runtime.sendMessage({
        type: 'aegis-mock-created',
        mockRule
      });

    } catch (error) {
      console.error('[Aegis] Mock creation error:', error);
      chrome.runtime.sendMessage({
        type: 'aegis-error',
        error: `Failed to create mock: ${(error as Error).message}`
      });
    }
  }

  function handleAegisToggleMock(payload: any) {
    const { ruleId } = payload;
    const rule = aegisState.mockRules.get(ruleId);
    if (rule) {
      rule.enabled = !rule.enabled;
      chrome.storage.local.set({
        aegisMockRules: Array.from(aegisState.mockRules.values())
      });
      console.log('[Aegis] Mock rule toggled:', ruleId, rule.enabled);
    }
  }

  function handleAegisDeleteMock(payload: any) {
    const { ruleId } = payload;
    aegisState.mockRules.delete(ruleId);
    chrome.storage.local.set({
      aegisMockRules: Array.from(aegisState.mockRules.values())
    });
    console.log('[Aegis] Mock rule deleted:', ruleId);
  }

  function handleAegisBlockDomain(payload: any) {
    const { domain } = payload;
    aegisState.blockedDomains.add(domain.toLowerCase());

    // Save to storage
    chrome.storage.local.set({
      aegisBlockedDomains: Array.from(aegisState.blockedDomains)
    });

    console.log('[Aegis] Domain blocked:', domain);

    chrome.runtime.sendMessage({
      type: 'aegis-domain-blocked',
      domain
    });
  }

  function handleAegisUnblockDomain(payload: any) {
    const { domain } = payload;
    aegisState.blockedDomains.delete(domain.toLowerCase());

    chrome.storage.local.set({
      aegisBlockedDomains: Array.from(aegisState.blockedDomains)
    });

    console.log('[Aegis] Domain unblocked:', domain);

    chrome.runtime.sendMessage({
      type: 'aegis-domain-unblocked',
      domain
    });
  }

  function handleAegisExportMocks() {
    const mocks = Array.from(aegisState.mockRules.values());
    const json = JSON.stringify(mocks, null, 2);

    chrome.runtime.sendMessage({
      type: 'aegis-mocks-exported',
      data: json
    });
  }

  async function handleAegisImportMocks(payload: any) {
    try {
      const { jsonData } = payload;
      const imported = JSON.parse(jsonData);

      if (!Array.isArray(imported)) {
        throw new Error('Invalid format - must be array of mock rules');
      }

      // Add all imported rules
      imported.forEach((rule: any) => {
        aegisState.mockRules.set(rule.id, rule);
        chrome.runtime.sendMessage({
          type: 'aegis-mock-created',
          mockRule: rule
        });
      });

      // Save
      chrome.storage.local.set({
        aegisMockRules: Array.from(aegisState.mockRules.values())
      });

      console.log('[Aegis] Imported', imported.length, 'mock rules');

      chrome.runtime.sendMessage({
        type: 'aegis-import-complete',
        count: imported.length
      });

    } catch (error) {
      console.error('[Aegis] Import error:', error);
      chrome.runtime.sendMessage({
        type: 'aegis-error',
        error: `Import failed: ${(error as Error).message}`
      });
    }
  }

  // --- Canvas Feature Handlers ---

  async function handleAccessibilityAudit() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        chrome.runtime.sendMessage({ type: 'canvas-error', error: 'No active tab found' });
        return;
      }

      // Check if we can access this tab
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          type: 'canvas-error',
          error: 'Cannot audit Chrome internal pages. Please navigate to a regular website.'
        });
        return;
      }

      console.log('[Canvas] Starting accessibility audit on:', tab.url);

      // Inject and execute the audit in one go
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runAccessibilityAuditInPage
      });

      console.log('[Canvas] Audit results:', results);

      if (results && results[0] && results[0].result) {
        const auditData = results[0].result;

        // BUILT-IN AI: Try to generate on-device summary of audit findings
        try {
          const summaryResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (issues: any[]) => {
              try {
                if (typeof window !== 'undefined' && 'ai' in window && (window as any).ai?.summarizer) {
                  console.log('[Canvas] Using on-device Summarizer API for audit summary');

                  const summarizer = await (window as any).ai.summarizer.create({
                    type: 'key-points',
                    length: 'short'
                  });

                  const issueText = issues.map(i =>
                    `${i.severity} issue: ${i.message} at ${i.element}`
                  ).join('. ');

                  const summary = await summarizer.summarize(issueText);

                  return {
                    hasBuiltInAI: true,
                    summary: summary
                  };
                }
                return { hasBuiltInAI: false };
              } catch (e) {
                console.error('[Canvas] Summarizer error:', e);
                return { hasBuiltInAI: false };
              }
            },
            args: [auditData.issues]
          });

          if (summaryResult && summaryResult[0] && summaryResult[0].result?.hasBuiltInAI) {
            console.log('[Canvas] On-device audit summary generated');
            auditData.aiSummary = summaryResult[0].result.summary;
            auditData.summarySource = 'on-device';
          }
        } catch (summaryError) {
          console.log('[Canvas] On-device summary failed:', summaryError);
        }

        chrome.runtime.sendMessage({
          type: 'canvas-audit-complete',
          result: auditData
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'canvas-error',
          error: 'Audit completed but no results returned'
        });
      }
    } catch (error) {
      console.error('[Canvas] Accessibility audit error:', error);
      chrome.runtime.sendMessage({
        type: 'canvas-error',
        error: `Audit failed: ${(error as Error).message}`
      });
    }
  }

  // Accessibility audit function to inject into page
  function runAccessibilityAuditInPage() {
    // Inline all the audit logic here since content scripts can't import modules
    const issues: any[] = [];
    let totalElements = 0;
    const startTime = performance.now();

    // Helper: Get element selector
    function getElementSelector(element: Element, index: number): string {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const classes = element.className ? `.${element.className.toString().split(' ').join('.')}` : '';
      if (id) return `${tag}${id}`;
      if (classes) return `${tag}${classes}`;
      return `${tag}:nth-of-type(${index + 1})`;
    }

    // Check 1: Missing alt text
    const images = document.querySelectorAll('img');
    images.forEach((img, index) => {
      const hasAlt = img.hasAttribute('alt');
      const altText = img.getAttribute('alt')?.trim();
      if (!hasAlt || !altText) {
        if (hasAlt && altText === '') return;
        const selector = getElementSelector(img, index);
        issues.push({
          type: 'missing-alt',
          severity: 'critical',
          element: selector,
          message: 'Image missing alt text',
          suggestion: 'Add descriptive alt text to explain the image content',
          wcagReference: 'WCAG 1.1.1 Non-text Content (Level A)',
        });
      }
    });

    // Check 2: Heading order
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let previousLevel = 0;
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName[1]);
      const selector = getElementSelector(heading, index);
      if (level === 1 && index > 0 && previousLevel === 1) {
        issues.push({
          type: 'heading-order',
          severity: 'warning',
          element: selector,
          message: 'Multiple H1 headings found on page',
          suggestion: 'Use only one H1 per page for the main title',
          wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
        });
      }
      if (previousLevel > 0 && level > previousLevel + 1) {
        issues.push({
          type: 'heading-order',
          severity: 'warning',
          element: selector,
          message: `Heading level skipped (H${previousLevel} → H${level})`,
          suggestion: `Use H${previousLevel + 1} instead of H${level} to maintain hierarchy`,
          wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
        });
      }
      previousLevel = level;
    });

    // Check 3: Form labels
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
    inputs.forEach((input, index) => {
      const id = input.getAttribute('id');
      let hasLabel = false;
      if (id) {
        hasLabel = !!document.querySelector(`label[for="${id}"]`);
      }
      if (!hasLabel) {
        let parent = input.parentElement;
        while (parent) {
          if (parent.tagName === 'LABEL') {
            hasLabel = true;
            break;
          }
          parent = parent.parentElement;
        }
      }
      const hasAriaLabel = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby');
      if (!hasLabel && !hasAriaLabel) {
        const selector = getElementSelector(input, index);
        const type = input.getAttribute('type') || input.tagName.toLowerCase();
        issues.push({
          type: 'missing-label',
          severity: 'critical',
          element: selector,
          message: `Form ${type} missing label`,
          suggestion: 'Add a <label> element or aria-label attribute',
          wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
        });
      }
    });

    totalElements = document.querySelectorAll('*').length;

    // Calculate score
    let score = 100;
    issues.forEach(issue => {
      if (issue.severity === 'critical') score -= 5;
      else if (issue.severity === 'warning') score -= 2;
      else if (issue.severity === 'info') score -= 0.5;
    });
    score = Math.max(0, Math.min(100, Math.round(score)));

    const endTime = performance.now();

    return {
      issues,
      score,
      totalElements,
      scanTime: Math.round(endTime - startTime),
      timestamp: Date.now(),
    };
  }

  async function handleStartElementCapture() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) {
        chrome.runtime.sendMessage({ type: 'canvas-error', error: 'No active tab found' });
        return;
      }

      // Check if we can access this tab
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        chrome.runtime.sendMessage({
          type: 'canvas-error',
          error: 'Cannot capture elements on Chrome internal pages. Please navigate to a regular website.'
        });
        return;
      }

      console.log('[Canvas] Injecting element capture script into:', tab.url);

      // First, inject html2canvas library separately
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/element-capturer.js']
        });

        console.log('[Canvas] Element capture script injected successfully');
      } catch (injectError) {
        console.error('[Canvas] Script injection failed:', injectError);
        chrome.runtime.sendMessage({
          type: 'canvas-error',
          error: `Script injection failed: ${(injectError as Error).message}`
        });
      }
    } catch (error) {
      console.error('[Canvas] Element capture error:', error);
      chrome.runtime.sendMessage({
        type: 'canvas-error',
        error: `Capture mode failed: ${(error as Error).message}`
      });
    }
  }

  async function handleStopCapture() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      // Execute stop command directly
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if ((window as any).canvasCaptureMode) {
            (window as any).canvasCaptureMode.exit();
          }
        }
      });
    } catch (error) {
      console.error('[Canvas] Stop capture error:', error);
    }
  }

  async function handleAnalyzeElement(payload: any) {
    try {
      const { image, prompt } = payload;

      console.log('[Canvas] Starting AI element analysis...');

      // Convert data URL to inline data format for Gemini
      const base64Data = image.split(',')[1];
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: 'image/png'
        }
      };

      // Construct specialized prompt based on user intent
      let systemPrompt = '';

      if (prompt.toLowerCase().includes('contrast') || prompt.toLowerCase().includes('color')) {
        systemPrompt = `You are a WCAG accessibility expert analyzing UI elements.
Focus on color contrast, readability, and WCAG compliance.
Analyze the image and respond to: ${prompt}

Provide specific, actionable feedback including:
- Estimated contrast ratios for text elements
- WCAG compliance level (AA/AAA/Fail)
- Specific color recommendations
- Accessibility improvements`;
      } else if (prompt.toLowerCase().includes('design') || prompt.toLowerCase().includes('improve')) {
        systemPrompt = `You are a senior UI/UX designer providing expert design critique.
Analyze the visual design, layout, typography, and spacing.
Respond to: ${prompt}

Provide:
- 3-5 specific design strengths
- 3-5 actionable improvements
- Modern design principles applied
- User experience considerations`;
      } else if (prompt.toLowerCase().includes('accessibility') || prompt.toLowerCase().includes('a11y')) {
        systemPrompt = `You are an accessibility specialist analyzing UI components.
Check for WCAG compliance, keyboard navigation, screen reader compatibility.
Respond to: ${prompt}

Analyze:
- Visual accessibility (contrast, sizing)
- Semantic structure
- Interactive element accessibility
- ARIA attributes and labels
- Keyboard navigation support`;
      } else {
        // General analysis
        systemPrompt = `You are an expert UI analyst. Analyze this UI element and respond to: ${prompt}

Provide clear, specific, actionable insights about the design, accessibility, and user experience.`;
      }

      // Call Gemini model with image and prompt
      const result = await model.generateContent([systemPrompt, imagePart]);
      const response = await result.response;
      const analysisText = response.text();

      console.log('[Canvas] AI analysis complete');

      chrome.runtime.sendMessage({
        type: 'canvas-analysis-result',
        result: analysisText
      });
    } catch (error) {
      console.error('[Canvas] Element analysis error:', error);
      chrome.runtime.sendMessage({
        type: 'canvas-error',
        error: `Analysis failed: ${(error as Error).message}`
      });
    }
  }

  async function handleGeneratePalette(payload: any) {
    try {
      const { image } = payload;

      console.log('[Canvas] Starting AI palette generation...');

      // Convert data URL to inline data format for Gemini
      const base64Data = image.split(',')[1];
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: 'image/png'
        }
      };

      // Specialized prompt for palette generation
      const palettePrompt = `You are a senior UI/UX designer and color theory expert.

Analyze the color scheme of this UI component and generate a harmonious, accessible alternative color palette.

Requirements:
1. Generate exactly 5 colors as a cohesive palette
2. Each color must be WCAG AA compliant for text (4.5:1 minimum contrast when used with white or black)
3. Maintain a similar design mood to the original
4. Include colors for: primary, secondary, accent, neutral, and background

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks, just raw JSON):
{
  "colors": [
    {
      "hex": "#3B82F6",
      "role": "primary",
      "usage": "Main actions, buttons, links"
    },
    {
      "hex": "#10B981",
      "role": "secondary",
      "usage": "Supporting elements, secondary actions"
    },
    {
      "hex": "#8B5CF6",
      "role": "accent",
      "usage": "Highlights, important information"
    },
    {
      "hex": "#6B7280",
      "role": "neutral",
      "usage": "Text, borders, dividers"
    },
    {
      "hex": "#F9FAFB",
      "role": "background",
      "usage": "Page backgrounds, cards"
    }
  ]
}

Important: Return ONLY the JSON object, no other text.`;

      // Call Gemini model
      const result = await model.generateContent([palettePrompt, imagePart]);
      const response = await result.response;
      let responseText = response.text().trim();

      console.log('[Canvas] Raw AI response:', responseText);

      // Clean up response - remove markdown code blocks if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Parse JSON response
      let palette;
      try {
        palette = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[Canvas] Failed to parse palette JSON:', responseText);
        // Fallback to demo palette if parsing fails
        palette = {
          colors: [
            { hex: '#3B82F6', role: 'primary', usage: 'Main actions, buttons, links' },
            { hex: '#10B981', role: 'secondary', usage: 'Supporting elements' },
            { hex: '#8B5CF6', role: 'accent', usage: 'Highlights, important info' },
            { hex: '#6B7280', role: 'neutral', usage: 'Text, borders, dividers' },
            { hex: '#F9FAFB', role: 'background', usage: 'Page backgrounds, cards' },
          ]
        };
      }

      console.log('[Canvas] Palette generation complete');

      chrome.runtime.sendMessage({
        type: 'canvas-palette-generated',
        palette: palette
      });
    } catch (error) {
      console.error('[Canvas] Palette generation error:', error);
      chrome.runtime.sendMessage({
        type: 'canvas-error',
        error: `Palette generation failed: ${(error as Error).message}`
      });
    }
  }

  async function handleInjectCSS(payload: any) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const { css } = payload;

      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        css: css
      });

      console.log('[Canvas] CSS injected for preview');
    } catch (error) {
      console.error('[Canvas] CSS injection error:', error);
      chrome.runtime.sendMessage({
        type: 'canvas-error',
        error: `CSS preview failed: ${(error as Error).message}`
      });
    }
  }

  async function handleRemoveCSSPreview() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      // Remove injected CSS by injecting removal script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const style = document.getElementById('canvas-preview-styles');
          if (style) style.remove();
        }
      });

      console.log('[Canvas] CSS preview removed');
    } catch (error) {
      console.error('[Canvas] CSS removal error:', error);
    }
  }

  // --- Event Listeners ---
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Service Worker V2] Message received:', request);

    if (request.action === 'synthesize-multi-tab') {
      handleMultiTabSynthesis(request.tabIds, request.userPrompt, request.origins);
    } else if (request.action === "readPage") {
      handleReadPage();
      return true;
    } else if (request.action === "start-network-analysis") {
      handleStartNetworkAnalysis();
    } else if (request.action === "stop-network-analysis") {
      handleStopNetworkAnalysis();
    } else if (request.action === "start-verification") {
      handleStartVerification(request.target);
    } else if (request.type === 'video_frame') {
      chrome.runtime.sendMessage({ type: 'video_frame_forward', dataUrl: request.dataUrl });
    }
    // Kino Feature Handlers
    else if (request.action === 'start-video-capture') {
      handleStartVideoCapture();
    } else if (request.action === 'stop-video-capture') {
      handleStopVideoCapture();
    } else if (request.action === 'kino-quick-analysis') {
      handleKinoQuickAnalysis(request.payload);
    } else if (request.action === 'kino-analyze-frame') {
      handleKinoAnalyzeFrame(request.payload);
    } else if (request.action === 'kino-summarize-video') {
      handleKinoSummarizeVideo(request.payload);
    } else if (request.action === 'kino-extract-transcript') {
      handleKinoExtractTranscript(request.payload);
    }
    // Nexus Feature Handlers
    else if (request.action === 'nexus-analyze-performance') {
      handleNexusAnalyzePerformance();
    } else if (request.action === 'nexus-preview-fix') {
      handleNexusPreviewFix(request.payload);
    } else if (request.action === 'nexus-revert-preview') {
      handleNexusRevertPreview();
    }
    // Aegis Feature Handlers
    else if (request.action === 'aegis-activate') {
      handleAegisActivate();
    } else if (request.action === 'aegis-deactivate') {
      handleAegisDeactivate();
    } else if (request.action === 'aegis-create-mock') {
      handleAegisCreateMock(request.payload);
    } else if (request.action === 'aegis-toggle-mock') {
      handleAegisToggleMock(request.payload);
    } else if (request.action === 'aegis-delete-mock') {
      handleAegisDeleteMock(request.payload);
    } else if (request.action === 'aegis-block-domain') {
      handleAegisBlockDomain(request.payload);
    } else if (request.action === 'aegis-unblock-domain') {
      handleAegisUnblockDomain(request.payload);
    } else if (request.action === 'aegis-export-mocks') {
      handleAegisExportMocks();
    } else if (request.action === 'aegis-import-mocks') {
      handleAegisImportMocks(request.payload);
    }
    // Canvas Feature Handlers
    else if (request.action === 'start-accessibility-audit') {
      handleAccessibilityAudit();
    } else if (request.action === 'start-element-capture') {
      handleStartElementCapture();
    } else if (request.action === 'stop-capture') {
      handleStopCapture();
    } else if (request.action === 'element-captured') {
      // Forward captured element to Canvas view
      chrome.runtime.sendMessage({
        type: 'canvas-element-captured',
        image: request.image,
        metadata: request.metadata
      });
      sendResponse({ success: true });
      return true;
    } else if (request.action === 'analyze-element') {
      handleAnalyzeElement(request.payload);
    } else if (request.action === 'generate-palette') {
      handleGeneratePalette(request.payload);
    } else if (request.action === 'inject-css') {
      handleInjectCSS(request.payload);
    } else if (request.action === 'remove-css-preview') {
      handleRemoveCSSPreview();
    }
  });
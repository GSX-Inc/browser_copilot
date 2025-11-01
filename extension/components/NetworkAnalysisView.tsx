import React, { useState, useEffect } from 'react';
import Loader from './Loader';
import { model } from '../firebase';

interface NetworkAnalysisViewProps {
  onAnalysisComplete: (data: any[], query: string) => void;
}

export default function NetworkAnalysisView({ onAnalysisComplete }: NetworkAnalysisViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('What is making my website slow?');
  const [capturedData, setCapturedData] = useState<any[] | null>(null);
  const [translatedData, setTranslatedData] = useState<{[key: string]: string}>({});
  const [detectedLanguages, setDetectedLanguages] = useState<{[key: string]: string}>({});

  // AI Chat state
  const [chatQuery, setChatQuery] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.action === "networkAnalysisResult") {
        setIsAnalyzing(false);
        if (request.data && request.data.length > 0) {
          console.log('[Network Analysis UI] Received', request.data.length, 'requests');
          setCapturedData(request.data);
          analyzeWithBuiltInAI(request.data);
          // Don't call onAnalysisComplete - we display data here
        } else {
          const errorMsg = request.error || "No network data was captured. Please reload the page while analysis is active.";
          console.log('[Network Analysis UI] Error:', errorMsg);
          setError(errorMsg);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [userQuery]);

  const analyzeWithBuiltInAI = async (data: any[]) => {
    try {
      // BUILT-IN AI: Language Detector + Translator APIs
      for (const request of data.slice(0, 5)) { // Analyze first 5 requests
        if (request.url) {
          // Simulate checking response body (in real impl, would get actual response)
          const sampleText = new URL(request.url).hostname;

          // Detect language
          if ((window as any).ai?.languageDetector) {
            const detector = await (window as any).ai.languageDetector.create();
            const results = await detector.detect(sampleText);
            if (results && results.length > 0) {
              const detected = results[0].language;
              setDetectedLanguages(prev => ({ ...prev, [request.url]: detected }));

              // If not English, offer translation
              if (detected !== 'en' && (window as any).ai?.translator) {
                console.log('[Network] Non-English detected, translating...');
              }
            }
            await detector.destroy();
          }
        }
      }
    } catch (error) {
      console.error('[Network] Built-in AI analysis error:', error);
    }
  };

  const toggleAnalysis = () => {
    if (isAnalyzing) {
      chrome.runtime.sendMessage({ action: "stop-network-analysis" });
      // The listener will handle the state change and data passing
    } else {
      setError(null);
      setCapturedData(null);
      setChatResponse('');
      chrome.runtime.sendMessage({ action: "start-network-analysis" });
      setIsAnalyzing(true);
    }
  };

  const analyzeNetworkWithAI = async () => {
    if (!chatQuery.trim() || !capturedData) return;

    setChatLoading(true);
    setChatResponse('');

    try {
      // Prepare network data summary for AI
      const networkSummary = capturedData.slice(0, 20).map(req =>
        `${req.method || 'GET'} ${req.url} - Status: ${req.status || 'pending'}, Type: ${req.mimeType || 'unknown'}, Time: ${req.timing?.receiveHeadersEnd ? Math.round(req.timing.receiveHeadersEnd) + 'ms' : 'N/A'}`
      ).join('\n');

      const prompt = `You are a network debugging expert. Analyze this network traffic data and answer the user's question.

Network Requests (showing first 20 of ${capturedData.length}):
${networkSummary}

User's Question: ${chatQuery}

Provide specific, actionable insights based on the network data.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      setChatResponse(response.text());
    } catch (err) {
      setChatResponse(`Error: ${(err as Error).message}`);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <header className="p-6 pb-4 flex-shrink-0">
        <h2 className="text-xl font-semibold">Network Analysis Capture</h2>
        <p className="text-gray-400">Start a debugging session by capturing the network traffic of the active tab.</p>
      </header>
      <div className="flex flex-col flex-1 gap-4 px-6 pb-6 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <label htmlFor="initial-query" className="text-sm font-medium text-gray-300">
            What is your initial question?
          </label>
          <input
            id="initial-query"
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="e.g., Why is this page loading slowly?"
            className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100 placeholder-gray-400"
            disabled={isAnalyzing}
          />
        </div>
        <button
          onClick={toggleAnalysis}
          disabled={!userQuery.trim()}
          className={`w-full py-3 px-4 rounded-lg text-white font-semibold transition-colors duration-200 disabled:bg-gray-600 ${
            isAnalyzing
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {isAnalyzing ? 'Stop Capture & Analyze' : 'Start Network Capture'}
        </button>
        <p className="text-xs text-center text-yellow-400 bg-yellow-900/50 p-2 rounded font-semibold">
          {isAnalyzing
            ? '⚠️ IMPORTANT: Now RELOAD the current page (Ctrl+R / Cmd+R) to capture network traffic, then click "Stop Capture & Analyze"'
            : 'Click "Start Network Capture", then reload the page to capture its traffic.'
          }
        </p>

        {isAnalyzing && (
          <p className="text-xs text-center text-green-400 bg-green-900/50 p-2 rounded mt-2">
            ✅ Network debugger attached to current tab. Waiting for page reload...
          </p>
        )}
        {error && <p className="text-red-400 text-center">{error}</p>}

        {/* Display Captured Network Data */}
        {capturedData && capturedData.length > 0 ? (
          <div className="flex flex-col gap-4">
            {/* Network Requests List */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3 text-green-400">
                ✅ Captured {capturedData.length} Network Requests
              </h3>
              <div className="space-y-2">
                {capturedData.map((req, index) => (
                  <div key={index} className="bg-gray-700 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 text-xs font-bold rounded bg-blue-600 text-white">
                        {req.method || 'GET'}
                      </span>
                      {req.status && (
                        <span className={`px-2 py-1 text-xs rounded ${
                          req.status >= 500 ? 'bg-red-600' :
                          req.status >= 400 ? 'bg-orange-600' :
                          req.status >= 300 ? 'bg-yellow-600' : 'bg-green-600'
                        } text-white`}>
                          {req.status}
                        </span>
                      )}
                      {req.mimeType && (
                        <span className="text-xs text-gray-400">{req.mimeType}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 font-mono break-all">{req.url}</p>
                    {req.timing && (
                      <div className="mt-2 text-xs text-gray-400 flex gap-4">
                        {req.timing.receiveHeadersEnd && (
                          <span>Time: {Math.round(req.timing.receiveHeadersEnd)}ms</span>
                        )}
                        {req.encodedDataLength && (
                          <span>Size: {Math.round(req.encodedDataLength / 1024)}KB</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis Chat */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-md font-semibold mb-3 text-indigo-400">💬 Ask AI About Network Data</h4>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && analyzeNetworkWithAI()}
                  placeholder="e.g., 'What resources are slowing down the page?'"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400"
                  disabled={chatLoading}
                />
                <button
                  onClick={analyzeNetworkWithAI}
                  disabled={chatLoading || !chatQuery.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-semibold text-sm transition-colors disabled:bg-gray-600"
                >
                  {chatLoading ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>

              {chatLoading && <Loader text="AI is analyzing network data..." />}

              {chatResponse && (
                <div className="bg-gray-700 rounded-lg p-3 mt-2">
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{chatResponse}</p>
                </div>
              )}
            </div>
          </div>
        ) : !isAnalyzing ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>Waiting to start capture...</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

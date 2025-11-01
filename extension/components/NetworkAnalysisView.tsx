import React, { useState, useEffect } from 'react';

interface NetworkAnalysisViewProps {
  onAnalysisComplete: (data: any[], query: string) => void;
}

export default function NetworkAnalysisView({ onAnalysisComplete }: NetworkAnalysisViewProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('What is making my website slow?');

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.action === "networkAnalysisResult") {
        setIsAnalyzing(false);
        if (request.data && request.data.length > 0) {
          onAnalysisComplete(request.data, userQuery);
        } else {
          setError("No network data was captured. " + (request.error || "Please reload the page while analysis is active."));
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [userQuery, onAnalysisComplete]);

  const toggleAnalysis = () => {
    if (isAnalyzing) {
      chrome.runtime.sendMessage({ action: "stop-network-analysis" });
      // The listener will handle the state change and data passing
    } else {
      setError(null);
      chrome.runtime.sendMessage({ action: "start-network-analysis" });
      setIsAnalyzing(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">Network Analysis Capture</h2>
        <p className="text-gray-400">Start a debugging session by capturing the network traffic of the active tab.</p>
      </header>
      <div className="flex flex-col flex-1 gap-4">
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
        <p className="text-xs text-center text-yellow-400 bg-yellow-900/50 p-2 rounded">
          {isAnalyzing 
            ? 'Now, reload the page you want to analyze to capture its traffic.'
            : 'A warning banner will appear on the active tab while capture is running.'
          }
        </p>
        {error && <p className="text-red-400 text-center">{error}</p>}
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>Waiting to start capture...</p>
        </div>
      </div>
    </div>
  );
}

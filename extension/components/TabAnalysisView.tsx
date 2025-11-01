
import React, { useState, useEffect } from 'react';
import Loader from './Loader';
import { model } from '../firebase'; // Import from central module

export default function TabAnalysisView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState('');
  const [quickSummary, setQuickSummary] = useState('');
  const [summarySource, setSummarySource] = useState<'on-device' | 'cloud' | null>(null);
  const [pageContent, setPageContent] = useState('');
  const [userQuery, setUserQuery] = useState('');

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.action === "pageContentResult") {
        if (request.content) {
          setPageContent(request.content);
          runAnalysis(request.content);
        } else {
          setError("Failed to get page content. The page might be protected.");
          setLoading(false);
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [userQuery]); // Rerun effect if userQuery changes, to capture it in the listener

  const handleAnalysis = () => {
    if (!userQuery.trim()) {
      setError("Please enter a question about the tab.");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysisResult('');
    setPageContent('');
    chrome.runtime.sendMessage({ action: "readPage" });
  };

  const runAnalysis = async (content: string) => {
    // BUILT-IN AI: Try on-device summarization first
    try {
      const summarizerAvailable = typeof window !== 'undefined' && 'ai' in window;

      if (summarizerAvailable && (window as any).ai?.summarizer) {
        console.log('[Tab Analysis] Using on-device Summarizer API');
        const summarizer = await (window as any).ai.summarizer.create();
        const summary = await summarizer.summarize(content.substring(0, 4000));

        setQuickSummary(summary);
        setSummarySource('on-device');
        console.log('[Tab Analysis] On-device summary generated');
      }
    } catch (summaryError) {
      console.log('[Tab Analysis] On-device summarization not available, using cloud');
    }

    // CLOUD: Full analysis with user's specific question
    const fullPrompt = `Based on the following web page content:
---
${content.substring(0, 5000)}...
---
Please answer this user's question: ${userQuery}`;

    try {
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      setAnalysisResult(response.text());
      if (!summarySource) {
        setSummarySource('cloud');
      }
    } catch (e) {
      console.error("Tab Analysis AI Error:", e);
      setError(`Failed to analyze tab: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">Active Tab Analysis</h2>
        <p className="text-gray-400">Ask a question about the current tab's content.</p>
      </header>
      <div className="flex flex-col flex-1 gap-4 overflow-hidden">
        <div className="flex items-center bg-gray-800 rounded-lg p-2">
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="e.g., 'Summarize this article' or 'What are the main points?'"
            className="flex-1 bg-transparent outline-none px-2 text-gray-100 placeholder-gray-400"
            disabled={loading}
          />
          <button
            onClick={handleAnalysis}
            disabled={loading || !userQuery.trim()}
            className="p-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col border border-gray-700">
            <h3 className="font-semibold text-lg mb-2">Scraped Page Content:</h3>
            <div className="flex-1 bg-gray-900 rounded p-2 overflow-y-auto text-sm text-gray-400">
              {loading && !pageContent && <Loader text="Scraping page..." />}
              {pageContent ? `${pageContent.substring(0, 1000)}...` : "Click 'Analyze' to scrape the page content."}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col border border-gray-700">
            <h3 className="font-semibold text-lg mb-2">AI Output:</h3>
            <div className="flex-1 overflow-y-auto text-gray-200 whitespace-pre-wrap">
              {loading && pageContent && <Loader text="AI is analyzing..." />}
              {error && <p className="text-red-400">{error}</p>}

              {quickSummary && (
                <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
                  <p className="text-green-200 text-xs font-semibold mb-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Quick Summary (Gemini Nano - On-Device)
                  </p>
                  <p className="text-green-300 text-sm">{quickSummary}</p>
                </div>
              )}

              {analysisResult && quickSummary && (
                <div className="mb-2 p-2 bg-indigo-900/30 border border-indigo-700 rounded">
                  <p className="text-indigo-300 text-xs">
                    💡 Detailed Analysis (Cloud):</p>
                </div>
              )}

              {analysisResult}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

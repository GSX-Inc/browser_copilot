import React, { useState, useRef, useEffect, useCallback } from 'react';
import Loader from './Loader';
import { model } from '../firebase';

// Helper function to convert a data URL to a GenerativePart
function dataUrlToGenerativePart(dataUrl: string, mimeType: string) {
  return {
    inlineData: {
      data: dataUrl.split(',')[1],
      mimeType
    },
  };
}

export default function ScreenAnalysisView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [captureWindowId, setCaptureWindowId] = useState<number | null>(null);
  const liveFeedRef = useRef<HTMLImageElement>(null);

  const analyzeFrame = useCallback(async (dataUrl: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const imagePart = dataUrlToGenerativePart(dataUrl, 'image/jpeg');
      const prompt = "Analyze this frame from a screen recording, which could be a video game or a web application. Describe the key elements, any visible text, and what action the user appears to be taking. Be concise.";
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      setAnalysisResult(response.text());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.type === 'video_frame_forward' && liveFeedRef.current) {
        liveFeedRef.current.src = request.dataUrl;
        analyzeFrame(request.dataUrl);
      } else if (request.type === 'capture_error') {
        setError(`Capture window error: ${request.error}`);
        setIsAnalyzing(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    const onWindowRemoved = (windowId: number) => {
      if (windowId === captureWindowId) {
        setIsAnalyzing(false);
        setCaptureWindowId(null);
      }
    };
    chrome.windows.onRemoved.addListener(onWindowRemoved);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.windows.onRemoved.removeListener(onWindowRemoved);
    };
  }, [captureWindowId, analyzeFrame]);

  const toggleAnalysis = async () => {
    if (isAnalyzing && captureWindowId) {
      chrome.windows.remove(captureWindowId);
      // The onWindowRemoved listener will handle state cleanup
    } else {
      setIsAnalyzing(true);
      setAnalysisResult('');
      setError(null);
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('capture.html'),
        type: 'popup',
        width: 420,
        height: 380,
      });
      setCaptureWindowId(window.id ?? null);
    }
  };


  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">Real-time Screen Analysis</h2>
        <p className="text-gray-400">The AI will describe what it sees from your selected tab or screen.</p>
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
        <div className="relative bg-black rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
          <img ref={liveFeedRef} className="w-full h-full object-contain" alt="Live screen feed will appear here" />
          {!isAnalyzing && <p className="absolute text-gray-400">Click "Start Analysis" to select a screen to share.</p>}
        </div>
        <div className="bg-gray-800 rounded-lg p-6 flex flex-col">
          <button
            onClick={toggleAnalysis}
            className={`w-full py-3 px-4 mb-4 rounded-lg text-white font-semibold transition-colors duration-200 ${
              isAnalyzing ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {isAnalyzing ? 'Stop Analysis' : 'Start Analysis'}
          </button>
          <div className="flex-1 overflow-y-auto">
            <h3 className="font-semibold text-lg mb-2">AI Output:</h3>
            {loading && <Loader text="Analyzing frame..." />}
            {error && <p className="text-red-400">{error}</p>}
            {!loading && analysisResult && <p className="text-gray-200 whitespace-pre-wrap">{analysisResult}</p>}
            {!loading && !analysisResult && !error && <p className="text-gray-500">Click "Start Analysis" to begin.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

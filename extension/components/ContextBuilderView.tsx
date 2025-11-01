import React, { useState, useEffect } from 'react';
import Loader from './Loader';
import { ChatMessage } from '../types';

interface Tab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

export default function ContextBuilderView() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<number>>(new Set());
  const [userPrompt, setUserPrompt] = useState('Summarize the key points from these pages.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatMessage | null>(null);

  useEffect(() => {
    // Fetch open tabs when the component mounts
    chrome.tabs.query({ currentWindow: true }, (openTabs) => {
      const filteredTabs = openTabs
        .filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://'))
        .map(tab => ({
          id: tab.id!,
          title: tab.title || 'Untitled',
          url: tab.url!,
          favIconUrl: tab.favIconUrl,
        }));
      setTabs(filteredTabs);
    });
  }, []);

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.type === 'synthesis_chunk') {
        setResult(prev => ({
          role: 'model',
          text: (prev?.text || '') + request.chunk,
        }));
      } else if (request.type === 'synthesis_end') {
        setLoading(false);
      } else if (request.type === 'synthesis_error') {
        setError(request.error);
        setLoading(false);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const handleTabSelection = (tabId: number) => {
    const newSelection = new Set(selectedTabs);
    if (newSelection.has(tabId)) {
      newSelection.delete(tabId);
    } else {
      newSelection.add(tabId);
    }
    setSelectedTabs(newSelection);
  };

  const handleSynthesize = async () => {
    if (selectedTabs.size === 0 || !userPrompt.trim()) {
      setError("Please select at least one tab and enter a prompt.");
      return;
    }

    const selectedTabObjects = tabs.filter(tab => selectedTabs.has(tab.id));
    const origins = Array.from(new Set(selectedTabObjects.map(tab => new URL(tab.url).origin + '/*')));

    try {
      const granted = await chrome.permissions.request({ origins });
      if (granted) {
        setLoading(true);
        setError(null);
        setResult(null);

        // Give Chrome a moment to propagate permissions to service worker context
        await new Promise(resolve => setTimeout(resolve, 100));

        // Now that permissions are granted and propagated, send the message.
        chrome.runtime.sendMessage({
          action: 'synthesize-multi-tab',
          tabIds: Array.from(selectedTabs),
          userPrompt: userPrompt,
          origins: origins, // Pass origins for verification
        });
      } else {
        setError("Permission to access tabs was denied.");
      }
    } catch (err) {
      setError(`An error occurred while requesting permissions: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 p-6">
      <header className="mb-4">
        <h2 className="text-xl font-semibold">Context Builder</h2>
        <p className="text-gray-400">Synthesize insights from multiple open tabs.</p>
      </header>
      <div className="flex flex-col flex-1 gap-4 overflow-hidden">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-300">1. Select tabs to use as context:</label>
          <div className="max-h-32 overflow-y-auto pr-2">
            {tabs.map(tab => (
              <div key={tab.id} className="flex items-center gap-2 p-1 rounded hover:bg-gray-700">
                <input
                  type="checkbox"
                  checked={selectedTabs.has(tab.id)}
                  onChange={() => handleTabSelection(tab.id)}
                  className="form-checkbox h-4 w-4 bg-gray-900 border-gray-600 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <img src={tab.favIconUrl} className="w-4 h-4" alt="" />
                <span className="text-sm text-gray-300 truncate">{tab.title}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="user-prompt" className="text-sm font-medium text-gray-300">2. What should I do with this context?</label>
          <input
            id="user-prompt"
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-gray-100"
            disabled={loading}
          />
        </div>

        <button onClick={handleSynthesize} disabled={loading} className="w-full py-3 px-4 rounded-lg text-white font-semibold transition-colors duration-200 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600">
          {loading ? 'Synthesizing...' : 'Synthesize'}
        </button>

        <div className="bg-gray-800 rounded-lg p-4 flex flex-col flex-1 border border-gray-700 overflow-y-auto">
          <h3 className="font-semibold text-lg mb-2">AI Synthesis:</h3>
          <div className="text-gray-200 whitespace-pre-wrap">
            {loading && !result && <Loader text="Scraping tabs and preparing context..." />}
            {error && <p className="text-red-400">{error}</p>}
            {result && <p>{result.text}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

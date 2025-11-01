
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { SendIcon } from './icons';
import Loader from './Loader';
import { model } from '../firebase'; // Import from central module

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofreadEnabled, setProofreadEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    let messageToSend = input;

    // BUILT-IN AI: Proofread if enabled
    if (proofreadEnabled) {
      try {
        if (typeof window !== 'undefined' && 'ai' in window && (window as any).ai?.proofreader) {
          console.log('[Chat] Using Proofreader API');
          const proofreader = await (window as any).ai.proofreader.create();
          const proofread = await proofreader.proofread(input);
          messageToSend = proofread;
          console.log('[Chat] Message proofread by Gemini Nano');
        }
      } catch (proofError) {
        console.log('[Chat] Proofreader not available:', proofError);
      }
    }

    const userMessage: ChatMessage = { role: 'user', text: messageToSend };
    setMessages((prev) => [...prev, userMessage, { role: 'model', text: '' }]);
    setLoading(true);
    setError(null);
    setInput('');

    try {
      const chat = model.startChat();
      const resultStream = await chat.sendMessageStream(messageToSend);

      for await (const chunk of resultStream.stream) {
        const chunkText = chunk.text();
        setMessages((prev) =>
          prev.map((msg, index) =>
            index === prev.length - 1 ? { ...msg, text: msg.text + chunkText } : msg
          )
        );
      }
    } catch (e) {
      console.error("AI Error:", e);
      setError(`AI Error: ${(e as Error).message}`);
      // Remove the empty model message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <header className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">AI Chat Assistant</h2>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={proofreadEnabled}
              onChange={(e) => setProofreadEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span>✓ Proofread (Gemini Nano)</span>
          </label>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex items-start gap-4 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0"></div>
            )}
            <div
              className={`max-w-xl p-4 rounded-xl whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-200'
              }`}
            >
              {msg.text}
              {msg.role === 'model' && loading && index === messages.length - 1 && (
                <div className="inline-block w-2 h-4 bg-white ml-2 animate-pulse-fast"></div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {error && <div className="px-6 pb-4 text-red-400">{error}</div>}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center bg-gray-800 rounded-lg p-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent outline-none px-2 text-gray-100 placeholder-gray-400"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            {loading ? <Loader text="" /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

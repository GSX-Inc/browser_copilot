import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { SendIcon } from './icons';
import Loader from './Loader';
import { model } from '../firebase';

interface DebuggingChatViewProps {
  networkData: any[];
  initialQuery: string;
  onExit: () => void;
}

// Helper to create a concise summary of the chat history
const summarizeHistory = (messages: ChatMessage[]): string => {
  return messages.map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`).join('\n');
};

export default function DebuggingChatView({ networkData, initialQuery, onExit }: DebuggingChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const sendQuery = async (query: string, isInitialQuery: boolean) => {
    setLoading(true);
    setError(null);

    const historySummary = isInitialQuery ? '' : `\n\n---
Previous Conversation:
${summarizeHistory(messages)}
---`;

    const prompt = `You are an expert web performance engineer acting as a helpful debugging assistant. Your primary source of truth is the JSON blob of network data provided below.

Your tasks are:
1.  Analyze and interpret the network data to answer the user's questions.
2.  If the user asks a meta-question about the tool itself (e.g., "What are you tracking?"), answer it based on the structure of the provided JSON data (e.g., "I am tracking the URL, status, and headers of network responses.").
3.  If the user asks a question that cannot be answered by the network data or the conversation history, politely state that the information is not available in the captured data.
4.  Do not answer questions that are off-topic from web performance or the provided data.

---
Captured Network Data:
${JSON.stringify(networkData, null, 2).substring(0, 7000)}
---${historySummary}

User's new question: "${query}"

Begin your response now.`;

    try {
      const resultStream = await model.generateContentStream(prompt);
      
      if (isInitialQuery) {
        setMessages([{ role: 'model', text: '' }]);
      }

      for await (const chunk of resultStream.stream) {
        const chunkText = chunk.text();
        setMessages((prev) =>
          prev.map((msg, index) =>
            index === prev.length - 1 ? { ...msg, text: msg.text + chunkText } : msg
          )
        );
      }
    } catch (e) {
      setError(`AI Error: ${(e as Error).message}`);
      if (!isInitialQuery) {
        setMessages((prev) => prev.slice(0, -1)); // Remove empty model message on error
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Send the initial query when the component mounts
    sendQuery(initialQuery, true);
  }, [networkData, initialQuery]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage, { role: 'model', text: '' }]);
    
    const currentInput = input;
    setInput('');
    
    sendQuery(currentInput, false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <header className="p-4 border-b border-gray-700 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Debugging Session</h2>
          <p className="text-sm text-gray-400">Ask follow-up questions about the captured network data.</p>
        </div>
        <button onClick={onExit} className="text-sm text-gray-400 hover:text-white hover:bg-gray-700 p-2 rounded">
          End Session
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0"></div>}
            <div className={`max-w-xl p-4 rounded-xl whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
              {msg.text}
              {msg.role === 'model' && loading && index === messages.length - 1 && <div className="inline-block w-2 h-4 bg-white ml-2 animate-pulse-fast"></div>}
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
            placeholder="Ask a follow-up question..."
            className="flex-1 bg-transparent outline-none px-2 text-gray-100 placeholder-gray-400"
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="p-2 rounded-md text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
            {loading ? <Loader text="" /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

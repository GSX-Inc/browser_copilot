import React, { useState, useEffect, useRef } from 'react';
import { VideoFrameData, VideoTranscript, VideoQA, VideoSummary, KinoSettings } from '../types';
import Loader from './Loader';
import Toast from './Toast';
import { speak, stopSpeaking, prepareTextForSpeech } from '../utils/speech-utils';

type KinoTab = 'live-qa' | 'transcript' | 'summary' | 'settings';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  show: boolean;
}

export default function KinoView() {
  const [activeTab, setActiveTab] = useState<KinoTab>('live-qa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', show: false });

  // Ref to access latest settings in message listener
  const settingsRef = useRef<KinoSettings>({
    frameRate: 1,
    enableTranscription: false,
    enableAudioDescription: false,
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceVolume: 1.0,
  });

  // Video capture state
  const [captureActive, setCaptureActive] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<VideoFrameData | null>(null);

  // Live Q&A state
  const [qaHistory, setQaHistory] = useState<VideoQA[]>([]);
  const [question, setQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');

  // Transcript state
  const [transcript, setTranscript] = useState<VideoTranscript[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Summary state
  const [videoUrl, setVideoUrl] = useState('');
  const [summary, setSummary] = useState<VideoSummary | null>(null);

  // Settings state
  const [settings, setSettings] = useState<KinoSettings>({
    frameRate: 1,
    enableTranscription: false,
    enableAudioDescription: false,
    voiceRate: 1.0,
    voicePitch: 1.0,
    voiceVolume: 1.0,
  });

  // Update ref whenever settings change
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, show: true });
  };

  useEffect(() => {
    // Initialize speech synthesis voices
    if (typeof speechSynthesis !== 'undefined') {
      // Load voices (sometimes needs time to populate)
      speechSynthesis.getVoices();

      // Listen for voices to be loaded
      speechSynthesis.addEventListener('voiceschanged', () => {
        console.log('[Kino] Speech voices loaded:', speechSynthesis.getVoices().length);
      });
    }

    // Load settings from storage
    chrome.storage.local.get(['kinoSettings'], (result) => {
      if (result.kinoSettings) {
        setSettings(result.kinoSettings);
      }
    });

    // Listen for messages from background script
    const messageListener = (request: any) => {
      if (request.type === 'kino-capture-started') {
        setCaptureActive(true);
        showToast('Video capture started', 'success');
      } else if (request.type === 'kino-capture-stopped') {
        setCaptureActive(false);
        showToast('Video capture stopped', 'info');
      } else if (request.type === 'kino-frame') {
        setCurrentFrame({
          dataUrl: request.frame,
          timestamp: request.timestamp,
          frameNumber: request.frameNumber
        });
      } else if (request.type === 'kino-qa-response') {
        setCurrentAnswer(request.answer);
        setLoading(false);
        const qa: VideoQA = {
          question: request.question,
          answer: request.answer,
          frameTimestamp: request.frameTimestamp,
          timestamp: Date.now()
        };
        setQaHistory(prev => [...prev, qa]);

        // Speak answer aloud if audio descriptions enabled (use ref for latest value)
        const currentSettings = settingsRef.current;
        console.log('[Kino] Audio description enabled:', currentSettings.enableAudioDescription);
        if (currentSettings.enableAudioDescription) {
          console.log('[Kino] Preparing to speak answer...');
          const speechText = prepareTextForSpeech(request.answer);
          console.log('[Kino] Speech text prepared:', speechText);
          console.log('[Kino] Voice settings:', {
            rate: currentSettings.voiceRate,
            pitch: currentSettings.voicePitch,
            volume: currentSettings.voiceVolume
          });
          speak(speechText, {
            rate: currentSettings.voiceRate,
            pitch: currentSettings.voicePitch,
            volume: currentSettings.voiceVolume
          });
          console.log('[Kino] speak() function called');
        } else {
          console.log('[Kino] Audio descriptions disabled, not speaking');
        }
      } else if (request.type === 'kino-transcript-chunk') {
        const transcript: VideoTranscript = {
          timestamp: request.timestamp,
          text: request.text,
          confidence: request.confidence
        };
        setTranscript(prev => [...prev, transcript]);
      } else if (request.type === 'kino-summary-complete') {
        setSummary(request.summary);
        setLoading(false);
        showToast('Video summary generated!', 'success');
      } else if (request.type === 'kino-error') {
        setError(request.error);
        setLoading(false);
        showToast(request.error, 'error');
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []); // Empty deps - use state updater functions to access latest values

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const toggleCapture = () => {
    if (captureActive) {
      chrome.runtime.sendMessage({ action: 'stop-video-capture' });
    } else {
      chrome.runtime.sendMessage({ action: 'start-video-capture' });
    }
  };

  const askQuestion = () => {
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (!currentFrame) {
      setError('No video frame available. Start video capture first.');
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentAnswer('');

    chrome.runtime.sendMessage({
      action: 'kino-analyze-frame',
      payload: {
        frame: currentFrame.dataUrl,
        question: question,
        timestamp: currentFrame.timestamp
      }
    });
  };

  const summarizeVideo = () => {
    if (!videoUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    // Validate URL
    try {
      new URL(videoUrl);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setLoading(true);
    setError(null);
    setSummary(null);

    chrome.runtime.sendMessage({
      action: 'kino-summarize-video',
      payload: { videoUrl }
    });
  };

  const saveSettings = () => {
    chrome.storage.local.set({ kinoSettings: settings }, () => {
      showToast('Settings saved', 'success');
    });
  };

  const TabButton = ({ tab, label }: { tab: KinoTab; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 font-medium transition-colors ${
        activeTab === tab
          ? 'text-indigo-400 border-b-2 border-indigo-400'
          : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <header className="p-4 border-b border-gray-700">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Kino - Video Intelligence Engine</h2>
          <p className="text-sm text-gray-400 mt-1">Deep AI analysis and summarization for video content</p>
        </div>

        {/* Live Capture Control - Prominent placement */}
        <div className="mb-4">
          <button
            onClick={toggleCapture}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
              captureActive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg'
            }`}
          >
            {captureActive ? (
              <>
                <span>⏹</span>
                <span>Stop Live Capture</span>
              </>
            ) : (
              <>
                <span>🎬</span>
                <span>Start Live Video Capture</span>
              </>
            )}
          </button>
          {captureActive && (
            <p className="text-xs text-green-400 mt-2 text-center flex items-center justify-center gap-1">
              <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span>LIVE - Capturing video at 1fps</span>
            </p>
          )}
          {!captureActive && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Click to capture live video from current tab - Ask questions in real-time!
            </p>
          )}
        </div>

        <div className="flex gap-2 border-b border-gray-700">
          <TabButton tab="live-qa" label="Live Q&A" />
          <TabButton tab="summary" label="Video Summary" />
          <TabButton tab="transcript" label="Transcript" />
          <TabButton tab="settings" label="About" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Live Q&A Tab - Frame-based */}
        {activeTab === 'live-qa' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Live Video Q&A</h3>
              <p className="text-gray-400 mb-4">Ask questions about the video playing right now!</p>

              {currentFrame && captureActive && (
                <div className="mb-4">
                  <p className="text-sm text-gray-400 mb-2">Current Frame (updates every second):</p>
                  <img
                    src={currentFrame.dataUrl}
                    alt="Current video frame"
                    className="w-full h-48 object-contain rounded-lg bg-gray-700 border-2 border-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                    <span>Frame #{currentFrame.frameNumber}</span>
                    <span>{new Date(currentFrame.timestamp).toLocaleTimeString()}</span>
                  </p>
                </div>
              )}

              {!captureActive && (
                <div className="text-center p-8 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border-2 border-dashed border-indigo-500/50">
                  <svg className="w-20 h-20 mx-auto mb-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-300 mb-2 font-semibold">No Live Capture Active</p>
                  <p className="text-gray-500 text-sm mb-4">Click "Start Live Video Capture" above to begin</p>
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 text-left">
                    <p className="text-blue-200 text-xs font-semibold mb-1">📝 How it works:</p>
                    <ul className="text-blue-300 text-xs space-y-1 list-disc list-inside">
                      <li>Opens screen picker (choose the tab with video)</li>
                      <li>Captures video at 1 frame per second</li>
                      <li>Ask AI questions about what's happening live!</li>
                      <li>Perfect for tutorials, streams, lectures</li>
                    </ul>
                  </div>
                </div>
              )}

              {captureActive && (
                <div className="space-y-3">
                  {/* Audio Description Toggle */}
                  <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={settings.enableAudioDescription}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          console.log('[Kino UI] Audio checkbox clicked, new value:', enabled);
                          const newSettings = { ...settings, enableAudioDescription: enabled };
                          setSettings(newSettings);

                          // Save with the new settings value
                          chrome.storage.local.set({ kinoSettings: newSettings }, () => {
                            console.log('[Kino UI] Settings saved with audio:', enabled);
                            if (enabled) {
                              showToast('🔊 Audio descriptions enabled - answers will be spoken aloud', 'success');
                            } else {
                              stopSpeaking();
                              showToast('Audio descriptions disabled', 'info');
                            }
                          });
                        }}
                        className="w-4 h-4"
                        id="audio-desc-toggle"
                      />
                      <label htmlFor="audio-desc-toggle" className="text-purple-200 font-semibold flex-1 cursor-pointer">
                        🔊 Enable Audio Descriptions (Accessibility)
                      </label>
                      {settings.enableAudioDescription && (
                        <button
                          onClick={() => stopSpeaking()}
                          className="px-2 py-1 bg-purple-800 hover:bg-purple-700 rounded text-xs"
                        >
                          Stop Speaking
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-purple-300 mt-1 ml-7">
                      AI answers will be read aloud - perfect for visually impaired users or hands-free learning
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setQuestion("What's happening in this video right now?")}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-indigo-600 text-sm rounded-lg transition-colors"
                    >
                      What's happening?
                    </button>
                    <button
                      onClick={() => setQuestion("Describe the main subject in this frame")}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-indigo-600 text-sm rounded-lg transition-colors"
                    >
                      Describe subject
                    </button>
                    <button
                      onClick={() => setQuestion("What text is visible on screen?")}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-indigo-600 text-sm rounded-lg transition-colors"
                    >
                      Read text
                    </button>
                    <button
                      onClick={() => setQuestion("What are they explaining?")}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-indigo-600 text-sm rounded-lg transition-colors"
                    >
                      What's being taught?
                    </button>
                  </div>

                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && askQuestion()}
                    placeholder="Or ask your own question..."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400 resize-none h-20"
                  />
                  <button
                    onClick={askQuestion}
                    disabled={loading || !question.trim() || !currentFrame}
                    className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                  >
                    {loading ? 'Analyzing Current Frame...' : '🎯 Ask About This Frame'}
                  </button>

                  {settings.enableAudioDescription && (
                    <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-200 text-xs flex items-center gap-2">
                      <svg className="w-5 h-5 flex-shrink-0 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                      </svg>
                      <span>Audio descriptions active - Answers will be spoken aloud (Rate: {settings.voiceRate}x)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {loading && <Loader text="Analyzing video frame with AI..." />}

            {/* Q&A History */}
            {qaHistory.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-3">Q&A History</h4>
                <div className="space-y-4">
                  {qaHistory.slice().reverse().map((qa, i) => (
                    <div key={i} className="bg-gray-700 p-3 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">{new Date(qa.timestamp).toLocaleTimeString()}</p>
                      <p className="text-sm text-indigo-400 font-medium mb-2">Q: {qa.question}</p>
                      <p className="text-gray-200 whitespace-pre-wrap">{qa.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transcript Tab */}
        {activeTab === 'transcript' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Video Transcript Extraction</h3>
              <p className="text-gray-400 mb-4">Extract and analyze transcript from video URLs.</p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400"
                />
                <button
                  onClick={() => {
                    if (!videoUrl.trim()) {
                      setError('Please enter a video URL');
                      return;
                    }
                    setLoading(true);
                    chrome.runtime.sendMessage({
                      action: 'kino-extract-transcript',
                      payload: { videoUrl }
                    });
                  }}
                  disabled={loading || !videoUrl.trim()}
                  className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                >
                  {loading ? 'Extracting...' : 'Extract Transcript'}
                </button>
              </div>

              {transcript.length > 0 && (
                <div className="mt-4 bg-gray-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                  {transcript.map((entry, i) => (
                    <div key={i} className="mb-3">
                      <span className="text-xs text-gray-500">
                        [{new Date(entry.timestamp).toLocaleTimeString()}]
                      </span>
                      <p className="text-gray-200">{entry.text}</p>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}

              {transcript.length > 0 && (
                <button
                  onClick={() => {
                    const text = transcript.map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.text}`).join('\n');
                    navigator.clipboard.writeText(text);
                    showToast('Transcript copied to clipboard', 'success');
                  }}
                  className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Copy Transcript
                </button>
              )}

              <div className="mt-4 p-3 bg-purple-900/30 border border-purple-700 rounded-lg text-purple-200 text-sm">
                <p className="font-semibold mb-1">🎯 Coming Soon: Live Transcription</p>
                <p className="text-xs">Real-time speech-to-text during video playback will be added in the next update!</p>
              </div>
            </div>
          </div>
        )}

        {/* Video Summary Tab */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Deep Video Analysis</h3>
              <p className="text-gray-400 mb-4">Analyze an entire video from a URL (YouTube, Vimeo, etc.)</p>

              <div className="space-y-3">
                <input
                  type="text"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400"
                />
                <button
                  onClick={summarizeVideo}
                  disabled={loading || !videoUrl.trim()}
                  className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                >
                  {loading ? 'Analyzing...' : 'Summarize Video'}
                </button>
              </div>
            </div>

            {loading && <Loader text="Analyzing entire video with AI..." />}

            {summary && (
              <div className="space-y-4">
                {/* Outline */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-lg font-semibold mb-3">Video Outline</h4>
                  <div className="space-y-2">
                    {summary.outline.map((item, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-indigo-400 font-mono text-sm">{item.time}</span>
                        <span className="text-gray-200">{item.topic}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Key Insights */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-lg font-semibold mb-3">Key Insights</h4>
                  <ul className="space-y-2">
                    {summary.insights.map((insight, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="text-indigo-400">•</span>
                        <span className="text-gray-200">{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Concepts */}
                {Object.keys(summary.concepts).length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h4 className="text-lg font-semibold mb-3">Key Concepts</h4>
                    <div className="space-y-3">
                      {Object.entries(summary.concepts).map(([concept, definition], i) => (
                        <div key={i}>
                          <p className="font-semibold text-indigo-400">{concept}</p>
                          <p className="text-gray-300 text-sm">{definition}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => {
                    const markdown = `# Video Summary\n\n## Outline\n${summary.outline.map(o => `- ${o.time}: ${o.topic}`).join('\n')}\n\n## Insights\n${summary.insights.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`;
                    navigator.clipboard.writeText(markdown);
                    showToast('Summary copied as markdown', 'success');
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Export as Markdown
                </button>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* Voice Settings */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Voice Settings (Accessibility)</h3>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
                    <span>Voice Speed: {settings.voiceRate.toFixed(1)}x</span>
                    <span className="text-xs text-gray-500">
                      {settings.voiceRate < 0.8 ? 'Slow' : settings.voiceRate > 1.5 ? 'Fast' : 'Normal'}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.voiceRate}
                    onChange={(e) => setSettings({ ...settings, voiceRate: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Adjust how fast AI answers are spoken (0.5x = very slow, 2x = very fast)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
                    <span>Voice Pitch: {settings.voicePitch.toFixed(1)}</span>
                    <span className="text-xs text-gray-500">
                      {settings.voicePitch < 0.8 ? 'Low' : settings.voicePitch > 1.5 ? 'High' : 'Normal'}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.voicePitch}
                    onChange={(e) => setSettings({ ...settings, voicePitch: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Change voice pitch for different sound (0 = low, 2 = high)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center justify-between">
                    <span>Volume: {Math.round(settings.voiceVolume * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.voiceVolume}
                    onChange={(e) => setSettings({ ...settings, voiceVolume: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Adjust audio volume (0% = muted, 100% = full volume)
                  </p>
                </div>

                <button
                  onClick={() => {
                    saveSettings();
                    // Test the voice
                    const testText = `Voice test. Speed ${settings.voiceRate} times. Pitch ${settings.voicePitch}. Volume ${Math.round(settings.voiceVolume * 100)} percent.`;
                    speak(testText, {
                      rate: settings.voiceRate,
                      pitch: settings.voicePitch,
                      volume: settings.voiceVolume
                    });
                    showToast('Settings saved! Playing voice test...', 'success');
                  }}
                  className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors"
                >
                  💾 Save Settings & Test Voice
                </button>
              </div>
            </div>

            {/* About */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">About Kino</h3>

              <div className="space-y-4 text-gray-300">
                <div>
                  <h4 className="font-semibold text-indigo-400 mb-2">Current Features</h4>
                  <ul className="space-y-1 text-sm list-disc list-inside">
                    <li>✅ Live video capture & frame analysis (1fps)</li>
                    <li>✅ Real-time Q&A about video content</li>
                    <li>✅ Audio descriptions for accessibility (spoken answers)</li>
                    <li>✅ Comprehensive video URL summarization</li>
                    <li>✅ Hierarchical outline with timestamps</li>
                    <li>✅ Key insights and concepts extraction</li>
                    <li>✅ Transcript extraction from URLs</li>
                  </ul>
                </div>

                <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
                  <p className="font-semibold text-purple-200 mb-1">♿ Accessibility Impact</p>
                  <p className="text-xs text-purple-300">
                    Kino makes video content accessible to visually impaired users by:
                    <br/>• Describing what's visible in each frame
                    <br/>• Reading answers aloud with customizable voice
                    <br/>• Providing context without needing to see the screen
                  </p>
                </div>

                <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <p className="font-semibold text-blue-200 mb-1">💡 Pro Tip</p>
                  <p className="text-xs text-blue-300">
                    Combine Kino with <strong>Screen Analysis</strong> for maximum flexibility!
                    Screen Analysis offers an alternative video capture method if needed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notifications */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, show: false })}
          duration={3000}
        />
      )}
    </div>
  );
}

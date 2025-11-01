import React, { useState, useEffect } from 'react';
import { PerformanceMetrics, PerformanceBottleneck, CodeFix, NexusAnalysis } from '../types';
import Loader from './Loader';
import Toast from './Toast';

type NexusTab = 'analysis' | 'metrics' | 'fixes' | 'about';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  show: boolean;
}

export default function NexusView() {
  const [activeTab, setActiveTab] = useState<NexusTab>('analysis');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', show: false });

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<NexusAnalysis | null>(null);
  const [previewActive, setPreviewActive] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, show: true });
  };

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.type === 'nexus-analysis-started') {
        setAnalyzing(true);
        showToast('Performance analysis started', 'info');
      } else if (request.type === 'nexus-analysis-complete') {
        setAnalysis(request.analysis);
        setAnalyzing(false);
        setLoading(false);
        showToast('Analysis complete - bottleneck identified!', 'success');
      } else if (request.type === 'nexus-preview-active') {
        setPreviewActive(true);
        showToast('Code fix preview applied to page', 'success');
      } else if (request.type === 'nexus-preview-reverted') {
        setPreviewActive(false);
        showToast('Preview reverted', 'info');
      } else if (request.type === 'nexus-error') {
        setError(request.error);
        setAnalyzing(false);
        setLoading(false);
        showToast(request.error, 'error');
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const startAnalysis = () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    chrome.runtime.sendMessage({ action: 'nexus-analyze-performance' });
  };

  const previewFix = () => {
    if (!analysis?.codeFix) return;
    chrome.runtime.sendMessage({
      action: 'nexus-preview-fix',
      payload: { fix: analysis.codeFix }
    });
  };

  const revertPreview = () => {
    chrome.runtime.sendMessage({ action: 'nexus-revert-preview' });
  };

  const getSeverityColor = (severity: string) => {
    return severity === 'critical' ? 'bg-red-600' :
           severity === 'major' ? 'bg-orange-600' : 'bg-yellow-600';
  };

  const getMetricColor = (value: number | null, thresholds: {good: number, needsImprovement: number}) => {
    if (value === null) return 'text-gray-400';
    if (value <= thresholds.good) return 'text-green-400';
    if (value <= thresholds.needsImprovement) return 'text-yellow-400';
    return 'text-red-400';
  };

  const TabButton = ({ tab, label }: { tab: NexusTab; label: string }) => (
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
          <h2 className="text-xl font-semibold">Nexus - AI Performance Engineer</h2>
          <p className="text-sm text-gray-400 mt-1">Autonomous performance optimization with agentic AI</p>
        </div>

        <button
          onClick={startAnalysis}
          disabled={loading || analyzing}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors mb-4 flex items-center justify-center gap-2 ${
            analyzing
              ? 'bg-yellow-600 text-white cursor-wait'
              : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg'
          }`}
        >
          {analyzing ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Analyzing Performance...</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Analyze Page Performance</span>
            </>
          )}
        </button>

        <div className="flex gap-2 border-b border-gray-700">
          <TabButton tab="analysis" label="AI Analysis" />
          <TabButton tab="metrics" label="Metrics" />
          <TabButton tab="fixes" label="Code Fixes" />
          <TabButton tab="about" label="About" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* AI Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            {!analysis && !analyzing && (
              <div className="text-center p-12 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border-2 border-dashed border-green-500/50">
                <svg className="w-24 h-24 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-gray-300 mb-2 font-semibold text-lg">Ready to Optimize</p>
                <p className="text-gray-500 text-sm mb-4">Click "Analyze Page Performance" to begin</p>
                <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-left max-w-md mx-auto">
                  <p className="text-blue-200 text-sm font-semibold mb-2">🤖 How Nexus Works:</p>
                  <ul className="text-blue-300 text-xs space-y-1 list-disc list-inside">
                    <li>Analyzes current page with AI</li>
                    <li>Identifies primary performance bottleneck</li>
                    <li>Explains root cause with reasoning</li>
                    <li>Generates optimized code fix</li>
                    <li>Preview fix live on page!</li>
                  </ul>
                </div>
              </div>
            )}

            {analyzing && (
              <div className="text-center p-12">
                <Loader text="AI is analyzing page performance..." />
                <p className="text-gray-400 text-sm mt-4">Identifying bottlenecks and generating fixes...</p>
              </div>
            )}

            {analysis && (
              <div className="space-y-4">
                {/* Bottleneck Card */}
                <div className="bg-gray-800 rounded-lg p-6 border-l-4 border-red-500">
                  <div className="flex items-start gap-3 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getSeverityColor(analysis.bottleneck.severity)}`}>
                      {analysis.bottleneck.severity.toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-1">Primary Bottleneck Identified</h3>
                      <p className="text-lg text-red-400">{analysis.bottleneck.description}</p>
                    </div>
                  </div>

                  {analysis.bottleneck.element && (
                    <div className="mb-3 p-3 bg-gray-700 rounded font-mono text-sm text-gray-300">
                      <span className="text-gray-500">Element: </span>{analysis.bottleneck.element}
                    </div>
                  )}

                  <div className="p-4 bg-orange-900/30 border border-orange-700 rounded-lg">
                    <p className="text-orange-200 font-semibold mb-1">⚠️ Performance Impact:</p>
                    <p className="text-orange-300 text-sm">{analysis.bottleneck.impact}</p>
                  </div>
                </div>

                {/* AI Reasoning */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <span>🤖</span>
                    <span>AI Reasoning</span>
                  </h4>
                  <div className="text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {analysis.reasoning}
                  </div>
                </div>

                {/* Metrics Summary */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h4 className="text-lg font-semibold mb-3">Performance Metrics</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-400">LCP (Largest Contentful Paint)</p>
                      <p className={`text-2xl font-bold ${getMetricColor(analysis.metrics.lcp, {good: 2500, needsImprovement: 4000})}`}>
                        {analysis.metrics.lcp ? `${(analysis.metrics.lcp / 1000).toFixed(2)}s` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Overall Score</p>
                      <p className={`text-2xl font-bold ${
                        analysis.metrics.score >= 90 ? 'text-green-400' :
                        analysis.metrics.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {analysis.metrics.score}/100
                      </p>
                    </div>
                  </div>
                </div>

                {analysis.codeFix ? (
                  <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-700 rounded-lg p-4">
                    <p className="text-green-200 font-semibold mb-2">✅ Code fix generated! View in "Code Fixes" tab</p>
                    <button
                      onClick={() => setActiveTab('fixes')}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-white font-semibold transition-colors"
                    >
                      View & Preview Fix →
                    </button>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-700 rounded-lg p-4">
                    <p className="text-green-200 font-semibold mb-2">🎉 Excellent Performance!</p>
                    <p className="text-green-300 text-sm">
                      No code fixes needed - this page is already well-optimized.
                      {analysis.metrics.score >= 90 && ' Great job! '}
                      Consider running Nexus on other pages that may need improvement.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Core Web Vitals</h3>

              {analysis?.metrics ? (
                <div className="space-y-6">
                  <div className="border-b border-gray-700 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">LCP (Largest Contentful Paint)</span>
                      <span className={`text-2xl font-bold ${getMetricColor(analysis.metrics.lcp, {good: 2500, needsImprovement: 4000})}`}>
                        {analysis.metrics.lcp ? `${(analysis.metrics.lcp / 1000).toFixed(2)}s` : 'N/A'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          (analysis.metrics.lcp || 0) <= 2500 ? 'bg-green-500' :
                          (analysis.metrics.lcp || 0) <= 4000 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, ((analysis.metrics.lcp || 0) / 4000) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Good: {'<'}2.5s | Needs Improvement: 2.5-4s | Poor: {'>'}4s</p>
                  </div>

                  <div className="border-b border-gray-700 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">FCP (First Contentful Paint)</span>
                      <span className={`text-2xl font-bold ${getMetricColor(analysis.metrics.fcp, {good: 1800, needsImprovement: 3000})}`}>
                        {analysis.metrics.fcp ? `${(analysis.metrics.fcp / 1000).toFixed(2)}s` : 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Good: {'<'}1.8s | Needs Improvement: 1.8-3s | Poor: {'>'}3s</p>
                  </div>

                  <div className="border-b border-gray-700 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">CLS (Cumulative Layout Shift)</span>
                      <span className={`text-2xl font-bold ${
                        (analysis.metrics.cls || 0) <= 0.1 ? 'text-green-400' :
                        (analysis.metrics.cls || 0) <= 0.25 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {analysis.metrics.cls !== null ? analysis.metrics.cls.toFixed(3) : 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Good: {'<'}0.1 | Needs Improvement: 0.1-0.25 | Poor: {'>'}0.25</p>
                  </div>

                  <div className="p-4 bg-indigo-900/30 border border-indigo-700 rounded-lg">
                    <p className="text-indigo-200 font-semibold mb-1">Overall Performance Score</p>
                    <p className={`text-4xl font-bold ${
                      analysis.metrics.score >= 90 ? 'text-green-400' :
                      analysis.metrics.score >= 50 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {analysis.metrics.score}/100
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-center text-gray-400 py-8">No analysis data yet. Run an analysis to see metrics.</p>
              )}
            </div>
          </div>
        )}

        {/* Code Fixes Tab */}
        {activeTab === 'fixes' && (
          <div className="space-y-4">
            {analysis?.codeFix ? (
              <>
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-3">AI-Generated Code Fix</h3>

                  <div className="mb-4">
                    <p className="text-sm text-gray-400 mb-2">Language: {analysis.codeFix.language.toUpperCase()}</p>
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 overflow-x-auto">
                      <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                        {analysis.codeFix.code}
                      </pre>
                    </div>
                  </div>

                  <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                    <p className="text-blue-200 font-semibold mb-2">💡 Why This Fix Works:</p>
                    <p className="text-blue-300 text-sm whitespace-pre-wrap">{analysis.codeFix.explanation}</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={previewActive ? revertPreview : previewFix}
                      className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                        previewActive
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-green-600 hover:bg-green-500 text-white'
                      }`}
                    >
                      {previewActive ? '↩️ Revert Preview' : '🔍 Preview Fix on Page'}
                    </button>
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(analysis.codeFix!.code);
                        showToast('Code copied to clipboard!', 'success');
                      }}
                      className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
                    >
                      📋 Copy Code
                    </button>
                  </div>

                  {previewActive && (
                    <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200 text-sm">
                      ⚠️ Preview mode active. Reload page to fully remove changes.
                    </div>
                  )}
                </div>

                {analysis.codeFix.alternativeFixes && analysis.codeFix.alternativeFixes.length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h4 className="text-lg font-semibold mb-3">Alternative Approaches</h4>
                    <div className="space-y-3">
                      {analysis.codeFix.alternativeFixes.map((alt, i) => (
                        <div key={i} className="bg-gray-700 p-4 rounded-lg">
                          <p className="text-sm text-gray-400 mb-2">Option {i + 2}:</p>
                          <pre className="text-xs text-green-400 font-mono mb-2 whitespace-pre-wrap">
                            {alt.code}
                          </pre>
                          <p className="text-xs text-gray-300">{alt.explanation}</p>
                          <p className="text-xs text-yellow-400 mt-1">Trade-offs: {alt.tradeoffs}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-8 bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700">
                <p className="text-gray-400">No code fixes available yet. Run an analysis first.</p>
              </div>
            )}
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">About Nexus</h3>

              <div className="space-y-4 text-gray-300">
                <div>
                  <h4 className="font-semibold text-green-400 mb-2">Agentic Performance Engineering</h4>
                  <p className="text-sm">
                    Nexus is an autonomous AI agent that acts as your personal frontend performance engineer.
                    It perceives performance issues, reasons about root causes, and acts by generating optimized code fixes.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-green-400 mb-2">Current Capabilities</h4>
                  <ul className="space-y-1 text-sm list-disc list-inside">
                    <li>Autonomous page performance analysis</li>
                    <li>AI-powered bottleneck identification</li>
                    <li>Root cause reasoning with explanations</li>
                    <li>Production-ready code fix generation</li>
                    <li>Live code preview with one click</li>
                    <li>Core Web Vitals measurement (LCP, FCP, CLS)</li>
                  </ul>
                </div>

                <div className="p-4 bg-purple-900/30 border border-purple-700 rounded-lg">
                  <p className="font-semibold text-purple-200 mb-1">🧠 Agentic AI Architecture</p>
                  <p className="text-xs text-purple-300">
                    <strong>Perceive:</strong> Analyzes page performance data
                    <br/><strong>Reason:</strong> Uses Gemini AI to identify root causes
                    <br/><strong>Act:</strong> Generates and previews optimized code
                  </p>
                </div>

                <div className="p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                  <p className="font-semibold text-blue-200 mb-1">⚡ Performance Focus Areas</p>
                  <ul className="text-xs text-blue-300 space-y-1 list-disc list-inside">
                    <li>Render-blocking resources (CSS, JavaScript)</li>
                    <li>Large unoptimized images</li>
                    <li>Slow network requests</li>
                    <li>Layout shift issues</li>
                    <li>Long-running JavaScript tasks</li>
                  </ul>
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

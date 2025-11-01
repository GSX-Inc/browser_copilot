import React, { useState, useEffect } from 'react';
import { AccessibilityIssue, AuditResult, CapturedElement, ColorPalette } from '../types';
import Loader from './Loader';
import Toast from './Toast';
import { exportAsCSS, exportAsSCSS, exportAsJS, exportAsTailwind, copyToClipboard, downloadAsFile } from '../utils/css-export';

type CanvasTab = 'audit' | 'capture' | 'analysis' | 'generator';
type ExportFormat = 'css' | 'scss' | 'js' | 'tailwind';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  show: boolean;
}

export default function CanvasView() {
  const [activeTab, setActiveTab] = useState<CanvasTab>('audit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', show: false });

  // Audit state
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  // Capture state
  const [capturedElements, setCapturedElements] = useState<CapturedElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<CapturedElement | null>(null);
  const [captureMode, setCaptureMode] = useState(false);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [aiEnhancedSuggestions, setAiEnhancedSuggestions] = useState<{[key: number]: string}>({});

  // Generator state
  const [generatedPalette, setGeneratedPalette] = useState<ColorPalette | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Helper to show toast notifications
  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, show: true });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'a' && e.shiftKey) {
        e.preventDefault();
        setActiveTab('audit');
      } else if (e.key === 'c' && e.shiftKey) {
        e.preventDefault();
        setActiveTab('capture');
      } else if (e.key === 'd' && e.shiftKey) {
        e.preventDefault();
        setActiveTab('analysis');
      } else if (e.key === 'g' && e.shiftKey) {
        e.preventDefault();
        setActiveTab('generator');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  useEffect(() => {
    // Listen for messages from background script
    const messageListener = (request: any) => {
      if (request.type === 'canvas-audit-complete') {
        setAuditResult(request.result);
        setLoading(false);
        showToast(`Audit complete: ${request.result.issues.length} issues found`, 'success');
      } else if (request.type === 'canvas-element-captured') {
        const newElement: CapturedElement = {
          id: `element-${Date.now()}`,
          dataUrl: request.image,
          metadata: request.metadata,
          timestamp: Date.now(),
        };
        setCapturedElements(prev => [...prev, newElement]);
        setSelectedElement(newElement);
        setCaptureMode(false);
        showToast('Element captured successfully!', 'success');
        setActiveTab('capture'); // Auto-switch to capture tab to see result
      } else if (request.type === 'canvas-analysis-result') {
        setAnalysisResult(request.result);
        setLoading(false);
        showToast('AI analysis complete', 'success');
      } else if (request.type === 'canvas-palette-generated') {
        setGeneratedPalette(request.palette);
        setLoading(false);
        showToast('Color palette generated!', 'success');
      } else if (request.type === 'canvas-error') {
        setError(request.error);
        setLoading(false);
        showToast(request.error, 'error');
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const startAccessibilityAudit = () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({
      action: 'start-accessibility-audit'
    });
  };

  const startElementCapture = async () => {
    try {
      // Get current tab to request permission
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) {
        setError('No active tab found');
        return;
      }

      const origin = new URL(tab.url).origin + '/*';

      // Request permission for current tab
      const granted = await chrome.permissions.request({ origins: [origin] });

      if (granted) {
        // Small delay to ensure permissions propagate
        await new Promise(resolve => setTimeout(resolve, 200));

        setCaptureMode(true);
        chrome.runtime.sendMessage({
          action: 'start-element-capture'
        });

        // Show success toast
        showToast('Capture mode starting - watch for overlay on page', 'info');
      } else {
        setError('Permission denied to access this page');
      }
    } catch (err) {
      setError(`Failed to start capture: ${(err as Error).message}`);
    }
  };

  const stopCapture = () => {
    setCaptureMode(false);
    chrome.runtime.sendMessage({
      action: 'stop-capture'
    });
  };

  const analyzeElement = () => {
    if (!selectedElement || !analysisPrompt.trim()) {
      setError('Please select an element and enter a prompt');
      return;
    }
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({
      action: 'analyze-element',
      payload: {
        image: selectedElement.dataUrl,
        prompt: analysisPrompt
      }
    });
  };

  const generatePalette = () => {
    if (!selectedElement) {
      setError('Please capture an element first');
      return;
    }
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({
      action: 'generate-palette',
      payload: {
        image: selectedElement.dataUrl
      }
    });
  };

  const togglePreview = () => {
    if (previewActive) {
      chrome.runtime.sendMessage({ action: 'remove-css-preview' });
      setPreviewActive(false);
    } else if (generatedPalette) {
      const css = generateCSSFromPalette(generatedPalette);
      chrome.runtime.sendMessage({
        action: 'inject-css',
        payload: { css }
      });
      setPreviewActive(true);
    }
  };

  const generateCSSFromPalette = (palette: ColorPalette): string => {
    // Find the primary, secondary, accent, neutral, and background colors
    const primary = palette.colors.find(c => c.role === 'primary')?.hex || palette.colors[0]?.hex;
    const secondary = palette.colors.find(c => c.role === 'secondary')?.hex || palette.colors[1]?.hex;
    const accent = palette.colors.find(c => c.role === 'accent')?.hex || palette.colors[2]?.hex;
    const neutral = palette.colors.find(c => c.role === 'neutral')?.hex || palette.colors[3]?.hex;
    const background = palette.colors.find(c => c.role === 'background')?.hex || palette.colors[4]?.hex;

    // Generate CSS that actually applies these colors to common elements
    return `
/* Canvas AI-Generated Color Palette Preview */
:root {
${palette.colors.map((c, i) => `  --canvas-${c.role}: ${c.hex};`).join('\n')}
}

/* Apply to common elements for preview */
a, .link, [class*="link"] {
  color: ${primary} !important;
}

button, .button, .btn, [class*="button"], [class*="btn"] {
  background-color: ${primary} !important;
  border-color: ${primary} !important;
}

.secondary, [class*="secondary"] {
  background-color: ${secondary} !important;
  border-color: ${secondary} !important;
}

h1, h2, h3, h4, h5, h6 {
  color: ${accent} !important;
}

nav, header, footer, [role="navigation"] {
  background-color: ${background} !important;
}

/* Borders and dividers */
hr, .divider, [class*="border"] {
  border-color: ${neutral} !important;
}

/* Text elements */
.text-primary {
  color: ${primary} !important;
}

.bg-primary {
  background-color: ${primary} !important;
}

/* Note: This is a live preview. Reload page to remove changes. */
`.trim();
  };

  const handleExport = async (format: ExportFormat) => {
    if (!generatedPalette) return;

    let content = '';
    let filename = '';

    switch (format) {
      case 'css':
        content = exportAsCSS(generatedPalette);
        filename = 'palette.css';
        break;
      case 'scss':
        content = exportAsSCSS(generatedPalette);
        filename = 'palette.scss';
        break;
      case 'js':
        content = exportAsJS(generatedPalette);
        filename = 'palette.js';
        break;
      case 'tailwind':
        content = exportAsTailwind(generatedPalette);
        filename = 'tailwind.config.js';
        break;
    }

    await copyToClipboard(content);
    showToast(`${format.toUpperCase()} copied to clipboard!`, 'success');
    setShowExportMenu(false);
  };

  const handleDownload = (format: ExportFormat) => {
    if (!generatedPalette) return;

    let content = '';
    let filename = '';
    let mimeType = 'text/plain';

    switch (format) {
      case 'css':
        content = exportAsCSS(generatedPalette);
        filename = 'palette.css';
        mimeType = 'text/css';
        break;
      case 'scss':
        content = exportAsSCSS(generatedPalette);
        filename = 'palette.scss';
        mimeType = 'text/plain';
        break;
      case 'js':
        content = exportAsJS(generatedPalette);
        filename = 'palette.js';
        mimeType = 'text/javascript';
        break;
      case 'tailwind':
        content = exportAsTailwind(generatedPalette);
        filename = 'tailwind.config.js';
        mimeType = 'text/javascript';
        break;
    }

    downloadAsFile(content, filename, mimeType);
    showToast(`${filename} downloaded!`, 'success');
    setShowExportMenu(false);
  };

  const handleQuickPrompt = (prompt: string) => {
    setAnalysisPrompt(prompt);
    analyzeElement();
  };

  const TabButton = ({ tab, label }: { tab: CanvasTab; label: string }) => (
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
          <h2 className="text-xl font-semibold">Canvas - Design & Accessibility Suite</h2>
          <p className="text-sm text-gray-400 mt-1">AI-powered web design analysis and color palette generation</p>
        </div>
        <div className="flex gap-2 border-b border-gray-700">
          <TabButton tab="audit" label="Accessibility Audit" />
          <TabButton tab="capture" label="Element Capture" />
          <TabButton tab="analysis" label="Design Analysis" />
          <TabButton tab="generator" label="CSS Generator" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Accessibility Audit Tab */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Page Accessibility Audit</h3>
              <p className="text-gray-400 mb-4">Scan the current page for accessibility issues and WCAG compliance.</p>
              <button
                onClick={startAccessibilityAudit}
                disabled={loading}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
              >
                {loading ? 'Analyzing...' : 'Analyze Page'}
              </button>
            </div>

            {loading && <Loader text="Scanning page for accessibility issues..." />}

            {auditResult && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-2">Audit Results</h4>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-indigo-400">{auditResult.score}</span>
                  <span className="text-gray-400">/100</span>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Found {auditResult.issues.length} issues in {auditResult.totalElements} elements ({auditResult.scanTime}ms)
                </p>
                <div className="space-y-2">
                  {auditResult.issues.map((issue, i) => (
                    <div key={i} className="bg-gray-700 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <span className={`px-2 py-1 text-xs rounded font-semibold ${
                          issue.severity === 'critical' ? 'bg-red-600 text-white' :
                          issue.severity === 'warning' ? 'bg-yellow-600 text-white' :
                          'bg-blue-600 text-white'
                        }`}>
                          {issue.severity}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium">{issue.message}</p>
                          <p className="text-sm text-gray-400">{issue.element}</p>
                          {issue.suggestion && (
                            <p className="text-sm text-indigo-400 mt-1">{issue.suggestion}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Element Capture Tab */}
        {activeTab === 'capture' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Capture UI Elements</h3>
              <p className="text-gray-400 mb-4">Click elements on the page to capture screenshots for analysis.</p>
              <div className="flex gap-2">
                <button
                  onClick={captureMode ? stopCapture : startElementCapture}
                  className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                    captureMode
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {captureMode ? 'Stop Capture Mode' : 'Start Capture Mode'}
                </button>
              </div>
              {captureMode && (
                <p className="mt-3 text-yellow-400 text-sm">Capture mode active - Click any element on the page</p>
              )}
            </div>

            {capturedElements.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-3">Captured Elements ({capturedElements.length})</h4>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {capturedElements.map((element) => (
                    <div
                      key={element.id}
                      onClick={() => setSelectedElement(element)}
                      className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                        selectedElement?.id === element.id
                          ? 'border-indigo-400 shadow-lg'
                          : 'border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <img src={element.dataUrl} alt="Captured element" className="w-full h-20 object-cover" />
                    </div>
                  ))}
                </div>

                {selectedElement && (
                  <div className="mt-4">
                    <img src={selectedElement.dataUrl} alt="Selected element" className="w-full rounded-lg mb-2" />
                    <div className="text-sm text-gray-400">
                      <p><span className="font-semibold">Tag:</span> {selectedElement.metadata.tag}</p>
                      <p><span className="font-semibold">Classes:</span> {selectedElement.metadata.classes.join(', ') || 'None'}</p>
                      <p><span className="font-semibold">Dimensions:</span> {selectedElement.metadata.dimensions.width}x{selectedElement.metadata.dimensions.height}px</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Design Analysis Tab */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">AI Design Analysis</h3>
              <p className="text-gray-400 mb-4">Get AI-powered feedback on captured elements.</p>

              {selectedElement ? (
                <div className="space-y-3">
                  <img src={selectedElement.dataUrl} alt="Element to analyze" className="w-full max-h-48 object-contain rounded-lg bg-gray-700" />

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { setAnalysisPrompt('Check color contrast and WCAG compliance'); }}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                      title="Quick: Contrast check"
                    >
                      Check Contrast
                    </button>
                    <button
                      onClick={() => { setAnalysisPrompt('Suggest design improvements and best practices'); }}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                      title="Quick: Design critique"
                    >
                      Design Critique
                    </button>
                    <button
                      onClick={() => { setAnalysisPrompt('Review accessibility and suggest fixes'); }}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                      title="Quick: Accessibility review"
                    >
                      A11y Review
                    </button>
                  </div>

                  <textarea
                    value={analysisPrompt}
                    onChange={(e) => setAnalysisPrompt(e.target.value)}
                    placeholder="Or enter custom prompt... (e.g., 'Check color contrast', 'Suggest design improvements')"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400 resize-none h-24"
                  />
                  <button
                    onClick={analyzeElement}
                    disabled={loading || !analysisPrompt.trim()}
                    className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                  >
                    {loading ? 'Analyzing...' : 'Analyze Element'}
                  </button>
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-400 mb-2">No element selected</p>
                  <p className="text-gray-500 text-sm">Capture an element first in the Element Capture tab</p>
                </div>
              )}
            </div>

            {loading && <Loader text="Analyzing element with AI..." />}

            {analysisResult && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-3">Analysis Result</h4>
                <div className="text-gray-200 whitespace-pre-wrap">{analysisResult}</div>
              </div>
            )}
          </div>
        )}

        {/* CSS Generator Tab */}
        {activeTab === 'generator' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">AI Color Palette Generator</h3>
              <p className="text-gray-400 mb-4">Generate WCAG-compliant color palettes from captured elements.</p>

              {selectedElement ? (
                <div className="space-y-3">
                  <img src={selectedElement.dataUrl} alt="Element for palette" className="w-full max-h-48 object-contain rounded-lg bg-gray-700" />
                  <button
                    onClick={generatePalette}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                  >
                    {loading ? 'Generating...' : 'Generate Color Palette'}
                  </button>
                </div>
              ) : (
                <p className="text-yellow-400">Please capture an element first in the Element Capture tab.</p>
              )}
            </div>

            {loading && <Loader text="Generating WCAG-compliant palette..." />}

            {generatedPalette && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-lg font-semibold mb-3">Generated Palette</h4>
                <div className="space-y-3">
                  {generatedPalette.colors.map((color, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-700 p-3 rounded-lg">
                      <div
                        className="w-16 h-16 rounded-lg border-2 border-gray-600"
                        style={{ backgroundColor: color.hex }}
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-100">{color.hex}</p>
                        <p className="text-sm text-gray-400">{color.role}</p>
                        <p className="text-xs text-gray-500">{color.usage}</p>
                      </div>
                      <button
                        onClick={async () => {
                          await copyToClipboard(color.hex);
                          showToast(`Copied ${color.hex}`, 'success');
                        }}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm transition-colors"
                        title={`Copy ${color.hex} to clipboard`}
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={togglePreview}
                    className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors ${
                      previewActive
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    } text-white`}
                    title={previewActive ? 'Remove CSS preview from page' : 'Apply CSS preview to page'}
                  >
                    {previewActive ? 'Remove Preview' : 'Preview on Page'}
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold flex items-center gap-2"
                      title="Export palette in various formats"
                    >
                      Export
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {showExportMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 overflow-hidden">
                        <div className="p-2">
                          <p className="text-xs text-gray-400 px-2 py-1 font-semibold uppercase">Copy to Clipboard</p>
                          <button
                            onClick={() => handleExport('css')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition-colors text-sm flex items-center justify-between"
                          >
                            <span>CSS Variables</span>
                            <span className="text-xs text-gray-500">.css</span>
                          </button>
                          <button
                            onClick={() => handleExport('scss')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition-colors text-sm flex items-center justify-between"
                          >
                            <span>SCSS Variables</span>
                            <span className="text-xs text-gray-500">.scss</span>
                          </button>
                          <button
                            onClick={() => handleExport('js')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition-colors text-sm flex items-center justify-between"
                          >
                            <span>JavaScript Object</span>
                            <span className="text-xs text-gray-500">.js</span>
                          </button>
                          <button
                            onClick={() => handleExport('tailwind')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition-colors text-sm flex items-center justify-between"
                          >
                            <span>Tailwind Config</span>
                            <span className="text-xs text-gray-500">.js</span>
                          </button>
                        </div>
                        <div className="border-t border-gray-700 p-2">
                          <p className="text-xs text-gray-400 px-2 py-1 font-semibold uppercase">Download</p>
                          <button
                            onClick={() => handleDownload('css')}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded transition-colors text-sm flex items-center justify-between"
                          >
                            <span>Download CSS</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {previewActive && (
                  <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200 text-sm flex items-start gap-2">
                    <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Preview mode active. Reload page to remove changes.</span>
                  </div>
                )}
              </div>
            )}
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

      {/* Keyboard Shortcuts Help */}
      <div className="fixed bottom-4 left-4 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
        <span className="font-semibold">Shortcuts:</span> Shift+A (Audit) | Shift+C (Capture) | Shift+D (Design) | Shift+G (Generator)
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { InterceptedRequest, ThreatAlert, MockRule, AegisStats } from '../types';
import Loader from './Loader';
import Toast from './Toast';

type AegisTab = 'monitor' | 'mocking' | 'alerts' | 'blocked';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  show: boolean;
}

export default function AegisView() {
  const [activeTab, setActiveTab] = useState<AegisTab>('monitor');
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', show: false });

  const [aegisActive, setAegisActive] = useState(false);
  const [monitoredTabUrl, setMonitoredTabUrl] = useState<string>('');
  const [requests, setRequests] = useState<InterceptedRequest[]>([]);
  const [alerts, setAlerts] = useState<ThreatAlert[]>([]);
  const [mockRules, setMockRules] = useState<MockRule[]>([]);
  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [stats, setStats] = useState<AegisStats>({
    totalIntercepted: 0,
    allowed: 0,
    blocked: 0,
    mocked: 0,
    suspicious: 0
  });

  const [mockCommand, setMockCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const requestsEndRef = useRef<HTMLDivElement>(null);

  // Advanced features
  const [selectedRequest, setSelectedRequest] = useState<InterceptedRequest | null>(null);
  const [showRequestDetails, setShowRequestDetails] = useState(false);
  const [blockDomainInput, setBlockDomainInput] = useState('');
  const [importJson, setImportJson] = useState('');
  const [requestFilter, setRequestFilter] = useState<'all' | 'allowed' | 'blocked' | 'mocked' | 'suspicious'>('all');

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, show: true });
  };

  useEffect(() => {
    const messageListener = (request: any) => {
      if (request.type === 'aegis-activated') {
        setAegisActive(true);
        if (request.tabUrl) {
          setMonitoredTabUrl(request.tabUrl);
        }
        showToast('Aegis security agent activated', 'success');
      } else if (request.type === 'aegis-tab-switched') {
        if (request.tabUrl) {
          setMonitoredTabUrl(request.tabUrl);
          showToast(`Now monitoring: ${new URL(request.tabUrl).hostname}`, 'info');
        }
      } else if (request.type === 'aegis-deactivated') {
        setAegisActive(false);
        setMonitoredTabUrl('');
        showToast('Aegis deactivated', 'info');
      } else if (request.type === 'aegis-request-intercepted') {
        const req: InterceptedRequest = request.request;
        setRequests(prev => [req, ...prev].slice(0, 100)); // Keep last 100
        setStats(prev => ({
          totalIntercepted: prev.totalIntercepted + 1,
          allowed: prev.allowed + (req.status === 'allowed' ? 1 : 0),
          blocked: prev.blocked + (req.status === 'blocked' ? 1 : 0),
          mocked: prev.mocked + (req.status === 'mocked' ? 1 : 0),
          suspicious: prev.suspicious + (req.threatLevel === 'suspicious' ? 1 : 0)
        }));
      } else if (request.type === 'aegis-threat-detected') {
        const alert: ThreatAlert = request.alert;
        setAlerts(prev => [alert, ...prev]);
        showToast(`Security threat detected: ${alert.type}`, 'error');
      } else if (request.type === 'aegis-mock-created') {
        const rule: MockRule = request.mockRule;
        setMockRules(prev => [...prev, rule]);
        setLoading(false);
        showToast('Mock rule created successfully!', 'success');
      } else if (request.type === 'aegis-domain-blocked') {
        setBlockedDomains(prev => [...prev, request.domain]);
        showToast(`Domain blocked: ${request.domain}`, 'success');
      } else if (request.type === 'aegis-domain-unblocked') {
        setBlockedDomains(prev => prev.filter(d => d !== request.domain));
        showToast(`Domain unblocked: ${request.domain}`, 'info');
      } else if (request.type === 'aegis-mocks-exported') {
        // Download as JSON file
        const blob = new Blob([request.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aegis-mocks-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Mock rules exported!', 'success');
      } else if (request.type === 'aegis-import-complete') {
        showToast(`Imported ${request.count} mock rules`, 'success');
        setImportJson('');
      } else if (request.type === 'aegis-error') {
        showToast(request.error, 'error');
        setLoading(false);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  // Don't auto-scroll - let user control scrolling
  // useEffect(() => {
  //   requestsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  // }, [requests]);

  const toggleAegis = () => {
    if (aegisActive) {
      chrome.runtime.sendMessage({ action: 'aegis-deactivate' });
    } else {
      chrome.runtime.sendMessage({ action: 'aegis-activate' });
    }
  };

  const createMockRule = () => {
    if (!mockCommand.trim()) {
      showToast('Please enter a mocking command', 'error');
      return;
    }

    setLoading(true);
    chrome.runtime.sendMessage({
      action: 'aegis-create-mock',
      payload: { command: mockCommand }
    });
    setMockCommand('');
  };

  const toggleMockRule = (ruleId: string) => {
    chrome.runtime.sendMessage({
      action: 'aegis-toggle-mock',
      payload: { ruleId }
    });
    setMockRules(prev => prev.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    ));
  };

  const deleteMockRule = (ruleId: string) => {
    chrome.runtime.sendMessage({
      action: 'aegis-delete-mock',
      payload: { ruleId }
    });
    setMockRules(prev => prev.filter(r => r.id !== ruleId));
    showToast('Mock rule deleted', 'info');
  };

  const blockDomain = () => {
    if (!blockDomainInput.trim()) {
      showToast('Please enter a domain to block', 'error');
      return;
    }

    const domain = blockDomainInput.trim().toLowerCase();

    chrome.runtime.sendMessage({
      action: 'aegis-block-domain',
      payload: { domain }
    });
    setBlockDomainInput('');
  };

  const unblockDomain = (domain: string) => {
    chrome.runtime.sendMessage({
      action: 'aegis-unblock-domain',
      payload: { domain }
    });
  };

  const exportMocks = () => {
    chrome.runtime.sendMessage({ action: 'aegis-export-mocks' });
  };

  const importMocks = () => {
    if (!importJson.trim()) {
      showToast('Please paste JSON data to import', 'error');
      return;
    }

    try {
      JSON.parse(importJson); // Validate
      chrome.runtime.sendMessage({
        action: 'aegis-import-mocks',
        payload: { jsonData: importJson }
      });
    } catch (e) {
      showToast('Invalid JSON format', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'allowed' ? 'bg-green-600' :
           status === 'blocked' ? 'bg-red-600' :
           status === 'mocked' ? 'bg-blue-600' : 'bg-yellow-600';
  };

  const TabButton = ({ tab, label }: { tab: AegisTab; label: string }) => (
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
          <h2 className="text-xl font-semibold">Aegis - AI Security Agent</h2>
          <p className="text-sm text-gray-400 mt-1">Network security monitoring & API resilience testing</p>
        </div>

        <button
          onClick={toggleAegis}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors mb-4 flex items-center justify-center gap-2 ${
            aegisActive
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg'
          }`}
        >
          {aegisActive ? (
            <>
              <span>🛑</span>
              <span>Deactivate Aegis</span>
            </>
          ) : (
            <>
              <span>🛡️</span>
              <span>Activate Aegis Security</span>
            </>
          )}
        </button>

        {aegisActive && (
          <>
            {monitoredTabUrl && (
              <div className="mb-3 p-3 bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-600 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <p className="text-indigo-200 text-sm font-semibold">🎯 Currently Monitoring:</p>
                </div>
                <p className="text-indigo-300 text-xs font-mono break-all bg-indigo-950/50 p-2 rounded">
                  {monitoredTabUrl}
                </p>
                <p className="text-green-400 text-xs mt-2 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Auto-Follow Enabled - Aegis automatically monitors whichever tab you switch to!</span>
                </p>
              </div>
            )}
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div>
                  <p className="text-blue-400 font-semibold">{requests.length}</p>
                  <p className="text-gray-500">Total</p>
                </div>
                <div>
                  <p className="text-green-400 font-semibold">{requests.filter(r => r.status === 'allowed').length}</p>
                  <p className="text-gray-500">Allowed</p>
                </div>
                <div>
                  <p className="text-red-400 font-semibold">{requests.filter(r => r.status === 'blocked').length}</p>
                  <p className="text-gray-500">Blocked</p>
                </div>
                <div>
                  <p className="text-blue-400 font-semibold">{requests.filter(r => r.status === 'mocked').length}</p>
                  <p className="text-gray-500">Mocked</p>
                </div>
                <div>
                  <p className="text-yellow-400 font-semibold">{requests.filter(r => r.threatLevel === 'suspicious').length}</p>
                  <p className="text-gray-500">Suspicious</p>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 border-b border-gray-700">
          <TabButton tab="monitor" label="Live Monitor" />
          <TabButton tab="mocking" label="API Mocking" />
          <TabButton tab="alerts" label="Alerts" />
          <TabButton tab="blocked" label="Blocked Domains" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Live Monitor Tab */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            {!aegisActive && (
              <div className="text-center p-12 bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-lg border-2 border-dashed border-blue-500/50">
                <svg className="w-24 h-24 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-gray-300 mb-2 font-semibold text-lg">Aegis Not Active</p>
                <p className="text-gray-500 text-sm mb-4">Click "Activate Aegis Security" to begin monitoring</p>
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-left max-w-md mx-auto">
                  <p className="text-yellow-200 text-sm font-semibold mb-2">⚠️ Important:</p>
                  <ul className="text-yellow-300 text-xs space-y-1 list-disc list-inside">
                    <li>Aegis intercepts ALL network requests</li>
                    <li>May slow down browsing slightly</li>
                    <li>Use for security testing and API mocking</li>
                    <li>Deactivate when done for normal browsing</li>
                  </ul>
                </div>
              </div>
            )}

            {aegisActive && requests.length === 0 && (
              <div className="text-center p-8">
                <Loader text="Monitoring network traffic..." />
                <p className="text-gray-400 text-sm mt-4">Reload the page to see intercepted requests</p>
              </div>
            )}

            {aegisActive && requests.length > 0 && (
              <>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-4">Intercepted Requests</h3>

                  {/* Filter Buttons - Full Width Grid */}
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <button
                      onClick={() => setRequestFilter('all')}
                      className={`px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        requestFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      All<br/>
                      <span className="text-xs opacity-75">{requests.length}</span>
                    </button>
                    <button
                      onClick={() => setRequestFilter('allowed')}
                      className={`px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        requestFilter === 'allowed' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Allowed<br/>
                      <span className="text-xs opacity-75">{requests.filter(r => r.status === 'allowed').length}</span>
                    </button>
                    <button
                      onClick={() => setRequestFilter('suspicious')}
                      className={`px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        requestFilter === 'suspicious' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Suspicious<br/>
                      <span className="text-xs opacity-75">{requests.filter(r => r.threatLevel === 'suspicious').length}</span>
                    </button>
                    <button
                      onClick={() => setRequestFilter('blocked')}
                      className={`px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        requestFilter === 'blocked' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Blocked<br/>
                      <span className="text-xs opacity-75">{requests.filter(r => r.status === 'blocked').length}</span>
                    </button>
                    <button
                      onClick={() => setRequestFilter('mocked')}
                      className={`px-3 py-2 text-sm font-semibold rounded transition-colors ${
                        requestFilter === 'mocked' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Mocked<br/>
                      <span className="text-xs opacity-75">{requests.filter(r => r.status === 'mocked').length}</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {requests
                      .filter(req => {
                        if (requestFilter === 'all') return true;
                        if (requestFilter === 'suspicious') return req.threatLevel === 'suspicious';
                        return req.status === requestFilter;
                      })
                      .map((req) => (
                      <div
                        key={req.id}
                        className="bg-gray-700 p-3 rounded-lg hover:bg-gray-600 cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedRequest(req);
                          setShowRequestDetails(true);
                        }}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${getStatusColor(req.status)} text-white`}>
                            {req.status.toUpperCase()}
                          </span>
                          {req.threatLevel === 'suspicious' && (
                            <span className="px-2 py-1 text-xs font-bold rounded bg-yellow-600 text-white">
                              ⚠️ SUSPICIOUS
                            </span>
                          )}
                          {req.threatLevel === 'malicious' && (
                            <span className="px-2 py-1 text-xs font-bold rounded bg-red-600 text-white">
                              🚫 MALICIOUS
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{req.method}</span>
                          {req.responseCode && (
                            <span className={`px-2 py-1 text-xs rounded ml-auto ${
                              req.responseCode >= 500 ? 'bg-red-700' :
                              req.responseCode >= 400 ? 'bg-orange-700' :
                              req.responseCode >= 300 ? 'bg-yellow-700' : 'bg-green-700'
                            } text-white`}>
                              {req.responseCode}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 font-mono break-all">{req.url}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(req.timestamp).toLocaleTimeString()} • Click for details
                        </p>
                      </div>
                    ))}
                    <div ref={requestsEndRef} />
                  </div>
                </div>

                {/* Block Domain Quick Action */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold mb-3 text-gray-400">🚫 Block Domain</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={blockDomainInput}
                      onChange={(e) => setBlockDomainInput(e.target.value)}
                      placeholder="evil-domain.com"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400"
                    />
                    <button
                      onClick={blockDomain}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-semibold text-sm"
                    >
                      Block
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Block requests from specific domains permanently
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* API Mocking Tab */}
        {activeTab === 'mocking' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-3">Conversational API Mocking</h3>
              <p className="text-gray-400 mb-4">Use natural language to mock API responses for testing</p>

              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setMockCommand("Mock /api/users with 404 error")}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                  >
                    404 Error
                  </button>
                  <button
                    onClick={() => setMockCommand("Mock /api/data with 500 internal server error")}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                  >
                    500 Error
                  </button>
                  <button
                    onClick={() => setMockCommand("Mock /api/products with empty array")}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
                  >
                    Empty Response
                  </button>
                </div>

                <textarea
                  value={mockCommand}
                  onChange={(e) => setMockCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && createMockRule()}
                  placeholder='e.g., "Mock /api/users with 404 error" or "Return 401 for /api/auth"'
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400 resize-none h-24"
                  disabled={!aegisActive}
                />

                <button
                  onClick={createMockRule}
                  disabled={loading || !mockCommand.trim() || !aegisActive}
                  className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-600"
                >
                  {loading ? 'Creating Mock Rule...' : '🎭 Create Mock Rule'}
                </button>
              </div>

              {!aegisActive && (
                <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-200 text-sm">
                  ⚠️ Activate Aegis above to enable API mocking
                </div>
              )}
            </div>

            {mockRules.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold">Active Mock Rules ({mockRules.length})</h4>
                  <button
                    onClick={exportMocks}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm font-semibold"
                  >
                    📥 Export All
                  </button>
                </div>
                <div className="space-y-3">
                  {mockRules.map((rule) => (
                    <div key={rule.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => toggleMockRule(rule.id)}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-300 flex-1 font-mono">{rule.urlPattern}</span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          rule.responseCode >= 500 ? 'bg-red-600' :
                          rule.responseCode >= 400 ? 'bg-orange-600' :
                          rule.responseCode >= 300 ? 'bg-yellow-600' : 'bg-green-600'
                        } text-white`}>
                          {rule.responseCode}
                        </span>
                        <button
                          onClick={() => deleteMockRule(rule.id)}
                          className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs"
                        >
                          Delete
                        </button>
                      </div>
                      {rule.method && (
                        <p className="text-xs text-gray-500">Method: {rule.method}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Created: {new Date(rule.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import Mock Rules */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-3">📤 Import Mock Rules</h4>
              <p className="text-gray-400 text-sm mb-3">Paste exported JSON to import mock rules</p>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='[{"id": "...", "urlPattern": "/api/users", "responseCode": 404, ...}]'
                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-gray-100 placeholder-gray-400 resize-none h-32 font-mono text-xs"
              />
              <button
                onClick={importMocks}
                disabled={!importJson.trim()}
                className="mt-3 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-semibold transition-colors disabled:bg-gray-600"
              >
                Import Mock Rules
              </button>
            </div>
          </div>
        )}

        {/* Request Details Modal */}
        {showRequestDetails && selectedRequest && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
            onClick={() => setShowRequestDetails(false)}
          >
            <div
              className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-semibold">Request Details</h3>
                <button
                  onClick={() => setShowRequestDetails(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Status</p>
                  <span className={`px-3 py-1.5 text-sm font-bold rounded ${getStatusColor(selectedRequest.status)} text-white`}>
                    {selectedRequest.status.toUpperCase()}
                  </span>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-1">Method</p>
                  <p className="text-white font-mono">{selectedRequest.method}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-1">URL</p>
                  <p className="text-white font-mono text-sm break-all bg-gray-700 p-3 rounded">
                    {selectedRequest.url}
                  </p>
                </div>

                {selectedRequest.responseCode && (
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Response Code</p>
                    <p className="text-white font-mono">{selectedRequest.responseCode}</p>
                  </div>
                )}

                {selectedRequest.threatLevel && (
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Threat Level</p>
                    <span className={`px-3 py-1.5 text-sm font-bold rounded ${
                      selectedRequest.threatLevel === 'malicious' ? 'bg-red-600' :
                      selectedRequest.threatLevel === 'suspicious' ? 'bg-yellow-600' : 'bg-green-600'
                    } text-white`}>
                      {selectedRequest.threatLevel.toUpperCase()}
                    </span>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-400 mb-1">Timestamp</p>
                  <p className="text-white">{new Date(selectedRequest.timestamp).toLocaleString()}</p>
                </div>

                {selectedRequest.threatLevel === 'suspicious' || selectedRequest.threatLevel === 'malicious' ? (
                  <div className="mt-4 p-4 bg-red-900/30 border border-red-700 rounded-lg">
                    <button
                      onClick={() => {
                        try {
                          const url = new URL(selectedRequest.url);
                          setBlockDomainInput(url.hostname);
                          setShowRequestDetails(false);
                          setActiveTab('monitor');
                          showToast('Domain copied to block input', 'info');
                        } catch (e) {
                          showToast('Invalid URL', 'error');
                        }
                      }}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-semibold"
                    >
                      🚫 Block This Domain
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Security Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center p-12 bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700">
                <svg className="w-20 h-20 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-gray-400 font-semibold">No Security Threats Detected</p>
                <p className="text-gray-500 text-sm mt-2">
                  {aegisActive ? 'Aegis is monitoring - you\'re protected!' : 'Activate Aegis to begin monitoring'}
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">Security Alerts ({alerts.length})</h3>
                <div className="space-y-3">
                  {alerts.map((alert, i) => (
                    <div key={i} className={`p-4 rounded-lg border-l-4 ${
                      alert.severity === 'critical' ? 'bg-red-900/30 border-red-500' :
                      alert.severity === 'high' ? 'bg-orange-900/30 border-orange-500' :
                      alert.severity === 'medium' ? 'bg-yellow-900/30 border-yellow-500' :
                      'bg-blue-900/30 border-blue-500'
                    }`}>
                      <div className="flex items-start gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-bold rounded ${
                          alert.severity === 'critical' ? 'bg-red-600' :
                          alert.severity === 'high' ? 'bg-orange-600' :
                          alert.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
                        } text-white`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <span className="px-2 py-1 text-xs font-bold rounded bg-gray-700 text-white">
                          {alert.type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-200 mb-2">{alert.description}</p>
                      <p className="text-xs text-gray-400 font-mono break-all mb-1">{alert.url}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                        <span className={`px-2 py-0.5 rounded ${
                          alert.action === 'blocked' ? 'bg-red-600 text-white' : 'bg-gray-600 text-white'
                        }`}>
                          {alert.action.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Blocked Domains Tab */}
        {activeTab === 'blocked' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Blocked Domains ({blockedDomains.length})</h3>

              {blockedDomains.length === 0 ? (
                <div className="text-center p-8 bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  <p className="text-gray-400">No domains blocked yet</p>
                  <p className="text-gray-500 text-sm mt-2">Block suspicious domains from Live Monitor or create blocks manually</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blockedDomains.map((domain, i) => (
                    <div key={i} className="bg-gray-700 p-4 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                        </svg>
                        <span className="text-gray-200 font-mono">{domain}</span>
                        <span className="px-2 py-1 text-xs rounded bg-red-600 text-white">BLOCKED</span>
                      </div>
                      <button
                        onClick={() => unblockDomain(domain)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-white text-sm font-semibold"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
                <p className="text-blue-200 font-semibold mb-2">💡 How Blocking Works</p>
                <ul className="text-blue-300 text-sm space-y-1 list-disc list-inside">
                  <li>Blocked domains return 403 Forbidden for all requests</li>
                  <li>Blocks persist across sessions (saved to storage)</li>
                  <li>Unblock anytime to allow requests again</li>
                  <li>Useful for blocking trackers, ads, or malicious domains</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

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

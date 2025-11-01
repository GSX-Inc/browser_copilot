
export type ViewMode = 'network' | 'context-builder' | 'canvas' | 'kino' | 'nexus' | 'aegis';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Canvas Feature Types
export interface AccessibilityIssue {
  type: 'missing-alt' | 'contrast' | 'heading-order' | 'missing-label' | 'aria-missing';
  severity: 'critical' | 'warning' | 'info';
  element: string; // CSS selector or description
  message: string;
  suggestion?: string;
  wcagReference?: string;
}

export interface AuditResult {
  issues: AccessibilityIssue[];
  score: number; // 0-100
  totalElements: number;
  scanTime: number;
  timestamp: number;
}

export interface ColorPalette {
  colors: Array<{
    hex: string;
    role: string;
    usage: string;
  }>;
  contrastReport?: Array<{
    fg: string;
    bg: string;
    ratio: number;
    compliant: boolean;
  }>;
}

export interface CapturedElement {
  id: string;
  dataUrl: string;
  metadata: {
    tag: string;
    classes: string[];
    id?: string;
    dimensions: { width: number; height: number };
  };
  timestamp: number;
}

export interface CanvasMessage {
  action: 'start-accessibility-audit'
        | 'start-element-capture'
        | 'element-captured'
        | 'stop-capture'
        | 'analyze-element'
        | 'generate-palette'
        | 'inject-css'
        | 'remove-css-preview';
  payload?: any;
}

// Types for messages between UI and Service Worker
export type ExtensionMessage =
  | { type: 'stream-chat', prompt: string }
  | { type: 'analyze-image', prompt: string, imageData: string, mimeType: string }
  | { type: 'debug-page', prompt: string };

export type ExtensionResponse =
  | { type: 'stream-chunk', chunk: string }
  | { type: 'stream-end' }
  | { type: 'stream-error', error: string };

// Kino Feature Types
export interface VideoStreamState {
  active: boolean;
  tabId: number | null;
  startTime: number;
  frameCount: number;
}

export interface VideoFrameData {
  timestamp: number;
  dataUrl: string;
  frameNumber: number;
}

export interface VideoTranscript {
  timestamp: number;
  text: string;
  confidence?: number;
}

export interface VideoQA {
  question: string;
  answer: string;
  frameTimestamp: number;
  timestamp: number;
}

export interface VideoSummary {
  outline: Array<{ time: string; topic: string; }>;
  insights: string[];
  concepts: Record<string, string>;
  duration?: string;
  videoUrl: string;
}

export interface KinoSettings {
  frameRate: number; // frames per second (0.5, 1, 2)
  enableTranscription: boolean;
  enableAudioDescription: boolean;
  voiceRate: number; // 0.5 - 2.0
  voicePitch: number; // 0 - 2
  voiceVolume: number; // 0 - 1
}

// Nexus Feature Types (Agentic Performance Engineer)
export interface PerformanceTrace {
  traceEvents: any[];
  metadata: {
    duration: number;
    eventCount: number;
    captureTime: number;
  };
  timestamp: number;
}

export interface PerformanceMetrics {
  lcp: number | null; // Largest Contentful Paint (ms)
  fid: number | null; // First Input Delay (ms)
  cls: number | null; // Cumulative Layout Shift (score)
  fcp: number | null; // First Contentful Paint (ms)
  ttfb: number | null; // Time to First Byte (ms)
  score: number; // 0-100 overall performance score
}

export interface PerformanceBottleneck {
  type: 'render-blocking-css' | 'render-blocking-js' | 'large-image' | 'slow-network' | 'long-task' | 'layout-shift';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  impact: string; // e.g., "Delays LCP by 2.3s"
  element?: string; // URL or selector
  details?: any;
}

export interface CodeFix {
  language: 'html' | 'css' | 'javascript';
  code: string;
  explanation: string;
  preview: boolean;
  alternativeFixes?: Array<{
    code: string;
    explanation: string;
    tradeoffs: string;
  }>;
}

export interface NexusAnalysis {
  bottleneck: PerformanceBottleneck;
  reasoning: string; // AI's step-by-step reasoning
  metrics: PerformanceMetrics;
  codeFix?: CodeFix;
  timestamp: number;
  status: 'analyzing' | 'complete' | 'error';
}

// Aegis Feature Types (AI Security & Resilience Agent)
export interface InterceptedRequest {
  id: string;
  url: string;
  method: string;
  resourceType?: string;
  timestamp: number;
  status: 'allowed' | 'blocked' | 'mocked' | 'suspicious';
  threatLevel?: 'safe' | 'suspicious' | 'malicious';
  responseCode?: number;
}

export interface ThreatAlert {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'malware' | 'phishing' | 'suspicious' | 'blocked';
  description: string;
  url: string;
  timestamp: number;
  action: 'blocked' | 'allowed' | 'flagged';
}

export interface MockRule {
  id: string;
  urlPattern: string; // Pattern to match
  method?: string; // GET, POST, etc.
  responseCode: number;
  responseBody?: string; // base64 encoded JSON
  responseHeaders?: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}

export interface AegisStats {
  totalIntercepted: number;
  allowed: number;
  blocked: number;
  mocked: number;
  suspicious: number;
}

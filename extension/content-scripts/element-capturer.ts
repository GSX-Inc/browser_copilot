// Element Capturer Content Script
// Enables click-to-capture screenshots of page elements

import html2canvas from 'html2canvas';

// State management
let captureMode = false;
let currentHighlightedElement: HTMLElement | null = null;
let overlay: HTMLElement | null = null;
let banner: HTMLElement | null = null;

/**
 * Initialize capture mode
 */
function initializeCaptureMode() {
  if (captureMode) return; // Already active

  captureMode = true;
  console.log('[Canvas Capture] Capture mode activated');

  // Create overlay
  createOverlay();

  // Create instruction banner
  createBanner();

  // Add event listeners
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  // Prevent default interactions while in capture mode
  document.body.style.cursor = 'crosshair';
}

/**
 * Create semi-transparent overlay
 */
function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'canvas-capture-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.1);
    z-index: 999998;
    pointer-events: none;
  `;
  document.body.appendChild(overlay);
}

/**
 * Create instruction banner
 */
function createBanner() {
  banner = document.createElement('div');
  banner.id = 'canvas-capture-banner';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 999999;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 12px;
  `;
  banner.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    <span>Capture Mode Active - Click element to capture | ESC to exit</span>
  `;
  document.body.appendChild(banner);
}

/**
 * Handle mouse over - highlight element
 */
function handleMouseOver(event: MouseEvent) {
  if (!captureMode) return;

  const target = event.target as HTMLElement;

  // Skip if hovering over our own UI elements
  if (
    target.id === 'canvas-capture-overlay' ||
    target.id === 'canvas-capture-banner' ||
    target.closest('#canvas-capture-banner')
  ) {
    return;
  }

  // Remove previous highlight
  if (currentHighlightedElement) {
    removeHighlight(currentHighlightedElement);
  }

  // Add highlight to current element
  currentHighlightedElement = target;
  addHighlight(target);
}

/**
 * Handle mouse out - remove highlight
 */
function handleMouseOut(event: MouseEvent) {
  if (!captureMode) return;

  const target = event.target as HTMLElement;
  if (target === currentHighlightedElement) {
    removeHighlight(target);
    currentHighlightedElement = null;
  }
}

/**
 * Handle click - capture element
 */
async function handleClick(event: MouseEvent) {
  if (!captureMode) return;

  event.preventDefault();
  event.stopPropagation();

  const target = event.target as HTMLElement;

  // Skip if clicking our own UI
  if (
    target.id === 'canvas-capture-overlay' ||
    target.id === 'canvas-capture-banner' ||
    target.closest('#canvas-capture-banner')
  ) {
    return;
  }

  console.log('[Canvas Capture] Capturing element:', target);

  try {
    // Temporarily remove highlight for clean capture
    const hadHighlight = target.dataset.canvasHighlight === 'true';
    if (hadHighlight) {
      removeHighlight(target);
    }

    // Capture the element with html2canvas
    const canvas = await html2canvas(target, {
      backgroundColor: null,
      scale: 2, // 2x for retina displays
      logging: false,
      useCORS: true,
      allowTaint: false,
      removeContainer: true,
      imageTimeout: 15000,
      onclone: (clonedDoc) => {
        // Remove any capture UI from cloned document
        const clonedOverlay = clonedDoc.getElementById('canvas-capture-overlay');
        const clonedBanner = clonedDoc.getElementById('canvas-capture-banner');
        if (clonedOverlay) clonedOverlay.remove();
        if (clonedBanner) clonedBanner.remove();
      }
    });

    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/png');

    // Extract element metadata
    const metadata = extractElementMetadata(target);

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'element-captured',
      image: dataUrl,
      metadata: metadata
    }, (response) => {
      // Handle response or error
      if (chrome.runtime.lastError) {
        console.error('[Canvas Capture] Message send error:', chrome.runtime.lastError);
      }
    });

    console.log('[Canvas Capture] Element captured successfully');

    // Restore highlight if needed
    if (hadHighlight) {
      addHighlight(target);
    }

    // Visual feedback - flash effect
    showCaptureFlash();

  } catch (error) {
    console.error('[Canvas Capture] Capture failed:', error);
    chrome.runtime.sendMessage({
      type: 'canvas-error',
      error: `Capture failed: ${(error as Error).message}`
    });
  }
}

/**
 * Handle keyboard - ESC to exit
 */
function handleKeyDown(event: KeyboardEvent) {
  if (!captureMode) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    exitCaptureMode();
  }
}

/**
 * Add highlight border to element
 */
function addHighlight(element: HTMLElement) {
  element.dataset.canvasHighlight = 'true';
  element.dataset.canvasOriginalOutline = element.style.outline;
  element.dataset.canvasOriginalOutlineOffset = element.style.outlineOffset;

  element.style.outline = '3px solid #667eea';
  element.style.outlineOffset = '2px';
  element.style.transition = 'outline 0.15s ease';
}

/**
 * Remove highlight border from element
 */
function removeHighlight(element: HTMLElement) {
  if (element.dataset.canvasHighlight === 'true') {
    element.style.outline = element.dataset.canvasOriginalOutline || '';
    element.style.outlineOffset = element.dataset.canvasOriginalOutlineOffset || '';
    element.style.transition = '';

    delete element.dataset.canvasHighlight;
    delete element.dataset.canvasOriginalOutline;
    delete element.dataset.canvasOriginalOutlineOffset;
  }
}

/**
 * Extract metadata from element
 */
function extractElementMetadata(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return {
    tag: element.tagName.toLowerCase(),
    classes: Array.from(element.classList),
    id: element.id || undefined,
    dimensions: {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    text: element.textContent?.trim().substring(0, 100) || '',
    attributes: {
      href: element.getAttribute('href'),
      src: element.getAttribute('src'),
      alt: element.getAttribute('alt'),
      title: element.getAttribute('title'),
    },
    computed: {
      backgroundColor: computedStyle.backgroundColor,
      color: computedStyle.color,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
    }
  };
}

/**
 * Show visual feedback flash on capture
 */
function showCaptureFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: white;
    opacity: 0.6;
    z-index: 1000000;
    pointer-events: none;
    animation: canvas-flash 0.3s ease-out;
  `;

  // Add keyframes animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes canvas-flash {
      0% { opacity: 0.6; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(flash);

  setTimeout(() => {
    flash.remove();
    style.remove();
  }, 300);
}

/**
 * Exit capture mode and clean up
 */
function exitCaptureMode() {
  if (!captureMode) return;

  console.log('[Canvas Capture] Exiting capture mode');

  captureMode = false;

  // Remove event listeners
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('mouseout', handleMouseOut, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  // Remove highlight from current element
  if (currentHighlightedElement) {
    removeHighlight(currentHighlightedElement);
    currentHighlightedElement = null;
  }

  // Remove overlay and banner
  if (overlay) {
    overlay.remove();
    overlay = null;
  }

  if (banner) {
    banner.remove();
    banner = null;
  }

  // Restore cursor
  document.body.style.cursor = '';
}

// Initialize capture mode when script is injected
try {
  console.log('[Canvas Capture] Script loaded, initializing...');
  initializeCaptureMode();
  console.log('[Canvas Capture] Initialization complete');

  // Export for external control
  (window as any).canvasCaptureMode = {
    exit: exitCaptureMode,
    isActive: () => captureMode
  };
} catch (error) {
  console.error('[Canvas Capture] Initialization error:', error);
  alert('Canvas Capture Mode failed to initialize: ' + (error as Error).message);
}

// Live Video Capturer Content Script
// Captures video stream and extracts frames for Kino

let stream: MediaStream | null = null;
let intervalId: number | null = null;
let frameCount = 0;

async function startLiveCapture() {
  try {
    console.log('[Kino Content] Requesting display media...');

    // Request screen/tab capture
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    console.log('[Kino Content] Stream captured successfully');
    console.log('[Kino Content] Video tracks:', stream.getVideoTracks().length);
    console.log('[Kino Content] Audio tracks:', stream.getAudioTracks().length);

    // Notify background that capture started
    chrome.runtime.sendMessage({ type: 'kino-capture-started' });

    // Create video element to process stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true; // Mute to avoid feedback
    video.style.display = 'none';
    document.body.appendChild(video);

    // Start playing
    await video.play();

    console.log('[Kino Content] Video element ready, starting frame extraction...');

    // Extract frames at 1fps
    frameCount = 0;
    intervalId = window.setInterval(() => {
      captureFrame(video);
    }, 1000); // 1 second interval

    // Handle stream end (user stops sharing)
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log('[Kino Content] Stream ended by user');
      stopLiveCapture();
    });

    return { success: true };

  } catch (error) {
    console.error('[Kino Content] Capture error:', error);
    chrome.runtime.sendMessage({
      type: 'kino-error',
      error: `Live capture failed: ${(error as Error).message}`
    });
    return { success: false, error: (error as Error).message };
  }
}

function captureFrame(video: HTMLVideoElement) {
  try {
    // Create canvas to capture current frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[Kino Content] Could not get canvas context');
      return;
    }

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality for performance

    frameCount++;

    // Send frame to background script
    chrome.runtime.sendMessage({
      type: 'kino-frame',
      frame: dataUrl,
      timestamp: Date.now(),
      frameNumber: frameCount
    });

  } catch (error) {
    console.error('[Kino Content] Frame capture error:', error);
  }
}

function stopLiveCapture() {
  console.log('[Kino Content] Stopping live capture...');

  // Stop interval
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }

  // Stop all tracks
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop();
      console.log('[Kino Content] Stopped track:', track.kind);
    });
    stream = null;
  }

  // Remove video element
  const videos = document.querySelectorAll('video[src^="blob:"]');
  videos.forEach(v => {
    if (v.parentElement === document.body && v.style.display === 'none') {
      v.remove();
    }
  });

  frameCount = 0;

  // Notify background
  chrome.runtime.sendMessage({ type: 'kino-capture-stopped' });

  console.log('[Kino Content] Live capture stopped');
}

// Listen for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'kino-start-live-capture') {
    startLiveCapture().then(result => {
      sendResponse(result);
    });
    return true; // Async response
  } else if (message.action === 'kino-stop-live-capture') {
    stopLiveCapture();
    sendResponse({ success: true });
  }
});

// Export for manual control if needed
(window as any).kinoLiveCapture = {
  start: startLiveCapture,
  stop: stopLiveCapture,
  isActive: () => stream !== null
};

console.log('[Kino Content] Live video capturer loaded and ready');

// extension/capture.js

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
let analysisInterval;

async function startCapture() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always"
      },
      audio: false
    });
    video.srcObject = stream;
    // Once the stream is ready, start sending frames immediately.
    analysisInterval = setInterval(captureAndSendFrame, 5000);
  } catch (err) {
    console.error("Error accessing screen in capture window:", err);
    chrome.runtime.sendMessage({ type: 'capture_error', error: err.message });
    window.close(); // Close the window if permission is denied or cancelled
  }
}

function captureAndSendFrame() {
  if (!video.srcObject) return;
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg');

  // Send the frame to the background script
  chrome.runtime.sendMessage({ type: 'video_frame', dataUrl });
}

// Listen for messages from the main extension
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'start_capture') {
    if (analysisInterval) clearInterval(analysisInterval);
    analysisInterval = setInterval(captureAndSendFrame, 5000);
  } else if (request.action === 'stop_capture') {
    if (analysisInterval) clearInterval(analysisInterval);
    window.close();
  }
});

// When the window is closed, stop the stream
window.addEventListener('beforeunload', () => {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  if (analysisInterval) {
    clearInterval(analysisInterval);
  }
});

startCapture();

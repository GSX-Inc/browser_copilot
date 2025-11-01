// Speech Synthesis Utilities for Kino Accessibility

export interface SpeechOptions {
  rate?: number;   // 0.5 - 2.0
  pitch?: number;  // 0 - 2
  volume?: number; // 0 - 1
  voice?: SpeechSynthesisVoice;
}

/**
 * Speak text aloud using Web Speech API
 */
export function speak(text: string, options?: SpeechOptions): void {
  try {
    console.log('[Speech] Attempting to speak:', text.substring(0, 100) + '...');
    console.log('[Speech] Options:', options);
    console.log('[Speech] speechSynthesis available:', typeof speechSynthesis !== 'undefined');

    // Check if speech synthesis is available
    if (typeof speechSynthesis === 'undefined') {
      console.error('[Speech] speechSynthesis not available in this context');
      return;
    }

    // Cancel any ongoing speech
    if (speechSynthesis.speaking) {
      console.log('[Speech] Cancelling ongoing speech');
      speechSynthesis.cancel();
    }

    // Function to actually speak once voices are ready
    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Apply options with defaults
      utterance.rate = options?.rate || 1.0;
      utterance.pitch = options?.pitch || 1.0;
      utterance.volume = options?.volume || 1.0;

      // Use default voice if available
      let voices = speechSynthesis.getVoices();
      console.log('[Speech] Available voices:', voices.length);

      // If no voices yet, wait for them to load
      if (voices.length === 0) {
        console.log('[Speech] No voices available yet, waiting...');
        speechSynthesis.addEventListener('voiceschanged', () => {
          voices = speechSynthesis.getVoices();
          console.log('[Speech] Voices loaded:', voices.length);
          if (voices.length > 0) {
            const englishVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
            utterance.voice = englishVoice;
            console.log('[Speech] Using voice after load:', englishVoice.name);
          }
        }, { once: true });
      } else if (!options?.voice) {
        const englishVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
        utterance.voice = englishVoice;
        console.log('[Speech] Using voice:', englishVoice.name);
      }

      // Add event listeners for debugging
      utterance.onstart = () => {
        console.log('[Speech] ✅ Speech started successfully!');
      };

      utterance.onend = () => {
        console.log('[Speech] Speech ended');
      };

      utterance.onerror = (event) => {
        console.error('[Speech] ❌ Speech error:', event.error);
        console.error('[Speech] Error details:', event);
      };

      // Speak
      console.log('[Speech] Calling speechSynthesis.speak() with text length:', text.length);
      speechSynthesis.speak(utterance);

      // Immediate status check
      setTimeout(() => {
        console.log('[Speech] Status check - speaking:', speechSynthesis.speaking);
        console.log('[Speech] Status check - pending:', speechSynthesis.pending);
      }, 200);
    };

    // Wait for cancel to complete, then speak
    setTimeout(doSpeak, 150);

  } catch (error) {
    console.error('[Speech] Error in speak():', error);
  }
}

/**
 * Stop all speech
 */
export function stopSpeaking(): void {
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }
}

/**
 * Check if currently speaking
 */
export function isSpeaking(): boolean {
  return speechSynthesis.speaking;
}

/**
 * Get available voices
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices();
}

/**
 * Get default voice (prefer English)
 */
export function getDefaultVoice(): SpeechSynthesisVoice | undefined {
  const voices = getAvailableVoices();

  // Prefer English voices
  const englishVoice = voices.find(v => v.lang.startsWith('en'));
  if (englishVoice) return englishVoice;

  // Fall back to default
  return voices.find(v => v.default) || voices[0];
}

/**
 * Prepare text for speech (clean up for better pronunciation)
 */
export function prepareTextForSpeech(text: string): string {
  // Remove code blocks
  let cleaned = text.replace(/```[\s\S]*?```/g, 'code block');

  // Remove markdown formatting
  cleaned = cleaned.replace(/[*_~`]/g, '');

  // Replace common programming terms for better pronunciation
  cleaned = cleaned.replace(/\bAPI\b/g, 'A P I');
  cleaned = cleaned.replace(/\bURL\b/g, 'U R L');
  cleaned = cleaned.replace(/\bHTML\b/g, 'H T M L');
  cleaned = cleaned.replace(/\bCSS\b/g, 'C S S');
  cleaned = cleaned.replace(/\bUI\b/g, 'U I');
  cleaned = cleaned.replace(/\bUX\b/g, 'U X');

  // Limit length for speech (too long is overwhelming)
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500) + '... Response truncated for audio.';
  }

  return cleaned;
}

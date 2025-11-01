// Chrome Built-in AI APIs Integration
// Demonstrates all 7 available Built-in AI APIs with feature detection

/**
 * Chrome Built-in AI APIs Available:
 * 1. Prompt API (LanguageModel) - General purpose, multimodal
 * 2. Summarizer API - Text summarization
 * 3. Writer API - Content creation
 * 4. Rewriter API - Content improvement
 * 5. Proofreader API - Grammar/spelling correction
 * 6. Translator API - Language translation
 * 7. Language Detector API - Language identification
 */

// ===== 1. PROMPT API (LanguageModel) =====

export async function createPromptSession(options?: any) {
  try {
    if (typeof LanguageModel === 'undefined') {
      console.log('[Built-in AI] Prompt API not available');
      return null;
    }

    const session = await LanguageModel.create(options || {});
    console.log('[Built-in AI] Prompt API session created');
    return session;
  } catch (error) {
    console.error('[Built-in AI] Prompt API error:', error);
    return null;
  }
}

export async function promptWithText(question: string, systemPrompt?: string) {
  const session = await createPromptSession({
    initialPrompts: systemPrompt ? [{ role: 'system', content: systemPrompt }] : []
  });

  if (!session) return null;

  try {
    const response = await session.prompt(question);
    await session.destroy();
    return response;
  } catch (error) {
    console.error('[Built-in AI] Prompt error:', error);
    return null;
  }
}

export async function promptWithImage(question: string, imageBlob: Blob) {
  try {
    const session = await LanguageModel.create({
      expectedInputs: [{ type: "image" }]
    });

    if (!session) return null;

    await session.append([{
      role: 'user',
      content: [
        { type: 'text', value: question },
        { type: 'image', value: imageBlob }
      ]
    }]);

    const response = await session.prompt('');
    await session.destroy();
    return response;
  } catch (error) {
    console.error('[Built-in AI] Multimodal prompt error:', error);
    return null;
  }
}

// ===== 2. SUMMARIZER API =====

export async function summarizeText(text: string, options?: {
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
  format?: 'plain-text' | 'markdown';
  length?: 'short' | 'medium' | 'long';
}) {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.summarizer) {
      console.log('[Built-in AI] Summarizer API not available');
      return null;
    }

    const summarizer = await (window as any).ai.summarizer.create(options || {});
    const summary = await summarizer.summarize(text);
    await summarizer.destroy();

    console.log('[Built-in AI] Summary generated');
    return summary;
  } catch (error) {
    console.error('[Built-in AI] Summarizer error:', error);
    return null;
  }
}

// ===== 3. WRITER API =====

export async function writeContent(prompt: string, options?: {
  tone?: 'formal' | 'neutral' | 'casual';
  format?: 'plain-text' | 'markdown';
  length?: 'short' | 'medium' | 'long';
}) {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.writer) {
      console.log('[Built-in AI] Writer API not available');
      return null;
    }

    const writer = await (window as any).ai.writer.create(options || {});
    const content = await writer.write(prompt);
    await writer.destroy();

    console.log('[Built-in AI] Content written');
    return content;
  } catch (error) {
    console.error('[Built-in AI] Writer error:', error);
    return null;
  }
}

// ===== 4. REWRITER API =====

export async function rewriteContent(text: string, options?: {
  tone?: 'as-is' | 'more-formal' | 'more-casual';
  format?: 'as-is' | 'plain-text' | 'markdown';
  length?: 'as-is' | 'shorter' | 'longer';
}) {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.rewriter) {
      console.log('[Built-in AI] Rewriter API not available');
      return null;
    }

    const rewriter = await (window as any).ai.rewriter.create(options || {});
    const rewritten = await rewriter.rewrite(text);
    await rewriter.destroy();

    console.log('[Built-in AI] Content rewritten');
    return rewritten;
  } catch (error) {
    console.error('[Built-in AI] Rewriter error:', error);
    return null;
  }
}

// ===== 5. PROOFREADER API =====

export async function proofreadText(text: string) {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.proofreader) {
      console.log('[Built-in AI] Proofreader API not available');
      return null;
    }

    const proofreader = await (window as any).ai.proofreader.create();
    const corrected = await proofreader.proofread(text);
    await proofreader.destroy();

    console.log('[Built-in AI] Text proofread');
    return corrected;
  } catch (error) {
    console.error('[Built-in AI] Proofreader error:', error);
    return null;
  }
}

// ===== 6. TRANSLATOR API =====

export async function translateText(text: string, sourceLanguage: string, targetLanguage: string = 'en') {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.translator) {
      console.log('[Built-in AI] Translator API not available');
      return null;
    }

    const translator = await (window as any).ai.translator.create({
      sourceLanguage,
      targetLanguage
    });

    const translated = await translator.translate(text);
    await translator.destroy();

    console.log('[Built-in AI] Text translated from', sourceLanguage, 'to', targetLanguage);
    return translated;
  } catch (error) {
    console.error('[Built-in AI] Translator error:', error);
    return null;
  }
}

// ===== 7. LANGUAGE DETECTOR API =====

export async function detectLanguage(text: string) {
  try {
    if (typeof window === 'undefined' || !('ai' in window) || !(window as any).ai?.languageDetector) {
      console.log('[Built-in AI] Language Detector API not available');
      return null;
    }

    const detector = await (window as any).ai.languageDetector.create();
    const results = await detector.detect(text);
    await detector.destroy();

    // results is array of {language: 'en', confidence: 0.95}
    const topLanguage = results && results.length > 0 ? results[0] : null;

    if (topLanguage) {
      console.log('[Built-in AI] Language detected:', topLanguage.language, 'confidence:', topLanguage.confidence);
      return topLanguage.language;
    }

    return null;
  } catch (error) {
    console.error('[Built-in AI] Language Detector error:', error);
    return null;
  }
}

// ===== UTILITY FUNCTIONS =====

export async function checkBuiltInAIAvailability() {
  const availability = {
    promptAPI: typeof LanguageModel !== 'undefined',
    summarizer: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.summarizer,
    writer: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.writer,
    rewriter: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.rewriter,
    proofreader: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.proofreader,
    translator: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.translator,
    languageDetector: typeof window !== 'undefined' && 'ai' in window && !!(window as any).ai?.languageDetector
  };

  console.log('[Built-in AI] Availability check:', availability);
  return availability;
}

export function getAvailableAPIsCount(availability: any): number {
  return Object.values(availability).filter(Boolean).length;
}

// Declare LanguageModel as global (comes from Chrome)
declare global {
  const LanguageModel: {
    create: (options?: any) => Promise<any>;
    params: () => Promise<any>;
    availability: () => Promise<string>;
  };
}

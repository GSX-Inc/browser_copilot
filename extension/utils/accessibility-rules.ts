// WCAG Accessibility Rules and Utilities
// Reference: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum

// WCAG 2.1 Contrast Ratio Standards
export const WCAG_STANDARDS = {
  AA: {
    NORMAL_TEXT: 4.5,
    LARGE_TEXT: 3.0,
  },
  AAA: {
    NORMAL_TEXT: 7.0,
    LARGE_TEXT: 4.5,
  },
};

// Large text is defined as 18pt+ or 14pt+ bold
export const LARGE_TEXT_THRESHOLD = {
  SIZE_PX: 24, // 18pt ≈ 24px at 96 DPI
  SIZE_PX_BOLD: 19, // 14pt ≈ 18.5px at 96 DPI
};

/**
 * Convert RGB color to relative luminance
 * Formula from WCAG 2.1: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  // Normalize RGB values to 0-1 range
  const [rs, gs, bs] = [r, g, b].map(val => {
    const normalized = val / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  // Calculate relative luminance
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * Formula: (L1 + 0.05) / (L2 + 0.05)
 * where L1 is the lighter color and L2 is the darker color
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
  const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse CSS color string to RGB object
 * Supports: rgb(r,g,b), rgba(r,g,b,a), #hex, named colors
 */
export function parseColor(colorString: string): RGB | null {
  // Create a temporary element to leverage browser's color parsing
  const temp = document.createElement('div');
  temp.style.color = colorString;
  document.body.appendChild(temp);

  const computed = window.getComputedStyle(temp).color;
  document.body.removeChild(temp);

  // Parse rgb/rgba format
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return {
      r: parseInt(match[1]),
      g: parseInt(match[2]),
      b: parseInt(match[3]),
    };
  }

  return null;
}

/**
 * Check if contrast ratio meets WCAG standards
 */
export function meetsWCAGStandard(
  ratio: number,
  level: 'AA' | 'AAA',
  isLargeText: boolean
): boolean {
  const threshold = isLargeText
    ? WCAG_STANDARDS[level].LARGE_TEXT
    : WCAG_STANDARDS[level].NORMAL_TEXT;

  return ratio >= threshold;
}

/**
 * Determine if text is "large" according to WCAG
 */
export function isLargeText(element: HTMLElement): boolean {
  const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
  const fontWeight = window.getComputedStyle(element).fontWeight;
  const isBold = parseInt(fontWeight) >= 700 || fontWeight === 'bold';

  if (isBold) {
    return fontSize >= LARGE_TEXT_THRESHOLD.SIZE_PX_BOLD;
  }
  return fontSize >= LARGE_TEXT_THRESHOLD.SIZE_PX;
}

/**
 * Get the effective background color of an element
 * Walks up the DOM tree to find the first non-transparent background
 */
export function getEffectiveBackgroundColor(element: HTMLElement): RGB | null {
  let current: HTMLElement | null = element;

  while (current && current !== document.body.parentElement) {
    const bgColor = window.getComputedStyle(current).backgroundColor;
    const parsed = parseColor(bgColor);

    if (parsed && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return parsed;
    }

    current = current.parentElement;
  }

  // Default to white if no background found
  return { r: 255, g: 255, b: 255 };
}

/**
 * RGB color interface
 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Contrast check result
 */
export interface ContrastCheckResult {
  ratio: number;
  meetsAA: boolean;
  meetsAAA: boolean;
  isLarge: boolean;
  foreground: RGB;
  background: RGB;
}

/**
 * Perform a complete contrast check on an element
 */
export function checkElementContrast(element: HTMLElement): ContrastCheckResult | null {
  const color = window.getComputedStyle(element).color;
  const foreground = parseColor(color);
  const background = getEffectiveBackgroundColor(element);

  if (!foreground || !background) {
    return null;
  }

  const ratio = getContrastRatio(foreground, background);
  const large = isLargeText(element);

  return {
    ratio,
    meetsAA: meetsWCAGStandard(ratio, 'AA', large),
    meetsAAA: meetsWCAGStandard(ratio, 'AAA', large),
    isLarge: large,
    foreground,
    background,
  };
}

/**
 * Format contrast ratio for display
 */
export function formatContrastRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/**
 * Get WCAG level description for contrast ratio
 */
export function getContrastLevel(ratio: number, isLarge: boolean): string {
  if (meetsWCAGStandard(ratio, 'AAA', isLarge)) {
    return 'AAA (Enhanced)';
  } else if (meetsWCAGStandard(ratio, 'AA', isLarge)) {
    return 'AA (Minimum)';
  } else {
    return 'Fail';
  }
}

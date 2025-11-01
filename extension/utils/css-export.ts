// CSS Export Utilities
// Convert color palettes to various formats

import { ColorPalette } from '../types';

/**
 * Export palette as CSS variables
 */
export function exportAsCSS(palette: ColorPalette): string {
  return `:root {
${palette.colors.map((color, i) => `  --color-${color.role}: ${color.hex}; /* ${color.usage} */`).join('\n')}
}

/* Usage Examples */
.button-primary {
  background-color: var(--color-primary);
}

.text-neutral {
  color: var(--color-neutral);
}`;
}

/**
 * Export palette as SCSS variables
 */
export function exportAsSCSS(palette: ColorPalette): string {
  return `// Color Palette Variables
${palette.colors.map(color => `$color-${color.role}: ${color.hex}; // ${color.usage}`).join('\n')}

// Usage Examples
.button-primary {
  background-color: $color-primary;
}

.text-neutral {
  color: $color-neutral;
}`;
}

/**
 * Export palette as JavaScript object
 */
export function exportAsJS(palette: ColorPalette): string {
  return `// Color Palette
export const colors = {
${palette.colors.map(color => `  ${color.role}: '${color.hex}', // ${color.usage}`).join('\n')}
};

// Usage Example (React/JS)
// style={{ backgroundColor: colors.primary }}`;
}

/**
 * Export palette as TypeScript
 */
export function exportAsTS(palette: ColorPalette): string {
  return `// Color Palette
export const colors = {
${palette.colors.map(color => `  ${color.role}: '${color.hex}' as const, // ${color.usage}`).join('\n')}
} as const;

export type ColorRole = keyof typeof colors;

// Usage Example (React/TS)
// style={{ backgroundColor: colors.primary }}`;
}

/**
 * Export palette as Tailwind config
 */
export function exportAsTailwind(palette: ColorPalette): string {
  return `// Tailwind CSS Configuration
module.exports = {
  theme: {
    extend: {
      colors: {
${palette.colors.map(color => `        ${color.role}: '${color.hex}', // ${color.usage}`).join('\n')}
      }
    }
  }
}

// Usage Example
// className="bg-primary text-neutral"`;
}

/**
 * Export palette as JSON
 */
export function exportAsJSON(palette: ColorPalette): string {
  return JSON.stringify(palette, null, 2);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Download text as file
 */
export function downloadAsFile(content: string, filename: string, type: string = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

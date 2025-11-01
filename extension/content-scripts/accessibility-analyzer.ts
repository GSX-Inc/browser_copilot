// Accessibility Analyzer Content Script
// Scans the DOM for WCAG compliance issues

import { checkElementContrast, formatContrastRatio, getContrastLevel } from '../utils/accessibility-rules';
import { AccessibilityIssue, AuditResult } from '../types';

/**
 * Main audit function - scans page and returns all issues
 */
function runAccessibilityAudit(): AuditResult {
  const startTime = performance.now();
  const issues: AccessibilityIssue[] = [];
  let totalElements = 0;

  // Check 1: Missing alt text on images
  issues.push(...checkMissingAltText());

  // Check 2: Heading hierarchy violations
  issues.push(...checkHeadingOrder());

  // Check 3: Missing form labels
  issues.push(...checkFormLabels());

  // Check 4: Color contrast issues
  issues.push(...checkColorContrast());

  // Check 5: Missing or improper ARIA attributes
  issues.push(...checkAriaAttributes());

  // Count total elements scanned
  totalElements = document.querySelectorAll('*').length;

  // Calculate score (100 - penalties based on severity)
  const score = calculateAccessibilityScore(issues, totalElements);

  const endTime = performance.now();

  return {
    issues,
    score,
    totalElements,
    scanTime: Math.round(endTime - startTime),
    timestamp: Date.now(),
  };
}

/**
 * Check for images missing alt text
 */
function checkMissingAltText(): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const images = document.querySelectorAll('img');

  images.forEach((img, index) => {
    // Check if alt attribute exists and is not empty
    const hasAlt = img.hasAttribute('alt');
    const altText = img.getAttribute('alt')?.trim();

    if (!hasAlt || !altText) {
      // Decorative images (empty alt) are okay if explicitly empty
      if (hasAlt && altText === '') {
        return; // This is acceptable for decorative images
      }

      const selector = getElementSelector(img, index);
      const isDecorative = checkIfDecorativeImage(img);

      issues.push({
        type: 'missing-alt',
        severity: isDecorative ? 'info' : 'critical',
        element: selector,
        message: `Image missing alt text`,
        suggestion: isDecorative
          ? 'If this image is decorative, add alt="" to mark it as such'
          : 'Add descriptive alt text to explain the image content',
        wcagReference: 'WCAG 1.1.1 Non-text Content (Level A)',
      });
    }
  });

  return issues;
}

/**
 * Check heading hierarchy (H1 -> H2 -> H3, etc.)
 */
function checkHeadingOrder(): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  if (headings.length === 0) return issues;

  let previousLevel = 0;

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName[1]);
    const selector = getElementSelector(heading, index);

    // Check for H1 count (should ideally be one per page)
    if (level === 1 && index > 0 && previousLevel === 1) {
      issues.push({
        type: 'heading-order',
        severity: 'warning',
        element: selector,
        message: 'Multiple H1 headings found on page',
        suggestion: 'Use only one H1 per page for the main title',
        wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
      });
    }

    // Check for skipped heading levels
    if (previousLevel > 0 && level > previousLevel + 1) {
      issues.push({
        type: 'heading-order',
        severity: 'warning',
        element: selector,
        message: `Heading level skipped (H${previousLevel} → H${level})`,
        suggestion: `Use H${previousLevel + 1} instead of H${level} to maintain hierarchy`,
        wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
      });
    }

    previousLevel = level;
  });

  return issues;
}

/**
 * Check for form inputs missing associated labels
 */
function checkFormLabels(): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

  inputs.forEach((input, index) => {
    const hasLabel = hasAssociatedLabel(input as HTMLElement);
    const hasAriaLabel = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby');

    if (!hasLabel && !hasAriaLabel) {
      const selector = getElementSelector(input, index);
      const type = input.getAttribute('type') || input.tagName.toLowerCase();

      issues.push({
        type: 'missing-label',
        severity: 'critical',
        element: selector,
        message: `Form ${type} missing label`,
        suggestion: 'Add a <label> element or aria-label attribute',
        wcagReference: 'WCAG 1.3.1 Info and Relationships (Level A)',
      });
    }
  });

  return issues;
}

/**
 * Check color contrast ratios for text elements
 */
function checkColorContrast(): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Sample text elements (checking all would be too slow)
  const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, li, td, th, label, span');
  const sampled = Array.from(textElements).filter((_, i) => i % 3 === 0).slice(0, 50); // Sample every 3rd, max 50

  sampled.forEach((element, index) => {
    const htmlElement = element as HTMLElement;

    // Skip if element has no visible text
    if (!htmlElement.textContent?.trim()) return;

    // Skip if element is hidden
    const style = window.getComputedStyle(htmlElement);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return;
    }

    const contrastResult = checkElementContrast(htmlElement);

    if (contrastResult && !contrastResult.meetsAA) {
      const selector = getElementSelector(element, index);
      const ratio = formatContrastRatio(contrastResult.ratio);
      const level = getContrastLevel(contrastResult.ratio, contrastResult.isLarge);

      issues.push({
        type: 'contrast',
        severity: 'critical',
        element: selector,
        message: `Insufficient color contrast: ${ratio} (${level})`,
        suggestion: `Increase contrast to at least ${contrastResult.isLarge ? '3:1' : '4.5:1'} for WCAG AA compliance`,
        wcagReference: 'WCAG 1.4.3 Contrast (Minimum) (Level AA)',
      });
    }
  });

  return issues;
}

/**
 * Check for missing or improper ARIA attributes
 */
function checkAriaAttributes(): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];

  // Check buttons without accessible names
  const buttons = document.querySelectorAll('button, [role="button"]');
  buttons.forEach((button, index) => {
    const hasText = button.textContent?.trim();
    const hasAriaLabel = button.hasAttribute('aria-label') || button.hasAttribute('aria-labelledby');
    const hasTitle = button.hasAttribute('title');

    if (!hasText && !hasAriaLabel && !hasTitle) {
      const selector = getElementSelector(button, index);
      issues.push({
        type: 'aria-missing',
        severity: 'critical',
        element: selector,
        message: 'Button without accessible name',
        suggestion: 'Add text content, aria-label, or aria-labelledby attribute',
        wcagReference: 'WCAG 4.1.2 Name, Role, Value (Level A)',
      });
    }
  });

  // Check links without accessible text
  const links = document.querySelectorAll('a[href]');
  links.forEach((link, index) => {
    const hasText = link.textContent?.trim();
    const hasAriaLabel = link.hasAttribute('aria-label');
    const hasTitle = link.hasAttribute('title');

    if (!hasText && !hasAriaLabel && !hasTitle) {
      const selector = getElementSelector(link, index);
      issues.push({
        type: 'aria-missing',
        severity: 'warning',
        element: selector,
        message: 'Link without accessible text',
        suggestion: 'Add descriptive text or aria-label to explain link purpose',
        wcagReference: 'WCAG 2.4.4 Link Purpose (In Context) (Level A)',
      });
    }
  });

  return issues;
}

/**
 * Helper: Check if input has an associated label
 */
function hasAssociatedLabel(input: HTMLElement): boolean {
  const id = input.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return true;
  }

  // Check if input is wrapped in a label
  let parent = input.parentElement;
  while (parent) {
    if (parent.tagName === 'LABEL') return true;
    parent = parent.parentElement;
  }

  return false;
}

/**
 * Helper: Check if image is likely decorative
 */
function checkIfDecorativeImage(img: HTMLImageElement): boolean {
  // Heuristics for decorative images
  const src = img.src.toLowerCase();
  const className = img.className.toLowerCase();

  // Common patterns for decorative images
  const decorativePatterns = [
    'icon', 'logo', 'decoration', 'spacer', 'divider',
    'background', 'banner', 'separator'
  ];

  return decorativePatterns.some(pattern =>
    src.includes(pattern) || className.includes(pattern)
  );
}

/**
 * Helper: Generate a CSS selector for an element
 */
function getElementSelector(element: Element, index: number): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';

  if (id) return `${tag}${id}`;
  if (classes) return `${tag}${classes}`;
  return `${tag}:nth-of-type(${index + 1})`;
}

/**
 * Calculate overall accessibility score
 */
function calculateAccessibilityScore(issues: AccessibilityIssue[], totalElements: number): number {
  let score = 100;

  // Deduct points based on severity
  issues.forEach(issue => {
    switch (issue.severity) {
      case 'critical':
        score -= 5;
        break;
      case 'warning':
        score -= 2;
        break;
      case 'info':
        score -= 0.5;
        break;
    }
  });

  // Bonus for small number of issues relative to page size
  const issueRatio = issues.length / Math.max(totalElements / 100, 1);
  if (issueRatio < 1) {
    score += 5;
  }

  // Clamp score between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Export for use when injected as content script
if (typeof window !== 'undefined') {
  (window as any).runAccessibilityAudit = runAccessibilityAudit;
}

export { runAccessibilityAudit };

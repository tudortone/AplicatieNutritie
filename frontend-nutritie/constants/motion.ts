/**
 * Centralized motion tokens and transition standards for GetFlow.
 * Aligned with P1-06 Reduce Motion Accessibility and performance constraints.
 */

export const MOTION_DURATIONS = {
  instant: 0,
  quick: 100,
  fast: 150,
  standard: 250,
  entering: 350,
  feedback: 500,
  feedbackReduced: 350,
} as const;

export const SPRING_CONFIGS = {
  snappy: { damping: 18, stiffness: 200, mass: 0.6 },
  standard: { damping: 16, stiffness: 140, mass: 0.7 },
  gentle: { damping: 20, stiffness: 100, mass: 0.8 },
} as const;

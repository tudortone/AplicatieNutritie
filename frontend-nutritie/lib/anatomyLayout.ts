import type { BodyView } from '../constants/muscles';

const VIEW_BOX = {
  front: { width: 424, height: 804 },
  back: { width: 431, height: 807 },
} as const;

export function anatomyMapSize(view: BodyView, requestedWidth: number, maxHeight = Number.POSITIVE_INFINITY) {
  const box = VIEW_BOX[view];
  const safeWidth = Number.isFinite(requestedWidth) ? Math.max(0, requestedWidth) : 0;
  const heightLimitedWidth = Number.isFinite(maxHeight)
    ? Math.max(0, maxHeight) * box.width / box.height
    : safeWidth;
  const width = Math.min(safeWidth, heightLimitedWidth);
  return { width, height: width * box.height / box.width };
}

/** Two maps, a 16dp gap, 16dp screen gutters and a 300dp vertical budget. */
export function dualAnatomyMapWidth(viewportWidth: number): number {
  const availableWidth = Math.min(Math.max(0, viewportWidth - 32), 720);
  const horizontalWidth = Math.max(0, (availableWidth - 16) / 2);
  const frontHeightWidth = 300 * VIEW_BOX.front.width / VIEW_BOX.front.height;
  const backHeightWidth = 300 * VIEW_BOX.back.width / VIEW_BOX.back.height;
  return Math.floor(Math.min(horizontalWidth, frontHeightWidth, backHeightWidth));
}

/** Responsive single-map width used by Home and the detailed anatomy card. */
export function singleAnatomyMapWidth(viewportWidth: number, maxWidth: number): number {
  const responsiveWidth = Math.floor(Math.max(0, viewportWidth - 96) * 0.62);
  return Math.min(maxWidth, Math.max(120, responsiveWidth));
}

const HAND_AVAILABLE_WIDTH = 632;
const CARD_WIDTH = 64;
const COMPACT_HAND_STEP = 34;

export function leafHandStep(cardCount: number): number {
  if (cardCount <= 1) return CARD_WIDTH;
  return Math.min(COMPACT_HAND_STEP, (HAND_AVAILABLE_WIDTH - CARD_WIDTH) / (cardCount - 1));
}

export function leafHandWidth(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return CARD_WIDTH + leafHandStep(cardCount) * (cardCount - 1);
}

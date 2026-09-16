/**
 * gestures.js — Real-time MediaPipe hand landmark gesture classifier.
 *
 * Classifies gestures for a SINGLE hand:
 *   - 'CLOSED_FIST'   : All fingers curled into a fist → triggers mist build-up
 *   - 'POINTING'      : Index finger strictly extended, other fingers curled → draws / wipes mist
 *   - 'OPEN_PALM'     : All fingers extended → resets / clears mist to clean video
 *   - 'OTHER'         : Hand moving between gestures or neutral
 */

function dist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Checks extension of each finger using relative distances from the wrist.
 *
 * @param {Array<{x: number, y: number, z?: number}>} lm - 21 MediaPipe landmarks
 * @returns {{
 *   thumb: boolean,
 *   index: boolean,
 *   middle: boolean,
 *   ring: boolean,
 *   pinky: boolean,
 *   extendedCount: number
 * }}
 */
export function analyzeFingerExtensions(lm) {
  if (!lm || lm.length < 21) {
    return {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
      extendedCount: 0,
    };
  }

  const wrist = lm[0];
  const palmScale = Math.max(0.01, dist(lm[5], lm[17]));

  // Index (MCP: 5, PIP: 6, TIP: 8)
  const dIndexTip = dist(lm[8], wrist);
  const dIndexPip = dist(lm[6], wrist);
  const dIndexMcp = dist(lm[5], wrist);
  const index = dIndexTip > dIndexPip * 1.15 && dIndexTip > dIndexMcp * 1.25;

  // Middle (MCP: 9, PIP: 10, TIP: 12)
  const dMiddleTip = dist(lm[12], wrist);
  const dMiddlePip = dist(lm[10], wrist);
  const middle = dMiddleTip > dMiddlePip * 1.12;

  // Ring (MCP: 13, PIP: 14, TIP: 16)
  const dRingTip = dist(lm[16], wrist);
  const dRingPip = dist(lm[14], wrist);
  const ring = dRingTip > dRingPip * 1.12;

  // Pinky (MCP: 17, PIP: 18, TIP: 20)
  const dPinkyTip = dist(lm[20], wrist);
  const dPinkyPip = dist(lm[18], wrist);
  const pinky = dPinkyTip > dPinkyPip * 1.12;

  // Thumb: distance from thumb tip (4) to index MCP (5)
  const thumbDistToIndex = dist(lm[4], lm[5]) / palmScale;
  const thumb = thumbDistToIndex > 0.85;

  const extendedCount = [thumb, index, middle, ring, pinky].filter(Boolean).length;

  return {
    thumb,
    index,
    middle,
    ring,
    pinky,
    extendedCount,
  };
}

/**
 * Strict verification that ONLY the index fingertip (Landmark 8) of a single hand
 * is extended, while middle, ring, and pinky fingers are curled into the palm.
 *
 * @param {Array<{x: number, y: number, z?: number}>} lm - 21 landmarks of single hand
 * @returns {boolean}
 */
export function isIndexFingerStrictlyPointing(lm) {
  if (!lm || lm.length < 21) return false;

  const wrist = lm[0];

  // Index (MCP: 5, PIP: 6, TIP: 8) - must be extended
  const dIndexTip = dist(lm[8], wrist);
  const dIndexPip = dist(lm[6], wrist);
  const dIndexMcp = dist(lm[5], wrist);
  const indexExtended = dIndexTip > dIndexPip * 1.15 && dIndexTip > dIndexMcp * 1.25;

  // Middle (MCP: 9, PIP: 10, TIP: 12) - must be curled
  const dMiddleTip = dist(lm[12], wrist);
  const dMiddlePip = dist(lm[10], wrist);
  const middleCurled = dMiddleTip <= dMiddlePip * 1.10;

  // Ring (MCP: 13, PIP: 14, TIP: 16) - must be curled
  const dRingTip = dist(lm[16], wrist);
  const dRingPip = dist(lm[14], wrist);
  const ringCurled = dRingTip <= dRingPip * 1.10;

  // Pinky (MCP: 17, PIP: 18, TIP: 20) - must be curled
  const dPinkyTip = dist(lm[20], wrist);
  const dPinkyPip = dist(lm[18], wrist);
  const pinkyCurled = dPinkyTip <= dPinkyPip * 1.10;

  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

/**
 * Classifies the 21 MediaPipe hand landmarks of a single hand into a clean gesture state.
 *
 * @param {Array<{x: number, y: number, z?: number}>} landmarks
 * @returns {'CLOSED_FIST' | 'POINTING' | 'OPEN_PALM' | 'OTHER'}
 */
export function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return 'OTHER';

  const ext = analyzeFingerExtensions(landmarks);

  // 1. OPEN_PALM: all 4 main fingers extended
  if (ext.index && ext.middle && ext.ring && ext.pinky) {
    return 'OPEN_PALM';
  }

  // 2. CLOSED_FIST: none of the 4 main fingers extended
  if (!ext.index && !ext.middle && !ext.ring && !ext.pinky) {
    return 'CLOSED_FIST';
  }

  // 3. POINTING: strict index finger pointing (only index extended, other 3 curled)
  if (isIndexFingerStrictlyPointing(landmarks)) {
    return 'POINTING';
  }

  return 'OTHER';
}

/**
 * Debouncer class to prevent rapid single-frame flickers when transitioning gestures.
 */
export class GestureDebouncer {
  constructor(holdFrames = 3) {
    this.holdFrames = holdFrames;
    this.candidate = 'OTHER';
    this.confirmed = 'OTHER';
    this.count = 0;
  }

  update(landmarks) {
    const raw = classifyGesture(landmarks);

    if (raw === this.candidate) {
      this.count += 1;
    } else {
      this.candidate = raw;
      this.count = 1;
    }

    if (this.count >= this.holdFrames) {
      this.confirmed = this.candidate;
    }

    return this.confirmed;
  }

  reset() {
    this.candidate = 'OTHER';
    this.confirmed = 'OTHER';
    this.count = 0;
  }
}

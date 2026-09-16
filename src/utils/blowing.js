/**
 * Blow detection logic from MediaPipe face landmarks.
 *
 * Key mouth landmarks used:
 *  - 13: upper lip center (inner)
 *  - 14: lower lip center (inner)
 *  - 61: left mouth corner
 *  - 291: right mouth corner
 *  - 78: upper lip left
 *  - 308: upper lip right
 */

import { BLOW_CONFIG } from '../config.js';

/**
 * Compute the mouth aspect ratio (MAR) and blow-likeness from face landmarks.
 * MAR = vertical opening / horizontal width.
 * A blowing face has a wide, relatively flat mouth → low MAR.
 *
 * @param {Array} landmarks - Array of {x, y, z} normalized landmarks
 * @returns {{ mar: number, isBlowShape: boolean, openness: number }}
 */
export function analyzeMouthForBlow(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return { mar: 0, isBlowShape: false, openness: 0 };
  }

  // Vertical: distance between upper and lower inner lip
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  const verticalDist = Math.hypot(
    upperLip.x - lowerLip.x,
    upperLip.y - lowerLip.y
  );

  // Horizontal: distance between mouth corners
  const leftCorner = landmarks[61];
  const rightCorner = landmarks[291];
  const horizontalDist = Math.hypot(
    leftCorner.x - rightCorner.x,
    leftCorner.y - rightCorner.y
  );

  if (horizontalDist < 0.001) {
    return { mar: 0, isBlowShape: false, openness: 0 };
  }

  const mar = verticalDist / horizontalDist;

  // Openness: normalized vertical opening relative to face size
  // Use nose tip (1) and chin (152) as face height reference
  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const faceHeight = Math.hypot(
    noseTip.x - chin.x,
    noseTip.y - chin.y
  );
  const openness = faceHeight > 0 ? verticalDist / faceHeight : 0;

  // Blow shape: mouth is open (enough vertical) but wide (low MAR)
  const isBlowShape =
    mar < BLOW_CONFIG.mouthAspectRatioThreshold &&
    openness > BLOW_CONFIG.minMouthOpenness;

  return { mar, isBlowShape, openness };
}

/**
 * Blow state accumulator — call once per face detection frame.
 * Returns updated blowIntensity (0→1).
 */
export function updateBlowIntensity(prevIntensity, isBlowShape, deltaTime) {
  const dt = Math.min(deltaTime, 0.1); // clamp to avoid huge jumps

  if (isBlowShape) {
    // Ramp up
    return Math.min(
      1,
      prevIntensity + BLOW_CONFIG.intensityGrowthRate * dt * 60
    );
  } else {
    // Decay
    return Math.max(
      0,
      prevIntensity - BLOW_CONFIG.intensityDecayRate * dt * 60
    );
  }
}

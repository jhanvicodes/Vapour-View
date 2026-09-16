/**
 * Tunable parameters for mic blow detection, fog behavior, and gesture recognition.
 *
 * MIC_BLOW_CONFIG  — Web Audio blow detector
 * FOG_CONFIG       — fog physics / rendering
 * GESTURE_CONFIG   — hand gesture classifier thresholds
 */

// ── Microphone blow detection ─────────────────────────────────────────────────
export const MIC_BLOW_CONFIG = {
  // AnalyserNode FFT size (power of two). 1024 → ~43 Hz/bin at 44 100 Hz.
  fftSize: 1024,

  // AnalyserNode time-domain smoothing (0 = none, 0.9 = very smooth)
  smoothingTimeConstant: 0.6,

  // Frequency band to analyse for blow energy (Hz).
  blowBandLowHz:  80,
  blowBandHighHz: 2500,

  // RMS energy threshold [0, 1]. Raise to require harder blows; lower for softer.
  rmsThreshold: 0.09,

  // Expected RMS at a strong blow — normalises blowIntensity to [0, 1].
  rmsMaxExpected: 0.55,

  // Spectral flatness threshold [0, 1].
  // White noise ≈ 1.0 | Speech ≈ 0.1–0.25 | Blow ≈ 0.35–0.7
  flatnessThreshold: 0.32,

  // Consecutive frames required before blowIntensity rises (~100 ms at 60 FPS).
  persistenceFrames: 6,

  // Frame-count decay speed when blow stops (2 = drops 2× faster than it rises).
  decayFrames: 2,

  // EMA alpha for attack (blow starts) and decay (blow stops).
  attackAlpha: 0.18,
  decayAlpha: 0.06,
};

// ── Fog physics / rendering ───────────────────────────────────────────────────
export const FOG_CONFIG = {
  // Maximum fog density [0, 1].
  maxDensity: 0.97,

  // Fog natural dissipation rate per second (very slow — fog lingers).
  dissipationRate: 0.004,

  // Rate at which wiped areas regenerate fog per second.
  regenerationRate: 0.012,

  // ── CHANGE 1: Smaller wipe brush ─────────────────────────────────────────
  // Was 38 px — reduced to 22 px for finer, more precise fingertip wiping.
  wipeRadius: 22,

  // Softness of wipe edge (0 = hard circle, 1 = very feathered).
  wipeSoftness: 0.65,

  // Fog growth rate driven by blow intensity (density / second / unit intensity).
  // ── CHANGE 1 (density): raised from 0.35 → 0.65 for faster, thicker buildup.
  fogGrowthRate: 0.65,

  // ── CHANGE 1 (density): base alpha multiplier raised for denser appearance.
  // Controls the minimum opacity factor in the render pass (was 0.78).
  fogBaseAlpha: 0.92,

  // Noise animation speed.
  noiseSpeed: 0.0003,

  // ── CHANGE 4: Fist-triggered fog growth rate (density / second).
  // Slower than a blow so users feel deliberate control.
  fistFogGrowthRate: 0.22,
};

// ── Hand gesture classifier ───────────────────────────────────────────────────
export const GESTURE_CONFIG = {
  // Frames a gesture must be held continuously before it is "confirmed".
  // At ~30 FPS hand detection, 8 frames ≈ 270 ms — avoids accidental triggers.
  gestureHoldFrames: 8,

  // Thumb extension: ratio of tip-to-indexMCP distance vs palm width.
  // Values >0.6 = thumb is clearly spread out.
  thumbExtensionRatio: 0.6,

  // How many consecutive confirmed OPEN_PALM frames trigger a clear.
  // Prevents a momentary open hand from wiping the screen.
  palmClearHoldFrames: 12,

  // How many consecutive confirmed CLOSED_FIST frames before fist fog starts.
  fistFogHoldFrames: 8,
};

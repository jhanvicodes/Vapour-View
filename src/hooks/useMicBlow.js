/**
 * useMicBlow — microphone blow detection hook
 *
 * Uses the Web Audio API to analyze microphone input in real time.
 * Detects the characteristic acoustic signature of blowing air into a mic:
 *
 *   Blowing = broadband low-frequency noise burst
 *   Speech  = harmonic, narrowband, pitched
 *   Silence = low overall energy
 *
 * Detection algorithm (two-factor):
 *
 *   1. RMS energy     — blowing has high overall volume
 *   2. Spectral flatness — blowing is broadband (white-noise-like),
 *                          speech is tonal (narrow spectral peaks)
 *
 *   Spectral flatness = geometric_mean(|X[k]|) / arithmetic_mean(|X[k]|)
 *   Range: 0 (pure tone) → 1 (white noise)
 *
 *   blow = (rms > RMS_THRESHOLD) AND (flatness > FLATNESS_THRESHOLD)
 *
 * The resulting blowIntensity [0, 1] is fed into the fog density system.
 *
 * @param {object} options
 * @param {MediaStream|null} options.stream     — the getUserMedia audio stream
 * @param {function}         options.onBlow     — called each frame with blowIntensity (0-1)
 * @param {boolean}          options.enabled    — pause analysis when false
 */

import { useEffect, useRef } from 'react';
import { MIC_BLOW_CONFIG } from '../config.js';

export function useMicBlow({ stream, onBlow, enabled = true }) {
  const audioCtxRef   = useRef(null);
  const analyserRef   = useRef(null);
  const sourceRef     = useRef(null);
  const rafRef        = useRef(null);
  const smoothedRef   = useRef(0); // smoothed blowIntensity across frames
  const blowCountRef  = useRef(0); // consecutive frames of detected blow

  // ── Build the audio graph when the stream becomes available ─────────────────
  useEffect(() => {
    if (!stream || !enabled) return;

    // Only use tracks that carry audio
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let cancelled = false;

    async function initAudio() {
      try {
        // Resume AudioContext — browsers suspend it until a user gesture.
        // getUserMedia itself counts as a gesture so this normally resolves
        // immediately, but we still call resume() defensively.
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        if (cancelled) { ctx.close(); return; }

        // Analyser FFT: 1024 bins → ~43 Hz resolution at 44 100 Hz sample rate.
        // Covers the blow frequency range (100–2000 Hz) in bins 2–46.
        const analyser = ctx.createAnalyser();
        analyser.fftSize = MIC_BLOW_CONFIG.fftSize;
        analyser.smoothingTimeConstant = MIC_BLOW_CONFIG.smoothingTimeConstant;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        // NOTE: do NOT connect to ctx.destination — we never want to hear ourselves

        audioCtxRef.current  = ctx;
        analyserRef.current  = analyser;
        sourceRef.current    = source;
      } catch (err) {
        console.warn('useMicBlow: audio init failed', err);
      }
    }

    initAudio();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sourceRef.current?.disconnect();
      audioCtxRef.current?.close();
      audioCtxRef.current  = null;
      analyserRef.current  = null;
      sourceRef.current    = null;
      smoothedRef.current  = 0;
      blowCountRef.current = 0;
    };
  }, [stream, enabled]);

  // ── Analysis loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    let active = true;
    const dataBuffer = new Uint8Array(MIC_BLOW_CONFIG.fftSize / 2); // freq bins

    function analyze() {
      if (!active) return;
      rafRef.current = requestAnimationFrame(analyze);

      const analyser = analyserRef.current;
      if (!analyser) return;

      // Pull frequency magnitude data (0–255 per bin, log-scale dB mapped)
      analyser.getByteFrequencyData(dataBuffer);

      // ── 1. Restrict to the blow frequency band ─────────────────────────────
      // Blow energy concentrates in roughly 80–2500 Hz.
      // Bin index = frequency / (sampleRate / fftSize)
      const sampleRate = audioCtxRef.current?.sampleRate ?? 44100;
      const binHz      = sampleRate / MIC_BLOW_CONFIG.fftSize;
      const binLo      = Math.max(1, Math.floor(MIC_BLOW_CONFIG.blowBandLowHz  / binHz));
      const binHi      = Math.min(dataBuffer.length - 1,
                          Math.ceil(MIC_BLOW_CONFIG.blowBandHighHz / binHz));

      const bandLen = binHi - binLo + 1;
      if (bandLen < 2) return;

      // ── 2. RMS energy of the band ──────────────────────────────────────────
      let sumSq = 0;
      for (let i = binLo; i <= binHi; i++) {
        const v = dataBuffer[i] / 255; // normalise to [0, 1]
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / bandLen); // [0, 1]

      // ── 3. Spectral flatness of the band ──────────────────────────────────
      // Geometric mean / arithmetic mean.
      // Pure noise → ≈1.  Pure tone (speech) → ≈0.
      let logSum  = 0;
      let linSum  = 0;
      let nonZero = 0;
      for (let i = binLo; i <= binHi; i++) {
        const v = dataBuffer[i] / 255 + 1e-10; // avoid log(0)
        logSum += Math.log(v);
        linSum += v;
        nonZero++;
      }
      const geoMean = Math.exp(logSum / nonZero);
      const ariMean = linSum / nonZero;
      const flatness = ariMean > 1e-10 ? geoMean / ariMean : 0; // [0, 1]

      // ── 4. Decide blow vs. non-blow ────────────────────────────────────────
      const cfg = MIC_BLOW_CONFIG;
      const isBlowFrame =
        rms     >= cfg.rmsThreshold      &&
        flatness >= cfg.flatnessThreshold;

      if (isBlowFrame) {
        blowCountRef.current = Math.min(blowCountRef.current + 1, cfg.persistenceFrames * 2);
      } else {
        blowCountRef.current = Math.max(0, blowCountRef.current - cfg.decayFrames);
      }

      // Require sustained detection before ramping up intensity
      const isBlowing = blowCountRef.current >= cfg.persistenceFrames;

      // ── 5. Smooth the intensity ────────────────────────────────────────────
      // When blowing: ramp toward a target driven by RMS above threshold.
      // When not: decay toward zero.
      const rawIntensity = isBlowing
        ? Math.min(1, (rms - cfg.rmsThreshold) / (cfg.rmsMaxExpected - cfg.rmsThreshold))
        : 0;

      const alpha = isBlowing ? cfg.attackAlpha : cfg.decayAlpha;
      smoothedRef.current = smoothedRef.current + alpha * (rawIntensity - smoothedRef.current);
      smoothedRef.current = Math.max(0, Math.min(1, smoothedRef.current));

      onBlow?.(smoothedRef.current);
    }

    rafRef.current = requestAnimationFrame(analyze);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, onBlow]);
}

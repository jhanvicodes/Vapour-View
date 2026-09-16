import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { landmarkToCanvas } from '../utils/drawing.js';
import { GestureDebouncer, isIndexFingerStrictlyPointing } from '../utils/gestures.js';

const HAND_LANDMARKER_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const DETECTION_INTERVAL_MS = 33; // ~30 FPS

export default function HandTracker({
  videoRef,
  onGestureChange,
  onFingertipMove,
  onStrokeStart,
  onStrokeEnd,
  enabled = true,
}) {
  const [isLoaded, setIsLoaded] = useState(false);

  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);
  const debouncerRef = useRef(new GestureDebouncer(3));
  const currentGestureRef = useRef('OTHER');
  const isDrawingRef = useRef(false);

  // Initialize MediaPipe HandLandmarker strictly for a single hand
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function initLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM);
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: HAND_LANDMARKER_MODEL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1, // Strictly single hand
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsLoaded(true);
      } catch (err) {
        console.error('HandLandmarker initialization error:', err);
      }
    }

    initLandmarker();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enabled]);

  // Continuous frame detection loop
  useEffect(() => {
    if (!isLoaded || !enabled) return;

    let active = true;

    function detect(timestamp) {
      if (!active) return;

      const video = videoRef?.current;
      const landmarker = landmarkerRef.current;

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        timestamp - lastDetectionTimeRef.current >= DETECTION_INTERVAL_MS
      ) {
        try {
          const results = landmarker.detectForVideo(video, timestamp);
          lastDetectionTimeRef.current = timestamp;

          // Strictly inspect the single primary hand
          const landmarks = results?.landmarks?.[0];

          if (landmarks && landmarks.length >= 21) {
            // 1. Gesture classification for FIST / PALM transitions
            const gesture = debouncerRef.current.update(landmarks);

            if (gesture !== currentGestureRef.current) {
              currentGestureRef.current = gesture;
              onGestureChange?.(gesture);
            }

            // 2. Strict index-finger-only pointing check:
            // MUST have index extended AND middle, ring, pinky curled.
            const isStrictPointing = isIndexFingerStrictlyPointing(landmarks);

            // Landmark 8: Index Finger Tip (and ONLY landmark 8)
            const tip = landmarks[8];
            const { x, y } = landmarkToCanvas(
              tip.x,
              tip.y,
              window.innerWidth,
              window.innerHeight
            );

            if (isStrictPointing) {
              if (!isDrawingRef.current) {
                isDrawingRef.current = true;
                onStrokeStart?.({ x, y });
              }
              onFingertipMove?.({ x, y, isPointing: true });
            } else {
              // Not pointing (e.g. fist, open palm, multiple extended fingers, etc.)
              if (isDrawingRef.current) {
                isDrawingRef.current = false;
                onStrokeEnd?.();
              }
              onFingertipMove?.({ x, y, isPointing: false });
            }
          } else {
            // No hand detected in frame
            if (currentGestureRef.current !== 'OTHER') {
              currentGestureRef.current = 'OTHER';
              debouncerRef.current.reset();
              onGestureChange?.('OTHER');
            }

            if (isDrawingRef.current) {
              isDrawingRef.current = false;
              onStrokeEnd?.();
            }

            onFingertipMove?.({ x: null, y: null, isPointing: false });
          }
        } catch (err) {
          // Ignore transient detection errors
        }
      }

      animFrameRef.current = requestAnimationFrame(detect);
    }

    animFrameRef.current = requestAnimationFrame(detect);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        onStrokeEnd?.();
      }
    };
  }, [isLoaded, enabled, videoRef, onGestureChange, onFingertipMove, onStrokeStart, onStrokeEnd]);

  return null;
}

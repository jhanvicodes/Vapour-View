/**
 * useHandTracking hook
 *
 * Initializes MediaPipe Hand Landmarker and continuously detects
 * hand landmarks from a video element. Calls onResult with landmark data.
 *
 * Landmark 8 = index fingertip.
 *
 * Returns { isLoaded, error }
 */

import { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const HAND_LANDMARKER_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const HAND_LANDMARKER_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Run hand detection at ~30 FPS (every ~33ms)
const HAND_DETECTION_INTERVAL_MS = 33;

export function useHandTracking({ videoRef, onResult, enabled = true }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function initHandLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(HAND_LANDMARKER_WASM_PATH);
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: HAND_LANDMARKER_MODEL_PATH,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
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
        console.error('Hand Landmarker init error:', err);
        if (!cancelled) setError(err.message || 'Failed to load hand tracking');
      }
    }

    initHandLandmarker();

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

  useEffect(() => {
    if (!isLoaded || !videoRef?.current || !onResult) return;

    let active = true;

    function detect(timestamp) {
      if (!active) return;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (
        video &&
        landmarker &&
        video.readyState >= 2 &&
        timestamp - lastDetectionTimeRef.current > HAND_DETECTION_INTERVAL_MS
      ) {
        try {
          const results = landmarker.detectForVideo(video, timestamp);
          lastDetectionTimeRef.current = timestamp;
          onResult(results);
        } catch (err) {
          // Transient errors — continue
        }
      }

      animFrameRef.current = requestAnimationFrame(detect);
    }

    animFrameRef.current = requestAnimationFrame(detect);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isLoaded, videoRef, onResult]);

  return { isLoaded, error };
}

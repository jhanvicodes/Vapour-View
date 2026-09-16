/**
 * useFaceTracking hook
 *
 * Initializes MediaPipe Face Landmarker and continuously detects
 * facial landmarks from a video element. Calls onResult with landmark data.
 *
 * Returns { isLoaded, error }
 */

import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const FACE_LANDMARKER_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_LANDMARKER_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Throttle face detection to ~15 FPS (every ~66ms)
const FACE_DETECTION_INTERVAL_MS = 66;

export function useFaceTracking({ videoRef, onResult, enabled = true }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);

  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastDetectionTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function initFaceLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(FACE_LANDMARKER_WASM_PATH);
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_PATH,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsLoaded(true);
      } catch (err) {
        console.error('Face Landmarker init error:', err);
        if (!cancelled) setError(err.message || 'Failed to load face tracking');
      }
    }

    initFaceLandmarker();

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

  // Detection loop — runs after landmarker is loaded
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
        video.readyState >= 2 && // HAVE_CURRENT_DATA
        timestamp - lastDetectionTimeRef.current > FACE_DETECTION_INTERVAL_MS
      ) {
        try {
          const results = landmarker.detectForVideo(video, timestamp);
          lastDetectionTimeRef.current = timestamp;
          onResult(results);
        } catch (err) {
          // Detection can fail transiently — just continue
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

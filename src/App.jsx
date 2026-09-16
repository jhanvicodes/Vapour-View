import React, { useState, useRef, useEffect, useCallback } from 'react';
import Camera from './components/Camera.jsx';
import FogCanvas from './components/FogCanvas.jsx';
import HandTracker from './components/HandTracker.jsx';
import UI from './components/UI.jsx';
import { drawVideoCover } from './utils/drawing.js';

export default function App() {
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: null, y: null, isVisible: false });

  // Mist density state: Starts at 0 (clean camera feed with no mist)
  const [mistDensity, setMistDensity] = useState(0);

  const videoRef = useRef(null);
  const fogCanvasRef = useRef(null);
  const currentGestureRef = useRef('OTHER');
  const mistDensityRef = useRef(0);
  const buildUpRafRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    mistDensityRef.current = mistDensity;
  }, [mistDensity]);

  // Initialize live webcam video feed
  useEffect(() => {
    let mounted = true;
    let localStream = null;

    async function startWebcam() {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        setStream(localStream);

        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.error('Webcam initialization error:', err);
        if (mounted) {
          setCameraError(
            err.name === 'NotAllowedError'
              ? 'Camera access was denied. Please grant camera permission and refresh.'
              : 'Webcam is unavailable. Please check your camera connection.'
          );
        }
      }
    }

    startWebcam();

    return () => {
      mounted = false;
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Continuous mist build-up loop when CLOSED_FIST gesture is active
  useEffect(() => {
    let active = true;

    function loop(timestamp) {
      if (!active) return;

      const dt = lastTimeRef.current != null ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.1) : 0.016;
      lastTimeRef.current = timestamp;

      // When CLOSED_FIST is held, gradually build up mist density to 1.0
      if (currentGestureRef.current === 'CLOSED_FIST') {
        if (mistDensityRef.current < 1.0) {
          const next = Math.min(1.0, mistDensityRef.current + dt * 0.45);
          mistDensityRef.current = next;
          setMistDensity(next);
        }
      }

      buildUpRafRef.current = requestAnimationFrame(loop);
    }

    buildUpRafRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (buildUpRafRef.current) {
        cancelAnimationFrame(buildUpRafRef.current);
      }
    };
  }, []);

  // Gesture state change handler
  const handleGestureChange = useCallback((gesture) => {
    currentGestureRef.current = gesture;

    // OPEN_PALM: Reset and clear all mist back to clean video
    if (gesture === 'OPEN_PALM') {
      mistDensityRef.current = 0;
      setMistDensity(0);
      fogCanvasRef.current?.clear();
    }
  }, []);

  // Hand tracking drawing event handlers (Pointed finger wipes away mist)
  const handleStrokeStart = useCallback(({ x, y }) => {
    if (mistDensityRef.current < 0.05) return;
    setCursorPos({ x, y, isVisible: true });
    fogCanvasRef.current?.startStroke(x, y);
  }, []);

  const handleFingertipMove = useCallback(({ x, y, isPointing }) => {
    if (isPointing && x != null && y != null) {
      setCursorPos({ x, y, isVisible: true });
      if (mistDensityRef.current >= 0.05) {
        fogCanvasRef.current?.addPoint(x, y);
      }
    } else {
      setCursorPos((prev) => ({ ...prev, isVisible: false }));
    }
  }, []);

  const handleStrokeEnd = useCallback(() => {
    setCursorPos((prev) => ({ ...prev, isVisible: false }));
    fogCanvasRef.current?.endStroke();
  }, []);

  // Native mouse / touch cursor tracking callback
  const handleCursorMove = useCallback(({ x, y, isVisible }) => {
    setCursorPos({ x, y, isVisible });
  }, []);

  // Stroke change callback from FogCanvas (updates UNDO availability)
  const handleStrokeChange = useCallback(({ canUndo }) => {
    setCanUndo(canUndo);
  }, []);

  // Top-Right UI Button Actions
  const handleUndo = useCallback(() => {
    fogCanvasRef.current?.undo();
  }, []);

  const handleClear = useCallback(() => {
    // Reset mist back to 0 (clean video) and clear strokes
    mistDensityRef.current = 0;
    setMistDensity(0);
    fogCanvasRef.current?.clear();
  }, []);

  // Snapshot functionality triggered by clicking bottom-center circle indicator
  const handleTakeSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width * dpr;
    captureCanvas.height = height * dpr;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    const w = width * dpr;
    const h = height * dpr;

    // 1. Draw the base live webcam video (mirrored with scaleX(-1) to match screen view)
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    drawVideoCover(ctx, video, w, h);
    ctx.restore();

    // 2. If mist is present, render the frosted glass mist layer
    const density = mistDensityRef.current;
    if (density > 0) {
      ctx.save();
      ctx.globalAlpha = density;

      // Heavy Gaussian blur of the video
      ctx.save();
      ctx.filter = 'blur(30px) brightness(1.06) saturate(0.85)';
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      drawVideoCover(ctx, video, w, h);
      ctx.restore();

      // Milky-white frosted glass mist veil
      ctx.fillStyle = 'rgba(235, 242, 248, 0.44)';
      ctx.fillRect(0, 0, w, h);

      ctx.restore();
    }

    // 3. Draw the wiped drawing paths from FogCanvas (which contains the sharp video reveal + rim)
    const fogCanvasEl = fogCanvasRef.current?.getCanvas();
    if (fogCanvasEl && density > 0) {
      ctx.save();
      ctx.globalAlpha = density;
      ctx.drawImage(fogCanvasEl, 0, 0, w, h);
      ctx.restore();
    }

    // 4. Generate base64 data URL and trigger browser download
    const dataUrl = captureCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'vapourview-snapshot.png';
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Camera permission error screen
  if (cameraError) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-center z-50">
        <h1 className="font-serif text-2xl tracking-[0.25em] text-white/90 uppercase mb-3">
          VAPOURVIEW
        </h1>
        <p className="font-sans text-sm text-white/60 max-w-sm mb-6 leading-relaxed">
          {cameraError}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2 text-xs uppercase tracking-widest text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 rounded transition cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#0a0a0f] select-none">
      {/* 1. Fullscreen Background: Crisp Video + Frosted Mist Overlay (opacity = mistDensity) */}
      <Camera ref={videoRef} stream={stream} mistDensity={mistDensity} />

      {/* 2. Wipe-and-Reveal Canvas (Reveals crisp webcam video inside wiped strokes) */}
      <FogCanvas
        ref={fogCanvasRef}
        videoRef={videoRef}
        mistDensity={mistDensity}
        onStrokeChange={handleStrokeChange}
        onCursorMove={handleCursorMove}
      />

      {/* 3. MediaPipe Hand Tracker:
             - CLOSED_FIST  → builds up mist density
             - POINTING     → draws / wipes mist smoothly
             - OPEN_PALM    → clears mist back to clean video
      */}
      <HandTracker
        videoRef={videoRef}
        onGestureChange={handleGestureChange}
        onStrokeStart={handleStrokeStart}
        onFingertipMove={handleFingertipMove}
        onStrokeEnd={handleStrokeEnd}
        enabled={!!stream}
      />

      {/* 4. Top-Right Controls & Bottom-Center Hint with Clickable Circular Snapshot Button */}
      <UI
        onUndo={handleUndo}
        onClear={handleClear}
        canUndo={canUndo}
        cursorPos={cursorPos}
        mistDensity={mistDensity}
        onTakeSnapshot={handleTakeSnapshot}
      />
    </div>
  );
}

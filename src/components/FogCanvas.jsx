import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import {
  BRUSH_RADIUS,
  drawVideoCover,
  drawWipeCircle,
  drawWipeSegment,
  redrawStroke,
} from '../utils/drawing.js';

const FogCanvas = forwardRef(function FogCanvas(
  { videoRef, onStrokeChange, onCursorMove, mistDensity = 0 },
  ref
) {
  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const rimCanvasRef = useRef(null);

  // Stroke history for complete UNDO and CLEAR support
  // strokesRef.current = Array of strokes: [ [{x, y}, {x, y}], ... ]
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const isPointerDownRef = useRef(false);

  const rafRef = useRef(null);
  const sizeRef = useRef({ width: window.innerWidth, height: window.innerHeight, dpr: 1 });

  // Initialize and resize offscreen and display canvases
  const resizeCanvases = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    sizeRef.current = { width, height, dpr };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    if (!maskCanvasRef.current) {
      maskCanvasRef.current = document.createElement('canvas');
    }
    const mask = maskCanvasRef.current;
    mask.width = width * dpr;
    mask.height = height * dpr;

    if (!rimCanvasRef.current) {
      rimCanvasRef.current = document.createElement('canvas');
    }
    const rim = rimCanvasRef.current;
    rim.width = width * dpr;
    rim.height = height * dpr;

    // Redraw existing strokes after resize
    redrawAllStrokes();
  }, []);

  // Redraws all strokes from the history stack onto maskCanvas
  const redrawAllStrokes = useCallback(() => {
    const mask = maskCanvasRef.current;
    if (!mask) return;

    const ctx = mask.getContext('2d');
    const { dpr } = sizeRef.current;
    ctx.clearRect(0, 0, mask.width, mask.height);

    for (const stroke of strokesRef.current) {
      const scaledStroke = stroke.map(pt => ({
        x: pt.x * dpr,
        y: pt.y * dpr,
      }));
      redrawStroke(ctx, scaledStroke, BRUSH_RADIUS * dpr);
    }

    updateRimCanvas();
  }, []);

  // Renders a soft glass condensation rim along the edge of the wipe
  const updateRimCanvas = useCallback(() => {
    const mask = maskCanvasRef.current;
    const rim = rimCanvasRef.current;
    if (!mask || !rim) return;

    const rimCtx = rim.getContext('2d');
    rimCtx.clearRect(0, 0, rim.width, rim.height);

    // Only render rim if there are strokes
    if (strokesRef.current.length === 0) return;

    rimCtx.save();
    rimCtx.filter = 'blur(4px)';
    rimCtx.drawImage(mask, 0, 0);

    rimCtx.globalCompositeOperation = 'destination-out';
    rimCtx.filter = 'none';
    rimCtx.drawImage(mask, 0, 0);

    rimCtx.globalCompositeOperation = 'source-in';
    rimCtx.fillStyle = 'rgba(215, 230, 240, 0.45)';
    rimCtx.fillRect(0, 0, rim.width, rim.height);

    rimCtx.restore();
  }, []);

  // Clear when mist drops to zero
  useEffect(() => {
    if (mistDensity <= 0.001 && strokesRef.current.length > 0) {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      const mask = maskCanvasRef.current;
      if (mask) {
        const ctx = mask.getContext('2d');
        ctx.clearRect(0, 0, mask.width, mask.height);
      }
      const rim = rimCanvasRef.current;
      if (rim) {
        const rimCtx = rim.getContext('2d');
        rimCtx.clearRect(0, 0, rim.width, rim.height);
      }
      onStrokeChange?.({ canUndo: false });
    }
  }, [mistDensity, onStrokeChange]);

  // ── Imperative API for Parent Components (HandTracker & UI) ─────────────
  useImperativeHandle(ref, () => ({
    startStroke(x, y) {
      if (mistDensity < 0.05) return;

      const newStroke = [{ x, y }];
      strokesRef.current.push(newStroke);
      currentStrokeRef.current = newStroke;

      const mask = maskCanvasRef.current;
      if (mask) {
        const { dpr } = sizeRef.current;
        const ctx = mask.getContext('2d');
        drawWipeCircle(ctx, x * dpr, y * dpr, BRUSH_RADIUS * dpr);
        updateRimCanvas();
      }

      onStrokeChange?.({ canUndo: strokesRef.current.length > 0 });
    },

    addPoint(x, y) {
      if (mistDensity < 0.05) return;

      if (!currentStrokeRef.current) {
        this.startStroke(x, y);
        return;
      }

      const stroke = currentStrokeRef.current;
      const prev = stroke[stroke.length - 1];

      if (Math.hypot(x - prev.x, y - prev.y) < 2) return;

      stroke.push({ x, y });

      const mask = maskCanvasRef.current;
      if (mask) {
        const { dpr } = sizeRef.current;
        const ctx = mask.getContext('2d');
        drawWipeSegment(
          ctx,
          prev.x * dpr,
          prev.y * dpr,
          x * dpr,
          y * dpr,
          BRUSH_RADIUS * dpr
        );
        updateRimCanvas();
      }
    },

    endStroke() {
      currentStrokeRef.current = null;
      onStrokeChange?.({ canUndo: strokesRef.current.length > 0 });
    },

    undo() {
      if (strokesRef.current.length > 0) {
        strokesRef.current.pop();
        currentStrokeRef.current = null;
        redrawAllStrokes();
        onStrokeChange?.({ canUndo: strokesRef.current.length > 0 });
      }
    },

    clear() {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      const mask = maskCanvasRef.current;
      if (mask) {
        const ctx = mask.getContext('2d');
        ctx.clearRect(0, 0, mask.width, mask.height);
      }
      const rim = rimCanvasRef.current;
      if (rim) {
        const rimCtx = rim.getContext('2d');
        rimCtx.clearRect(0, 0, rim.width, rim.height);
      }
      onStrokeChange?.({ canUndo: false });
    },

    hasStrokes() {
      return strokesRef.current.length > 0;
    },

    getCanvas() {
      return canvasRef.current;
    },
  }), [mistDensity, onStrokeChange, redrawAllStrokes, updateRimCanvas]);

  // Window resize listener
  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // Main 60 FPS video-masking compositing loop
  useEffect(() => {
    let active = true;

    function render() {
      if (!active) return;

      const canvas = canvasRef.current;
      const mask = maskCanvasRef.current;
      const rim = rimCanvasRef.current;
      const video = videoRef?.current;

      if (canvas && mask) {
        const ctx = canvas.getContext('2d');
        const { width, height, dpr } = sizeRef.current;
        const w = width * dpr;
        const h = height * dpr;

        ctx.clearRect(0, 0, w, h);

        // Only perform compositing if there are active wipe strokes and mist is visible
        if (strokesRef.current.length > 0 && mistDensity > 0.01) {
          ctx.save();

          // 1. Draw the wipe mask (where alpha > 0 = wiped area)
          ctx.drawImage(mask, 0, 0, w, h);

          // 2. Composite the live, crisp webcam video strictly within the mask
          ctx.globalCompositeOperation = 'source-in';

          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);

          if (video && video.readyState >= 2) {
            drawVideoCover(ctx, video, w, h);
          }
          ctx.restore();

          // 3. Draw the condensation refraction rim along the wipe borders
          if (rim) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(rim, 0, 0, w, h);
          }

          ctx.restore();
        }
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [videoRef, mistDensity]);

  // ── Native Mouse & Touch Fallback Event Handlers ────────────────────────
  const handlePointerDown = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    onCursorMove?.({ x, y, isVisible: true });

    if (mistDensity < 0.05) return;

    isPointerDownRef.current = true;
    const newStroke = [{ x, y }];
    strokesRef.current.push(newStroke);
    currentStrokeRef.current = newStroke;

    const mask = maskCanvasRef.current;
    if (mask) {
      const { dpr } = sizeRef.current;
      const ctx = mask.getContext('2d');
      drawWipeCircle(ctx, x * dpr, y * dpr, BRUSH_RADIUS * dpr);
      updateRimCanvas();
    }
    onStrokeChange?.({ canUndo: true });
  };

  const handlePointerMove = (e) => {
    const x = e.clientX;
    const y = e.clientY;
    onCursorMove?.({ x, y, isVisible: true });

    if (!isPointerDownRef.current || !currentStrokeRef.current || mistDensity < 0.05) return;

    const stroke = currentStrokeRef.current;
    const prev = stroke[stroke.length - 1];
    if (Math.hypot(x - prev.x, y - prev.y) < 2) return;

    stroke.push({ x, y });

    const mask = maskCanvasRef.current;
    if (mask) {
      const { dpr } = sizeRef.current;
      const ctx = mask.getContext('2d');
      drawWipeSegment(
        ctx,
        prev.x * dpr,
        prev.y * dpr,
        x * dpr,
        y * dpr,
        BRUSH_RADIUS * dpr
      );
      updateRimCanvas();
    }
  };

  const handlePointerUp = () => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      currentStrokeRef.current = null;
      onStrokeChange?.({ canUndo: strokesRef.current.length > 0 });
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={() => {
        handlePointerUp();
        onCursorMove?.({ x: null, y: null, isVisible: false });
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch) handlePointerDown(touch);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (touch) handlePointerMove(touch);
      }}
      onTouchEnd={handlePointerUp}
      className="fixed inset-0 w-full h-full z-10 select-none touch-none"
      style={{
        cursor: 'none',
        opacity: mistDensity,
        transition: 'opacity 0.15s ease-out',
      }}
    />
  );
});

export default FogCanvas;

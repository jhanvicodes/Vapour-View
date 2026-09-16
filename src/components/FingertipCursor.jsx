/**
 * FingertipCursor
 *
 * Renders a subtle glowing ring at the detected fingertip position.
 * Uses a canvas overlay so it can render above the fog.
 * Disappears when no hand is detected.
 */

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const FingertipCursor = forwardRef(function FingertipCursor(_, ref) {
  const canvasRef = useRef(null);
  const posRef = useRef(null); // null = hidden, {x, y} = visible
  const rafRef = useRef(null);
  const fadeRef = useRef(0); // 0=invisible, 1=fully visible

  useImperativeHandle(ref, () => ({
    setPosition(x, y) {
      posRef.current = { x, y };
    },
    hide() {
      posRef.current = null;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    setSize();
    window.addEventListener('resize', setSize);

    const ctx = canvas.getContext('2d');

    function frame() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const target = posRef.current ? 1 : 0;
      fadeRef.current += (target - fadeRef.current) * 0.15;

      if (fadeRef.current > 0.01 && posRef.current) {
        const { x, y } = posRef.current;
        const px = x * dpr;
        const py = y * dpr;
        const alpha = fadeRef.current;

        // Outer glow ring
        ctx.save();
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = 'rgba(220, 235, 245, 1)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, 18 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Inner dot
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = 'rgba(220, 235, 245, 1)';
        ctx.beginPath();
        ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Subtle condensation ripple (pulsing)
        const pulse = (Math.sin(Date.now() * 0.004) + 1) * 0.5;
        ctx.save();
        ctx.globalAlpha = alpha * 0.15 * pulse;
        ctx.strokeStyle = 'rgba(200, 220, 235, 1)';
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.arc(px, py, (26 + pulse * 6) * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', setSize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3,
        pointerEvents: 'none',
      }}
    />
  );
});

export default FingertipCursor;

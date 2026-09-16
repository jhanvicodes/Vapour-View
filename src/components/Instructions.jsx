/**
 * Instructions component
 *
 * Shows minimal atmospheric text that fades in/out based on app state.
 * Disappears after the user starts interacting.
 */

import { useEffect, useRef } from 'react';

export default function Instructions({ appState, fogDensity }) {
  const containerRef = useRef(null);
  const hasInteractedRef = useRef(false);

  // Once fog appears or interaction begins, mark as interacted
  useEffect(() => {
    if (fogDensity > 0.15 || appState === 'INTERACTING') {
      hasInteractedRef.current = true;
    }
  }, [fogDensity, appState]);

  // Determine visibility
  const showIntro = appState === 'INTRO';
  const showBlowHint = appState === 'CAMERA_READY' || appState === 'WAITING_FOR_BLOW';
  const showInteractHint = appState === 'FOGGING' && fogDensity > 0.3 && !hasInteractedRef.current;
  const showAny = showIntro || showBlowHint || showInteractHint;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'opacity 1.5s ease',
        opacity: showAny ? 1 : 0,
      }}
    >
      {/* Title */}
      <h1
        style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontWeight: 300,
          fontSize: 'clamp(1.4rem, 4vw, 2.2rem)',
          letterSpacing: '0.35em',
          color: 'rgba(220, 230, 235, 0.9)',
          textTransform: 'uppercase',
          margin: 0,
          marginBottom: '1.2rem',
          textShadow: '0 0 30px rgba(180, 210, 230, 0.3)',
          transition: 'opacity 1s ease',
          opacity: showIntro || showBlowHint ? 1 : 0,
        }}
      >
        VAPOURVIEW
      </h1>

      {/* Instruction text */}
      {showBlowHint && (
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontWeight: 300,
            fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
            letterSpacing: '0.15em',
            color: 'rgba(200, 215, 225, 0.7)',
            textTransform: 'uppercase',
            margin: 0,
            textShadow: '0 0 20px rgba(180, 210, 230, 0.2)',
            animation: 'breathe 3s ease-in-out infinite',
          }}
        >
          Blow on the screen.
        </p>
      )}

      {showIntro && (
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontWeight: 300,
            fontSize: 'clamp(0.65rem, 1.5vw, 0.8rem)',
            letterSpacing: '0.12em',
            color: 'rgba(180, 200, 215, 0.5)',
            textTransform: 'uppercase',
            margin: 0,
            marginTop: '2rem',
          }}
        >
          preparing the glass&hellip;
        </p>
      )}

      {showInteractHint && (
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontWeight: 300,
            fontSize: 'clamp(0.7rem, 1.8vw, 0.85rem)',
            letterSpacing: '0.15em',
            color: 'rgba(200, 215, 225, 0.6)',
            textTransform: 'uppercase',
            margin: 0,
            textShadow: '0 0 20px rgba(180, 210, 230, 0.2)',
            animation: 'breathe 3s ease-in-out infinite',
          }}
        >
          Raise your hand &mdash; use your finger to draw.
        </p>
      )}
    </div>
  );
}

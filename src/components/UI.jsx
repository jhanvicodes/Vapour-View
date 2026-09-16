import React, { memo } from 'react';
import { BRUSH_RADIUS } from '../utils/drawing.js';

function UI({
  onUndo,
  onClear,
  canUndo = false,
  cursorPos,
  mistDensity = 0,
  onTakeSnapshot,
}) {
  const isMistActive = mistDensity >= 0.05;

  return (
    <>
      {/* ── Top-Right Control Panel ───────────────────────────────────────── */}
      <div className="fixed top-5 right-6 z-30 flex items-center gap-2 select-none">
        {/* UNDO Button */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last wipe stroke"
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded text-[11px] font-medium tracking-[0.15em] uppercase transition-all duration-150 border ${
            canUndo
              ? 'bg-black/80 hover:bg-black/95 text-white/95 border-white/20 hover:border-white/40 active:scale-95 cursor-pointer shadow-lg'
              : 'bg-black/40 text-white/30 border-white/10 cursor-not-allowed'
          } backdrop-blur-md`}
        >
          <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
            <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.95 5.12-1.95 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C20.91 10.98 17.07 8 12.5 8z" />
          </svg>
          <span>UNDO</span>
        </button>

        {/* CLEAR Button */}
        <button
          onClick={onClear}
          aria-label="Clear all mist and return to clean video"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-[11px] font-medium tracking-[0.15em] uppercase bg-black/80 hover:bg-black/95 text-white/95 border border-white/20 hover:border-white/40 active:scale-95 cursor-pointer transition-all duration-150 backdrop-blur-md shadow-lg"
        >
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
          <span>CLEAR</span>
        </button>
      </div>

      {/* ── Bottom-Center Subtitle & Middle Circle Indicator ──────────────── */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none select-none transition-opacity duration-300">
        <span className="text-white/75 font-sans text-[11px] uppercase tracking-[0.28em] mb-2 drop-shadow-sm font-light">
          {isMistActive ? 'POINT TO DRAW • OPEN PALM TO CLEAR' : 'HOLD FIST TO MIST SCREEN'}
        </span>

        {/* Middle circular cursor outline indicator (Click to take snapshot) */}
        <button
          onClick={onTakeSnapshot}
          type="button"
          aria-label="Capture snapshot"
          title="Click to take snapshot"
          className="pointer-events-auto cursor-pointer rounded-full border-[1.5px] border-white/75 hover:border-white hover:scale-105 active:scale-95 transition-all duration-150 bg-transparent p-0 outline-none focus:outline-none"
          style={{
            width: `${BRUSH_RADIUS * 2}px`,
            height: `${BRUSH_RADIUS * 2}px`,
            boxShadow: '0 0 8px rgba(0,0,0,0.15)',
          }}
        />
      </div>

      {/* ── Active Dynamic Fingertip / Pointer Cursor Outline ─────────────── */}
      {cursorPos && cursorPos.isVisible && cursorPos.x != null && cursorPos.y != null && (
        <div
          className="fixed pointer-events-none z-40 rounded-full border-[1.5px] border-white/85 transition-transform duration-75 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${cursorPos.x}px`,
            top: `${cursorPos.y}px`,
            width: `${BRUSH_RADIUS * 2}px`,
            height: `${BRUSH_RADIUS * 2}px`,
            boxShadow: '0 0 10px rgba(0,0,0,0.3)',
          }}
        />
      )}
    </>
  );
}

export default memo(UI);

/**
 * Fog rendering system — breath condensation on glass effect.
 *
 * Architecture:
 * - Density map: Float32Array grid (each cell = fog opacity in that region)
 * - Global density: overall fog level driven by blow intensity
 * - Wipe: sets cells to 0 (clear) in a soft radial pattern
 * - Regeneration: cells slowly return to globalDensity over time
 * - Render: draws layered fog to offscreen canvas using cell densities
 *           as alpha, modulated by animated FBM noise for organic texture
 *
 * Performance note:
 * We render at the grid resolution (cells ~8×8px) and let canvas scale up.
 * This gives organic-looking fog without pixel-by-pixel iteration.
 */

import { FOG_CONFIG } from '../config.js';

/* ── Noise helpers ─────────────────────────────────────────────────────────── */

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

/** Fast deterministic hash → [-1, 1] */
function hash(xi, yi, seed) {
  let n = ((xi * 1619 + yi * 31337 + seed * 1013) | 0) & 0x7fffffff;
  n = ((n >> 13) ^ n);
  n = (((n * ((n * n * 60493 + 19990303) | 0) + 1376312589) | 0) & 0x7fffffff);
  return n / 0x3fffffff - 1.0;
}

/** 2D value noise */
function valueNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u),
    v
  );
}

/** Fractal Brownian Motion — layered noise for organic fog texture */
function fbm(x, y, t) {
  let v = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < 4; i++) {
    v += valueNoise(x * freq + t * (0.3 + i * 0.05), y * freq + t * (0.2 + i * 0.04), i * 137) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return v / max; // ≈ [-1, 1]
}

/* ── FogRenderer ───────────────────────────────────────────────────────────── */

// Grid cell size in physical pixels — balance between performance & quality
const CELL_SIZE = 6;

export class FogRenderer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.globalDensity = 0;
    this.time = 0;
    this.droplets = [];
    this._initGrid();
    this._initOffscreen();
  }

  _initGrid() {
    this.gridW = Math.ceil(this.width / CELL_SIZE);
    this.gridH = Math.ceil(this.height / CELL_SIZE);
    // Per-cell density [0, 1]
    this.densityMap = new Float32Array(this.gridW * this.gridH);
    // Per-cell regen speed variation (adds realism)
    this.regenVariation = new Float32Array(this.gridW * this.gridH);
    for (let i = 0; i < this.regenVariation.length; i++) {
      this.regenVariation[i] = 0.5 + Math.random() * 1.0;
    }
  }

  _initOffscreen() {
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.gridW;
    this.offscreen.height = this.gridH;
    this.offCtx = this.offscreen.getContext('2d');

    // Final composited canvas (scaled to full resolution)
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = this.width;
    this.fogCanvas.height = this.height;
    this.fogCtx = this.fogCanvas.getContext('2d');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this._initGrid();
    this._initOffscreen();
  }

  /**
   * Apply a circular wipe centered at (x, y) with given radius.
   * Uses Gaussian falloff so center is fully clear, edges feather out.
   */
  wipeAt(x, y, radius) {
    const gx0 = Math.floor(x / CELL_SIZE);
    const gy0 = Math.floor(y / CELL_SIZE);
    const gr = Math.ceil(radius / CELL_SIZE);

    for (let dy = -gr; dy <= gr; dy++) {
      for (let dx = -gr; dx <= gr; dx++) {
        const gx = gx0 + dx;
        const gy = gy0 + dy;
        if (gx < 0 || gy < 0 || gx >= this.gridW || gy >= this.gridH) continue;

        const normDist = Math.hypot(dx, dy) / gr;
        if (normDist > 1) continue;

        // Gaussian falloff — soft center, feathered edges
        const sigma = FOG_CONFIG.wipeSoftness;
        const strength = Math.exp(-normDist * normDist / (2 * sigma * sigma));

        const idx = gy * this.gridW + gx;
        this.densityMap[idx] = Math.max(0, this.densityMap[idx] - strength);
      }
    }

    // Spawn condensation droplets at wipe boundary
    if (Math.random() < 0.12) {
      const angle = Math.random() * Math.PI * 2;
      const r = radius * (0.7 + Math.random() * 0.5);
      this._addDroplet(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
    }
  }

  _addDroplet(x, y) {
    if (this.droplets.length > 60) return;
    this.droplets.push({
      x, y,
      r: 1.5 + Math.random() * 2.5,
      opacity: 0.25 + Math.random() * 0.35,
      vy: 8 + Math.random() * 12, // px/sec drift down
      life: 1,
    });
  }

  /**
   * Update fog physics. Called every animation frame.
   * @param {number} dt            - delta seconds
   * @param {number} blowIntensity - 0→1, from mic blow detection
   * @param {number} fistIntensity - 0→1, from closed-fist gesture (default 0)
   */
  update(dt, blowIntensity, fistIntensity = 0) {
    this.time += dt;

    // ── Global density ──────────────────────────────────────────────────────
    // Either blow or fist can build fog — take the stronger signal.
    const hasInput = blowIntensity > 0.05 || fistIntensity > 0.05;
    if (hasInput) {
      const blowContrib = blowIntensity * FOG_CONFIG.fogGrowthRate;
      const fistContrib = fistIntensity * FOG_CONFIG.fistFogGrowthRate;
      this.globalDensity = Math.min(
        FOG_CONFIG.maxDensity,
        this.globalDensity + (blowContrib + fistContrib) * dt
      );
    } else {
      this.globalDensity = Math.max(
        0,
        this.globalDensity - FOG_CONFIG.dissipationRate * dt
      );
    }

    // ── Density map update ──────────────────────────────────────────────────
    const regen = FOG_CONFIG.regenerationRate * dt;
    const dissip = FOG_CONFIG.dissipationRate * dt * 0.5;
    const target = this.globalDensity;

    for (let i = 0; i < this.densityMap.length; i++) {
      const cur = this.densityMap[i];
      if (cur < target) {
        // Wipe regeneration — cells grow back toward globalDensity
        this.densityMap[i] = Math.min(target, cur + regen * this.regenVariation[i]);
      } else if (cur > target) {
        // Follow global density down (dissipation)
        this.densityMap[i] = Math.max(target, cur - dissip);
      }
    }

    // ── Droplets ────────────────────────────────────────────────────────────
    this.droplets = this.droplets.filter(d => {
      d.y += d.vy * dt;
      d.life -= dt * 0.06;
      return d.life > 0 && d.y < this.height;
    });

    // Natural droplets appear when fog is dense
    if (this.globalDensity > 0.45 && Math.random() < dt * 4) {
      this._addDroplet(Math.random() * this.width, Math.random() * this.height * 0.7);
    }
  }

  /**
   * Render the current fog state to an offscreen canvas at grid resolution,
   * then scale it up to full resolution using canvas smoothing (imageSmoothing).
   * Returns the final full-resolution fog canvas.
   */
  render() {
    const { offscreen, offCtx, fogCanvas, fogCtx, gridW, gridH, width, height } = this;
    const t = this.time * FOG_CONFIG.noiseSpeed * 1000;

    // ── Step 1: Draw fog to low-res grid canvas ─────────────────────────────
    const imageData = offCtx.createImageData(gridW, gridH);
    const data = imageData.data;

    // Fog base color: cool blue-gray (like condensation on glass)
    const baseR = 200, baseG = 210, baseB = 216;

    const noiseScale = 2.8;

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const cellDensity = this.densityMap[gy * gridW + gx];

        const i4 = (gy * gridW + gx) * 4;

        if (cellDensity < 0.005) {
          // Fully transparent — camera shows through
          data[i4] = 0; data[i4 + 1] = 0; data[i4 + 2] = 0; data[i4 + 3] = 0;
          continue;
        }

        // FBM noise for organic texture
        const nx = gx / gridW * noiseScale + t * 0.35;
        const ny = gy / gridH * noiseScale + t * 0.25;
        const noise = fbm(nx, ny, t); // ≈ [-1, 1]
        const n01 = (noise + 1) * 0.5; // [0, 1]

        // Brightness variation from noise
        const brightness = 0.92 + n01 * 0.16;
        const r = Math.min(255, Math.round(baseR * brightness));
        const g = Math.min(255, Math.round(baseG * brightness));
        const b = Math.min(255, Math.round(baseB * brightness));

        // Alpha: cell density drives opacity, noise adds texture variation.
        // fogBaseAlpha raised to 0.92 (was 0.78) for denser, more opaque mist.
        const alphaRaw = cellDensity * (FOG_CONFIG.fogBaseAlpha + n01 * (1 - FOG_CONFIG.fogBaseAlpha));
        const alpha = Math.min(255, Math.round(alphaRaw * 255));

        data[i4]     = r;
        data[i4 + 1] = g;
        data[i4 + 2] = b;
        data[i4 + 3] = alpha;
      }
    }

    offCtx.putImageData(imageData, 0, 0);

    // ── Step 2: Scale up to full resolution with smoothing ──────────────────
    fogCtx.clearRect(0, 0, width, height);
    fogCtx.imageSmoothingEnabled = true;
    fogCtx.imageSmoothingQuality = 'high';
    fogCtx.drawImage(offscreen, 0, 0, width, height);

    // ── Step 3: Draw condensation droplets on top ───────────────────────────
    for (const drop of this.droplets) {
      const alpha = drop.opacity * drop.life;
      if (alpha < 0.01) continue;

      // Small semi-transparent teardrop
      fogCtx.save();
      fogCtx.globalAlpha = alpha;
      fogCtx.beginPath();
      fogCtx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
      fogCtx.fillStyle = `rgba(175, 198, 210, 1)`;
      fogCtx.fill();
      fogCtx.restore();
    }

    return fogCanvas;
  }

  /** Reset all fog state */
  clear() {
    this.globalDensity = 0;
    this.densityMap.fill(0);
    this.droplets = [];
  }
}

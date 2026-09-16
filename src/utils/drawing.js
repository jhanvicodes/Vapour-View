/**
 * drawing.js — Canvas utilities for the "VapourView" wipe and reveal system.
 */

// Brush radius matching the screenshot's medium-small circular wiping stroke
export const BRUSH_RADIUS = 24; // 48px diameter circle

/**
 * Maps MediaPipe normalized hand landmark coordinates to screen pixel coordinates,
 * taking into account horizontal mirroring (scaleX(-1)) of the webcam feed.
 *
 * @param {number} normX - Normalized X from MediaPipe [0, 1]
 * @param {number} normY - Normalized Y from MediaPipe [0, 1]
 * @param {number} width - Target canvas width in CSS pixels
 * @param {number} height - Target canvas height in CSS pixels
 * @returns {{ x: number, y: number }}
 */
export function landmarkToCanvas(normX, normY, width, height) {
  // Mirror X horizontally so movement aligns naturally with the user's view
  const mirroredX = (1 - normX) * width;
  const y = normY * height;
  return { x: mirroredX, y };
}

/**
 * Draws a video element onto a canvas context using "cover" aspect ratio fit
 * (equivalent to CSS object-fit: cover).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLVideoElement} video
 * @param {number} targetWidth
 * @param {number} targetHeight
 */
export function drawVideoCover(ctx, video, targetWidth, targetHeight) {
  if (!video || video.readyState < 2) return;

  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;

  const targetRatio = targetWidth / targetHeight;
  const videoRatio = videoWidth / videoHeight;

  let sWidth, sHeight, sx, sy;

  if (videoRatio > targetRatio) {
    sHeight = videoHeight;
    sWidth = videoHeight * targetRatio;
    sx = (videoWidth - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = videoWidth;
    sHeight = videoWidth / targetRatio;
    sx = 0;
    sy = (videoHeight - sHeight) / 2;
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
}

/**
 * Draws a single circular wipe dab onto a mask context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} radius
 */
export function drawWipeCircle(ctx, x, y, radius = BRUSH_RADIUS) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a smooth continuous wipe stroke segment between two points with round ends.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} radius
 */
export function drawWipeSegment(ctx, x1, y1, x2, y2, radius = BRUSH_RADIUS) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = radius * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Redraws a complete stroke (series of points) onto the mask canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number}>} points
 * @param {number} radius
 */
export function redrawStroke(ctx, points, radius = BRUSH_RADIUS) {
  if (!points || points.length === 0) return;

  if (points.length === 1) {
    drawWipeCircle(ctx, points[0].x, points[0].y, radius);
    return;
  }

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = radius * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();

  ctx.restore();
}

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface PortraitTileDebugProps {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  containerSize: number; // px
  onOffsetChange: (offset: number) => void;
  initialOffset?: number;
}

/**
 * Tile-map debug overlay for portrait positioning.
 * Renders the full sprite as a grid, highlights the visible container area,
 * and lets you tap +/- to adjust the Y offset in real time.
 */
export const PortraitTileDebug: React.FC<PortraitTileDebugProps> = ({
  imageUrl,
  frameWidth,
  frameHeight,
  scale,
  containerSize,
  onOffsetChange,
  initialOffset = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [offset, setOffset] = useState(initialOffset);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const scaledW = frameWidth * scale;
  const scaledH = frameHeight * scale;
  const TILE = 10; // px per tile in the debug view

  // Load sprite image
  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.src = imageUrl;
    return () => { imgRef.current = null; };
  }, [imageUrl]);

  // Draw tile map
  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas size: full sprite scaled + some padding for info
    const cols = Math.ceil(scaledW / TILE);
    const rows = Math.ceil(scaledH / TILE);
    canvas.width = scaledW + 80; // extra space for row labels
    canvas.height = scaledH + 20;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the sprite scaled down to fit tile grid
    const tileScale = TILE / scale; // how many source px per tile
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = c * tileScale;
        const sy = r * tileScale;
        const sw = Math.min(tileScale, frameWidth - sx);
        const sh = Math.min(tileScale, frameHeight - sy);
        if (sw <= 0 || sh <= 0) continue;

        ctx.drawImage(
          imgRef.current,
          sx, sy, sw, sh,
          c * TILE, r * TILE, TILE, TILE
        );

        // Tile grid lines
        ctx.strokeStyle = 'rgba(0,255,0,0.25)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // Draw container visible area (red rectangle)
    // Container starts at y=0 in the container coordinate system.
    // Sprite is at `offset` inside container.
    // So visible area in sprite coordinates: y=0 to y=containerSize, offset by -offset
    const visTop = Math.max(0, -offset);
    const visBottom = Math.min(scaledH, containerSize - offset);
    if (visBottom > visTop) {
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, visTop, scaledW, visBottom - visTop);

      // Semi-transparent red overlay on visible area
      ctx.fillStyle = 'rgba(255,0,0,0.15)';
      ctx.fillRect(0, visTop, scaledW, visBottom - visTop);

      // Label
      ctx.fillStyle = '#ff0000';
      ctx.font = '10px monospace';
      ctx.fillText(`VISIBLE: ${Math.round(visTop/scale)}-${Math.round(visBottom/scale)}px src`, 4, visTop + 12);
    }

    // Row labels (source Y)
    ctx.fillStyle = '#0f0';
    ctx.font = '8px monospace';
    for (let r = 0; r < rows; r += 3) {
      const srcY = Math.round(r * tileScale);
      ctx.fillText(`${srcY}`, scaledW + 4, r * TILE + 8);
    }

    // Head zone marker (top 25% of source)
    const headBottom = Math.round(rows * 0.25);
    ctx.strokeStyle = 'rgba(0,200,255,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(0, 0, scaledW, headBottom * TILE);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,200,255,0.8)';
    ctx.font = '9px monospace';
    ctx.fillText('HEAD', 4, headBottom * TILE - 4);

    // Torso zone (25%-60%)
    const torsoBottom = Math.round(rows * 0.6);
    ctx.strokeStyle = 'rgba(255,200,0,0.4)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(0, headBottom * TILE, scaledW, (torsoBottom - headBottom) * TILE);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,200,0,0.7)';
    ctx.fillText('TORSO', 4, torsoBottom * TILE - 4);

    // Info text
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText(`Offset: ${offset}px`, scaledW + 4, scaledH + 12);
    ctx.fillText(`Container: ${containerSize}px`, scaledW + 4, scaledH - 4);

  }, [imgLoaded, offset, scaledW, scaledH, containerSize, scale, frameWidth, frameHeight]);

  const adjust = useCallback((d: number) => {
    setOffset(prev => {
      const next = prev + d;
      onOffsetChange(next);
      return next;
    });
  }, [onOffsetChange]);

  // Auto-calculate: show top 40% of sprite (head + upper torso)
  const autoCalc = useCallback(() => {
    // We want the top ~40% of the sprite visible in the container.
    // That means the head starts at y=0 of the container.
    // offset = 0 means top of sprite at top of container.
    // But we want a bit of the upper body, not just the head.
    // Head is ~25% of 140px = 35px source = 63px scaled.
    // Let's show from y=0 (top of head) to containerSize.
    // So offset = 0.
    // But if we want to center the head+torso (top 60%):
    // The visible area should be centered on the top 60% of the sprite.
    // Top 60% = 0.6 * 252 = 151px.
    // Center of that = 75.5px from top.
    // Container center = containerSize / 2 ≈ 52px.
    // offset = 52 - 75.5 = -23.5 ≈ -24
    const headTorsoPx = scaledH * 0.55; // top 55% of sprite
    const centerOfTarget = headTorsoPx / 2;
    const containerCenter = containerSize / 2;
    const idealOffset = Math.round(containerCenter - centerOfTarget);
    setOffset(idealOffset);
    onOffsetChange(idealOffset);
  }, [scaledH, containerSize, onOffsetChange]);

  return (
    <div style={{
      position: 'fixed', top: 10, right: 10, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)', border: '2px solid #0f0',
      padding: 8, borderRadius: 4, maxWidth: '95vw', overflow: 'auto',
    }}>
      <div style={{ color: '#0f0', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>
        🗺️ PORTRAIT TILE MAP DEBUG
      </div>
      <canvas ref={canvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
      <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
        {[-50, -10, -1, 1, 10, 50].map(d => (
          <button key={d} onClick={() => adjust(d)} style={{
            background: '#111', color: '#0f0', border: '1px solid #0f0',
            fontSize: 10, padding: '2px 6px', cursor: 'pointer', fontFamily: 'monospace',
          }}>
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
        <button onClick={autoCalc} style={{
          background: '#003300', color: '#0f0', border: '1px solid #0f0',
          fontSize: 10, padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace',
          marginLeft: 8,
        }}>
          AUTO
        </button>
      </div>
      <div style={{ color: '#888', fontSize: 9, fontFamily: 'monospace', marginTop: 4 }}>
        <div>Sprite: {frameWidth}×{frameHeight} @ {scale}x = {scaledW}×{scaledH}px</div>
        <div>Container: {containerSize}px | Offset: {offset}px</div>
        <div>Source visible: {Math.round(Math.max(0, -offset)/scale)}–{Math.round(Math.min(scaledH, containerSize - offset)/scale)}px</div>
      </div>
    </div>
  );
};

export default PortraitTileDebug;

import { PALETTES, type PaletteColor } from './palettes';

export interface ConvertOptions {
  pixelSize: number;
  paletteId: string;
  dithering: boolean;
  showGrid: boolean;
  gridColor: string;
}

export interface ColorStats {
  color: PaletteColor;
  count: number;
  percentage: number;
}

export interface ConvertResult {
  pixelCanvas: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  stats: ColorStats[];
  width: number;
  height: number;
}

function findClosestColor(r: number, g: number, b: number, palette: PaletteColor[]): PaletteColor {
  let minDistance = Infinity;
  let closest = palette[0];

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p.rgb[0];
    const dg = g - p.rgb[1];
    const db = b - p.rgb[2];
    const dist = 0.299 * (dr * dr) + 0.587 * (dg * dg) + 0.114 * (db * db);
    if (dist < minDistance) {
      minDistance = dist;
      closest = p;
    }
  }
  return closest;
}

export function processImageToPixelArt(
  img: HTMLImageElement,
  options: ConvertOptions
): ConvertResult {
  const { pixelSize, paletteId, dithering, showGrid, gridColor } = options;

  const aspect = img.height / img.width;
  const targetW = pixelSize;
  const targetH = Math.max(1, Math.round(targetW * aspect));

  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = targetW;
  lowCanvas.height = targetH;
  const lowCtx = lowCanvas.getContext('2d', { willReadFrequently: true })!;
  
  lowCtx.drawImage(img, 0, 0, targetW, targetH);
  const imgData = lowCtx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;

  const currentPalette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];
  const usePalette = currentPalette.colors.length > 0;
  
  const colorCounts = new Map<string, { color: PaletteColor; count: number }>();

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = (y * targetW + x) * 4;
      const alpha = data[idx + 3];

      if (alpha < 32) {
        data[idx + 3] = 0;
        continue;
      }

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (usePalette) {
        const closest = findClosestColor(r, g, b, currentPalette.colors);
        const newR = closest.rgb[0];
        const newG = closest.rgb[1];
        const newB = closest.rgb[2];

        const key = closest.hex;
        if (!colorCounts.has(key)) {
          colorCounts.set(key, { color: closest, count: 0 });
        }
        colorCounts.get(key)!.count++;

        const errR = r - newR;
        const errG = g - newG;
        const errB = b - newB;

        data[idx] = newR;
        data[idx + 1] = newG;
        data[idx + 2] = newB;
        data[idx + 3] = 255;

        if (dithering) {
          const spread = [
            { dx: 1, dy: 0, factor: 7 / 16 },
            { dx: -1, dy: 1, factor: 3 / 16 },
            { dx: 0, dy: 1, factor: 5 / 16 },
            { dx: 1, dy: 1, factor: 1 / 16 },
          ];

          for (const s of spread) {
            const nx = x + s.dx;
            const ny = y + s.dy;
            if (nx >= 0 && nx < targetW && ny < targetH) {
              const nIdx = (ny * targetW + nx) * 4;
              data[nIdx] = Math.min(255, Math.max(0, data[nIdx] + errR * s.factor));
              data[nIdx + 1] = Math.min(255, Math.max(0, data[nIdx + 1] + errG * s.factor));
              data[nIdx + 2] = Math.min(255, Math.max(0, data[nIdx + 2] + errB * s.factor));
            }
          }
        }
      }
    }
  }

  lowCtx.putImageData(imgData, 0, 0);

  const scale = Math.max(12, Math.floor(640 / targetW));
  const displayW = targetW * scale;
  const displayH = targetH * scale;

  const displayCanvas = document.createElement('canvas');
  displayCanvas.width = displayW;
  displayCanvas.height = displayH;
  const displayCtx = displayCanvas.getContext('2d')!;

  displayCtx.imageSmoothingEnabled = false;
  displayCtx.drawImage(lowCanvas, 0, 0, displayW, displayH);

  if (showGrid && scale >= 6) {
    displayCtx.save();
    displayCtx.strokeStyle = gridColor || 'rgba(0, 0, 0, 0.25)';
    displayCtx.lineWidth = 1;

    for (let x = 0; x <= targetW; x++) {
      displayCtx.beginPath();
      if (x % 10 === 0) {
        displayCtx.lineWidth = 1.5;
        displayCtx.strokeStyle = gridColor ? gridColor : 'rgba(0, 0, 0, 0.55)';
      } else {
        displayCtx.lineWidth = 0.5;
        displayCtx.strokeStyle = gridColor || 'rgba(0, 0, 0, 0.2)';
      }
      displayCtx.moveTo(x * scale, 0);
      displayCtx.lineTo(x * scale, displayH);
      displayCtx.stroke();
    }

    for (let y = 0; y <= targetH; y++) {
      displayCtx.beginPath();
      if (y % 10 === 0) {
        displayCtx.lineWidth = 1.5;
        displayCtx.strokeStyle = gridColor ? gridColor : 'rgba(0, 0, 0, 0.55)';
      } else {
        displayCtx.lineWidth = 0.5;
        displayCtx.strokeStyle = gridColor || 'rgba(0, 0, 0, 0.2)';
      }
      displayCtx.moveTo(0, y * scale);
      displayCtx.lineTo(displayW, y * scale);
      displayCtx.stroke();
    }

    displayCtx.restore();
  }

  const totalPixels = targetW * targetH;
  const stats: ColorStats[] = Array.from(colorCounts.values())
    .map(item => ({
      color: item.color,
      count: item.count,
      percentage: Math.round((item.count / totalPixels) * 1000) / 10
    }))
    .sort((a, b) => b.count - a.count);

  return {
    pixelCanvas: lowCanvas,
    displayCanvas,
    stats,
    width: targetW,
    height: targetH
  };
}

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, filename);
    }
  }, 'image/png');
}

// 将多帧 Canvas 编码导出为真实的循环 GIF 动图
export async function exportFramesToGif(
  canvases: HTMLCanvasElement[],
  fps: number = 8
): Promise<Blob> {
  if (canvases.length === 0) {
    throw new Error('No frames to export to GIF');
  }

  const width = canvases[0].width;
  const height = canvases[0].height;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);

  for (const cv of canvases) {
    const ctx = cv.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, width, height);
    
    // 量化颜色生成 256 色调色板
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);

    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: 0 // 0 = 永远无限循环
    });
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

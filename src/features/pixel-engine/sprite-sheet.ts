// 雪碧图与多帧动图切片合成引擎
export interface FrameData {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

export interface AtlasMetadata {
  frames: Record<string, FrameData>;
  meta: {
    app: string;
    version: string;
    image: string;
    format: string;
    size: { w: number; h: number };
    scale: string;
  };
}

export interface PackOptions {
  columns?: number;
  padding?: number;
}

export function packFramesToSpriteSheet(
  frames: HTMLCanvasElement[],
  options: PackOptions = {}
): { sheetCanvas: HTMLCanvasElement; metadata: AtlasMetadata } {
  if (frames.length === 0) {
    throw new Error('No frames provided for packing');
  }

  const padding = options.padding ?? 2;
  const frameW = frames[0].width;
  const frameH = frames[0].height;

  // 自适应或指定列数
  const total = frames.length;
  const cols = options.columns && options.columns > 0
    ? options.columns
    : Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / cols);

  const sheetW = cols * frameW + (cols + 1) * padding;
  const sheetH = rows * frameH + (rows + 1) * padding;

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = sheetW;
  sheetCanvas.height = sheetH;
  const ctx = sheetCanvas.getContext('2d')!;

  const frameDict: Record<string, FrameData> = {};

  for (let i = 0; i < total; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padding + col * (frameW + padding);
    const y = padding + row * (frameH + padding);

    ctx.drawImage(frames[i], x, y);

    const name = `frame_${i.toString().padStart(3, '0')}.png`;
    frameDict[name] = {
      filename: name,
      frame: { x, y, w: frameW, h: frameH },
      duration: 100 // 默认 100ms
    };
  }

  const metadata: AtlasMetadata = {
    frames: frameDict,
    meta: {
      app: 'PixelForge Sprite Studio',
      version: '1.0',
      image: 'spritesheet.png',
      format: 'RGBA8888',
      size: { w: sheetW, h: sheetH },
      scale: '1'
    }
  };

  return { sheetCanvas, metadata };
}

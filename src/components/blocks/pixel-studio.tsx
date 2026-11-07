import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PALETTES } from '@/features/pixel-engine/palettes';
import { processImageToPixelArt, type ColorStats } from '@/features/pixel-engine/converter';
import { downloadCanvas, exportFramesToGif, downloadBlob } from '@/features/pixel-engine/gif-export';
import {
  IconUpload,
  IconGridDots,
  IconDownload,
  IconSparkles,
  IconColorFilter,
  IconPrinter,
  IconInfoCircle,
  IconMovie
} from '@tabler/icons-react';

interface PixelStudioProps {
  initialResolution?: number;
  initialPalette?: string;
  defaultShowGrid?: boolean;
  pageMode?: 'general' | 'grid-beads' | 'minecraft';
  title?: string;
  subtitle?: string;
}

export function PixelStudio({
  initialResolution = 32,
  initialPalette = 'original',
  defaultShowGrid = false,
  title = 'Image to Pixel Art Converter',
  subtitle = 'Instant in-browser pixelation engine with grid overlay, physical bead palettes, and lossless exports.'
}: PixelStudioProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [pixelSize, setPixelSize] = useState<number>(initialResolution);
  const [paletteId, setPaletteId] = useState<string>(initialPalette);
  const [showGrid, setShowGrid] = useState<boolean>(defaultShowGrid);
  const [dithering, setDithering] = useState<boolean>(true);
  const [stats, setStats] = useState<ColorStats[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isGifExporting, setIsGifExporting] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const lowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 处理图像转换
  const triggerProcess = useCallback(() => {
    if (!imgRef.current) return;
    setIsProcessing(true);

    try {
      const result = processImageToPixelArt(imgRef.current, {
        pixelSize,
        paletteId,
        dithering,
        showGrid,
        gridColor: showGrid ? 'rgba(0, 0, 0, 0.35)' : ''
      });

      lowCanvasRef.current = result.pixelCanvas;
      displayCanvasRef.current = result.displayCanvas;
      setStats(result.stats);

      if (previewContainerRef.current) {
        previewContainerRef.current.innerHTML = '';
        result.displayCanvas.className = 'max-w-full max-h-[550px] object-contain shadow-2xl rounded-lg border border-border';
        previewContainerRef.current.appendChild(result.displayCanvas);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [pixelSize, paletteId, dithering, showGrid]);

  useEffect(() => {
    if (imgSrc) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        imgRef.current = image;
        triggerProcess();
      };
      image.src = imgSrc;
    }
  }, [imgSrc, triggerProcess]);

  // 上传图片处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImgSrc(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 1. 修复：可靠导出原尺寸原生像素 PNG
  const handleDownloadOriginal = () => {
    if (!lowCanvasRef.current) return;
    downloadCanvas(lowCanvasRef.current, `pixel_${pixelSize}x${pixelSize}.png`);
  };

  // 2. 修复：可靠导出高清网格图纸 PNG
  const handleDownloadDisplay = () => {
    if (!displayCanvasRef.current) return;
    downloadCanvas(displayCanvasRef.current, `pixelforge_grid_${pixelSize}x${pixelSize}.png`);
  };

  // 3. 新增：动画 GIF 动态演化导出（从原图渐变像素化 / 闪烁循环 GIF）
  const handleExportAnimatedGif = async () => {
    if (!imgRef.current) return;
    setIsGifExporting(true);
    try {
      // 动态生成一阶阶梯像素化的多帧动画
      const resolutions = [16, 24, 32, 48, 64, 96, 64, 48, 32, 24];
      const frames: HTMLCanvasElement[] = [];

      for (const res of resolutions) {
        const step = processImageToPixelArt(imgRef.current, {
          pixelSize: res,
          paletteId,
          dithering,
          showGrid: false,
          gridColor: ''
        });
        frames.push(step.displayCanvas);
      }

      const gifBlob = await exportFramesToGif(frames, 4);
      downloadBlob(gifBlob, `pixelforge_animated_${pixelSize}px.gif`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGifExporting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* 头部标题区 */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左侧控制面板 */}
        <div className="lg:col-span-4 space-y-6 bg-card border border-border p-6 rounded-2xl shadow-sm">
          <div>
            <label className="block text-sm font-semibold mb-2">Upload Source Image</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 cursor-pointer p-6 rounded-xl transition-colors bg-muted/20">
              <IconUpload className="size-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Click or Drag Image Here</span>
              <span className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP (Processed 100% in browser memory)</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {/* 分辨率滑块与预设 */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold">Pixel Resolution</label>
              <span className="text-sm font-mono px-2 py-0.5 bg-muted rounded font-bold">
                {pixelSize} × {pixelSize}
              </span>
            </div>
            <input
              type="range"
              min="16"
              max="128"
              step="4"
              value={pixelSize}
              onChange={(e) => setPixelSize(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="grid grid-cols-5 gap-1 mt-2">
              {[16, 32, 48, 64, 96].map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setPixelSize(res)}
                  className={`text-xs py-1 rounded font-mono font-medium border transition-colors ${
                    pixelSize === res ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  {res}px
                </button>
              ))}
            </div>
          </div>

          {/* 调色板选择 */}
          <div>
            <label className="block text-sm font-semibold mb-2 flex items-center gap-1.5">
              <IconColorFilter className="size-4" /> Color Palette Quantization
            </label>
            <select
              value={paletteId}
              onChange={(e) => setPaletteId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-border bg-background text-sm font-medium"
            >
              {PALETTES.map((pal) => (
                <option key={pal.id} value={pal.id}>
                  {pal.name}
                </option>
              ))}
            </select>
          </div>

          {/* 增强网格与抖动开关 */}
          <div className="space-y-3 pt-2 border-t border-border">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold flex items-center gap-2">
                <IconGridDots className="size-4" /> Toggle Grid Lines (坐标网格线)
              </span>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="size-5 rounded border-border accent-primary cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold flex items-center gap-2">
                <IconSparkles className="size-4" /> Floyd-Steinberg Dithering
              </span>
              <input
                type="checkbox"
                checked={dithering}
                onChange={(e) => setDithering(e.target.checked)}
                className="size-5 rounded border-border accent-primary cursor-pointer"
              />
            </label>
          </div>

          {/* 导出按钮区 */}
          <div className="pt-4 border-t border-border space-y-2">
            <button
              type="button"
              disabled={!imgSrc || isProcessing}
              onClick={handleDownloadOriginal}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
            >
              <IconDownload className="size-5" /> Download Native Pixel PNG ({pixelSize}px)
            </button>
            <button
              type="button"
              disabled={!imgSrc || isProcessing}
              onClick={handleDownloadDisplay}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl border border-border transition disabled:opacity-50 text-sm cursor-pointer"
            >
              <IconPrinter className="size-4" /> Download Printable HD / Grid PNG
            </button>
            <button
              type="button"
              disabled={!imgSrc || isProcessing || isGifExporting}
              onClick={handleExportAnimatedGif}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition disabled:opacity-50 text-sm cursor-pointer shadow-xs"
            >
              <IconMovie className="size-4" /> {isGifExporting ? 'Generating Animated GIF...' : 'Export Pixel Animated GIF'}
            </button>
          </div>
        </div>

        {/* 右侧展示与材料清单区 */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          <div className="flex-1 min-h-[460px] bg-card/60 border border-border rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
            {imgSrc ? (
              <div ref={previewContainerRef} className="flex items-center justify-center w-full h-full" />
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <IconGridDots className="size-16 mx-auto stroke-1 mb-3 opacity-40 animate-pulse" />
                <p className="font-semibold text-lg">No image loaded yet</p>
                <p className="text-sm mt-1 max-w-sm mx-auto">
                  Upload an image on the left to see the instant live pixel transformation and coordinate grid.
                </p>
              </div>
            )}
          </div>

          {/* 材料清单 (BOM) & 色彩统计 */}
          {stats.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                <IconInfoCircle className="size-4 text-primary" />
                Materials & Color Breakdown (材料清单统计 - {stats.length} 种颜色)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-48 overflow-y-auto pr-2">
                {stats.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 p-2 bg-muted/40 rounded-lg border border-border/50 text-xs">
                    <span
                      className="size-5 rounded border border-black/10 shrink-0 shadow-sm"
                      style={{ backgroundColor: s.color.hex }}
                    />
                    <div className="truncate">
                      <div className="font-semibold truncate">
                        {s.color.code ? `[${s.color.code}] ` : ''}{s.color.name}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {s.count} pcs ({s.percentage}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

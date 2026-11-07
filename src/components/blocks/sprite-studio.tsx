import React, { useState } from 'react';
import { packFramesToSpriteSheet } from '@/features/pixel-engine/sprite-sheet';
import { downloadCanvas, exportFramesToGif, downloadBlob } from '@/features/pixel-engine/gif-export';
import { IconPhotoPlus, IconDownload, IconLayersIntersect, IconFileCode, IconMovie } from '@tabler/icons-react';

export function SpriteStudio() {
  const [frames, setFrames] = useState<{ id: string; url: string; canvas: HTMLCanvasElement }[]>([]);
  const [sheetPreviewCanvas, setSheetPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [sheetPreviewUrl, setSheetPreviewUrl] = useState<string | null>(null);
  const [metadataJson, setMetadataJson] = useState<string | null>(null);
  const [columns, setColumns] = useState<number>(0);
  const [fps, setFps] = useState<number>(8);
  const [isGifExporting, setIsGifExporting] = useState<boolean>(false);

  const handleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const loadedFrames: { id: string; url: string; canvas: HTMLCanvasElement }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.width;
          cv.height = img.height;
          const ctx = cv.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          loadedFrames.push({
            id: `frame_${i}`,
            url,
            canvas: cv
          });
          resolve();
        };
        img.src = url;
      });
    }

    setFrames(loadedFrames);
    pack(loadedFrames, columns);
  };

  const pack = (currentFrames: typeof frames, cols: number) => {
    if (currentFrames.length === 0) return;
    try {
      const { sheetCanvas, metadata } = packFramesToSpriteSheet(
        currentFrames.map(f => f.canvas),
        { columns: cols > 0 ? cols : undefined }
      );
      setSheetPreviewCanvas(sheetCanvas);
      setSheetPreviewUrl(sheetCanvas.toDataURL('image/png'));
      setMetadataJson(JSON.stringify(metadata, null, 2));
    } catch (err) {
      console.error(err);
    }
  };

  // 1. 导出整张雪碧图 PNG
  const handleDownloadSheet = () => {
    if (!sheetPreviewCanvas) return;
    downloadCanvas(sheetPreviewCanvas, 'spritesheet.png');
  };

  // 2. 导出 JSON 元数据
  const handleDownloadJson = () => {
    if (!metadataJson) return;
    const blob = new Blob([metadataJson], { type: 'application/json' });
    downloadBlob(blob, 'spritesheet.json');
  };

  // 3. 导出循环动图 GIF (修复需求中的核心动图功能)
  const handleDownloadGif = async () => {
    if (frames.length === 0) return;
    setIsGifExporting(true);
    try {
      const gifBlob = await exportFramesToGif(frames.map(f => f.canvas), fps);
      downloadBlob(gifBlob, 'animation.gif');
    } catch (e) {
      console.error(e);
    } finally {
      setIsGifExporting(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
          Free Sprite Sheet Maker & GIF Studio
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Merge animation frames into a packed sprite sheet PNG, export animated GIFs, or generate TextureAtlas JSON.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6 bg-card border border-border p-6 rounded-2xl shadow-sm">
          <div>
            <label className="block text-sm font-semibold mb-2">Upload Frames (PNG/GIF)</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 cursor-pointer p-6 rounded-xl transition-colors bg-muted/20">
              <IconPhotoPlus className="size-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Select Multiple Image Frames</span>
              <span className="text-xs text-muted-foreground mt-1">Select 2+ files to pack into atlas or export GIF</span>
              <input type="file" multiple accept="image/png, image/jpeg, image/gif" className="hidden" onChange={handleFilesUpload} />
            </label>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Columns Layout</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setColumns(0); pack(frames, 0); }}
                className={`flex-1 py-1.5 text-xs rounded-lg font-medium border cursor-pointer ${columns === 0 ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
              >
                Auto Square
              </button>
              {[4, 6, 8, 12].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColumns(c); pack(frames, c); }}
                  className={`py-1.5 px-3 text-xs rounded-lg font-medium border cursor-pointer ${columns === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                >
                  {c} Col
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-semibold">Animation Speed (FPS)</label>
              <span className="text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded">{fps} FPS</span>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <div className="pt-4 border-t border-border space-y-2">
            <button
              type="button"
              disabled={!sheetPreviewUrl}
              onClick={handleDownloadSheet}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
            >
              <IconDownload className="size-5" /> Download Sprite Sheet PNG
            </button>
            <button
              type="button"
              disabled={frames.length === 0 || isGifExporting}
              onClick={handleDownloadGif}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition disabled:opacity-50 text-sm cursor-pointer"
            >
              <IconMovie className="size-4" /> {isGifExporting ? 'Encoding GIF...' : 'Download Animated GIF'}
            </button>
            <button
              type="button"
              disabled={!metadataJson}
              onClick={handleDownloadJson}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-xl border border-border transition disabled:opacity-50 text-sm cursor-pointer"
            >
              <IconFileCode className="size-4" /> Download TextureAtlas JSON
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col space-y-6">
          <div className="flex-1 min-h-[460px] bg-card/60 border border-border rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
            {sheetPreviewUrl ? (
              <img
                src={sheetPreviewUrl}
                alt="Packed Sprite Sheet"
                className="max-w-full max-h-[500px] object-contain border border-border rounded-lg shadow-xl"
              />
            ) : (
              <div className="text-center text-muted-foreground p-8">
                <IconLayersIntersect className="size-16 mx-auto stroke-1 mb-3 opacity-40 animate-pulse" />
                <p className="font-semibold text-lg">No frames loaded</p>
                <p className="text-sm mt-1 max-w-sm mx-auto">
                  Upload multiple animation frames to automatically arrange and generate an engine-ready atlas and GIF.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

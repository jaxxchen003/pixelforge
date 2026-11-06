import { useState, useMemo } from 'react';
import { generatePixelCircle } from '@/features/pixel-engine/geometry';

export function CircleStudio() {
  const [diameter, setDiameter] = useState<number>(25);

  const { grid, radius } = useMemo(() => generatePixelCircle(diameter), [diameter]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground">
          Pixel Circle & Sphere Generator (Minecraft & Voxel)
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Calculate smooth circular curves and spherical blueprints on a discrete block grid. Essential for Minecraft builders.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6 bg-card border border-border p-6 rounded-2xl shadow-sm">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold">Diameter (Blocks / Pixels)</label>
              <span className="text-sm font-mono px-2 py-0.5 bg-muted rounded font-bold">
                {diameter}
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="65"
              step="2"
              value={diameter}
              onChange={(e) => setDiameter(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="grid grid-cols-5 gap-1 mt-3">
              {[9, 15, 25, 35, 49].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiameter(d)}
                  className={`text-xs py-1 rounded font-mono font-medium border transition-colors ${
                    diameter === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-muted/40 rounded-xl text-xs space-y-1.5 border border-border/60">
            <div className="font-semibold text-foreground">Blueprint Specs:</div>
            <div>Radius: <span className="font-mono font-bold">{radius}</span> blocks</div>
            <div>Grid Canvas: <span className="font-mono font-bold">{diameter} × {diameter}</span> blocks</div>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col items-center justify-center bg-card/60 border border-border rounded-2xl p-6 shadow-inner min-h-[460px] overflow-auto">
          <div
            className="grid gap-[1px] bg-border p-2 rounded border border-border shadow-md"
            style={{
              gridTemplateColumns: `repeat(${diameter}, minmax(0, 1fr))`,
              width: `${Math.min(520, diameter * 16)}px`,
              height: `${Math.min(520, diameter * 16)}px`
            }}
          >
            {grid.map((row, y) =>
              row.map((active, x) => (
                <div
                  key={`${x}-${y}`}
                  className={`aspect-square transition-colors ${
                    active ? 'bg-primary shadow-xs' : 'bg-background/80 hover:bg-muted/40'
                  }`}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

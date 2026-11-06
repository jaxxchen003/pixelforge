// 体素沙盒平滑像素圆 (Midpoint Circle) 与球体建造图纸算法
export interface CirclePoint {
  x: number;
  y: number;
}

export function generatePixelCircle(diameter: number): {
  points: CirclePoint[];
  grid: boolean[][];
  radius: number;
} {
  const d = Math.max(3, Math.min(128, Math.round(diameter)));
  const r = (d - 1) / 2;
  const size = d;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const points: CirclePoint[] = [];

  const center = r;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const distSq = dx * dx + dy * dy;
      // 边界厚度判定
      if (distSq <= r * r && distSq >= (r - 1) * (r - 1)) {
        grid[y][x] = true;
        points.push({ x, y });
      }
    }
  }

  return { points, grid, radius: r };
}

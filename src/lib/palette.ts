// Extract the most common colors from a canvas, quantized so anti-aliased
// edges collapse into their nearest neighbor.
export function extractPalette(
  canvas: HTMLCanvasElement,
  max = 5,
  minSharePct = 0.5
): string[] {
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const counts = new Map<number, number>();
  let totalPixels = 0;

  // Quantize each channel to 5 bits (32 buckets).
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = (data[i] >> 3) << 3;
    const g = (data[i + 1] >> 3) << 3;
    const b = (data[i + 2] >> 3) << 3;
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalPixels++;
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const out: string[] = [];
  for (const [key, count] of sorted) {
    const share = (count / totalPixels) * 100;
    if (share < minSharePct && out.length > 0) break;
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    const hex = `#${[r, g, b]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
    out.push(hex);
    if (out.length >= max) break;
  }
  return out;
}

import html2canvas from 'html2canvas';

export async function snapshotIframe(
  iframe: HTMLIFrameElement,
  width: number,
  height: number
): Promise<HTMLCanvasElement> {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) {
    throw new Error('iframe not ready');
  }
  return html2canvas(doc.body, {
    width,
    height,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
  });
}

export type DiffResult = {
  similarity: number;       // 0..1, 1 = identical
  diffCanvas: HTMLCanvasElement;
  changedPixels: number;
  maxChannelDiff: number;
};

// Compares two canvases, returns a similarity score AND a diff visualization.
// Diff canvas: black where pixels match, bright magenta scaled by magnitude
// where they differ. Uses screen-blend-style intensity so even small diffs
// show up.
export function compareCanvases(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement
): DiffResult {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);

  const ctxA = a.getContext('2d')!;
  const ctxB = b.getContext('2d')!;
  const da = ctxA.getImageData(0, 0, w, h).data;
  const db = ctxB.getImageData(0, 0, w, h).data;

  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w;
  diffCanvas.height = h;
  const diffCtx = diffCanvas.getContext('2d')!;
  const diffImg = diffCtx.createImageData(w, h);

  let total = 0;
  let changed = 0;
  let maxDiff = 0;
  const pixels = (da.length / 4);

  for (let i = 0; i < da.length; i += 4) {
    const dr = Math.abs(da[i] - db[i]);
    const dg = Math.abs(da[i + 1] - db[i + 1]);
    const dbb = Math.abs(da[i + 2] - db[i + 2]);
    const channelMean = (dr + dg + dbb) / 3;
    total += channelMean;

    const peak = Math.max(dr, dg, dbb);
    if (peak > 4) changed++;
    if (peak > maxDiff) maxDiff = peak;

    // Visualization: amplify so small diffs are visible.
    // 0 diff -> black; bigger diff -> bright magenta then white.
    const amp = Math.min(255, peak * 4);
    diffImg.data[i] = amp;            // R
    diffImg.data[i + 1] = Math.max(0, amp - 200); // G — only shows past saturation
    diffImg.data[i + 2] = amp;        // B
    diffImg.data[i + 3] = 255;
  }

  diffCtx.putImageData(diffImg, 0, 0);

  const meanDiff = total / pixels;
  const similarity = Math.max(0, 1 - meanDiff / 255);

  return {
    similarity,
    diffCanvas,
    changedPixels: changed,
    maxChannelDiff: maxDiff,
  };
}

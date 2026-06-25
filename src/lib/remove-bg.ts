// Client-side logo background remover.
//
// Strategy: sample the background color from the image corners, then clear every
// pixel whose color matches that background within a tolerance. This is a global
// color key, so it removes the outer background AND the enclosed pockets inside
// letters (the counters of O, D, P, A, etc.) and any other gaps. Genuine
// foreground (a different color from the background) is never touched. A light
// edge feather then softens the boundary so no background-colored halo remains.
//
// This is intentionally dependency-free and runs entirely in the browser. It is
// tuned for the common case of a logo on a solid (usually white) background. If
// the source already has real transparency it is returned unchanged.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function removeImageBackground(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return dataUrl; // tainted canvas; bail safely
  }
  const d = imageData.data;

  // If a meaningful share of pixels is already transparent, treat as pre-cut.
  let transparent = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
  if (transparent / (w * h) > 0.12) return dataUrl;

  // Background color = average of the four corners.
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let br = 0,
    bg = 0,
    bb = 0;
  for (const i of corners) {
    br += d[i];
    bg += d[i + 1];
    bb += d[i + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const tol = 50; // Euclidean color tolerance for "is background"
  const tol2 = tol * tol;
  const dist2 = (i: number) => {
    const dr = d[i] - br;
    const dg = d[i + 1] - bg;
    const db = d[i + 2] - bb;
    return dr * dr + dg * dg + db * db;
  };

  // Global color key: clear every pixel matching the background color, wherever
  // it is. This removes the outer background and the enclosed counters inside
  // letters/shapes, while leaving any differently-colored foreground intact.
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (dist2(i) <= tol2) d[i + 3] = 0;
  }

  // Feather: any still-opaque pixel that touches transparency and is close to
  // the background color gets partial alpha, removing hard color halos without
  // eating into the foreground.
  const ext = tol * 1.8;
  const ext2 = ext * ext;
  const isTrans = (x: number, y: number) => d[(y * w + x) * 4 + 3] === 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const touches =
        (x > 0 && isTrans(x - 1, y)) ||
        (x < w - 1 && isTrans(x + 1, y)) ||
        (y > 0 && isTrans(x, y - 1)) ||
        (y < h - 1 && isTrans(x, y + 1));
      if (!touches) continue;
      const dd = dist2(i);
      if (dd < ext2) d[i + 3] = Math.round(255 * Math.sqrt(dd / ext2));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

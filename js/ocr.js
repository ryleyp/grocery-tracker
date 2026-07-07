// On-device OCR via Tesseract.js. All engine files (JS, WASM core, and
// English language data) are vendored in vendor/tesseract/, so scanning
// works offline and never sends your receipt anywhere.
const VENDOR = 'vendor/tesseract';

let tesseractPromise = null;

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `${VENDOR}/tesseract.min.js`;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => {
        tesseractPromise = null;
        reject(new Error('Could not load the OCR engine. Reload the page and try again.'));
      };
      document.head.appendChild(s);
    });
  }
  return tesseractPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not prepare that image for scanning.'));
    };
    img.src = url;
  });
}

async function prepareImageForOcr(file) {
  try {
    const img = await loadImage(file);
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!sourceWidth || !sourceHeight) return file;

    const shortEdge = Math.min(sourceWidth, sourceHeight);
    let scale = Math.min(2.5, Math.max(1, 1400 / shortEdge));
    const maxPixels = 12000000;
    const scaledPixels = sourceWidth * sourceHeight * scale * scale;
    if (scaledPixels > maxPixels) {
      scale = Math.max(1, Math.sqrt(maxPixels / (sourceWidth * sourceHeight)));
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      const cleaned = contrasted > 236 ? 255 : contrasted < 30 ? 0 : contrasted;
      data[i] = cleaned;
      data[i + 1] = cleaned;
      data[i + 2] = cleaned;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  } catch {
    return file;
  }
}

export async function recognizeReceipt(file, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: `${VENDOR}/worker.min.js`,
    corePath: `${VENDOR}/core`,
    langPath: `${VENDOR}/lang`,
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
    },
  });
  try {
    const image = await prepareImageForOcr(file);
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

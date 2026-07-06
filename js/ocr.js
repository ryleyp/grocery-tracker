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
    const { data } = await worker.recognize(file);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

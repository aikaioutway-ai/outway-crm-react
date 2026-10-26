import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export type ReceiptPage = { image: string; width: number; height: number; textLayer: HTMLDivElement };

/** Изображение и выделяемый текст используют один viewport для точного совмещения. */
export async function renderPdfPages(url: string): Promise<ReceiptPage[]> {
  const pdf = await getDocument(url).promise;
  try {
    const pages: ReceiptPage[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Браузер не поддерживает отрисовку PDF');
      await page.render({ canvasContext: context, viewport }).promise;
      const textLayer = document.createElement('div');
      textLayer.className = 'receipt-pdf-text';
      textLayer.style.setProperty('--scale-factor', String(viewport.scale));
      await new TextLayer({ textContentSource: await page.getTextContent(), container: textLayer, viewport }).render();
      pages.push({ image: canvas.toDataURL('image/png'), width: viewport.width, height: viewport.height, textLayer });
    }
    return pages;
  } finally {
    void pdf.destroy();
  }
}

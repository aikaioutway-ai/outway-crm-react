import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Рисует страницы PDF-чека в картинки, чтобы окно чека вписывало их по размеру
 * одинаково во всех браузерах, без встроенного просмотрщика с его панелями. */
export async function renderPdfPages(url: string): Promise<string[]> {
  const pdf = await getDocument(url).promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Браузер не поддерживает отрисовку PDF');
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL('image/png'));
    }
    return pages;
  } finally {
    void pdf.destroy();
  }
}

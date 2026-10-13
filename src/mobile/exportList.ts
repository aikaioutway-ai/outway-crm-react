/**
 * «Список для водителя»: таблица детей трансфера в виде картинки (PNG) или PDF,
 * чтобы сразу переслать водителю. Рисуем на canvas — без сторонних библиотек.
 */

export interface ExportRow {
  stop: string;
  name: string;
  address: string;
  phones: string[];
  time: string;
}

export interface ExportList {
  title: string;
  subtitle: string;
  rows: ExportRow[];
}

const PAGE_WIDTH = 1240; // A4 при 150 dpi
const PAGE_HEIGHT = 1754;
const MARGIN = 56;
const FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';
type ColumnKey = 'index' | 'stop' | 'name' | 'address' | 'phones';
interface Column { key: ColumnKey; label: string; width: number }

/** Колонку «Ост.» показываем, только если остановки заполнены, — иначе её ширина уходит адресу. */
function columnsFor(list: ExportList): Column[] {
  const hasStops = list.rows.some(row => row.stop);
  return [
    { key: 'index', label: '№', width: 60 },
    ...(hasStops ? [{ key: 'stop' as const, label: 'Ост.', width: 80 }] : []),
    { key: 'name', label: 'ФИО ребёнка', width: 300 },
    { key: 'address', label: 'Адрес', width: hasStops ? 400 : 480 },
    { key: 'phones', label: 'Телефон', width: 288 },
  ];
}

const LINE = 30;
const CELL_PAD = 14;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}

interface LaidRow { cells: string[][]; height: number }

function layoutRows(ctx: CanvasRenderingContext2D, list: ExportList, columns: Column[]): LaidRow[] {
  ctx.font = `500 22px ${FONT}`;
  const widthOf = (key: ColumnKey) => (columns.find(column => column.key === key)?.width ?? 0) - CELL_PAD * 2;
  return list.rows.map((row, index) => {
    const values: Record<ColumnKey, string[]> = {
      index: [String(index + 1)],
      stop: [row.stop || '—'],
      name: wrap(ctx, row.name, widthOf('name')),
      address: wrap(ctx, row.address || '—', widthOf('address')),
      phones: row.phones.length ? row.phones : ['—'],
    };
    if (row.time) values.name = [...values.name, `утро ${row.time}`];
    const cells = columns.map(column => values[column.key]);
    const height = Math.max(...cells.map(lines => lines.length)) * LINE + CELL_PAD * 2 - 6;
    return { cells, height };
  });
}

function drawHeader(ctx: CanvasRenderingContext2D, list: ExportList, columns: Column[], page: number, pages: number): number {
  ctx.fillStyle = '#17222F';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(list.title, MARGIN, MARGIN + 36);
  ctx.fillStyle = '#626C8B';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(list.subtitle, MARGIN, MARGIN + 76);
  if (pages > 1) {
    const label = `стр. ${page} из ${pages}`;
    ctx.fillText(label, PAGE_WIDTH - MARGIN - ctx.measureText(label).width, MARGIN + 36);
  }
  let y = MARGIN + 110;
  ctx.fillStyle = '#E2F5F3';
  ctx.fillRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 48);
  ctx.fillStyle = '#237F81';
  ctx.font = `800 22px ${FONT}`;
  let x = MARGIN;
  columns.forEach(column => {
    ctx.fillText(column.label, x + CELL_PAD, y + 32);
    x += column.width;
  });
  y += 48;
  return y;
}

function drawRow(ctx: CanvasRenderingContext2D, columns: Column[], row: LaidRow, y: number, striped: boolean) {
  if (striped) {
    ctx.fillStyle = '#F5FAFB';
    ctx.fillRect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, row.height);
  }
  let x = MARGIN;
  row.cells.forEach((lines, columnIndex) => {
    const isName = columns[columnIndex].key === 'name';
    lines.forEach((line, lineIndex) => {
      const isTime = isName && line.startsWith('утро ');
      ctx.fillStyle = isTime ? '#626C8B' : '#17222F';
      ctx.font = isName && !isTime ? `700 22px ${FONT}` : `500 22px ${FONT}`;
      ctx.fillText(line, x + CELL_PAD, y + CELL_PAD + 20 + lineIndex * LINE);
    });
    x += columns[columnIndex].width;
  });
  ctx.strokeStyle = '#D4E3E7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y + row.height);
  ctx.lineTo(PAGE_WIDTH - MARGIN, y + row.height);
  ctx.stroke();
}

function newCanvas(height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не умеет рисовать картинки');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_WIDTH, height);
  ctx.textBaseline = 'alphabetic';
  return [canvas, ctx];
}

/** Одна длинная картинка — удобно смотреть в мессенджере. */
function renderImage(list: ExportList): HTMLCanvasElement {
  const columns = columnsFor(list);
  const [, probeCtx] = newCanvas(10);
  const rows = layoutRows(probeCtx, list, columns);
  const height = MARGIN + 158 + rows.reduce((sum, row) => sum + row.height, 0) + MARGIN;
  const [canvas, ctx] = newCanvas(Math.max(height, 400));
  let y = drawHeader(ctx, list, columns, 1, 1);
  rows.forEach((row, index) => { drawRow(ctx, columns, row, y, index % 2 === 1); y += row.height; });
  return canvas;
}

/** Страницы A4 для PDF: строки не разрываются между страницами. */
function renderPages(list: ExportList): HTMLCanvasElement[] {
  const columns = columnsFor(list);
  const [, probeCtx] = newCanvas(10);
  const rows = layoutRows(probeCtx, list, columns);
  const bodyHeight = PAGE_HEIGHT - MARGIN * 2 - 158;
  const chunks: LaidRow[][] = [[]];
  let used = 0;
  rows.forEach(row => {
    if (used + row.height > bodyHeight && chunks[chunks.length - 1].length) {
      chunks.push([]);
      used = 0;
    }
    chunks[chunks.length - 1].push(row);
    used += row.height;
  });
  return chunks.map((chunk, pageIndex) => {
    const [canvas, ctx] = newCanvas(PAGE_HEIGHT);
    let y = drawHeader(ctx, list, columns, pageIndex + 1, chunks.length);
    const offset = chunks.slice(0, pageIndex).reduce((sum, item) => sum + item.length, 0);
    chunk.forEach((row, index) => { drawRow(ctx, columns, row, y, (offset + index) % 2 === 1); y += row.height; });
    return canvas;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Не удалось создать файл'))), type, quality);
  });
}

/** Минимальный PDF: каждая страница — JPEG-картинка на весь лист A4. */
async function buildPdf(pages: HTMLCanvasElement[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  const images = await Promise.all(pages.map(async page => new Uint8Array(await (await canvasBlob(page, 'image/jpeg', 0.9)).arrayBuffer())));
  const pageIds = pages.map((_, index) => 3 + index * 3);
  const width = 595.28;
  const height = 841.89;

  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  images.forEach((image, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    object(pageId, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    object(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    object(imageId, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);
      push(image);
      push('\nendstream');
    });
  });
  const objectCount = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportFileName(list: ExportList, extension: string): string {
  return `${list.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.${extension}`;
}

/**
 * Файлы готовим заранее, когда открыт выбор формата: iPhone разрешает
 * «Поделиться» только сразу после нажатия, без долгой подготовки.
 */
export async function prepareExportFiles(list: ExportList): Promise<{ png: File; pdf: File }> {
  const [png, pdf] = await Promise.all([
    canvasBlob(renderImage(list), 'image/png'),
    buildPdf(renderPages(list)),
  ]);
  return {
    png: new File([png], exportFileName(list, 'png'), { type: 'image/png' }),
    pdf: new File([pdf], exportFileName(list, 'pdf'), { type: 'application/pdf' }),
  };
}

export function canShareFile(file: File): boolean {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  return !!nav.share && !!nav.canShare?.({ files: [file] });
}

/** На телефоне — системное «Поделиться» (WhatsApp, Telegram…), иначе скачивание. */
export async function shareOrDownload(file: File, title: string): Promise<void> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
    }
  }
  download(file, file.name);
}

/**
 * «Список для водителя»: таблица детей трансфера картинкой PNG,
 * чтобы сразу переслать водителю. Рисуем на canvas — без сторонних библиотек.
 */

export interface ExportRow {
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

const PAGE_WIDTH = 1240;
const MARGIN = 56;
const FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';
type ColumnKey = 'index' | 'name' | 'address' | 'phones';
interface Column { key: ColumnKey; label: string; width: number }

/** Одна колонка «№»: порядок уже задан — сначала по остановкам, потом дети без остановки. */
const COLUMNS: Column[] = [
  { key: 'index', label: '№', width: 60 },
  { key: 'name', label: 'ФИО ребёнка', width: 320 },
  { key: 'address', label: 'Адрес', width: 460 },
  { key: 'phones', label: 'Телефон', width: 288 },
];

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

function drawHeader(ctx: CanvasRenderingContext2D, list: ExportList, columns: Column[]): number {
  ctx.fillStyle = '#17222F';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(list.title, MARGIN, MARGIN + 36);
  ctx.fillStyle = '#626C8B';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillText(list.subtitle, MARGIN, MARGIN + 76);
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
  const columns = COLUMNS;
  const [, probeCtx] = newCanvas(10);
  const rows = layoutRows(probeCtx, list, columns);
  const height = MARGIN + 158 + rows.reduce((sum, row) => sum + row.height, 0) + MARGIN;
  const [canvas, ctx] = newCanvas(Math.max(height, 400));
  let y = drawHeader(ctx, list, columns);
  rows.forEach((row, index) => { drawRow(ctx, columns, row, y, index % 2 === 1); y += row.height; });
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Не удалось создать файл'))), type, quality);
  });
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

/** Рисует список и сразу скачивает картинку. */
export async function downloadListImage(list: ExportList): Promise<void> {
  const blob = await canvasBlob(renderImage(list), 'image/png');
  download(blob, exportFileName(list, 'png'));
}

export interface DriverParentCardInput {
  school?: string | null;
  transferNumber?: string | number | null;
  driverName?: string | null;
  phone?: string | null;
  secondPhone?: string | null;
  brand?: string | null;
  model?: string | null;
  plateNumber?: string | null;
  seats?: string | number | null;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export function buildDriverParentCardLines(input: DriverParentCardInput): string[] {
  const vehicle = [clean(input.brand), clean(input.model)].filter(Boolean).join(' ');
  const transferNumber = clean(input.transferNumber);
  const lines = ['🚌 OutWay — информация о трансфере'];

  const optionalLines: Array<[string, string]> = [
    ['Школа', clean(input.school)],
    ['Трансфер', transferNumber ? `№${transferNumber.replace(/^№\s*/, '')}` : ''],
    ['Водитель', clean(input.driverName)],
    ['Телефон', clean(input.phone)],
    ['Доп. телефон', clean(input.secondPhone)],
    ['Автомобиль', vehicle],
    ['Гос. номер', clean(input.plateNumber)],
    ['Количество мест', clean(input.seats)],
  ];

  optionalLines.forEach(([label, value]) => {
    if (value) lines.push(`${label}: ${value}`);
  });

  return lines;
}

export function buildDriverParentCardText(input: DriverParentCardInput): string {
  return buildDriverParentCardLines(input).join('\n');
}

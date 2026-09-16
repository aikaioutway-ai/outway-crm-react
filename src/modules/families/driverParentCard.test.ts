import { buildDriverParentCardLines, buildDriverParentCardText } from './driverParentCard';

describe('driver parent card', () => {
  it('formats the details needed by parents', () => {
    expect(buildDriverParentCardText({
      school: 'ABL #1',
      transferNumber: '2',
      driverName: 'Кыпчакбаев Нажимидин',
      phone: '0700880120',
      brand: 'Мерседес',
      model: 'Спринтер',
      plateNumber: '06KG054AIM',
      seats: 18,
    })).toContain('Трансфер: №2\nВодитель: Кыпчакбаев Нажимидин');
  });

  it('does not render labels for missing values', () => {
    const lines = buildDriverParentCardLines({ driverName: 'Водитель', phone: '' });
    expect(lines).toEqual([
      '🚌 OutWay — информация о трансфере',
      'Водитель: Водитель',
    ]);
    expect(lines.join('\n')).not.toContain('Телефон');
    expect(lines.join('\n')).not.toContain('Автомобиль');
  });
});

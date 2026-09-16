import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddressChangeModal } from './InlineFamilyCard';
import { loadYandexMaps } from '../../utils/yandexMaps';
import { Child } from '../../types';

jest.mock('../../utils/yandexMaps', () => ({ loadYandexMaps: jest.fn() }));

const child: Child = {
  id: 'child-1',
  familyId: 'family-1',
  childName: 'Азиз',
  class: '2А',
  selfExitAllowed: false,
  schoolCode: 'AES',
  branchId: 'branch-1',
  branchShort: 'AES',
  zone: 'A',
  vehicleType: 'microbus',
  distanceKm: 2,
  basePrice: 5600,
  finalPrice: 5600,
};

describe('AddressChangeModal', () => {
  beforeEach(() => {
    const geoObject = {
      geometry: { getCoordinates: () => [42.82, 74.61], setCoordinates: jest.fn() },
      getAddressLine: () => 'Кыргызстан, Бишкек, улица Манаса, 10',
      properties: { get: () => ({ GeocoderMetaData: { precision: 'exact' } }) },
    };
    const placemark = {
      geometry: { getCoordinates: () => [42.82, 74.61], setCoordinates: jest.fn() },
      events: { add: jest.fn() },
    };
    (loadYandexMaps as jest.Mock).mockResolvedValue({
      geocode: jest.fn().mockResolvedValue({
        geoObjects: { getLength: () => 1, get: () => geoObject },
      }),
      Map: jest.fn().mockImplementation(() => ({
        geoObjects: { add: jest.fn() },
        setCenter: jest.fn(),
        destroy: jest.fn(),
      })),
      Placemark: jest.fn().mockImplementation(() => placemark),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distance: 5000 }] }),
    }) as typeof fetch;
  });

  test('finds an address, previews the route and applies the plan', async () => {
    const onApply = jest.fn();
    render(
      <AddressChangeModal
        initialAddress=""
        children={[child]}
        branches={[{
          id: 'branch-1', schoolId: 'school-1', code: 'AES', shortName: 'AES', name: 'AES',
          latitude: 42.85, longitude: 74.58,
        }]}
        onClose={jest.fn()}
        onApply={onApply}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Токомбаева/i), { target: { value: 'Манаса, 10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Найти адрес' }));
    const candidate = await screen.findByRole('button', { name: /Кыргызстан, Бишкек, улица Манаса, 10/i });
    fireEvent.click(candidate);

    await screen.findByText(/2 →/);
    expect(screen.getByText(/5 км/)).toBeInTheDocument();
    expect(screen.getByText(/A →/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Применить к карточке/i })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: /Применить к карточке/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ latitude: 42.82, longitude: 74.61 }), [expect.objectContaining({
      childId: 'child-1', distanceKm: 5, zone: 'B', price: 6100,
    })]);
  });
});

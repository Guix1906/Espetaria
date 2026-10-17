import { STATUS_STYLES } from '../statusStyles';
import { describe, expect, it } from 'vitest';
import { getProductAvailability } from '../productAvailability';
import { getDeliveryStatusConfig } from '../deliveryStatus';
import type { DailyPrepStock, Product, DeliveryStatus } from '../../types/domain';

const product: Product = {
  id: 'product-ui', category_id: 'category-ui', name: 'Produto de demonstração', description: null,
  price: 15, image_url: null, active: true, available: true, sector: 'GRILL', type: 'ESPETO', tracks_stock: true,
  is_cubas: false, portions_per_cuba: 1, allows_doneness: true, allows_notes: true, display_order: 1,
  created_at: '2026-01-01T12:00:00Z', updated_at: '2026-01-01T12:00:00Z',
};
const stock: DailyPrepStock = {
  id: 'stock-ui', shift_id: 'shift-ui', product_id: product.id, cubas_count: 0, portions_per_cuba: 1,
  initial_quantity: 10, current_quantity: 5, reserved_quantity: 0, consumed_quantity: 5, discarded_quantity: 0,
  adjusted_quantity: 0, last_counted_quantity: null, count_difference: null, is_exhausted: false,
  exhausted_at: null, exhausted_by: null, exhaust_reason: null, created_at: product.created_at, updated_at: product.updated_at, updated_by: null, version: 1,
};

describe('Consistent catalog availability', () => {
  it('uses the same availability and remaining count in both catalogs', () => expect(getProductAvailability(product, stock)).toEqual({ isAvailable: true, remaining: 5 }));
  it('retains products without daily stock records', () => expect(getProductAvailability(product)).toEqual({ isAvailable: true, remaining: null }));
  it.each([{ ...stock, current_quantity: 0 }, { ...stock, current_quantity: -1 }, { ...stock, is_exhausted: true }])('disables exhausted stock without hiding the recorded balance', (record) => {
    expect(getProductAvailability(product, record)).toEqual({ isAvailable: false, remaining: record.current_quantity });
  });
  it.each([{ ...product, available: false }, { ...product, active: false }])('disables unavailable or inactive products even with a positive balance', (record) => expect(getProductAvailability(record, stock).isAvailable).toBe(false));
});

describe('Delivery status presentation', () => {
  it.each<DeliveryStatus>(['PENDING', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])('provides a visible label and description for %s', (status) => {
    const config = getDeliveryStatusConfig(status);
    expect(config.label.length).toBeGreaterThan(0);
    expect(config.description.length).toBeGreaterThan(0);
    expect(config.classes).toBe(STATUS_STYLES[config.kind]);
  });
  it('does not describe cancelled or delivered orders as still being prepared', () => {
    expect(getDeliveryStatusConfig('CANCELLED').label).toBe('Cancelado');
    expect(getDeliveryStatusConfig('DELIVERED').label).toBe('Entregue');
    expect(getDeliveryStatusConfig('OUT_FOR_DELIVERY').label).toBe('A caminho');
  });
});

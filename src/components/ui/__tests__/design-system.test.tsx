import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Receipt } from 'lucide-react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { FilterChip } from '../FilterChip';
import { PageHeader } from '../PageHeader';
import { StatCard } from '../StatCard';
import { SearchField } from '../SearchField';
import { TableCard } from '../TableCard';
import { EmptyState } from '../EmptyState';
import { CartItemRow } from '../CartItemRow';
import { NAVIGATION_GROUPS, PAGE_TITLES } from '../../layout/navigation';
import { KDSElapsedTimer } from '../../../features/kds/KDSElapsedTimer';
import type { RestaurantTable } from '../../../types/domain';
import type { TableStatus } from '../../../types/enums';

const css = readFileSync(path.resolve('src', 'index.css'), 'utf8');
function color(name: string): number[] {
  const match = new RegExp(`--color-${name}:\\s*([\\d ]+);`).exec(css);
  if (!match?.[1]) throw new Error(`Missing design token: ${name}`);
  return match[1].trim().split(/\s+/).map(Number);
}
function luminance(rgb: number[]): number {
  return rgb.reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0);
  }, 0);
}
function contrast(first: number[], second: number[]): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const table: RestaurantTable = { id: 'table-ui', number: 1, capacity: 4, status: 'LIVRE', active: true, created_at: '2026-01-01T12:00:00Z' };
afterEach(() => vi.useRealTimers());

describe('Shared interface and accessibility', () => {
  it.each(['ink', 'ink-secondary', 'ink-muted'])('keeps %s readable on every neutral surface', (foreground) => {
    for (const surface of ['canvas', 'surface', 'surface-soft', 'surface-muted']) expect(contrast(color(foreground), color(surface))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['brand-600', 'brand-700', 'brand-800', 'brand-900'])('keeps white labels readable on %s', (background) => expect(contrast([255, 255, 255], color(background))).toBeGreaterThanOrEqual(4.5));
  it('keeps input borders distinguishable from the field surface', () => expect(contrast(color('line-strong'), color('surface'))).toBeGreaterThanOrEqual(3));
  it('retains every system screen in navigation without duplicate entries', () => {
    const entries = NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    expect(new Set(entries).size).toBe(Object.keys(PAGE_TITLES).length);
    expect([...entries].sort()).toEqual(Object.keys(PAGE_TITLES).sort());
  });
  it('announces selected filters and preserves zero counters', () => {
    const html = renderToStaticMarkup(<FilterChip active onClick={() => { }} count={0}>Todas</FilterChip>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('is-active');
    expect(html).toContain('>0</span>');
  });
  it('renders one primary heading with explanatory text', () => {
    const html = renderToStaticMarkup(<PageHeader title="Caixa" description="Recebimentos do turno" icon={Receipt} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Recebimentos do turno');
  });
  it('does not replace zero metric values with a nonzero default', () => {
    expect(renderToStaticMarkup(<StatCard label="Comandas encerradas" value={0} icon={Receipt} />)).toContain('>0</div>');
  });
  it('gives search and clear controls accessible names', () => {
    const html = renderToStaticMarkup(<SearchField label="Buscar produto" value="Picanha" onChange={() => { }} placeholder="Nome do produto" />);
    expect(html).toContain('Buscar produto</label>');
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="Limpar busca"');
  });
  it.each<TableStatus>(['LIVRE', 'OCUPADA', 'AGUARDANDO_CONTA', 'RESERVADA'])('identifies %s tables with text, not color alone', (status) => {
    const html = renderToStaticMarkup(<TableCard table={{ ...table, status }} onOpen={() => { }} onOrder={() => { }} />);
    expect(html).toContain('aria-label="Mesa 1,');
    expect(html).toContain('status-badge');
    expect(html).toContain('Mesa 01');
  });
  it('prevents new table opening when a shift is closed', () => {
    expect(renderToStaticMarkup(<TableCard table={table} disabled onOpen={() => { }} onOrder={() => { }} />)).toContain('disabled=""');
  });
  it('keeps empty states explanatory and announced', () => {
    const html = renderToStaticMarkup(<EmptyState title="Nenhum produto" description="Tente outro filtro." />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Tente outro filtro.');
  });
  it('labels all cart operations with the affected product', () => {
    const html = renderToStaticMarkup(<CartItemRow name="Picanha" unitPrice={15} quantity={2} onQuantityChange={() => { }} onRemove={() => { }} />);
    for (const label of ['Remover Picanha', 'Diminuir quantidade de Picanha', 'Aumentar quantidade de Picanha']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toMatch(/30,00/);
  });
  it.each([[599, 'No prazo'], [600, 'Atenção'], [1199, 'Atenção'], [1200, 'Atrasado']] as const)('labels a production wait of %i seconds as %s', (seconds, label) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:30:00Z'));
    const html = renderToStaticMarkup(<KDSElapsedTimer createdAt={new Date(Date.now() - seconds * 1000).toISOString()} />);
    expect(html).toContain(label);
    expect(html).not.toContain('animate-');
  });
  it('preserves the shorter warning thresholds used by the bar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:30:00Z'));
    const html = renderToStaticMarkup(<KDSElapsedTimer createdAt={new Date(Date.now() - 360000).toISOString()} warningMinutes={3} urgentMinutes={6} />);
    expect(html).toContain('Atrasado');
  });
});

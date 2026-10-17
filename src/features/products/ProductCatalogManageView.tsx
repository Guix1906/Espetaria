import { isSupabaseConfigured } from '../../lib/supabase';
import React, { useEffect, useRef, useState } from 'react';
import { Beer, ChefHat, Flame, MoreHorizontal, PackagePlus, RotateCcw, Trash2, UtensilsCrossed } from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { formatBRL } from '../../lib/formatters';
import { Product } from '../../types/domain';
import { ProductionSector } from '../../types/enums';
import { ProductFormModal } from './ProductFormModal';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterChip } from '../../components/ui/FilterChip';
import { SearchField } from '../../components/ui/SearchField';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusTag } from '../../components/ui/StatusTag';

const SECTOR_LABEL: Record<ProductionSector, string> = { GRILL: 'Churrasqueira', KITCHEN: 'Cozinha', BAR: 'Bar' } as Record<ProductionSector, string>;
const SECTOR_ICON = { GRILL: Flame, KITCHEN: UtensilsCrossed, BAR: Beer } as Record<string, typeof Flame>;

/** Menu "mais" da linha: guarda a ação de excluir longe dos botões do dia a dia. */
function MoreMenu({ product, onDelete }: { product: Product; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label={`Mais ações para ${product.name}`} className="btn-secondary h-11 w-11 px-0">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-20 w-40 rounded-2xl border border-line bg-surface p-1 shadow-floating">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" />Excluir
          </button>
        </div>
      )}
    </div>
  );
}

export const ProductCatalogManageView: React.FC = () => {
  const { products, toggleProductActive, deleteProduct, resetProductsToDefault } = useStockStore();
  const confirm = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<'ALL' | ProductionSector | 'PAUSED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  const counts = {
    ALL: products.length,
    GRILL: products.filter((p) => p.sector === 'GRILL').length,
    KITCHEN: products.filter((p) => p.sector === 'KITCHEN').length,
    BAR: products.filter((p) => p.sector === 'BAR').length,
    PAUSED: products.filter((p) => !p.active).length,
  };

  const handleEdit = (product: Product) => { setProductToEdit(product); setIsModalOpen(true); };
  const handleCreateNew = () => { setProductToEdit(null); setIsModalOpen(true); };

  const handleDelete = async (product: Product) => {
    const confirmed = await confirm({ title: 'Excluir produto', message: `Excluir "${product.name}" do cardápio? Para tirar só por hoje, use "Pausar".`, confirmText: 'Excluir', variant: 'danger' });
    if (confirmed) deleteProduct(product.id);
  };

  const handleReset = async () => {
    const confirmed = await confirm({ title: 'Restaurar catálogo', message: 'Restaurar os produtos padrão da demonstração? Itens criados à mão serão redefinidos.', confirmText: 'Restaurar', variant: 'warning' });
    if (confirmed) resetProductsToDefault();
  };

  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLocaleLowerCase('pt-BR').includes(query) || (p.description?.toLocaleLowerCase('pt-BR').includes(query) ?? false);
    if (selectedSector === 'ALL') return matchesSearch;
    if (selectedSector === 'PAUSED') return matchesSearch && !p.active;
    return matchesSearch && p.sector === selectedSector;
  });

  const filters: { id: typeof selectedSector; label: string }[] = [
    { id: 'ALL', label: 'Todos' }, { id: 'GRILL', label: 'Churrasqueira' }, { id: 'KITCHEN', label: 'Cozinha' }, { id: 'BAR', label: 'Bar' }, { id: 'PAUSED', label: 'Pausados' },
  ];

  return (
    <div className="page-layout">
      <PageHeader
        eyebrow="Cardápio"
        title="Cadastro de produtos"
        description="O que é cadastrado aqui aparece na hora no cardápio do garçom e no delivery."
        icon={ChefHat}
        actions={<>
          {!isSupabaseConfigured && <button type="button" onClick={handleReset} className="btn-secondary min-h-[44px]" title="Restaura os produtos padrão de demonstração"><RotateCcw className="h-4 w-4" />Restaurar padrões</button>}
          <button type="button" onClick={handleCreateNew} className="btn-primary min-h-[44px]"><PackagePlus className="h-4 w-4" />Novo produto</button>
        </>}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="filter-bar" aria-label="Filtrar por setor">
          {filters.map((f) => <FilterChip key={f.id} active={selectedSector === f.id} onClick={() => setSelectedSector(f.id)} count={counts[f.id as keyof typeof counts]}>{f.label}</FilterChip>)}
        </div>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar produto" placeholder="Buscar por nome ou ingrediente" className="w-full lg:w-72" />
      </div>

      {filteredProducts.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" description="Nada corresponde à busca ou ao filtro." icon={PackagePlus} action={<button type="button" onClick={handleCreateNew} className="btn-primary"><PackagePlus className="h-4 w-4" />Cadastrar produto</button>} />
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="hidden grid-cols-[56px_minmax(0,1fr)_130px_110px_90px_auto] items-center gap-4 border-b border-line bg-surface-soft px-4 py-3 text-sm font-semibold text-ink-muted md:grid">
            <span aria-hidden="true" /><span>Produto</span><span>Setor</span><span className="text-right">Preço</span><span>Status</span><span className="text-right">Ações</span>
          </div>
          <ul className="divide-y divide-line">
            {filteredProducts.map((product) => {
              const Icon = SECTOR_ICON[product.sector] ?? Flame;
              return (
                <li key={product.id} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 md:grid-cols-[56px_minmax(0,1fr)_130px_110px_90px_auto]">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-muted text-ink-muted">
                    {product.image_url
                      ? <img src={product.image_url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                      : <Icon className="h-6 w-6" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold text-ink">{product.name}</h3>
                    {product.description && <p className="truncate text-sm text-ink-muted">{product.description}</p>}
                    <p className="mt-0.5 text-[13px] text-ink-secondary">
                      {[product.allows_doneness && 'Ponto da carne', product.is_cubas && `Cubas (${product.portions_per_cuba} por cuba)`, product.tracks_stock ? 'Estoque do dia' : 'Sem controle diário'].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm md:hidden">
                      <span className="text-ink-secondary">{SECTOR_LABEL[product.sector] ?? product.sector}</span>
                      <span className="font-mono font-semibold text-ink">{formatBRL(product.price)}</span>
                      <StatusTag kind={product.active ? 'occupied' : 'reserved'}>{product.active ? 'Ativo' : 'Pausado'}</StatusTag>
                    </p>
                  </div>
                  <span className="hidden text-sm text-ink-secondary md:block">{SECTOR_LABEL[product.sector] ?? product.sector}</span>
                  <span className="hidden text-right font-mono text-[15px] font-semibold text-ink md:block">{formatBRL(product.price)}</span>
                  <span className="hidden md:block"><StatusTag kind={product.active ? 'occupied' : 'reserved'}>{product.active ? 'Ativo' : 'Pausado'}</StatusTag></span>
                  <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
                    <button type="button" onClick={() => toggleProductActive(product.id)} className="btn-secondary min-h-[44px]">{product.active ? 'Pausar' : 'Reativar'}</button>
                    <button type="button" onClick={() => handleEdit(product)} className="btn-secondary min-h-[44px]">Editar</button>
                    <MoreMenu product={product} onDelete={() => void handleDelete(product)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ProductFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} productToEdit={productToEdit} />
    </div>
  );
};

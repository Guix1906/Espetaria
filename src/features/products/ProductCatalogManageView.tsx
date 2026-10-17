import { isSupabaseConfigured } from '../../lib/supabase';
import React, { useState } from 'react';
import { 
  PackagePlus, 
  Search, 
  Flame, 
  UtensilsCrossed, 
  Beer, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  EyeOff, 
  Eye,  
  Layers, 
  RotateCcw,
  ChefHat
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { formatBRL } from '../../lib/formatters';
import { Product } from '../../types/domain';
import { ProductionSector } from '../../types/enums';
import { ProductFormModal } from './ProductFormModal';
import { useConfirm } from '../../components/ui/ConfirmDialog';

export const ProductCatalogManageView: React.FC = () => {
  const { products, toggleProductActive, deleteProduct, resetProductsToDefault } = useStockStore();
  const confirm = useConfirm();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<'ALL' | ProductionSector | 'PAUSED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // Contadores
  const totalProducts = products.length;
  const grillCount = products.filter((p) => p.sector === 'GRILL').length;
  const kitchenCount = products.filter((p) => p.sector === 'KITCHEN').length;
  const barCount = products.filter((p) => p.sector === 'BAR').length;
  const pausedCount = products.filter((p) => !p.active).length;

  const handleEdit = (product: Product) => {
    setProductToEdit(product);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setProductToEdit(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (product: Product) => {
    const confirmed = await confirm({
      title: 'Remover produto',
      message: `Deseja realmente remover o produto "${product.name}" do cardápio?`,
      confirmText: 'Remover',
      variant: 'danger',
    });
    if (confirmed) {
      deleteProduct(product.id);
    }
  };

  const handleReset = async () => {
    const confirmed = await confirm({
      title: 'Restaurar catálogo',
      message: 'Deseja restaurar o catálogo de produtos para os itens padrões da Espetaria Sabor da Carne? Itens criados manualmente serão redefinidos.',
      confirmText: 'Restaurar',
      variant: 'warning',
    });
    if (confirmed) {
      resetProductsToDefault();
    }
  };

  // Filtragem
  const filteredProducts = products.filter((p) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    if (selectedSector === 'ALL') return matchesSearch;
    if (selectedSector === 'PAUSED') return matchesSearch && !p.active;
    return matchesSearch && p.sector === selectedSector;
  });

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* Topo / Header da Gestão */}
      <div className="bg-white border border-stone-200 p-4 sm:p-6 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-semibold shadow-sm">
            <ChefHat className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">
              Cadastro de produtos
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Itens cadastrados aqui são disponibilizados imediatamente no <strong>Cardápio do garçom</strong> e no <strong>Delivery</strong>
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isSupabaseConfigured && <button
            type="button"
            onClick={handleReset}
            className="bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 border border-stone-200 px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Restaura os produtos padrão de demonstração"
          >
            <RotateCcw className="w-4 h-4 text-stone-500" />
            <span>Restaurar padrões</span>
          </button>}

          <button
            type="button"
            onClick={handleCreateNew}
            className="btn-primary px-5 py-2.5 rounded-2xl text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition active:scale-95"
          >
            <PackagePlus className="w-4 h-4" />
            <span>Novo produto</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas por Setor */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-stone-500 uppercase">Total cadastrado</span>
          <div className="text-2xl font-semibold font-mono text-stone-900">{totalProducts}</div>
          <span className="text-[10px] text-stone-400">itens no catálogo</span>
        </div>

        <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-brand-700 uppercase flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" />
            <span>Churrasqueira</span>
          </span>
          <div className="text-2xl font-semibold font-mono text-brand-600">{grillCount}</div>
          <span className="text-[10px] text-stone-400">espetos na grelha</span>
        </div>

        <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-amber-800 uppercase flex items-center gap-1">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Cozinha</span>
          </span>
          <div className="text-2xl font-semibold font-mono text-amber-700">{kitchenCount}</div>
          <span className="text-[10px] text-stone-400">porções & cubas</span>
        </div>

        <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm space-y-1">
          <span className="text-[11px] font-semibold text-sky-700 uppercase flex items-center gap-1">
            <Beer className="w-3.5 h-3.5" />
            <span>Bar / Copa</span>
          </span>
          <div className="text-2xl font-semibold font-mono text-sky-700">{barCount}</div>
          <span className="text-[10px] text-stone-400">cervejas & bebidas</span>
        </div>

        <div className="bg-white border border-stone-200 p-4 rounded-2xl shadow-sm space-y-1 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-stone-500 uppercase flex items-center gap-1">
            <EyeOff className="w-3.5 h-3.5" />
            <span>Pausados</span>
          </span>
          <div className="text-2xl font-semibold font-mono text-stone-600">{pausedCount}</div>
          <span className="text-[10px] text-stone-400">ocultos da venda</span>
        </div>
      </div>

      {/* Barra de Filtros e Busca Rápida */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        
        {/* Filtros em Pílula */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'GRILL', label: 'Churrasqueira' },
            { id: 'KITCHEN', label: 'Cozinha' },
            { id: 'BAR', label: 'Bar' },
            { id: 'PAUSED', label: 'Pausados' },
          ].map((tab) => {
            const isActive = selectedSector === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedSector(tab.id as typeof selectedSector)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome ou ingrediente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 shadow-sm transition"
          />
        </div>

      </div>

      {/* Listagem de Produtos Cadastrados */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-sm bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
              <PackagePlus className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-stone-900 text-base">Nenhum produto encontrado</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Nenhum item corresponde à sua busca ou filtro. Que tal cadastrar um novo corte agora?
            </p>
            <button
              type="button"
              onClick={handleCreateNew}
              className="btn-primary px-5 py-2.5 rounded-2xl text-white text-xs font-bold shadow-sm inline-flex items-center gap-2"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Cadastrar produto</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredProducts.map((product) => {
              const isGrill = product.sector === 'GRILL';
              const isKitchen = product.sector === 'KITCHEN';
              const isBar = product.sector === 'BAR';

              return (
                <div
                  key={product.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                    !product.active ? 'bg-stone-50/70 opacity-75' : 'hover:bg-stone-50/50'
                  }`}
                >
                  {/* Foto / Ícone e Informações do Produto */}
                  <div className="flex items-start gap-3.5">
                    {/* Imagem ou Ícone Ilustrativo */}
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 flex items-center justify-center shrink-0 shadow-sm relative">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback se URL da imagem quebrar
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${
                          isGrill ? 'bg-brand-50 text-brand-600' :
                          isKitchen ? 'bg-amber-50 text-amber-600' :
                          'bg-sky-50 text-sky-600'
                        }`}>
                          {isGrill && <Flame className="w-6 h-6" />}
                          {isKitchen && <UtensilsCrossed className="w-6 h-6" />}
                          {isBar && <Beer className="w-6 h-6" />}
                        </div>
                      )}

                      {/* Badge do Setor na foto */}
                      <span className={`absolute bottom-0 inset-x-0 text-[8px] font-semibold uppercase text-center py-0.5 text-white ${
                        isGrill ? 'bg-brand-600' :
                        isKitchen ? 'bg-amber-600' :
                        'bg-sky-600'
                      }`}>
                        {product.sector}
                      </span>
                    </div>

                    {/* Detalhes Textuais */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-stone-900 text-sm sm:text-base">
                          {product.name}
                        </h3>

                        {/* Status Ativo / Pausado */}
                        {product.active ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 font-medium flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>ATIVO NO CARDÁPIO</span>
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-sm bg-stone-200 text-stone-600 font-medium flex items-center gap-1 font-mono">
                            <EyeOff className="w-3 h-3" />
                            <span>PAUSADO / OCULTO</span>
                          </span>
                        )}
                      </div>

                      {product.description && (
                        <p className="text-xs text-stone-500 max-w-xl line-clamp-1">
                          {product.description}
                        </p>
                      )}

                      {/* Badges de Regras Operacionais */}
                      <div className="flex items-center gap-2 flex-wrap pt-0.5 text-[10px] font-mono">
                        {product.allows_doneness && (
                          <span className="px-2 py-0.5 rounded-sm bg-brand-100 text-brand-800 font-semibold flex items-center gap-1">
                            
                            <span>Ponto da carne</span>
                          </span>
                        )}

                        {product.is_cubas && (
                          <span className="px-2 py-0.5 rounded-sm bg-amber-100 text-amber-800 font-semibold flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>Cubas ({product.portions_per_cuba} un/cuba)</span>
                          </span>
                        )}

                        {product.tracks_stock ? (
                          <span className="px-2 py-0.5 rounded-sm bg-stone-100 text-stone-600">
                            Estoque Diário: Sim
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-sm bg-stone-100 text-stone-400">
                            Sem controle diário
                          </span>
                        )}

                        <span className="text-stone-400 font-sans">
                          ID: <code className="font-mono text-stone-500">{product.id}</code>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Preço e Botões de Ação */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-16 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] uppercase font-bold text-stone-400">Preço de venda</div>
                      <div className="text-lg sm:text-xl font-semibold font-mono text-brand-600">
                        {formatBRL(product.price)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Botão Pausar / Ativar com 1 clique */}
                      <button
                        type="button"
                        onClick={() => toggleProductActive(product.id)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center transition active:scale-95 shadow-sm ${
                          product.active
                            ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                        title={product.active ? 'Pausar venda no cardápio' : 'Reativar venda no cardápio'}
                      >
                        {product.active ? (
                          <EyeOff className="w-4 h-4 text-stone-600" />
                        ) : (
                          <Eye className="w-4 h-4 text-emerald-600" />
                        )}
                      </button>

                      {/* Botão Editar */}
                      <button
                        type="button"
                        onClick={() => handleEdit(product)}
                        className="bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center transition active:scale-95 shadow-sm"
                        title="Editar dados e preço do produto"
                      >
                        <Edit3 className="w-4 h-4 text-stone-600" />
                      </button>

                      {/* Botão Excluir */}
                      <button
                        type="button"
                        onClick={() => handleDelete(product)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center transition active:scale-95 shadow-sm"
                        title="Remover produto do catálogo"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Cadastro e Edição */}
      <ProductFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        productToEdit={productToEdit}
      />

    </div>
  );
};

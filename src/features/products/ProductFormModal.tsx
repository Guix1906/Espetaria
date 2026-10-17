import React, { useState, useEffect } from 'react';
import { 
  X, 
  Flame, 
  UtensilsCrossed, 
  Beer, 
  CheckCircle2,  
  AlertCircle,
  PackagePlus,
  Layers
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { Product } from '../../types/domain';
import { ProductionSector, ProductType } from '../../types/enums';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSaved?: (product: Product) => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSaved,
}) => {
  const { addProduct, updateProduct } = useStockStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [name, setName] = useState('');
  const [price, setPrice] = useState<string>('22.00');
  const [sector, setSector] = useState<ProductionSector>('GRILL');
  const [type, setType] = useState<ProductType>('ESPETO');
  const categories = useStockStore((state) => state.categories);
  const [categoryId, setCategoryId] = useState(() => useStockStore.getState().categoryIdByOrder(1));
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [allowsDoneness, setAllowsDoneness] = useState(false);
  const [isCubas, setIsCubas] = useState(false);
  const [portionsPerCuba, setPortionsPerCuba] = useState<number>(15);
  const [tracksStock, setTracksStock] = useState(true);
  const [lowStock, setLowStock] = useState('');
  const [active, setActive] = useState(true);
  
  // Quantidade inicial para injetar no turno caso já esteja aberto
  const [initialShiftQuantity, setInitialShiftQuantity] = useState<string>('40');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEditing = Boolean(productToEdit);
  const isShiftOpen = currentShift?.status === 'ABERTO';

  // Sincroniza formulário com produto para edição ou valores iniciais
  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setPrice(productToEdit.price.toFixed(2));
      setSector(productToEdit.sector);
      setType(productToEdit.type);
      setCategoryId(productToEdit.category_id);
      setDescription(productToEdit.description || '');
      setImageUrl(productToEdit.image_url || '');
      setAllowsDoneness(productToEdit.allows_doneness);
      setIsCubas(productToEdit.is_cubas);
      setPortionsPerCuba(productToEdit.portions_per_cuba || 15);
      setTracksStock(productToEdit.tracks_stock);
      setLowStock(productToEdit.low_stock_threshold != null ? String(productToEdit.low_stock_threshold) : '');
      setActive(productToEdit.active);
    } else {
      setName('');
      setPrice('22.00');
      setSector('GRILL');
      setType('ESPETO');
      setCategoryId(useStockStore.getState().categoryIdByOrder(1));
      setDescription('');
      setImageUrl('');
      setAllowsDoneness(true);
      setIsCubas(false);
      setPortionsPerCuba(15);
      setTracksStock(true);
      setActive(true);
      setInitialShiftQuantity('40');
    }
    setErrorMsg(null);
  }, [productToEdit, isOpen]);

  // Ajusta automaticamente regras inteligentes ao mudar setor ou tipo
  const handleSectorChange = (newSector: ProductionSector) => {
    setSector(newSector);
    if (newSector === 'GRILL') {
      setType('ESPETO');
      setCategoryId(useStockStore.getState().categoryIdByOrder(1));
      setAllowsDoneness(true);
      setIsCubas(false);
      setTracksStock(true);
    } else if (newSector === 'KITCHEN') {
      setType('PORCAO');
      setCategoryId(useStockStore.getState().categoryIdByOrder(3));
      setAllowsDoneness(false);
      setIsCubas(true);
      setTracksStock(true);
    } else if (newSector === 'BAR') {
      setType('BEBIDA');
      setCategoryId(useStockStore.getState().categoryIdByOrder(4));
      setAllowsDoneness(false);
      setIsCubas(false);
      setTracksStock(true);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedPrice = parseFloat(price.replace(',', '.'));
    if (!name.trim()) {
      setErrorMsg('Informe o nome do produto.');
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setErrorMsg('Informe um preço de venda válido (maior que zero).');
      return;
    }

    const lowStockValue = lowStock.trim() === '' ? null : Math.max(0, parseInt(lowStock, 10) || 0);
    try {
      if (isEditing && productToEdit) {
        updateProduct(productToEdit.id, {
          name: name.trim(),
          price: parsedPrice,
          sector,
          type,
          category_id: categoryId,
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          allows_doneness: allowsDoneness,
          is_cubas: isCubas,
          portions_per_cuba: isCubas ? portionsPerCuba : 1,
          tracks_stock: tracksStock,
          low_stock_threshold: lowStockValue,
          active,
        });
        onSaved?.({
          ...productToEdit,
          name: name.trim(),
          price: parsedPrice,
          sector,
          type,
          category_id: categoryId,
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          allows_doneness: allowsDoneness,
          is_cubas: isCubas,
          portions_per_cuba: isCubas ? portionsPerCuba : 1,
          tracks_stock: tracksStock,
          low_stock_threshold: lowStockValue,
          active,
        });
      } else {
        const initialQty = parseInt(initialShiftQuantity, 10);
        const saved = addProduct(
          {
            name: name.trim(),
            price: parsedPrice,
            sector,
            type,
            category_id: categoryId,
            description: description.trim() || null,
            image_url: imageUrl.trim() || null,
            allows_doneness: allowsDoneness,
            allows_notes: true,
            is_cubas: isCubas,
            portions_per_cuba: isCubas ? portionsPerCuba : 1,
            tracks_stock: tracksStock,
            low_stock_threshold: lowStockValue,
            active,
            available: true,
            display_order: 99,
          },
          isShiftOpen && initialQty > 0
            ? {
                shiftId: currentShift.id,
                initialShiftQuantity: initialQty,
                userId: currentProfile.id,
              }
            : undefined
        );
        onSaved?.(saved);
      }

      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar produto.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-2xl shadow-floating overflow-hidden flex flex-col max-h-[92vh] text-stone-900">
        
        {/* Topo / Cabeçalho */}
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-brand-100 text-brand-600 flex items-center justify-center">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-stone-900 tracking-tight">
                {isEditing ? 'Editar produto do Cardápio' : 'Novo produto'}
              </h2>
              <p className="text-xs text-stone-500">
                Disponibilize itens para venda nos celulares dos garçons e no delivery
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 flex-1 text-xs sm:text-sm custom-scrollbar">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. SELEÇÃO RÁPIDA DE SETOR DE PRODUÇÃO */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Setor de preparo / Produção (KDS) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSectorChange('GRILL')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 active:scale-98 ${
                  sector === 'GRILL'
                    ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-200 font-medium'
                    : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Flame className="w-5 h-5 text-brand-600" />
                <span className="text-xs">Churrasqueira</span>
                <span className="text-[10px] text-stone-400">Grelha e espetos</span>
              </button>

              <button
                type="button"
                onClick={() => handleSectorChange('KITCHEN')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 active:scale-98 ${
                  sector === 'KITCHEN'
                    ? 'bg-amber-50 text-amber-800 ring-2 ring-amber-200 font-medium'
                    : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <UtensilsCrossed className="w-5 h-5 text-amber-600" />
                <span className="text-xs">Cozinha</span>
                <span className="text-[10px] text-stone-400">Porções & Cubas</span>
              </button>

              <button
                type="button"
                onClick={() => handleSectorChange('BAR')}
                className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 active:scale-98 ${
                  sector === 'BAR'
                    ? 'bg-sky-50 text-sky-700 ring-2 ring-sky-200 font-medium'
                    : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Beer className="w-5 h-5 text-sky-600" />
                <span className="text-xs">Bar e copa</span>
                <span className="text-[10px] text-stone-400">Bebidas e chopp</span>
              </button>
            </div>
          </div>

          {/* 2. DADOS PRINCIPAIS: NOME E PREÇO */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Nome do produto *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Espeto de Cupim Casqueirado"
                required
                className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900 font-medium placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Preço de Venda (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-stone-400 font-mono font-bold">R$</span>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="24.00"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow"
                />
              </div>
            </div>
          </div>

          {/* 3. CATEGORIA E TIPO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Categoria no Cardápio
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-stone-900 font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-shadow"
              >
                {[...categories].sort((a, b) => a.display_order - b.display_order).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Tipo do item
              </label>
              <select
                value={type}
                onChange={(e) => { const next = e.target.value as ProductType; setType(next); setCategoryId(useStockStore.getState().categoryIdByOrder(next === 'ESPETO' ? 1 : next === 'PORCAO' ? 3 : next === 'BEBIDA' ? 4 : 5)); }}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-stone-900 font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="ESPETO">Espeto (churrasqueira)</option>
                <option value="PORCAO">Porção / Acompanhamento</option>
                <option value="BEBIDA">Bebida</option>
                <option value="SOBREMESA">Sobremesa</option>
              </select>
            </div>
          </div>

          {/* 4. DESCRIÇÃO DETALHADA E FOTO */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Descrição Apetitosa (Cardápio do Cliente & Garçom)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Corte nobre com marmoreio intenso, assado lentamente na brasa e finalizado com flor de sal..."
              className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-xs transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              URL da Foto do Prato (Opcional para o Delivery)
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/... (ou deixe em branco)"
              className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-xs font-mono transition-shadow"
            />
          </div>

          {/* 5. REGRAS AVANÇADAS DE OPERAÇÃO */}
          <div className="p-4 rounded-2xl bg-white border border-stone-300 space-y-3">
            <h3 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-brand-600" />
              <span>Produção</span>
            </h3>

            {/* Toggle: Ponto da Carne */}
            <label className="flex items-center justify-between cursor-pointer py-1.5">
              <div>
                <div className="font-semibold text-stone-900 text-xs">Exigir seleção de ponto da carne?</div>
                <div className="text-[11px] text-stone-500">
                  Abre o modal de pontos (*Malpassada, Ao Ponto, etc.*) ao garçom ou cliente pedir
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowsDoneness}
                onChange={(e) => setAllowsDoneness(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </label>

            {/* Toggle: Controle por cubas Gastronômicas */}
            <label className="flex items-center justify-between cursor-pointer py-1.5 border-t border-stone-200">
              <div>
                <div className="font-semibold text-stone-900 text-xs flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-600" />
                  <span>Controlar por cubas?</span>
                </div>
                <div className="text-[11px] text-stone-500">
                  Ideal para arroz, feijão tropeiro e mandioca (Cálculo: Cubas × Porções)
                </div>
              </div>
              <input
                type="checkbox"
                checked={isCubas}
                onChange={(e) => setIsCubas(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </label>

            {isCubas && (
              <div className="pt-2 pl-4 border-l-2 border-amber-400 space-y-1">
                <label className="block text-xs font-semibold text-stone-700">
                  Rendimento de Porções por Cuba GN:
                </label>
                <input
                  type="number"
                  min="1"
                  value={portionsPerCuba}
                  onChange={(e) => setPortionsPerCuba(Math.max(1, Number(e.target.value)))}
                  className="w-24 bg-white border border-stone-300 rounded-xl px-3 py-1 text-center font-bold text-stone-900 font-mono text-xs"
                />
              </div>
            )}

            {/* Toggle: Controla estoque Diário */}
            <label className="flex items-center justify-between cursor-pointer py-1.5 border-t border-stone-200">
              <div>
                <div className="font-semibold text-stone-900 text-xs">Controla estoque operacional diário?</div>
                <div className="text-[11px] text-stone-500">
                  Exige contagem na abertura de turno e debita saldo a cada espeto vendido
                </div>
              </div>
              <input
                type="checkbox"
                checked={tracksStock}
                onChange={(e) => setTracksStock(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </label>

            {tracksStock && (
              <label className="flex items-center justify-between gap-3 py-1.5" htmlFor="product-low-stock">
                <div>
                  <div className="font-semibold text-ink text-sm">Avisar estoque baixo a partir de</div>
                  <div className="text-[13px] text-ink-muted">Vazio usa o padrão de 5 unidades</div>
                </div>
                <input
                  id="product-low-stock"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={lowStock}
                  placeholder="5"
                  onChange={(e) => setLowStock(e.target.value)}
                  className="h-11 w-24 rounded-md border border-line-strong bg-surface px-3 text-center font-mono text-base text-ink"
                />
              </label>
            )}

            {/* Toggle: Ativo para venda */}
            <label className="flex items-center justify-between cursor-pointer py-1.5 border-t border-stone-200">
              <div>
                <div className="font-semibold text-stone-900 text-xs">Ativo no cardápio</div>
                <div className="text-[11px] text-stone-500">
                  Se desativado, o produto é ocultado tanto do salão quanto do delivery
                </div>
              </div>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
            </label>
          </div>

          {/* 6. INJEÇÃO IMEDIATA NO TURNO ATIVO (Apenas ao criar novo produto) */}
          {!isEditing && isShiftOpen && tracksStock && (
            <div className="p-3.5 rounded-2xl bg-brand-50 border border-brand-200 space-y-2">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-brand-600" />
                <span className="font-bold text-brand-900 text-xs">
                  Turno atual Aberto ({currentShift.name})
                </span>
              </div>
              <p className="text-[11px] text-brand-800 leading-snug">
                Deseja disponibilizar este corte imediatamente para venda hoje à noite? Informe a quantidade preparada:
              </p>
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="number"
                  min="0"
                  value={initialShiftQuantity}
                  onChange={(e) => setInitialShiftQuantity(e.target.value)}
                  className="w-24 bg-white border border-brand-300 rounded-xl px-3 py-1.5 text-center font-bold text-brand-600 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <span className="text-xs text-brand-900 font-medium">unidades prontas para assar/servir</span>
              </div>
            </div>
          )}

          {/* Botões de Ação do Rodapé */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-stone-200">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary py-3 rounded-xl font-medium text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary py-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-sm text-white"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isEditing ? 'Salvar Alterações' : 'Cadastrar produto'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

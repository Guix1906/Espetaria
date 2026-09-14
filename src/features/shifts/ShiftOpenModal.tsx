import { AlertCircle,CheckCircle2,Coins,Flame,Sparkles,X } from 'lucide-react';
import React,{ useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { PrepItemInput,useStockStore } from '../../stores/useStockStore';

interface ShiftOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = ({ isOpen, onClose }) => {
  const { products } = useStockStore();
  const { openShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [shiftName, setShiftName] = useState<string>(
    `${new Date().toLocaleDateString('pt-BR')} — Noite`
  );
  const [cashStart, setCashStart] = useState<number>(150);
  const [notes, setNotes] = useState<string>('');
  
  // Estado das quantidades preparadas
  const [prepValues, setPrepValues] = useState<Record<string, { quantity: number; cubas: number; portions: number }>>(() => {
    const initial: Record<string, { quantity: number; cubas: number; portions: number }> = {};
    products.forEach((p) => {
      if (p.is_cubas) {
        initial[p.id] = {
          quantity: 0,
          cubas: p.id === 'prod-arroz' ? 3 : p.id === 'prod-tropeiro' ? 2 : 3,
          portions: p.portions_per_cuba || 15,
        };
      } else if (p.sector === 'GRILL') {
        initial[p.id] = {
          quantity: p.id === 'prod-picanha' ? 80 : p.id === 'prod-alcatra' ? 60 : 40,
          cubas: 0,
          portions: 1,
        };
      } else {
        initial[p.id] = {
          quantity: 24, // Bebidas
          cubas: 0,
          portions: 1,
        };
      }
    });
    return initial;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCubaChange = (productId: string, cubas: number) => {
    setPrepValues((prev) => {
      const current = prev[productId] || { quantity: 0, cubas: 0, portions: 15 };
      return {
        ...prev,
        [productId]: {
          ...current,
          cubas: Math.max(0, cubas),
        },
      };
    });
  };

  const handlePortionPerCubaChange = (productId: string, portions: number) => {
    setPrepValues((prev) => {
      const current = prev[productId] || { quantity: 0, cubas: 0, portions: 15 };
      return {
        ...prev,
        [productId]: {
          ...current,
          portions: Math.max(1, portions),
        },
      };
    });
  };

  const handleQuantityChange = (productId: string, qty: number) => {
    setPrepValues((prev) => {
      const current = prev[productId] || { quantity: 0, cubas: 0, portions: 1 };
      return {
        ...prev,
        [productId]: {
          ...current,
          quantity: Math.max(0, qty),
        },
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const items: PrepItemInput[] = [];

      Object.entries(prepValues).forEach(([productId, val]) => {
        const prod = products.find((p) => p.id === productId);
        if (!prod) return;

        if (prod.is_cubas) {
          if (val.cubas > 0) {
            items.push({
              productId,
              cubasCount: val.cubas,
              portionsPerCuba: val.portions,
            });
          }
        } else if (val.quantity > 0) {
          items.push({
            productId,
            quantity: val.quantity,
          });
        }
      });

      if (items.length === 0) {
        setErrorMsg('Informe pelo menos um produto preparado para abrir o turno.');
        return;
      }

      openShift(shiftName, notes, cashStart, items, currentProfile.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Erro inesperado ao abrir turno.');
      }
    }
  };

  const grillProducts = products.filter((p) => p.sector === 'GRILL');
  const cubaProducts = products.filter((p) => p.is_cubas);
  const barProducts = products.filter((p) => p.sector === 'BAR');

  return (
    <Dialog label="Abrir turno e preparar estoque" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-3xl bg-surface-muted border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink zoom-in-95 duration-200">
        
        {/* Topo / Header do Modal */}
        <div className="px-5 py-4 bg-surface-muted border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-100 text-brand-700 border border-brand-200 flex items-center justify-center shadow-sm">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink tracking-tight font-sans">
                Abertura da Noite (Mise en Place)
              </h2>
              <p className="text-xs text-ink-muted">
                Informe a quantidade de espetos espetados e cubas produzidas para o dia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar modal"
           type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center gap-2.5" role="alert">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-700" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dados Gerais do Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5" htmlFor="shiftopenmodal-field-1">
                Nome / Identificação do Turno
              </label>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                required
                className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-ink font-medium placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600"
               aria-label="Nome / Identificação do Turno" id="shiftopenmodal-field-1"/>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5 flex items-center gap-1.5" htmlFor="shiftopenmodal-field-2">
                <Coins className="w-4 h-4 text-amber-800" />
                <span>Fundo de Troco Inicial (Caixa)</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={cashStart}
                onChange={(e) => setCashStart(Number(e.target.value))}
                className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-brand-600 focus:border-brand-600 tabular-nums font-bold"
               aria-label="Fundo de Troco Inicial (Caixa)" id="shiftopenmodal-field-2"/>
            </div>
          </div>

          {/* 1. SEÇÃO DE ESPETOS PREPARADOS (GRELHA) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <Sparkles className="w-4 h-4 text-amber-800" />
              <h3 className="font-bold text-ink text-xs font-sans">
                🥩 Espetos Preparados para Hoje (Unidades)
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grillProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-surface-muted border border-line hover:border-line transition"
                  >
                    <div>
                      <div className="font-semibold text-ink">{p.name}</div>
                      <div className="text-xs text-brand-700 tabular-nums font-bold">{formatBRL(p.price)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val - 5)}
                        className="bg-surface-muted hover:bg-surface-muted text-ink w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs transition"
                       aria-label="Diminuir quantidade">
                        -5
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={val}
                        onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                        className="w-16 bg-surface-muted border border-line rounded-lg px-2 py-1 text-center font-bold text-brand-700 tabular-nums focus:outline-none focus:border-brand-600 text-xs"
                       aria-label="Quantidade disponível"/>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val + 5)}
                        className="bg-surface-muted hover:bg-surface-muted text-ink w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs transition"
                       aria-label="Aumentar quantidade">
                        +5
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. SEÇÃO DE CUBAS DE ACOMPANHAMENTO (COZINHA) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <Flame className="w-4 h-4 text-brand-700" />
              <h3 className="font-bold text-ink text-xs font-sans">
                🥘 Acompanhamentos Produzidos por CUBAS (Cozinha)
              </h3>
            </div>

            <div className="space-y-3">
              {cubaProducts.map((p) => {
                const cubas = prepValues[p.id]?.cubas ?? 0;
                const portions = prepValues[p.id]?.portions ?? p.portions_per_cuba ?? 15;
                const totalCalculado = cubas * portions;

                return (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-surface-muted border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-ink flex items-center gap-2">
                        {p.name}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 tabular-nums font-bold">
                          CONTROLE POR CUBA
                        </span>
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5 tabular-nums">
                        Fórmula: <span className="text-amber-800 font-semibold">{cubas} cubas</span> × <span className="text-amber-800 font-semibold">{portions} porções</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Quantidade de Cubas */}
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-ink-muted font-semibold">Cubas</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, Math.max(0, cubas - 1))}
                            className="bg-surface-muted hover:bg-surface-muted text-ink w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs transition"
                           aria-label="Diminuir quantidade">
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={cubas}
                            onChange={(e) => handleCubaChange(p.id, Number(e.target.value))}
                            className="w-14 bg-surface-muted border border-line rounded-lg px-1.5 py-0.5 text-center font-bold text-ink tabular-nums text-xs"
                           aria-label="Quantidade de cubas"/>
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, cubas + 1)}
                            className="bg-surface-muted hover:bg-surface-muted text-ink w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs transition"
                           aria-label="Aumentar quantidade">
                            +
                          </button>
                        </div>
                      </div>

                      {/* Rendimento por Cuba */}
                      <div className="flex flex-col items-center">
                        <span className="text-xs text-ink-muted font-semibold">Rendimento</span>
                        <input
                          type="number"
                          min="1"
                          value={portions}
                          onChange={(e) => handlePortionPerCubaChange(p.id, Number(e.target.value))}
                          className="w-14 bg-surface-muted border border-line rounded-lg px-1.5 py-1 text-center text-xs text-ink tabular-nums mt-0.5"
                          title="Porções por cuba"
                         aria-label="Porções por cuba"/>
                      </div>

                      {/* Total Calculado */}
                      <div className="flex flex-col items-center bg-amber-50 border border-amber-200 px-3 py-1 rounded-xl">
                        <span className="text-xs text-amber-800 font-bold">Total Porções</span>
                        <span className="text-base font-bold text-amber-800 tabular-nums">
                          {totalCalculado}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. BEBIDAS DISPONÍVEIS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <h3 className="font-bold text-ink text-xs font-sans">
                🍺 Bebidas Geladas Disponíveis (Unidades)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {barProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-surface-muted border border-line"
                  >
                    <div>
                      <div className="font-semibold text-ink">{p.name}</div>
                      <div className="text-xs text-ink-muted tabular-nums">{formatBRL(p.price)}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={val}
                      onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                      className="w-16 bg-surface-muted border border-line rounded-lg px-2 py-1 text-center font-bold text-ink tabular-nums focus:outline-none focus:border-brand-600 text-xs"
                     aria-label="Quantidade disponível"/>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observações da Noite */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5" htmlFor="shiftopenmodal-field-3">
              Observações Iniciais da Noite (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sexta-feira com música ao vivo, previsão de 150 clientes..."
              rows={2}
              className="w-full bg-surface-muted border border-line rounded-xl px-3.5 py-2 text-ink placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600 text-xs"
             aria-label="Observações Iniciais da Noite (Opcional)" id="shiftopenmodal-field-3"/>
          </div>

          {/* Botão de Confirmação */}
          <div className="pt-2">
            <button
              type="submit"
              className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm text-white"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar e Iniciar Turno da Noite</span>
            </button>
          </div>

        </form>
      </div>
    </Dialog>
  );
};

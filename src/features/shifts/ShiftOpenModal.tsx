import React, { useState } from 'react';
import { X, Flame, Sparkles, AlertCircle, Coins, CheckCircle2 } from 'lucide-react';
import { useStockStore, PrepItemInput } from '../../stores/useStockStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { formatBRL } from '../../lib/formatters';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-obsidian-950/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl card-carbon border border-carbon-700/80 rounded-3xl shadow-2xl shadow-black/80 overflow-hidden my-auto max-h-[90vh] flex flex-col">
        
        {/* Topo / Header do Modal */}
        <div className="px-5 py-4 bg-carbon-900/90 border-b border-carbon-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-ember-500/10 text-ember-400 border border-ember-500/30 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">
                Abertura da Noite (Mise en Place)
              </h2>
              <p className="text-xs text-obsidian-400">
                Informe a quantidade de espetos espetados e cubas produzidas para o dia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-obsidian-400 hover:text-white hover:bg-carbon-800 transition"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-6 flex-1 text-sm custom-scrollbar">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-ruby-950/60 border border-ruby-500/50 text-ruby-300 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-ruby-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dados Gerais do Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-obsidian-200 mb-1.5">
                Nome / Identificação do Turno
              </label>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                required
                className="w-full bg-carbon-950 border border-carbon-700 rounded-xl px-3.5 py-2 text-white font-medium placeholder-obsidian-500 focus:outline-none focus:ring-1 focus:ring-ember-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-obsidian-200 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-gold-400" />
                <span>Fundo de Troco Inicial (Caixa)</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={cashStart}
                onChange={(e) => setCashStart(Number(e.target.value))}
                className="w-full bg-carbon-950 border border-carbon-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-gold-500 font-mono font-bold"
              />
            </div>
          </div>

          {/* 1. SEÇÃO DE ESPETOS PREPARADOS (GRELHA) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-carbon-800/80 pb-2">
              <Sparkles className="w-4 h-4 text-gold-400" />
              <h3 className="font-bold text-white tracking-wider uppercase text-xs">
                🥩 Espetos Preparados para Hoje (Unidades)
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grillProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-carbon-900/80 border border-carbon-800/80 hover:border-carbon-700 transition"
                  >
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-gold-400/90 font-mono font-bold">{formatBRL(p.price)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val - 5)}
                        className="btn-carbon w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs"
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={val}
                        onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                        className="w-16 bg-carbon-950 border border-carbon-700 rounded-lg px-2 py-1 text-center font-bold text-ember-400 font-mono focus:outline-none focus:border-ember-500 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val + 5)}
                        className="btn-carbon w-8 h-8 rounded-lg font-bold flex items-center justify-center text-xs"
                      >
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
            <div className="flex items-center gap-2 border-b border-carbon-800/80 pb-2">
              <Flame className="w-4 h-4 text-ember-400" />
              <h3 className="font-bold text-white tracking-wider uppercase text-xs">
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
                    className="p-3.5 rounded-2xl bg-carbon-900/90 border border-carbon-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-white flex items-center gap-2">
                        {p.name}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/30 font-mono font-bold">
                          CONTROLE POR CUBA
                        </span>
                      </div>
                      <div className="text-xs text-obsidian-400 mt-0.5 font-mono">
                        Fórmula: <span className="text-gold-400 font-semibold">{cubas} cubas</span> × <span className="text-gold-400 font-semibold">{portions} porções</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Quantidade de Cubas */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Cubas</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, Math.max(0, cubas - 1))}
                            className="btn-carbon w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={cubas}
                            onChange={(e) => handleCubaChange(p.id, Number(e.target.value))}
                            className="w-14 bg-carbon-950 border border-carbon-700 rounded-lg px-1.5 py-0.5 text-center font-bold text-white font-mono text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, cubas + 1)}
                            className="btn-carbon w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Rendimento por Cuba */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Rendimento</span>
                        <input
                          type="number"
                          min="1"
                          value={portions}
                          onChange={(e) => handlePortionPerCubaChange(p.id, Number(e.target.value))}
                          className="w-14 bg-carbon-950 border border-carbon-700 rounded-lg px-1.5 py-1 text-center text-xs text-obsidian-300 font-mono mt-0.5"
                          title="Porções por cuba"
                        />
                      </div>

                      {/* Total Calculado */}
                      <div className="flex flex-col items-center bg-gold-950/20 border border-gold-500/30 px-3 py-1 rounded-xl">
                        <span className="text-[10px] text-gold-400 uppercase font-bold">Total Porções</span>
                        <span className="text-base font-black text-gold-400 font-mono">
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
            <div className="flex items-center gap-2 border-b border-carbon-800/80 pb-2">
              <h3 className="font-bold text-white tracking-wider uppercase text-xs">
                🍺 Bebidas Geladas Disponíveis (Unidades)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {barProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-carbon-900/80 border border-carbon-800/80"
                  >
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-obsidian-400 font-mono">{formatBRL(p.price)}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={val}
                      onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                      className="w-16 bg-carbon-950 border border-carbon-700 rounded-lg px-2 py-1 text-center font-bold text-white font-mono focus:outline-none focus:border-ember-500 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observações da Noite */}
          <div>
            <label className="block text-xs font-semibold text-obsidian-200 mb-1.5">
              Observações Iniciais da Noite (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sexta-feira com música ao vivo, previsão de 150 clientes..."
              rows={2}
              className="w-full bg-carbon-950 border border-carbon-700 rounded-xl px-3.5 py-2 text-white placeholder-obsidian-500 focus:outline-none focus:ring-1 focus:ring-ember-500 text-xs"
            />
          </div>

          {/* Botão de Confirmação */}
          <div className="pt-2">
            <button
              type="submit"
              className="btn-ember w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-ember-950/50"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar e Iniciar Turno da Noite</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

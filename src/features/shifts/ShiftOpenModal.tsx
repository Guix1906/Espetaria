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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        
        {/* Topo / Header do Modal */}
        <div className="px-5 py-4 bg-gradient-to-r from-rose-950/60 via-slate-900 to-amber-950/40 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-600/20 text-rose-400 border border-rose-600/30">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Abertura da Noite (Mise en Place)
              </h2>
              <p className="text-xs text-slate-400">
                Informe a quantidade de espetos espetados e cubas produzidas para o dia
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dados Gerais do Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome / Identificação do Turno
              </label>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span>Fundo de Troco Inicial (Caixa)</span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={cashStart}
                onChange={(e) => setCashStart(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>
          </div>

          {/* 1. SEÇÃO DE ESPETOS PREPARADOS (GRELHA) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-white tracking-wide uppercase text-xs">
                🥩 Espetos Preparados para Hoje (Unidades)
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {grillProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-amber-400/90 font-mono">{formatBRL(p.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val - 5)}
                        className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition flex items-center justify-center"
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={val}
                        onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                        className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-rose-400 font-mono focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(p.id, val + 5)}
                        className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition flex items-center justify-center"
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
            <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
              <Flame className="w-4 h-4 text-orange-400" />
              <h3 className="font-bold text-white tracking-wide uppercase text-xs">
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
                    className="p-3.5 rounded-xl bg-slate-800/80 border border-amber-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-white flex items-center gap-2">
                        {p.name}
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                          CONTROLE POR CUBA
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Fórmula: <span className="text-amber-400 font-mono font-semibold">{cubas} cubas</span> × <span className="text-amber-400 font-mono font-semibold">{portions} porções</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Quantidade de Cubas */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Cubas</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, Math.max(0, cubas - 1))}
                            className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold transition flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={cubas}
                            onChange={(e) => handleCubaChange(p.id, Number(e.target.value))}
                            className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-center font-bold text-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleCubaChange(p.id, cubas + 1)}
                            className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold transition flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Rendimento por Cuba */}
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Rendimento</span>
                        <input
                          type="number"
                          min="1"
                          value={portions}
                          onChange={(e) => handlePortionPerCubaChange(p.id, Number(e.target.value))}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-xs text-slate-300 font-mono"
                          title="Porções por cuba"
                        />
                      </div>

                      {/* Total Calculado */}
                      <div className="flex flex-col items-center bg-amber-950/40 border border-amber-800/60 px-3 py-1 rounded-lg">
                        <span className="text-[10px] text-amber-300 uppercase font-bold">Total Porções</span>
                        <span className="text-base font-black text-amber-400 font-mono">
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
            <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
              <h3 className="font-bold text-white tracking-wide uppercase text-xs">
                🍺 Bebidas Geladas Disponíveis (Unidades)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {barProducts.map((p) => {
                const val = prepValues[p.id]?.quantity ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-800"
                  >
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-xs text-slate-400">{formatBRL(p.price)}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={val}
                      onChange={(e) => handleQuantityChange(p.id, Number(e.target.value))}
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center font-bold text-white font-mono focus:outline-none focus:border-rose-500"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observações da Noite */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Observações Iniciais da Noite (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sexta-feira com música ao vivo, previsão de 150 clientes..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 text-xs"
            />
          </div>

          {/* Botão de Confirmação */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-sm tracking-wide uppercase shadow-xl shadow-rose-950/60 transition active:scale-[0.98] flex items-center justify-center gap-2"
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

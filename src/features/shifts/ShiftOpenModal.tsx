import { AlertCircle, Ban, Calendar, Check, CheckCircle2, Coins, Flame, History, RotateCcw, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { isComboProduct } from '../../lib/comboStock';
import { loadLastClosedShiftPrep } from '../../lib/lastShift';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { PrepItemInput, useStockStore } from '../../stores/useStockStore';
import type { Product } from '../../types/domain';

interface ShiftOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** '' = ainda não preenchido (fica destacado). */
type PrepValue = { quantity: string; cubas: string };

const toNumber = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0));
const isRice = (p: Product) => /^arroz(\b|$)/i.test(p.name.trim());

const DEFAULT_RICE_OPTIONS = [
  'Arroz Branco',
  'Arroz Carreteiro',
  'Baião de Dois',
  'Arroz de Alho',
  'Arroz com Brócolis',
  'Arroz à Grega',
  'Arroz Integral',
];

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = ({ isOpen, onClose }) => {
  const { products, categories } = useStockStore();
  const { openShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { settings, updateSettings } = useSettingsStore();

  const [shiftName, setShiftName] = useState<string>(`${new Date().toLocaleDateString('pt-BR')} — Noite`);
  const [cashStart, setCashStart] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [prepValues, setPrepValues] = useState<Record<string, PrepValue>>({});
  const [disabledProducts, setDisabledProducts] = useState<Record<string, boolean>>({});
  /** Rendimento por cuba vindo do último turno (senão, do cadastro do produto). */
  const [portionsOverride, setPortionsOverride] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [repeatState, setRepeatState] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });

  // Sabores de arroz do dia selecionados para o turno
  const [selectedRiceFlavors, setSelectedRiceFlavors] = useState<string[]>(() => {
    return settings.daily_rice_flavors && settings.daily_rice_flavors.length > 0
      ? settings.daily_rice_flavors
      : ['Arroz Branco'];
  });
  const [customRiceInput, setCustomRiceInput] = useState('');
  const [isAddingCustomRice, setIsAddingCustomRice] = useState(false);

  // Lista consolidada de todos os arrozes cadastrados (configurações + catálogo de produtos + sugestões)
  const allRegisteredRices = React.useMemo(() => {
    const fromSettings = settings.daily_rice_flavors || [];
    const fromProducts = products
      .filter((p) => /arroz|bai[aã]o/i.test(p.name))
      .map((p) => p.name.replace(/\s*\([^)]*\)\s*/g, '').trim());
    return Array.from(new Set([...fromSettings, ...fromProducts, ...DEFAULT_RICE_OPTIONS])).filter(Boolean);
  }, [settings.daily_rice_flavors, products]);

  // Campos começam vazios a cada abertura
  useEffect(() => {
    if (!isOpen) return;
    setPrepValues({});
    setDisabledProducts({});
    setPortionsOverride({});
    setCashStart('');
    setErrorMsg(null);
    setRepeatState({ loading: false, message: null });
    setSelectedRiceFlavors(
      settings.daily_rice_flavors && settings.daily_rice_flavors.length > 0
        ? settings.daily_rice_flavors
        : ['Arroz Branco']
    );
    setCustomRiceInput('');
    setIsAddingCustomRice(false);
  }, [isOpen, settings.daily_rice_flavors]);

  if (!isOpen) return null;

  // "X com acompanhamento" não é digitado: o banco calcula o saldo = menor entre espeto X e arroz (00031)
  // Só se conta no turno: espetos, porções de arroz, entradas e acompanhamentos. O resto vende sem controle de quantidade.
  const activeTracked = products.filter((p) => p.active && p.tracks_stock);
  const combos = activeTracked.filter(isComboProduct);
  const isStarter = (p: Product) => /entrada/i.test(categories.find((c) => c.id === p.category_id)?.name ?? '');
  const rice = activeTracked.find(isRice);
  const skewers = activeTracked.filter((p) => !isComboProduct(p) && p.sector === 'GRILL' && p !== rice && !isStarter(p));
  const starters = activeTracked.filter((p) => !isComboProduct(p) && p !== rice && isStarter(p));
  const otherSides = activeTracked.filter(
    (p) => !isComboProduct(p) && p !== rice && !skewers.some((s) => s.id === p.id) && !starters.some((s) => s.id === p.id)
  );
  const stockProducts = [...skewers, ...(rice ? [rice] : []), ...starters, ...otherSides];

  /** Arroz é lançado direto em porções (o rendimento muda a cada dia). */
  const usesCubas = (p: Product) => p.is_cubas && p !== rice;
  const portionsOf = (p: Product) => portionsOverride[p.id] || p.portions_per_cuba || 1;
  /** Pedido do dono: arroz já vem pré-estabelecido com 130 porções; outros acompanhamentos com 8; espetos em branco. */
  const DEFAULT_NON_SKEWER = '8';
  const DEFAULT_RICE_PORTIONS = '130';
  const valueOf = (id: string): PrepValue => {
    if (prepValues[id]) return prepValues[id];
    const p = stockProducts.find((s) => s.id === id);
    if (!p || skewers.some((s) => s.id === id)) return { quantity: '', cubas: '' };
    if (isRice(p)) return { quantity: DEFAULT_RICE_PORTIONS, cubas: '' };
    return usesCubas(p) ? { quantity: '', cubas: DEFAULT_NON_SKEWER } : { quantity: DEFAULT_NON_SKEWER, cubas: '' };
  };
  const isFilled = (p: Product) => {
    if (disabledProducts[p.id]) return true;
    return (usesCubas(p) ? valueOf(p.id).cubas : valueOf(p.id).quantity).trim() !== '';
  };
  const qtyOf = (p: Product) => {
    if (disabledProducts[p.id]) return 0;
    return usesCubas(p)
      ? Math.round((toNumber(valueOf(p.id).cubas) ?? 0) * portionsOf(p))
      : toNumber(valueOf(p.id).quantity) ?? 0;
  };
  const riceQty = rice ? qtyOf(rice) : 0;
  const baseOf = (combo: Product) => {
    const name = combo.name.replace(/\s+com acompanhamento\s*$/i, '').trim().toLocaleLowerCase('pt-BR');
    return stockProducts.find((p) => p.name.trim().toLocaleLowerCase('pt-BR') === name);
  };
  const missingCount = stockProducts.filter(
    (p) => !disabledProducts[p.id] && (usesCubas(p) ? valueOf(p.id).cubas : valueOf(p.id).quantity).trim() === ''
  ).length;
  const disabledCount = stockProducts.filter((p) => disabledProducts[p.id]).length;
  const uncountedSkewers = skewers.filter(
    (p) => !disabledProducts[p.id] && !(toNumber(valueOf(p.id).quantity) ?? 0)
  );

  const setField = (productId: string, field: keyof PrepValue, value: string) =>
    setPrepValues((prev) => ({ ...prev, [productId]: { ...valueOf(productId), [field]: value } }));
  const step = (productId: string, field: keyof PrepValue, delta: number) => {
    const current = toNumber(valueOf(productId)[field]) ?? 0;
    setField(productId, field, String(Math.max(0, current + delta)));
  };

  const toggleDisable = (productId: string) => {
    setDisabledProducts((prev) => {
      const nextState = !prev[productId];
      if (nextState) {
        setPrepValues((p) => ({ ...p, [productId]: { quantity: '', cubas: '' } }));
      }
      return { ...prev, [productId]: nextState };
    });
  };

  const repeatLastShift = async () => {
    setRepeatState({ loading: true, message: null });
    try {
      const last = await loadLastClosedShiftPrep();
      if (!last) {
        setRepeatState({ loading: false, message: 'Ainda não há turno fechado para repetir.' });
        return;
      }
      const next: Record<string, PrepValue> = {};
      const portions: Record<string, number> = {};
      const nextDisabled: Record<string, boolean> = {};

      last.items.forEach((item) => {
        const prod = stockProducts.find((p) => p.id === item.productId);
        if (!prod) return;
        if (item.quantity === 0 && item.cubas === 0) {
          nextDisabled[prod.id] = true;
          return;
        }
        if (usesCubas(prod)) {
          next[prod.id] = { quantity: '', cubas: String(item.cubas) };
          if (item.portions > 0) portions[prod.id] = item.portions;
        } else {
          next[prod.id] = { quantity: String(item.quantity), cubas: '' };
        }
      });
      setPrepValues(next);
      setDisabledProducts(nextDisabled);
      setPortionsOverride(portions);
      setCashStart(String(last.cashStart));
      setRepeatState({ loading: false, message: `Preenchido com "${last.shiftName}". Confira antes de abrir.` });
    } catch (err) {
      setRepeatState({ loading: false, message: err instanceof Error ? err.message : 'Não foi possível buscar o último turno.' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const items: PrepItemInput[] = [];
      const disabledIds: string[] = [];

      stockProducts.forEach((prod) => {
        if (disabledProducts[prod.id]) {
          disabledIds.push(prod.id);
          return;
        }

        const val = valueOf(prod.id);
        if (usesCubas(prod)) {
          const cubas = toNumber(val.cubas) ?? 0;
          if (cubas > 0) items.push({ productId: prod.id, cubasCount: cubas, portionsPerCuba: portionsOf(prod) });
        } else {
          const qty = toNumber(val.quantity) ?? 0;
          if (qty > 0) items.push({ productId: prod.id, quantity: qty });
        }
      });

      if (items.length === 0) {
        setErrorMsg('Informe pelo menos um produto preparado para abrir o turno.');
        return;
      }

      // Salva os sabores de arroz selecionados nas configurações para os garçons
      if (selectedRiceFlavors.length > 0) {
        updateSettings({ daily_rice_flavors: selectedRiceFlavors });
      }

      openShift(shiftName, notes, toNumber(cashStart) ?? 0, items, currentProfile.id, disabledIds);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao abrir turno.');
    }
  };

  const handleSelectRiceOption = (value: string) => {
    if (value === '__NEW__') {
      setIsAddingCustomRice(true);
      return;
    }
    if (!value) return;
    if (!selectedRiceFlavors.includes(value)) {
      setSelectedRiceFlavors([...selectedRiceFlavors, value]);
    }
  };

  const toggleRiceFlavor = (flavor: string) => {
    if (selectedRiceFlavors.includes(flavor)) {
      if (selectedRiceFlavors.length > 1) {
        setSelectedRiceFlavors(selectedRiceFlavors.filter((f) => f !== flavor));
      }
    } else {
      setSelectedRiceFlavors([...selectedRiceFlavors, flavor]);
    }
  };

  const handleAddCustomRice = () => {
    const trimmed = customRiceInput.trim();
    if (!trimmed) return;
    if (!selectedRiceFlavors.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedRiceFlavors([...selectedRiceFlavors, trimmed]);
    }
    setCustomRiceInput('');
    setIsAddingCustomRice(false);
  };

  const fieldClass = (filled: boolean) =>
    `h-10 rounded-lg border px-2 text-center font-mono text-base font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand-600 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
      filled ? 'bg-surface border-line-strong' : 'bg-amber-50/80 border-amber-300'
    }`;
  const stepButton =
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface font-mono text-sm font-bold text-ink hover:bg-surface-muted active:scale-95 transition';

  const unitRow = (p: Product) => {
    const isDisabled = Boolean(disabledProducts[p.id]);
    const isCuba = usesCubas(p);
    const field = isCuba ? 'cubas' : 'quantity';
    const stepDelta = isCuba ? 1 : 5;
    const val = isCuba ? valueOf(p.id).cubas : valueOf(p.id).quantity;
    const filled = isFilled(p);

    return (
      <div
        key={p.id}
        className={`flex flex-col justify-between gap-2 p-3 rounded-2xl border transition ${
          isDisabled
            ? 'bg-rose-50/40 border-rose-200'
            : filled
            ? 'bg-surface border-line shadow-xs'
            : 'bg-amber-50/60 border-amber-300 shadow-xs'
        }`}
      >
        {/* Linha 1: Nome completo do produto (sempre visível) + Preço + Sabor + Botão de disponibilidade */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-bold text-sm sm:text-base leading-tight break-words ${
                  isDisabled ? 'text-ink-muted line-through' : 'text-ink'
                }`}
              >
                {p.name}
              </span>
              {isRice(p) && selectedRiceFlavors.length > 0 && !isDisabled && (
                <span className="inline-flex items-center gap-1 font-semibold text-xs text-brand-800 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                  <span>Sabor: {selectedRiceFlavors.join(' & ')}</span>
                </span>
              )}
            </div>
            <div className="text-xs text-ink-muted font-mono mt-0.5 flex items-center gap-2">
              <span>{formatBRL(p.price)}</span>
              {isCuba && !isDisabled && <span>· {portionsOf(p)} porções/cuba</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => toggleDisable(p.id)}
            className={`h-11 w-11 justify-center sm:w-auto px-0 sm:px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
              isDisabled
                ? 'border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100 shadow-xs active:scale-95'
                : 'border-line bg-surface text-ink-muted hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50'
            }`}
            title={isDisabled ? `Habilitar ${p.name}` : `Desabilitar ${p.name} (não tem hoje)`}
            aria-label={isDisabled ? `Habilitar ${p.name}` : `Desabilitar ${p.name}`}
          >
            {isDisabled ? (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-brand-700 shrink-0" />
                <span className="hidden sm:inline">Habilitar</span>
              </>
            ) : (
              <>
                <Ban className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">Não tem hoje</span>
              </>
            )}
          </button>
        </div>

        {/* Linha 2: Controles de quantidade ou status de desabilitado */}
        {isDisabled ? (
          <div className="pt-2 border-t border-rose-200/70 flex items-center justify-between text-xs font-semibold text-rose-700">
            <span className="flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 shrink-0" />
              Fora do cardápio hoje
            </span>
            <span className="text-[13px] font-normal text-rose-600">Garçons não verão este item</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-secondary">
              {isCuba ? 'Cubas preparadas:' : 'Qtd. preparada:'}
            </span>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => step(p.id, field, -stepDelta)}
                className={stepButton}
                aria-label={`Tirar ${stepDelta} de ${p.name}`}
              >
                −{stepDelta}
              </button>

              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={val}
                placeholder="0"
                onChange={(e) => setField(p.id, field, e.target.value)}
                className={`w-20 ${fieldClass(filled)}`}
                aria-label={`Quantidade de ${p.name}`}
              />

              <button
                type="button"
                onClick={() => step(p.id, field, stepDelta)}
                className={stepButton}
                aria-label={`Somar ${stepDelta} em ${p.name}`}
              >
                +{stepDelta}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog label="Abrir turno" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-3xl bg-surface border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink zoom-in-95 duration-200">

        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Abrir turno</h2>
              <p className="text-sm text-ink-muted">Confira o fundo de troco e os produtos preparados.</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition" aria-label="Fechar" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-line bg-surface-soft p-3">
            <p className="text-sm text-ink-secondary">Comece igual ao último turno fechado e ajuste o que mudou.</p>
            <button type="button" onClick={repeatLastShift} disabled={repeatState.loading} className="btn-secondary h-11 px-4 rounded-md text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <History className="w-4 h-4" />
              <span>{repeatState.loading ? 'Buscando...' : 'Repetir último turno'}</span>
            </button>
          </div>
          {repeatState.message && <p className="-mt-3 text-sm text-ink-secondary" role="status">{repeatState.message}</p>}

          {errorMsg && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2.5" role="alert">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 h-5 text-sm font-semibold text-ink mb-1.5" htmlFor="shift-open-name">
                <Calendar className="w-4 h-4 text-ink-muted shrink-0" />
                <span>Nome do turno</span>
              </label>
              <input
                id="shift-open-name"
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                required
                className="w-full h-11 bg-surface border border-line-strong rounded-xl px-3.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-600 transition"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 h-5 text-sm font-semibold text-ink mb-1.5" htmlFor="shift-open-cash">
                <Coins className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Fundo de troco inicial</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono pointer-events-none">
                  R$
                </span>
                <input
                  id="shift-open-cash"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={cashStart}
                  placeholder="0,00"
                  onChange={(e) => setCashStart(e.target.value)}
                  className={`w-full h-11 bg-surface border rounded-xl pl-9 pr-3.5 text-sm font-bold text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand-600 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                    cashStart.trim() !== '' ? 'border-line-strong' : 'border-amber-300 bg-amber-50/40'
                  }`}
                />
              </div>
            </div>
          </div>

          <p className="text-[13px] text-ink-muted">Só espetos, arroz e entradas têm quantidade. Bebidas e os demais itens vendem sem contagem.</p>

          {skewers.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Espetos preparados (unidades)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{skewers.map(unitRow)}</div>
            </div>
          )}

          {rice && (
            <div className="space-y-3.5 rounded-2xl border border-line bg-surface-soft p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-line pb-2.5">
                <div>
                  <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                    <span>Arroz do Dia & Porções Preparadas</span>
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Puxe os arrozes cadastrados e defina qual está pronto para os garçons venderem hoje.
                  </p>
                </div>
              </div>

              {/* Seletor de arrozes cadastrados */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="select-daily-rice" className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
                    Puxar Arroz Cadastrado:
                  </label>
                  <span className="text-[13px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                    {selectedRiceFlavors.length === 1 ? '1 sabor selecionado' : `${selectedRiceFlavors.length} sabores selecionados`}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    id="select-daily-rice"
                    value=""
                    onChange={(e) => handleSelectRiceOption(e.target.value)}
                    className="flex-1 h-10 rounded-lg border border-line-strong bg-white px-3 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-600 cursor-pointer"
                  >
                    <option value="" disabled>-- Selecionar da lista de arrozes cadastrados --</option>
                    {allRegisteredRices.map((r) => (
                      <option key={r} value={r}>
                        {r} {selectedRiceFlavors.includes(r) ? '✓ (Ativo)' : ''}
                      </option>
                    ))}
                    <option value="__NEW__">➕ Digitar outro sabor de arroz...</option>
                  </select>

                  {isAddingCustomRice && (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        autoFocus
                        value={customRiceInput}
                        onChange={(e) => setCustomRiceInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomRice(); } }}
                        placeholder="Ex.: Arroz à Piamontese"
                        className="flex-1 h-10 rounded-lg border border-line-strong bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomRice}
                        disabled={!customRiceInput.trim()}
                        className="btn-primary h-10 px-3 text-xs font-bold shrink-0 disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingCustomRice(false)}
                        className="btn-secondary h-10 px-2 text-xs shrink-0"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {/* Chips rápidos dos arrozes cadastrados mais comuns */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[13px] font-semibold text-ink-muted">Toque para ativar ou desativar do turno:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allRegisteredRices.slice(0, 8).map((option) => {
                      const isSelected = selectedRiceFlavors.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleRiceFlavor(option)}
                          className={`h-7 px-3 rounded-full text-xs font-bold transition flex items-center gap-1.5 border ${
                            isSelected
                              ? 'border-brand-600 bg-brand-600 text-white shadow-xs'
                              : 'border-line-strong bg-white text-ink hover:border-brand-400 hover:bg-surface-muted'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Banner com o arroz do dia que os garçons vão ver */}
                {selectedRiceFlavors.length > 0 && (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/80 p-2.5 flex items-center justify-between text-xs font-semibold text-brand-900 mt-2">
                    <span className="flex items-center gap-1.5">
                      <span>Arroz do dia para os garçons:</span>
                      <strong className="text-brand-800 underline decoration-brand-300">
                        {selectedRiceFlavors.join(' & ')}
                      </strong>
                    </span>
                    <span className="text-[13px] text-brand-700 bg-white/90 border border-brand-200 px-2 py-0.5 rounded-full font-bold">
                      Ativo no turno
                    </span>
                  </div>
                )}
              </div>

              {/* Card de contagem de porções preparadas */}
              <div className="pt-2.5 border-t border-line">
                <div className="w-full">
                  {unitRow(rice)}
                </div>
              </div>
            </div>
          )}

          {combos.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-line bg-surface-soft p-3">
              <h3 className="font-bold text-ink text-sm">Espetos com acompanhamento (calculado sozinho)</h3>
              <p className="text-[13px] text-ink-muted">Usam o espeto + 1 porção de arroz. O que dá para vender é o menor dos dois.</p>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {combos.map((combo) => {
                  const base = baseOf(combo);
                  const baseDisabled = base ? Boolean(disabledProducts[base.id]) : true;
                  const riceDisabled = rice ? Boolean(disabledProducts[rice.id]) : true;
                  const isComboDisabled = baseDisabled || riceDisabled;
                  const parts = [
                    base && !baseDisabled ? qtyOf(base) : null,
                    rice && !riceDisabled ? riceQty : null,
                  ].filter((n): n is number => n !== null);
                  const avail = isComboDisabled ? 0 : parts.length ? Math.min(...parts) : 0;

                  return (
                    <li key={combo.id} className="flex justify-between items-center gap-2 text-sm py-0.5">
                      <span className={`truncate ${isComboDisabled ? 'text-ink-muted line-through' : 'text-ink-secondary'}`}>
                        {combo.name}
                      </span>
                      <span className={`shrink-0 font-mono text-xs font-bold px-2 py-0.5 rounded ${
                        isComboDisabled 
                          ? 'bg-rose-100 text-rose-800' 
                          : avail > 0 
                          ? 'bg-surface text-ink border border-line' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {baseDisabled
                          ? 'sem espeto base'
                          : riceDisabled
                          ? 'sem arroz hoje'
                          : base
                          ? `até ${avail}`
                          : 'sem espeto base'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {starters.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Entradas (unidades)</h3>
              <div className={`grid grid-cols-1 ${starters.length > 1 ? 'sm:grid-cols-2' : ''} gap-3`}>{starters.map(unitRow)}</div>
            </div>
          )}

          {otherSides.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Outros acompanhamentos e porções</h3>
              <div className={`grid grid-cols-1 ${otherSides.length > 1 ? 'sm:grid-cols-2' : ''} gap-3`}>{otherSides.map(unitRow)}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="shift-open-notes">Observações da noite (opcional)</label>
            <textarea id="shift-open-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Ex.: sexta com música ao vivo, previsão de 150 clientes..."
              className="w-full bg-surface border border-line-strong rounded-md px-3.5 py-2 text-base sm:text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600" />
          </div>

          <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 space-y-2 border-t border-line bg-surface px-5 py-3">
            {disabledCount > 0 && (
              <p className="text-sm font-semibold text-rose-800 flex items-center gap-1.5" role="status">
                <Ban className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{disabledCount === 1 ? '1 produto desabilitado hoje' : `${disabledCount} produtos desabilitados hoje`} (não poderão ser pedidos pelos garçons).</span>
              </p>
            )}
            {uncountedSkewers.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs sm:text-sm text-amber-900 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-2 font-bold text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>Atenção: {uncountedSkewers.length} {uncountedSkewers.length === 1 ? 'espeto está' : 'espetos estão'} sem quantidade informada!</span>
                </div>
                <p className="text-xs text-amber-800/90 leading-relaxed">
                  Eles e as suas versões com acompanhamento começarão o turno como <strong>esgotados</strong> para os garçons:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {uncountedSkewers.map((s) => (
                    <span key={s.id} className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100/90 text-amber-950 font-semibold text-xs border border-amber-300">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {missingCount > 0 && uncountedSkewers.length === 0 && (
              <p className="text-sm font-semibold text-amber-800" role="status">
                {missingCount === 1 ? '1 produto sem quantidade' : `${missingCount} produtos sem quantidade`} (ficam fora do turno).
              </p>
            )}
            <button type="submit" className="btn-primary w-full h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar e abrir turno</span>
            </button>
          </div>

        </form>
      </div>
    </Dialog>
  );
};

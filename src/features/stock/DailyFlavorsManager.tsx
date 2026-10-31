import React, { useState } from 'react';
import { ChefHat, Citrus, Plus, X, Check } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useFeedback } from '../../components/ui/FeedbackProvider';

const SUGGESTED_RICE = [
  'Arroz Branco',
  'Arroz de Alho',
  'Arroz Carreteiro',
  'Baião de Dois',
  'Arroz com Brócolis',
  'Arroz à Grega',
  'Arroz Integral',
];

const SUGGESTED_JUICES = [
  'Laranja',
  'Maracujá',
  'Limão',
  'Abacaxi com Hortelã',
  'Acerola',
  'Caju',
  'Manga',
  'Morango',
  'Uva',
  'Goiaba',
  'Tangerina',
];

export const DailyFlavorsManager: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { notify } = useFeedback();

  const [riceInput, setRiceInput] = useState('');
  const [juiceInput, setJuiceInput] = useState('');
  const [savedBadge, setSavedBadge] = useState(false);

  const riceFlavors = settings.daily_rice_flavors || [
    'Arroz Branco',
    'Arroz Carreteiro',
    'Arroz com Brócolis',
    'Baião de Dois',
  ];

  const juiceFlavors = settings.daily_juice_flavors || [
    'Laranja',
    'Maracujá',
    'Limão',
    'Abacaxi com Hortelã',
    'Acerola',
  ];

  const triggerSaveNotice = () => {
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2500);
  };

  const handleAddRice = (flavorToAdd?: string) => {
    const raw = (flavorToAdd ?? riceInput).trim();
    if (!raw) return;
    // Evita duplicidade case-insensitive
    if (riceFlavors.some((f) => f.toLowerCase() === raw.toLowerCase())) {
      notify(`"${raw}" já está na lista de arrozes do dia.`, 'info');
      setRiceInput('');
      return;
    }
    const next = [...riceFlavors, raw];
    updateSettings({ daily_rice_flavors: next });
    setRiceInput('');
    triggerSaveNotice();
    notify(`Sabor de arroz "${raw}" liberado para os garçons!`, 'success');
  };

  const handleRemoveRice = (flavorToRemove: string) => {
    const next = riceFlavors.filter((f) => f !== flavorToRemove);
    updateSettings({ daily_rice_flavors: next });
    triggerSaveNotice();
  };

  const handleAddJuice = (flavorToAdd?: string) => {
    const raw = (flavorToAdd ?? juiceInput).trim();
    if (!raw) return;
    if (juiceFlavors.some((f) => f.toLowerCase() === raw.toLowerCase())) {
      notify(`"${raw}" já está na lista de sucos do dia.`, 'info');
      setJuiceInput('');
      return;
    }
    const next = [...juiceFlavors, raw];
    updateSettings({ daily_juice_flavors: next });
    setJuiceInput('');
    triggerSaveNotice();
    notify(`Sabor de suco "${raw}" liberado para os garçons!`, 'success');
  };

  const handleRemoveJuice = (flavorToRemove: string) => {
    const next = juiceFlavors.filter((f) => f !== flavorToRemove);
    updateSettings({ daily_juice_flavors: next });
    triggerSaveNotice();
  };

  return (
    <div className="surface-card overflow-hidden border border-brand-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ChefHat className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-ink">Sabores do Dia (Mise en Place da Cozinha)</h3>
            <p className="text-xs text-ink-secondary">
              Os sabores ativos aqui aparecem instantaneamente nos celulares dos garçons na hora de anotar pedidos.
            </p>
          </div>
        </div>
        {savedBadge && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Check className="h-3.5 w-3.5" />
            Sincronizado com os garçons
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Bloco 1: Sabores de Arroz */}
        <div className="rounded-xl border border-line bg-surface-soft p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🍚</span>
              <span className="text-sm font-bold text-ink">Sabores de Arroz do Dia</span>
            </div>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {riceFlavors.length} ativos
            </span>
          </div>

          {/* Chips ativos */}
          <div className="flex flex-wrap gap-1.5 min-h-[42px] items-center rounded-lg border border-line bg-white p-2">
            {riceFlavors.length === 0 ? (
              <span className="text-xs italic text-ink-muted">Nenhum sabor cadastrado hoje.</span>
            ) : (
              riceFlavors.map((flavor) => (
                <span
                  key={flavor}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-100 text-brand-900 px-2.5 py-1 text-xs font-bold border border-brand-200"
                >
                  <span>{flavor}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRice(flavor)}
                    aria-label={`Remover ${flavor}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-200 text-brand-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Input para adicionar novo */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddRice();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={riceInput}
              onChange={(e) => setRiceInput(e.target.value)}
              placeholder="Outro arroz (ex: Arroz à Piamontese)..."
              className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!riceInput.trim()}
              className="btn-primary h-9 px-3 text-xs font-semibold shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </button>
          </form>

          {/* Sugestões rápidas de 1 toque */}
          <div className="space-y-1 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Sugestões rápidas:
            </span>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_RICE.filter((s) => !riceFlavors.includes(s)).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleAddRice(suggestion)}
                  className="rounded border border-dashed border-line bg-white px-2 py-0.5 text-xs text-ink-secondary hover:border-brand-400 hover:text-brand-700 active:bg-brand-50"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bloco 2: Sabores de Suco */}
        <div className="rounded-xl border border-line bg-surface-soft p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Citrus className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-bold text-ink">Sabores de Sucos do Dia</span>
            </div>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {juiceFlavors.length} ativos
            </span>
          </div>

          {/* Chips ativos */}
          <div className="flex flex-wrap gap-1.5 min-h-[42px] items-center rounded-lg border border-line bg-white p-2">
            {juiceFlavors.length === 0 ? (
              <span className="text-xs italic text-ink-muted">Nenhum sabor cadastrado hoje.</span>
            ) : (
              juiceFlavors.map((flavor) => (
                <span
                  key={flavor}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 text-amber-900 px-2.5 py-1 text-xs font-bold border border-amber-200"
                >
                  <span>{flavor}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveJuice(flavor)}
                    aria-label={`Remover ${flavor}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-amber-200 text-amber-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Input para adicionar novo */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddJuice();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={juiceInput}
              onChange={(e) => setJuiceInput(e.target.value)}
              placeholder="Outro suco (ex: Clorofila, Morango)..."
              className="flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!juiceInput.trim()}
              className="btn-primary h-9 px-3 text-xs font-semibold shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </button>
          </form>

          {/* Sugestões rápidas de 1 toque */}
          <div className="space-y-1 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Sugestões rápidas:
            </span>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_JUICES.filter((s) => !juiceFlavors.includes(s)).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleAddJuice(suggestion)}
                  className="rounded border border-dashed border-line bg-white px-2 py-0.5 text-xs text-ink-secondary hover:border-amber-400 hover:text-amber-700 active:bg-amber-50"
                >
                  + {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

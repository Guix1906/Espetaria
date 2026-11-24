import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL } from '../../lib/formatters';
import { METHOD_LABELS, OWNER_CONTRIBUTION, OWNER_WITHDRAWAL, QUICK_CATEGORIES, financeEntriesApi, paidMomentFor, todayISO, type FinanceKind } from '../../lib/financeData';
import { useShiftStore } from '../../stores/useShiftStore';

const METHODS = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'BOLETO'];

/** Aceita "1.234,56", "1234,56" ou "1234.56". */
export function parseAmount(value: string): number {
  const raw = value.trim().replace(/[R$\s]/g, '');
  if (!raw) return NaN;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return Number(normalized);
}

/**
 * Lançamento rápido de dinheiro que já entrou ou já saiu (compra no mercado, vale de funcionário,
 * evento recebido, retirada do dono...). Grava como conta já quitada, então aparece na hora
 * em Entradas, Saídas, Resultado e no fluxo de caixa. Em dinheiro, com turno aberto, pode mexer
 * na gaveta: o fechamento do turno passa a esperar esse valor a mais ou a menos.
 */
export function MovementDialog({ initialKind, onClose, onSaved }: { initialKind: FinanceKind; onClose: () => void; onSaved: () => void }) {
  const { notify } = useFeedback();
  const currentShift = useShiftStore((s) => s.currentShift);
  const [kind, setKind] = useState<FinanceKind>(initialKind);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(QUICK_CATEGORIES[initialKind][0]!);
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState('DINHEIRO');
  const [date, setDate] = useState(todayISO());
  const [fromDrawer, setFromDrawer] = useState(true);
  const [busy, setBusy] = useState(false);
  // A janela nativa foca o primeiro botão ao abrir; o cursor vai para o valor logo depois
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const id = window.setTimeout(() => amountRef.current?.focus(), 30); return () => window.clearTimeout(id); }, []);

  const isOut = kind === 'PAGAR';
  const value = parseAmount(amount);
  const valid = Number.isFinite(value) && value > 0;
  const shiftOpen = !!currentShift && currentShift.status === 'ABERTO';
  const canUseDrawer = shiftOpen && method === 'DINHEIRO' && date === todayISO();

  const switchKind = (next: FinanceKind) => {
    if (next === kind) return;
    setKind(next);
    setCategory(QUICK_CATEGORIES[next][0]!);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) { notify('Informe um valor maior que zero.', 'error'); return; }
    if (date > todayISO()) { notify('Data no futuro: lance como conta a pagar ou a receber.', 'error'); return; }
    setBusy(true);
    try {
      const rounded = Math.round(value * 100) / 100;
      await financeEntriesApi.save({
        kind,
        description: description.trim() || category,
        category,
        amount: rounded,
        due_date: date,
        paid_at: paidMomentFor(date),
        payment_method: method,
        supplier: null,
        notes: null,
        shift_id: canUseDrawer && fromDrawer ? currentShift!.id : null,
      });
      const drawer = canUseDrawer && fromDrawer ? (isOut ? ' Saiu da gaveta do caixa.' : ' Entrou na gaveta do caixa.') : '';
      notify(`${isOut ? 'Saída' : 'Entrada'} de ${formatBRL(rounded)} lançada.${drawer}`, 'success');
      onSaved();
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível lançar.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-md border px-3 py-2.5';
  const placeholder = isOut
    ? category === OWNER_WITHDRAWAL ? 'Ex.: Retirada semanal' : 'Ex.: Pão de alho na padaria'
    : category === OWNER_CONTRIBUTION ? 'Ex.: Troco extra para o caixa' : 'Ex.: Sinal do evento de sábado';

  return (
    <Dialog label={isOut ? 'Lançar saída' : 'Lançar entrada'} onClose={onClose} placement="sheet">
      <form onSubmit={submit} className="dialog-panel w-full max-w-lg space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{isOut ? 'Lançar saída' : 'Lançar entrada'}</h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">Dinheiro que já {isOut ? 'saiu' : 'entrou'}. Conta para pagar depois fica em Contas a pagar.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div role="group" aria-label="Tipo" className="grid grid-cols-2 gap-2">
          <button type="button" aria-pressed={!isOut} onClick={() => switchKind('RECEBER')} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-md border text-sm font-semibold ${!isOut ? 'border-emerald-700 bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-700' : 'border-line-strong bg-surface text-ink-secondary'}`}>
            <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />Entrada
          </button>
          <button type="button" aria-pressed={isOut} onClick={() => switchKind('PAGAR')} className={`flex min-h-[48px] items-center justify-center gap-2 rounded-md border text-sm font-semibold ${isOut ? 'border-rose-700 bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-700' : 'border-line-strong bg-surface text-ink-secondary'}`}>
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />Saída
          </button>
        </div>

        <div>
          <label htmlFor="mv-amount" className="text-sm">Valor</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base font-semibold text-ink-muted">R$</span>
            <input id="mv-amount" ref={amountRef} inputMode="decimal" autoComplete="off" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00"
              className="h-14 w-full rounded-md border pl-11 pr-3 font-mono text-2xl font-bold tabular-nums" />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm">{isOut ? 'Com o quê' : 'De onde veio'}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {QUICK_CATEGORIES[kind].map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className="choice min-h-[44px] px-3">{c}</button>
            ))}
          </div>
          {(category === OWNER_WITHDRAWAL || category === OWNER_CONTRIBUTION) && (
            <p className="mt-1.5 text-xs text-ink-muted">Mexe no saldo do caixa, mas não entra como {category === OWNER_WITHDRAWAL ? 'despesa' : 'venda'} no lucro.</p>
          )}
        </fieldset>

        <div>
          <label htmlFor="mv-desc" className="text-sm">Descrição (opcional)</label>
          <input id="mv-desc" className={input} maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={placeholder} />
        </div>

        <fieldset>
          <legend className="text-sm">Forma</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className="choice min-h-[44px] px-2">{METHOD_LABELS[m] ?? m}</button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="mv-date" className="text-sm">Data</label>
          <input id="mv-date" type="date" className={input} required max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {canUseDrawer && (
          <label className="flex items-start gap-2.5 rounded-md bg-surface-muted p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={fromDrawer} onChange={(e) => setFromDrawer(e.target.checked)} />
            <span>
              <span className="font-medium text-ink">{isOut ? 'Saiu da gaveta do caixa' : 'Entrou na gaveta do caixa'}</span>
              <span className="block text-[13px] text-ink-muted">No fechamento deste turno, o dinheiro esperado na gaveta fica {valid ? formatBRL(value) : 'esse valor'} {isOut ? 'menor' : 'maior'}.</span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary min-h-[44px]" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary min-h-[44px]" disabled={busy || !valid}>
            {busy ? 'Lançando...' : `Lançar ${isOut ? 'saída' : 'entrada'}${valid ? ` de ${formatBRL(value)}` : ''}`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

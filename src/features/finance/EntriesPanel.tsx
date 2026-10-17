import { useMemo, useState, type FormEvent } from 'react';
import { Check, Download, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { FilterChip } from '../../components/ui/FilterChip';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { Chart, CHART_COLORS, baseOptions } from '../../components/charts/Chart';
import { formatBRL } from '../../lib/formatters';
import { FINANCE_CATEGORIES, METHOD_LABELS, downloadCsv, financeEntriesApi, todayISO, type FinanceDataset, type FinanceEntry, type FinanceKind } from '../../lib/financeData';
import { Empty } from './FinanceView';
import { useConfirm } from '../../components/ui/ConfirmDialog';

type Filter = 'OPEN' | 'OVERDUE' | 'PAID' | 'ALL';
const METHODS = ['PIX', 'DINHEIRO', 'DEBITO', 'CREDITO', 'BOLETO', 'TRANSFERENCIA', 'OUTROS'];
const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

export function EntriesPanel({ kind, data, onChanged }: { kind: FinanceKind; data: FinanceDataset; onChanged: () => void }) {
  const { notify, requestText } = useFeedback();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [editing, setEditing] = useState<FinanceEntry | 'new' | null>(null);
  const today = todayISO();
  const isPay = kind === 'PAGAR';
  const entries = data.entries.filter((e) => e.kind === kind);
  const shown = entries
    .filter((e) => filter === 'ALL' || (filter === 'PAID' ? !!e.paid_at : filter === 'OVERDUE' ? !e.paid_at && e.due_date < today : !e.paid_at))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const open = entries.filter((e) => !e.paid_at);
  const overdue = open.filter((e) => e.due_date < today);
  const settled = entries.filter((e) => e.paid_at);

  // Gráfico por mês de vencimento: escuro = quitado, claro = em aberto (previsto)
  const months = useMemo(() => {
    const map = new Map<string, { label: string; done: number; forecast: number }>();
    [...entries].sort((a, b) => a.due_date.localeCompare(b.due_date)).forEach((e) => {
      const key = e.due_date.slice(0, 7);
      const label = new Date(`${key}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const row = map.get(key) ?? { label, done: 0, forecast: 0 };
      if (e.paid_at) row.done += e.amount; else row.forecast += e.amount;
      map.set(key, row);
    });
    return [...map.values()];
  }, [entries]);

  const run = async (action: () => Promise<void>, ok: string) => {
    try { await action(); notify(ok, 'success'); onChanged(); } catch (error: unknown) { notify(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error'); }
  };
  const settle = async (entry: FinanceEntry) => {
    const method = await requestText({ title: isPay ? 'Registrar pagamento' : 'Registrar recebimento', message: `${entry.description} · ${formatBRL(entry.amount)}`, label: 'Forma (PIX, Dinheiro, Boleto...)', initialValue: 'PIX', multiline: false, confirmText: isPay ? 'Marcar como paga' : 'Marcar como recebida' });
    if (method === null) return;
    const code = METHODS.find((m) => (METHOD_LABELS[m] ?? m).toLowerCase() === method.trim().toLowerCase()) ?? method.trim().toUpperCase();
    await run(() => financeEntriesApi.setPaid(entry.id, true, code), isPay ? 'Conta marcada como paga.' : 'Conta marcada como recebida.');
  };
  const remove = async (entry: FinanceEntry) => {
    const confirmed = await confirm({ title: 'Excluir lançamento', message: `Excluir "${entry.description}" (${formatBRL(entry.amount)})?`, confirmText: 'Excluir', variant: 'danger' });
    if (!confirmed) return;
    await run(() => financeEntriesApi.remove(entry.id), 'Lançamento excluído.');
  };
  const exportCsv = () => downloadCsv(`contas-a-${isPay ? 'pagar' : 'receber'}_${data.from}_${data.to}.csv`, ['Vencimento', 'Descrição', 'Categoria', isPay ? 'Fornecedor' : 'Cliente', 'Valor', 'Situação', 'Quitado em', 'Forma'], shown.map((e) => [fmtDate(e.due_date), e.description, e.category, e.supplier ?? '', e.amount, e.paid_at ? (isPay ? 'Paga' : 'Recebida') : e.due_date < today ? 'Vencida' : 'Em aberto', e.paid_at ? fmtDate(e.paid_at) : '', e.payment_method ? METHOD_LABELS[e.payment_method] ?? e.payment_method : '']));

  return (
    <div className="space-y-6">
      <div className="stat-grid stat-grid--three">
        <Kpi label={isPay ? 'A pagar' : 'A receber'} value={open.reduce((s, e) => s + e.amount, 0)} hint={`${open.length} em aberto`} />
        <Kpi label="Vencidas" value={overdue.reduce((s, e) => s + e.amount, 0)} hint={`${overdue.length} ${overdue.length === 1 ? 'conta' : 'contas'}`} danger={overdue.length > 0} />
        <Kpi label={isPay ? 'Pago no período' : 'Recebido no período'} value={settled.reduce((s, e) => s + e.amount, 0)} hint={`${settled.length} quitadas`} />
      </div>

      <section className="surface-card p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold">{isPay ? 'Saídas' : 'Entradas'} por mês</h2>
        <p className="mb-2 text-xs text-ink-muted">Barra escura: {isPay ? 'pago' : 'recebido'}. Barra clara: previsto (em aberto).</p>
        {months.length ? <Chart type="bar" height={260} series={[{ name: isPay ? 'Pago' : 'Recebido', data: months.map((m) => +m.done.toFixed(2)) }, { name: 'Previsto', data: months.map((m) => +m.forecast.toFixed(2)) }]} options={baseOptions({ colors: isPay ? [CHART_COLORS.outflow, CHART_COLORS.outflowForecast] : [CHART_COLORS.inflow, CHART_COLORS.inflowForecast], chart: { type: 'bar', stacked: true }, plotOptions: { bar: { columnWidth: '45%', borderRadius: 2 } }, xaxis: { categories: months.map((m) => m.label) } })} /> : <Empty text="Nenhum lançamento no período." />}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="filter-bar" aria-label="Situação">
            <FilterChip active={filter === 'OPEN'} onClick={() => setFilter('OPEN')} count={open.length}>Em aberto</FilterChip>
            <FilterChip active={filter === 'OVERDUE'} onClick={() => setFilter('OVERDUE')} count={overdue.length}>Vencidas</FilterChip>
            <FilterChip active={filter === 'PAID'} onClick={() => setFilter('PAID')} count={settled.length}>{isPay ? 'Pagas' : 'Recebidas'}</FilterChip>
            <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} count={entries.length}>Todas</FilterChip>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" />Exportar</button>
            <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" />{isPay ? 'Nova conta a pagar' : 'Nova conta a receber'}</button>
          </div>
        </div>

        {shown.length === 0 ? <div className="surface-card"><Empty text={filter === 'OPEN' ? 'Nenhuma conta em aberto no período.' : 'Nada por aqui.'} /></div> : (
          <ul className="surface-card divide-y divide-line">
            {shown.map((e) => {
              const late = !e.paid_at && e.due_date < today;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{e.description}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                      <span>{e.category}</span>
                      {e.supplier && <span>· {e.supplier}</span>}
                      <span className={late ? 'font-medium text-rose-700' : ''}>· vence {fmtDate(e.due_date)}{late ? ' (vencida)' : ''}</span>
                      {e.paid_at && <span className="text-emerald-800">· {isPay ? 'paga' : 'recebida'} em {fmtDate(e.paid_at)}{e.payment_method ? ` (${METHOD_LABELS[e.payment_method] ?? e.payment_method})` : ''}</span>}
                    </p>
                  </div>
                  <span className={`text-base font-semibold tabular-nums ${isPay ? 'text-rose-800' : 'text-emerald-800'}`}>{formatBRL(e.amount)}</span>
                  <div className="flex shrink-0 gap-1.5">
                    {e.paid_at
                      ? <button type="button" className="btn-secondary h-10 px-3" onClick={() => void run(() => financeEntriesApi.setPaid(e.id, false), 'Baixa desfeita.')} aria-label="Desfazer baixa"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                      : <button type="button" className="btn-success h-10 px-3" onClick={() => void settle(e)}><Check className="h-4 w-4" aria-hidden="true" />{isPay ? 'Pagar' : 'Receber'}</button>}
                    <button type="button" className="icon-button h-10 w-10" onClick={() => setEditing(e)} aria-label={`Editar ${e.description}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="icon-button h-10 w-10 text-rose-700" onClick={() => void remove(e)} aria-label={`Excluir ${e.description}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing && <EntryForm kind={kind} entry={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function Kpi({ label, value, hint, danger = false }: { label: string; value: number; hint: string; danger?: boolean }) {
  return (
    <div className="stat-card">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      <div><div className={`stat-value ${danger ? 'text-rose-700' : ''}`}>{formatBRL(value)}</div><div className="mt-1 text-xs text-ink-muted">{hint}</div></div>
    </div>
  );
}

export function EntryForm({ kind, entry, onClose, onSaved }: { kind: FinanceKind; entry: FinanceEntry | null; onClose: () => void; onSaved: () => void }) {
  const { notify } = useFeedback();
  const isPay = kind === 'PAGAR';
  const [description, setDescription] = useState(entry?.description ?? '');
  const [category, setCategory] = useState(entry?.category ?? FINANCE_CATEGORIES[kind][0]!);
  const [amount, setAmount] = useState(entry ? String(entry.amount).replace('.', ',') : '');
  const [dueDate, setDueDate] = useState(entry?.due_date ?? todayISO());
  const [supplier, setSupplier] = useState(entry?.supplier ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [alreadyPaid, setAlreadyPaid] = useState(!!entry?.paid_at);
  const [method, setMethod] = useState(entry?.payment_method ?? 'PIX');
  const [repeat, setRepeat] = useState(1);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount.replace(/\./g, '').replace(',', '.'));
    if (!description.trim()) { notify('Informe a descrição.', 'error'); return; }
    if (!Number.isFinite(value) || value <= 0) { notify('Informe um valor maior que zero.', 'error'); return; }
    setBusy(true);
    try {
      // Repetir: cria a mesma conta nos meses seguintes (aluguel, salário, internet...)
      const times = entry ? 1 : Math.min(Math.max(repeat, 1), 24);
      for (let i = 0; i < times; i++) {
        const due = new Date(`${dueDate}T12:00:00`);
        due.setMonth(due.getMonth() + i);
        await financeEntriesApi.save({
          kind, description: description.trim() + (times > 1 ? ` (${i + 1}/${times})` : ''), category, amount: Math.round(value * 100) / 100,
          due_date: due.toLocaleDateString('sv-SE'),
          paid_at: alreadyPaid && i === 0 ? (entry?.paid_at ?? new Date().toISOString()) : null,
          payment_method: alreadyPaid && i === 0 ? method : null,
          supplier: supplier.trim() || null, notes: notes.trim() || null,
        }, entry?.id);
      }
      notify(entry ? 'Lançamento atualizado.' : times > 1 ? `${times} lançamentos criados.` : 'Lançamento criado.', 'success');
      onSaved();
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível salvar.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 w-full rounded-xl border px-3 py-2.5';
  return (
    <Dialog label={entry ? 'Editar lançamento' : isPay ? 'Nova conta a pagar' : 'Nova conta a receber'} onClose={onClose} placement="sheet">
      <form onSubmit={submit} className="dialog-panel w-full max-w-lg space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold">{entry ? 'Editar lançamento' : isPay ? 'Nova conta a pagar' : 'Nova conta a receber'}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div><label htmlFor="fe-desc" className="text-sm">Descrição</label><input id="fe-desc" className={input} required maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isPay ? 'Ex.: Picanha — Frigorífico Boi Bom' : 'Ex.: Evento aniversário sábado'} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="fe-amount" className="text-sm">Valor (R$)</label><input id="fe-amount" className={`${input} tabular-nums`} inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
          <div><label htmlFor="fe-due" className="text-sm">Vencimento</label><input id="fe-due" type="date" className={input} required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div><label htmlFor="fe-cat" className="text-sm">Categoria</label><select id="fe-cat" className={input} value={category} onChange={(e) => setCategory(e.target.value)}>{FINANCE_CATEGORIES[kind].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label htmlFor="fe-sup" className="text-sm">{isPay ? 'Fornecedor' : 'Cliente'} (opcional)</label><input id="fe-sup" className={input} maxLength={80} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        </div>
        <div><label htmlFor="fe-notes" className="text-sm">Observação (opcional)</label><input id="fe-notes" className={input} maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-5 w-5" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} />{isPay ? 'Já está paga' : 'Já foi recebida'}</label>
        {alreadyPaid && <div><label htmlFor="fe-method" className="text-sm">Forma</label><select id="fe-method" className={input} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>)}</select></div>}
        {!entry && <div><label htmlFor="fe-repeat" className="text-sm">Repetir todo mês</label><select id="fe-repeat" className={input} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}><option value={1}>Não repetir</option>{[2, 3, 6, 12, 24].map((n) => <option key={n} value={n}>{n} meses</option>)}</select></div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </form>
    </Dialog>
  );
}

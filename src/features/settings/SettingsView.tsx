import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  CupSoda,
  FileText,
  Flame,
  MapPin,
  Receipt,
  MessageCircle,
  Printer,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Store,
  Trash2,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { FilterChip } from '../../components/ui/FilterChip';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { usePrintStore } from '../../stores/usePrintStore';
import type { PixKeyType, ProductionSector } from '../../types/enums';
import { generatePixPayload } from '../../lib/pix';
import { PixQrCode } from '../pix/PixQrCode';
import { PixAutoCard } from './PixAutoCard';
import { WhatsAppAutoCard } from './WhatsAppAutoCard';
import { WhatsAppBotCard } from './WhatsAppBotCard';
import { formatBRL } from '../../lib/formatters';
import { maskCnpj, maskPhone, pixKeyError, toPixText } from '../../lib/inputMasks';
import { PrintBridgeStatus, DigitalMenuLinkCard, PrinterHealthTag } from './PrintBridgeStatus';

import { PrintTemplatesEditor } from './PrintTemplatesEditor';
import { TableManagementView } from './TableManagementView';
import { DeliveryZonesView } from './DeliveryZonesView';

type SettingsTab = 'pix' | 'printers' | 'templates' | 'queue' | 'store' | 'tables' | 'zones' | 'whatsapp';
type SettingsGroup = 'loja' | 'pagamentos' | 'delivery' | 'impressao';

/** Abas agrupadas por assunto: o grupo aparece em cima, as abas dele logo abaixo. */
const GROUPS: { id: SettingsGroup; label: string; icon: typeof Store; tabs: { id: SettingsTab; label: string; icon: typeof Store }[] }[] = [
  { id: 'loja', label: 'Loja', icon: Store, tabs: [{ id: 'store', label: 'Dados da loja', icon: Store }, { id: 'tables', label: 'Mesas', icon: Building2 }] },
  { id: 'pagamentos', label: 'Pagamentos', icon: QrCode, tabs: [{ id: 'pix', label: 'PIX', icon: QrCode }] },
  { id: 'delivery', label: 'Delivery', icon: MapPin, tabs: [{ id: 'zones', label: 'Bairros e taxas', icon: MapPin }, { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }] },
  { id: 'impressao', label: 'Impressão', icon: Printer, tabs: [{ id: 'printers', label: 'Impressoras', icon: Printer }, { id: 'templates', label: 'Modelos de cupom', icon: FileText }, { id: 'queue', label: 'Fila de impressão', icon: Zap }] },
];
const ALL_TABS = GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
const TAB_STORAGE_KEY = 'ponto.settings.tab';

function readSavedTab(): SettingsTab {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY) as SettingsTab | null;
    return saved && ALL_TABS.includes(saved) ? saved : 'store';
  } catch {
    return 'store';
  }
}

/** Setores de impressão, na mesma regra do printer-bridge (bar e caixa sem impressora própria saem na churrasqueira). */
const PRINTER_SECTORS: { sector: ProductionSector; title: string; description: string; icon: typeof Store; tone: string }[] = [
  { sector: 'GRILL', title: 'Churrasqueira', description: 'Espetos com o ponto da carne em destaque, a via do motoboy quando o delivery tem espeto e a conta da mesa.', icon: Flame, tone: 'bg-amber-100 text-amber-800' },
  { sector: 'KITCHEN', title: 'Cozinha', description: 'Porções e acompanhamentos, a cópia do espeto com acompanhamento e a via do motoboy quando não há espeto.', icon: UtensilsCrossed, tone: 'bg-emerald-100 text-emerald-800' },
  { sector: 'BAR', title: 'Bar', description: 'Bebidas. Sem impressora própria no bar, o cupom sai na churrasqueira.', icon: CupSoda, tone: 'bg-sky-100 text-sky-800' },
  { sector: 'NONE', title: 'Caixa', description: 'Itens sem setor de produção. Sem impressora própria no caixa, o cupom sai na churrasqueira.', icon: Receipt, tone: 'bg-surface-muted text-ink-secondary' },
];

const FIELD ='h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base sm:text-sm';
const LABEL = 'mb-1 block text-sm font-semibold text-ink-secondary';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, updatePixConfig } = useSettingsStore();
  const {
    jobs,
    processJob,
    reprintJob,
    deleteJobs,
    formatTicketText,
    sendTestPrint,
  } = usePrintStore();
  const { requestChoice, notify } = useFeedback();

  // Excluir cupons: pergunta antes; cupom aguardando excluído não é mais impresso
  const confirmDelete = async (ids: string[], what: string) => {
    if (!ids.length) { notify('Nenhum cupom para excluir.', 'info'); return; }
    const hasPending = jobs.some((j) => ids.includes(j.id) && j.status !== 'PRINTED');
    const answer = await requestChoice({
      title: `Excluir ${what}?`,
      message: hasPending ? 'Cupom que ainda não saiu na impressora deixa de ser impresso. O pedido continua normal no sistema.' : 'Some da lista de cupons. O pedido continua normal no sistema.',
      choices: [{ value: 'yes', label: 'Excluir' }, { value: 'no', label: 'Cancelar' }],
    });
    if (answer !== 'yes') return;
    if (await deleteJobs(ids)) { setSelectedJobId(null); notify(ids.length === 1 ? 'Cupom excluído.' : `${ids.length} cupons excluídos.`, 'success'); }
    else notify('Não foi possível excluir. Tente de novo.', 'error');
  };

  const [activeTab, setActiveTabState] = useState<SettingsTab>(readSavedTab);
  const [copied, setCopied] = useState(false);
  const [saveFeedback, setSaveFeedbackState] = useState<{ scope: 'pix' | 'store' | 'printers'; message: string } | null>(null);
  const setSaveFeedback = (scope: 'pix' | 'store' | 'printers', message: string | null, ms = 4000) => {
    setSaveFeedbackState(message ? { scope, message } : null);
    if (message) setTimeout(() => setSaveFeedbackState((cur) => (cur?.message === message ? null : cur)), ms);
  };
  const feedbackFor = (scope: 'pix' | 'store' | 'printers') => saveFeedback?.scope === scope && (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{saveFeedback.message}</p>
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Estados locais do PIX
  const [pixKey, setPixKey] = useState(settings.pix_key);
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(settings.pix_key_type);
  const [pixMerchantName, setPixMerchantName] = useState(settings.pix_merchant_name);
  const [pixMerchantCity, setPixMerchantCity] = useState(settings.pix_merchant_city);

  // Estados locais da Loja
  const [storeName, setStoreName] = useState(settings.name);
  const [cnpj, setCnpj] = useState(settings.cnpj ? maskCnpj(settings.cnpj) : '');
  const [phone, setPhone] = useState(settings.phone ? maskPhone(settings.phone) : '');
  const [address, setAddress] = useState(settings.address);
  const [serviceFee, setServiceFee] = useState(settings.service_fee_percent);
  const [deliveryEta, setDeliveryEta] = useState(settings.delivery_eta ?? '40–55 min');
  const [pickupEta, setPickupEta] = useState(settings.pickup_eta ?? '30–40 min');

  // Alterações digitadas e ainda não salvas
  const pixDirty = pixKey !== settings.pix_key || pixKeyType !== settings.pix_key_type
    || pixMerchantName !== settings.pix_merchant_name || pixMerchantCity !== settings.pix_merchant_city;
  const storeDirty = storeName !== settings.name || cnpj !== (settings.cnpj ? maskCnpj(settings.cnpj) : '')
    || phone !== (settings.phone ? maskPhone(settings.phone) : '') || address !== settings.address
    || Number(serviceFee) !== settings.service_fee_percent
    || deliveryEta !== (settings.delivery_eta ?? '40–55 min') || pickupEta !== (settings.pickup_eta ?? '30–40 min');
  const dirtyHere = (activeTab === 'pix' && pixDirty) || (activeTab === 'store' && storeDirty);
  const pixError = pixKey ? pixKeyError(pixKeyType, pixKey) : null;

  // Fechar ou recarregar a página com algo digitado pede confirmação do navegador
  useEffect(() => {
    if (!pixDirty && !storeDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pixDirty, storeDirty]);

  const discardChanges = () => {
    setPixKey(settings.pix_key); setPixKeyType(settings.pix_key_type);
    setPixMerchantName(settings.pix_merchant_name); setPixMerchantCity(settings.pix_merchant_city);
    setStoreName(settings.name); setCnpj(settings.cnpj ? maskCnpj(settings.cnpj) : ''); setPhone(settings.phone ? maskPhone(settings.phone) : '');
    setAddress(settings.address); setServiceFee(settings.service_fee_percent);
    setDeliveryEta(settings.delivery_eta ?? '40–55 min'); setPickupEta(settings.pickup_eta ?? '30–40 min');
  };

  const setActiveTab = async (tab: SettingsTab) => {
    if (tab === activeTab) return;
    if (dirtyHere) {
      const answer = await requestChoice({
        title: 'Sair sem salvar?',
        message: 'Você mudou dados nesta aba e ainda não clicou em Salvar.',
        choices: [{ value: 'stay', label: 'Continuar editando' }, { value: 'leave', label: 'Sair sem salvar' }],
      });
      if (answer !== 'leave') return;
      discardChanges();
    }
    setActiveTabState(tab);
    try { localStorage.setItem(TAB_STORAGE_KEY, tab); } catch { /* sem armazenamento: só não lembra a aba */ }
  };
  const activeGroup = GROUPS.find((g) => g.tabs.some((t) => t.id === activeTab)) ?? GROUPS[0]!;

  // Preview de PIX
  const previewAmount = 45.0;
  const samplePayload = generatePixPayload({
    pixKey,
    merchantName: pixMerchantName || 'ESPETARIA SABOR DA CARNE',
    merchantCity: pixMerchantCity || 'SAO PAULO',
    amount: previewAmount,
    txId: 'TESTE001',
    description: 'Demonstracao Pix Sabor da Carne',
  });

  const handleSavePix = (e: React.FormEvent) => {
    e.preventDefault();
    if (pixKeyError(pixKeyType, pixKey)) return;
    updatePixConfig({
      pix_key: pixKey.trim(),
      pix_key_type: pixKeyType,
      pix_merchant_name: pixMerchantName,
      pix_merchant_city: pixMerchantCity,
    });
    setPixKey(pixKey.trim());
    setSaveFeedback('pix', 'PIX salvo. O novo QR Code já vale no salão e no delivery.');
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      name: storeName,
      cnpj,
      phone,
      address,
      service_fee_percent: Number(serviceFee),
      delivery_eta: deliveryEta.trim() || '40–55 min',
      pickup_eta: pickupEta.trim() || '30–40 min',
    });
    setSaveFeedback('store', 'Dados da loja salvos.');
  };

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(samplePayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handlePrintTest = async (sector: ProductionSector, title: string) => {
    try {
      await sendTestPrint(sector);
      setSaveFeedback('printers', `Cupom de teste enviado: ${title}. Confira a impressora e a aba Fila de impressão.`, 5000);
    } catch {
      notify('Não foi possível enviar o teste. Tente de novo.', 'error');
    }
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  const pendingCount = jobs.filter((j) => j.status === 'PENDING').length;
  const printedCount = jobs.filter((j) => j.status === 'PRINTED').length;

  return (
    <div className="page-layout pb-24">
      <PageHeader
        eyebrow="Painel administrativo"
        title="Configurações"
        description="Loja, pagamentos, delivery e impressão."
        icon={SettingsIcon}
      />

      {/* Grupos (4 botões que cabem no celular) e, abaixo, as abas do grupo */}
      <div className="space-y-2 border-b border-line pb-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Assuntos das configurações">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            const active = group.id === activeGroup.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => void setActiveTab(group.tabs[0]!.id)}
                className={`flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors ${active ? 'bg-brand-700 text-white' : 'bg-surface-soft text-ink-secondary hover:bg-surface-muted'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {group.label}
                {group.id === 'impressao' && pendingCount > 0 && <span className={`font-mono text-xs ${active ? 'text-white' : 'text-amber-800'}`}>{pendingCount}</span>}
              </button>
            );
          })}
        </div>
        {activeGroup.tabs.length > 1 && (
          <div className="filter-bar" aria-label={`Abas de ${activeGroup.label}`}>
            {activeGroup.tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <FilterChip key={tab.id} active={activeTab === tab.id} onClick={() => void setActiveTab(tab.id)} count={tab.id === 'queue' ? pendingCount : undefined}>
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </FilterChip>
              );
            })}
          </div>
        )}
      </div>

      {activeTab === 'whatsapp' && <div className="space-y-6"><WhatsAppAutoCard /><WhatsAppBotCard /></div>}
      {activeTab === 'templates' && <PrintTemplatesEditor />}
      {activeTab === 'tables' && <TableManagementView />}
      {activeTab === 'zones' && <DeliveryZonesView />}

      {/* ABA 1: CONTA PIX & PAGAMENTO */}
      {activeTab === 'pix' && <PixAutoCard />}
      {activeTab === 'pix' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <form onSubmit={handleSavePix} className="surface-card p-4 sm:p-5 space-y-4 lg:col-span-7">
            <div className="border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink">Chave PIX da loja</h3>
              <p className="text-xs text-ink-muted">
                Os dados inseridos aqui serão utilizados para gerar o QR Code dinâmico e o código Copia e Cola na hora que o cliente pedir a conta na mesa ou fizer checkout no delivery.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pix-key-type" className={LABEL}>Tipo da chave</label>
                <select
                  id="pix-key-type"
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className={FIELD}
                >
                  <option value="EMAIL">E-mail</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                  <option value="TELEFONE">Telefone celular</option>
                  <option value="ALEATORIA">Chave aleatória (EVP)</option>
                </select>
              </div>

              <div>
                <label htmlFor="pix-key" className={LABEL}>Chave PIX</label>
                <input
                  id="pix-key"
                  type="text"
                  required
                  value={pixKey}
                  onChange={(e) => setPixKey(pixKeyType === 'CNPJ' ? maskCnpj(e.target.value) : e.target.value)}
                  placeholder={{ EMAIL: 'contato@sualoja.com.br', CNPJ: '00.000.000/0000-00', CPF: '000.000.000-00', TELEFONE: '+55 11 98765-4321', ALEATORIA: '123e4567-e89b-12d3-a456-426614174000' }[pixKeyType]}
                  aria-invalid={Boolean(pixError)}
                  className={`${FIELD} font-mono ${pixError ? 'border-rose-500' : ''}`}
                />
                {pixError && <span className="mt-1 block text-xs font-medium text-rose-700" role="alert">{pixError}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pix-name" className={LABEL}>Nome do favorecido</label>
                <input
                  id="pix-name"
                  type="text"
                  required
                  maxLength={25}
                  value={pixMerchantName}
                  onChange={(e) => setPixMerchantName(toPixText(e.target.value))}
                  placeholder="ESPETARIA SABOR DA CARNE"
                  className={`${FIELD} uppercase`}
                />
                <span className="text-xs text-ink-muted">Até 25 letras. Acentos são tirados sozinhos.</span>
              </div>

              <div>
                <label htmlFor="pix-city" className={LABEL}>Cidade</label>
                <input
                  id="pix-city"
                  type="text"
                  required
                  maxLength={15}
                  value={pixMerchantCity}
                  onChange={(e) => setPixMerchantCity(toPixText(e.target.value))}
                  placeholder="SAO PAULO"
                  className={`${FIELD} uppercase`}
                />
                <span className="text-xs text-ink-muted">Até 15 letras. Acentos são tirados sozinhos.</span>
              </div>
            </div>

            <div className="pt-2">
              {pixDirty && <p className="mb-2 text-sm font-medium text-amber-800" role="status">Alterações ainda não salvas.</p>}
              <button type="submit" className="btn-primary w-full py-2.5" disabled={Boolean(pixError)}>
                <CheckCircle2 className="h-4 w-4" />
                Salvar PIX
              </button>
              <div className="mt-2">{feedbackFor('pix')}</div>
            </div>
          </form>

          {/* Simulador ao vivo do QR Code */}
          <div className="surface-card p-4 sm:p-5 space-y-4 lg:col-span-5">
            <div className="border-b border-line pb-3">
              
              <h4 className="text-sm font-bold text-ink">Prévia do QR Code</h4>
              <p className="text-xs text-ink-muted">Simulação calculada com valor de teste de {formatBRL(previewAmount)}.</p>
            </div>

            <div className="mx-auto flex w-fit flex-col items-center rounded-2xl border border-line bg-white p-4 shadow-sm">
              <PixQrCode payload={samplePayload} size={176} />
              <span className="mt-2 text-[11px] font-medium text-ink-muted">Leitura com app do banco</span>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-secondary">Código PIX Copia e Cola:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={samplePayload}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface-muted px-3 py-2 text-xs font-mono text-ink-muted"
                />
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="btn-secondary shrink-0 px-3 py-2 text-xs"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: IMPRESSORAS & SETORIZAÇÃO */}
      {activeTab === 'printers' && (
        <div className="space-y-6">
          <PrintBridgeStatus jobs={jobs} />
          <DigitalMenuLinkCard />

          <div className="surface-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Imprimir pedidos automaticamente</h3>
                <p className="text-xs text-ink-muted">
                  Assim que o garçom confirmar os itens ou um pedido de delivery chegar, as comandas saem impressas imediatamente no setor correspondente.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-900">
                <input
                  type="checkbox"
                  checked={settings.auto_print_orders}
                  onChange={(e) => updateSettings({ auto_print_orders: e.target.checked })}
                  className="h-5 w-5 rounded border-line text-brand-700 focus:ring-brand-500"
                />
                <span>Auto-imprimir pedidos ao chegar</span>
              </label>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-xs font-semibold text-ink-secondary">Largura do papel</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateSettings({ print_paper_width: '80mm' })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${settings.print_paper_width === '80mm' ? 'bg-brand-700 text-white' : 'bg-surface-soft text-ink-secondary'}`}
                >
                  80 mm (bobina padrão)
                </button>
                <button
                  type="button"
                  onClick={() => updateSettings({ print_paper_width: '58mm' })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${settings.print_paper_width === '58mm' ? 'bg-brand-700 text-white' : 'bg-surface-soft text-ink-secondary'}`}
                >
                  58 mm (bobina estreita)
                </button>
              </div>
            </div>
          </div>

          {feedbackFor('printers')}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PRINTER_SECTORS.map(({ sector, title, description, icon: Icon, tone }) => (
              <div key={sector} className="surface-card p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className={`icon-tile ${tone}`}><Icon className="h-5 w-5" /></span>
                    <h4 className="font-bold text-ink">{title}</h4>
                  </div>
                  <PrinterHealthTag jobs={jobs} sector={sector} />
                </div>
                <p className="text-sm text-ink-secondary">{description}</p>
                <button type="button" onClick={() => handlePrintTest(sector, title)} className="btn-secondary min-h-[44px] w-full text-sm">
                  <Printer className="h-4 w-4" aria-hidden="true" />
                  Imprimir teste
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ABA 3: FILA TÉRMICA & TOLERÂNCIA A FALHAS / QUEDA DE ENERGIA */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="notice border-emerald-200 bg-emerald-50 text-emerald-950">
            <ShieldCheck className="h-6 w-6 shrink-0 text-emerald-700" />
            <div className="text-xs leading-relaxed">
              <p className="font-bold">Proteção contra cupom duplicado ativa</p>
              <p className="mt-0.5 text-emerald-800">
                Cada pedido gera um único cupom por setor. Se a energia cair durante uma impressão, o cupom volta marcado como 2ª via, para a churrasqueira e a cozinha não prepararem o mesmo item duas vezes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`status-badge ${pendingCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-surface-muted text-ink-secondary'}`}>Pendentes: <span className="font-mono">{pendingCount}</span></span>
              <span className="status-badge bg-surface-muted text-ink">Impressos: <span className="font-mono">{printedCount}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void confirmDelete(jobs.filter((j) => j.status === 'PRINTED').map((j) => j.id), 'todos os cupons impressos')} className="btn-secondary text-xs">
                <Trash2 className="h-4 w-4" aria-hidden="true" />Excluir impressos
              </button>
              <button type="button" onClick={() => void confirmDelete(jobs.map((j) => j.id), `todos os ${jobs.length} cupons da lista`)} className="btn-secondary text-xs text-rose-700 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" aria-hidden="true" />Excluir todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Lista da Fila */}
            <div className="surface-card p-4 sm:p-5 space-y-3 lg:col-span-7">
              <h4 className="text-sm font-bold text-ink">Cupons recentes</h4>
              {jobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-muted">
                  Nenhuma comanda na fila no momento.
                </div>
              ) : (
                <div className="divide-y divide-line overflow-y-auto max-h-[500px]">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                      className={`cursor-pointer p-3 transition-colors ${selectedJob?.id === job.id ? 'bg-surface-muted border-l-4 border-brand-700' : 'hover:bg-surface-soft'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-sm px-2 py-0.5 text-[11px] font-medium ${
                            job.sector === 'GRILL' ? 'bg-amber-100 text-amber-900' :
                            job.sector === 'KITCHEN' ? 'bg-emerald-100 text-emerald-900' :
                            'bg-sky-100 text-sky-900'
                          }`}>
                            {job.sector === 'GRILL' ? 'Churrasqueira' : job.sector === 'KITCHEN' ? 'Cozinha' : 'Bar/Caixa'}
                          </span>
                          <span className="font-mono text-xs font-semibold text-ink">#{job.order_number}</span>
                          {job.is_reprint && (
                            <span className="status-badge bg-rose-600 text-white">2ª via</span>
                          )}
                        </div>
                        <span className={`text-[11px] font-bold ${
                          job.status === 'PRINTED' ? 'text-emerald-700' :
                          job.status === 'PRINTING' ? 'text-amber-700' :
                          'text-ink-muted'
                        }`}>
                          {job.status === 'PRINTED' ? 'Impressa' : job.status === 'PRINTING' ? 'Imprimindo...' : 'Aguardando'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-ink-muted">
                        <span>{job.origin === 'DELIVERY' ? `Delivery (${job.customer_name})` : `Mesa ${job.table_number}`}</span>
                        <span className="text-[11px]">{new Date(job.created_at).toLocaleTimeString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visualizador do Cupom ESC/POS */}
            <div className="surface-card p-4 sm:p-5 space-y-4 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h4 className="text-sm font-bold text-ink">Prévia do cupom</h4>
                {selectedJob && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reprintJob(selectedJob.id, '2ª via solicitada via painel')}
                      className="btn-secondary py-1 px-2.5 text-xs text-rose-700"
                    >
                      Reimprimir (2ª via)
                    </button>
                    {selectedJob.status !== 'PRINTED' && (
                      <button
                        type="button"
                        onClick={() => processJob(selectedJob.id)}
                        className="btn-primary py-1 px-2.5 text-xs"
                      >
                        Disparar
                      </button>
                    )}
                    <button type="button" onClick={() => void confirmDelete([selectedJob.id], `o cupom #${selectedJob.order_number}`)} className="icon-button h-8 w-8 text-rose-700 hover:bg-rose-50" aria-label={`Excluir cupom #${selectedJob.order_number}`} title="Excluir cupom">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {selectedJob ? (
                <pre className="rounded-xl border border-line-strong bg-slate-950 p-4 font-mono text-[11px] leading-tight text-emerald-400 overflow-x-auto shadow-inner">
                  {formatTicketText(selectedJob)}
                </pre>
              ) : (
                <div className="p-8 text-center text-xs text-ink-muted">
                  Selecione uma comanda para visualizar o texto formatado para impressora térmica.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: DADOS DA ESPETARIA */}
      {activeTab === 'store' && (
        <form onSubmit={handleSaveStore} className="surface-card p-4 sm:p-5 max-w-2xl space-y-4">
          <div className="border-b border-line pb-3">
            <h3 className="text-base font-bold text-ink">Dados da loja</h3>
            <p className="text-xs text-ink-muted">
              Esses dados saem impressos no cabeçalho das comandas e dos recibos do caixa.
            </p>
          </div>

          <div>
            <label htmlFor="store-name" className={LABEL}>Nome do restaurante</label>
            <input
              id="store-name"
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className={FIELD}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="store-cnpj" className={LABEL}>CNPJ</label>
              <input
                id="store-cnpj"
                type="text"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="store-phone" className={LABEL}>Telefone e WhatsApp</label>
              <input
                id="store-phone"
                type="tel"
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                className={FIELD}
              />
            </div>
          </div>

          <div>
            <label htmlFor="store-address" className={LABEL}>Endereço</label>
            <input
              id="store-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={FIELD}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="store-delivery-eta" className="mb-1 block text-sm font-semibold text-ink-secondary">Tempo de entrega (cardápio)</label>
              <input id="store-delivery-eta" type="text" value={deliveryEta} onChange={(e) => setDeliveryEta(e.target.value)} placeholder="40–55 min" className={FIELD} />
            </div>
            <div>
              <label htmlFor="store-pickup-eta" className="mb-1 block text-sm font-semibold text-ink-secondary">Tempo de retirada (cardápio)</label>
              <input id="store-pickup-eta" type="text" value={pickupEta} onChange={(e) => setPickupEta(e.target.value)} placeholder="30–40 min" className={FIELD} />
            </div>
          </div>

          <div>
            <label htmlFor="store-fee" className={LABEL}>Taxa de serviço (%)</label>
            <input
              id="store-fee"
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={serviceFee}
              onChange={(e) => setServiceFee(Number(e.target.value))}
              className={FIELD}
            />
          </div>

          <div className="pt-2">
            {storeDirty && <p className="mb-2 text-sm font-medium text-amber-800" role="status">Alterações ainda não salvas.</p>}
            <button type="submit" className="btn-primary w-full py-2.5">
              Salvar dados da loja
            </button>
            <div className="mt-2">{feedbackFor('store')}</div>
          </div>
        </form>
      )}
    </div>
  );
};

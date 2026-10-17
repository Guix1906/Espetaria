import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Copy,
  Flame,
  MapPin,
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
import { PixKeyType } from '../../types/enums';
import { generatePixPayload } from '../../lib/pix';
import { PixQrCode } from '../pix/PixQrCode';
import { PixAutoCard } from './PixAutoCard';
import { WhatsAppAutoCard } from './WhatsAppAutoCard';
import { WhatsAppBotCard } from './WhatsAppBotCard';
import { formatBRL } from '../../lib/formatters';
import { isSupabaseConfigured } from '../../lib/supabase';
import { PrintBridgeStatus, DigitalMenuLinkCard, PrinterHealthTag } from './PrintBridgeStatus';

import { PrintTemplatesEditor } from './PrintTemplatesEditor';
import { TableManagementView } from './TableManagementView';
import { DeliveryZonesView } from './DeliveryZonesView';

type SettingsTab = 'pix' | 'printers' | 'templates' | 'queue' | 'store' | 'tables' | 'zones' | 'whatsapp';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, updatePixConfig } = useSettingsStore();
  const {
    jobs,
    processJob,
    reprintJob,
    deleteJobs,
    formatTicketText,
    enqueuePrintJob,
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

  const [activeTab, setActiveTab] = useState<SettingsTab>('pix');
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
  const [cnpj, setCnpj] = useState(settings.cnpj);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [serviceFee, setServiceFee] = useState(settings.service_fee_percent);
  const [deliveryEta, setDeliveryEta] = useState(settings.delivery_eta ?? '40–55 min');
  const [pickupEta, setPickupEta] = useState(settings.pickup_eta ?? '30–40 min');

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
    updatePixConfig({
      pix_key: pixKey,
      pix_key_type: pixKeyType,
      pix_merchant_name: pixMerchantName,
      pix_merchant_city: pixMerchantCity,
    });
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

  const requestTestPrint = async (sector: 'GRILL' | 'KITCHEN' | 'NONE', label: string) => {
    await sendTestPrint(sector);
    setSaveFeedback('printers', `Cupom de teste enviado para ${label}. Confira a impressora e a aba Fila.`, 5000);
  };

  const handlePrintTestGrill = () => {
    if (isSupabaseConfigured) { void requestTestPrint('GRILL', 'a churrasqueira'); return; }
    const { job } = enqueuePrintJob({
      order_id: 'test-grill-01',
      order_number: 901,
      sector: 'GRILL',
      origin: 'SALAO',
      table_number: 7,
      customer_name: 'Mesa 7 (Teste)',
      items: [
        { name: 'Espeto de Picanha Grill', quantity: 2, doneness: 'AO_PONTO', notes: 'Pouco sal' },
        { name: 'Espeto de Queijo Coalho', quantity: 1, doneness: null, notes: 'Bem dourado' },
      ],
    });
    setSelectedJobId(job.id);
  };

  const handlePrintTestKitchen = () => {
    if (isSupabaseConfigured) { void requestTestPrint('KITCHEN', 'a cozinha'); return; }
    const { job } = enqueuePrintJob({
      order_id: 'test-kitchen-01',
      order_number: 902,
      sector: 'KITCHEN',
      origin: 'SALAO',
      table_number: 7,
      customer_name: 'Mesa 7 (Teste)',
      items: [
        { name: 'Porção de Mandioca Cozida', quantity: 1, notes: 'Manteiga de garrafa à parte' },
        { name: 'Cuba Feijão Tropeiro Especial', quantity: 1, notes: null },
      ],
    });
    setSelectedJobId(job.id);
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[0];

  const pendingCount = jobs.filter((j) => j.status === 'PENDING').length;
  const printedCount = jobs.filter((j) => j.status === 'PRINTED').length;

  return (
    <div className="page-layout pb-24">
      <PageHeader
        eyebrow="Painel administrativo"
        title="Configurações"
        description="PIX, impressoras, modelos de cupom e dados da loja."
        icon={SettingsIcon}
      />

      {/* Navegação de Abas */}
      <div className="filter-bar border-b border-line pb-2" aria-label="Abas de configuração">
        <FilterChip active={activeTab === 'pix'} onClick={() => setActiveTab('pix')}>
          <QrCode className="h-4 w-4" />
          PIX
        </FilterChip>
        <FilterChip active={activeTab === 'printers'} onClick={() => setActiveTab('printers')}>
          <Printer className="h-4 w-4" />
          Impressoras
        </FilterChip>
        <FilterChip active={activeTab === 'templates'} onClick={() => setActiveTab('templates')}>
          <Printer className="h-4 w-4" />
          Modelos de cupom
        </FilterChip>
        <FilterChip active={activeTab === 'queue'} onClick={() => setActiveTab('queue')} count={pendingCount}>
          <Zap className="h-4 w-4" />
          Fila de impressão
        </FilterChip>
        <FilterChip active={activeTab === 'store'} onClick={() => setActiveTab('store')}>
          <Store className="h-4 w-4" />
          Dados da loja
        </FilterChip>
        <FilterChip active={activeTab === 'tables'} onClick={() => setActiveTab('tables')}>
          <Building2 className="h-4 w-4" />
          Mesas
        </FilterChip>
        <FilterChip active={activeTab === 'zones'} onClick={() => setActiveTab('zones')}>
          <MapPin className="h-4 w-4" />
          Bairros e taxas
        </FilterChip>
        <FilterChip active={activeTab === 'whatsapp'} onClick={() => setActiveTab('whatsapp')}>
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </FilterChip>
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
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo da chave</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="EMAIL">E-mail</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                  <option value="TELEFONE">Telefone celular</option>
                  <option value="ALEATORIA">Chave aleatória (EVP)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">Chave PIX</label>
                <input
                  type="text"
                  required
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="ex: contato@espetariasabor.com.br"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nome do favorecido</label>
                <input
                  type="text"
                  required
                  maxLength={25}
                  value={pixMerchantName}
                  onChange={(e) => setPixMerchantName(e.target.value.toUpperCase())}
                  placeholder="ESPETARIA SABOR DA CARNE"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm uppercase"
                />
                <span className="text-[11px] text-ink-muted">Máximo 25 caracteres (padrão BACEN)</span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-secondary">Cidade</label>
                <input
                  type="text"
                  required
                  maxLength={15}
                  value={pixMerchantCity}
                  onChange={(e) => setPixMerchantCity(e.target.value.toUpperCase())}
                  placeholder="SAO PAULO"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm uppercase"
                />
                <span className="text-[11px] text-ink-muted">Sem acentos (padrão BACEN)</span>
              </div>
            </div>

            <div className="pt-2">
              <button type="submit" className="btn-primary w-full py-2.5">
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Impressora Churrasqueira */}
            <div className="surface-card p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="icon-tile bg-amber-100 text-amber-800">
                    <Flame className="h-5 w-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-ink">Churrasqueira</h4>
                    <p className="text-xs text-ink-muted">Setor GRILL</p>
                  </div>
                </div>
                <PrinterHealthTag jobs={jobs} sector="GRILL" />
              </div>
              <p className="text-xs text-ink-secondary">
                Recebe exclusivamente espetos e cortes bovinos/suínos com especificação obrigatória de ponto da carne em destaque.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handlePrintTestGrill}
                  className="btn-secondary w-full text-xs"
                >
                  <Printer className="h-4 w-4 text-amber-700" />
                  Imprimir teste da churrasqueira
                </button>
              </div>
            </div>

            {/* Impressora Cozinha */}
            <div className="surface-card p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="icon-tile bg-emerald-100 text-emerald-800">
                    <UtensilsCrossed className="h-5 w-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-ink">Cozinha e cubas</h4>
                    <p className="text-xs text-ink-muted">Setor KITCHEN</p>
                  </div>
                </div>
                <PrinterHealthTag jobs={jobs} sector="KITCHEN" />
              </div>
              <p className="text-xs text-ink-secondary">
                Recebe porções, mandioca, feijão tropeiro, farofas e pratos de acompanhamento das cubas gastronômicas.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handlePrintTestKitchen}
                  className="btn-secondary w-full text-xs"
                >
                  <Printer className="h-4 w-4 text-emerald-700" />
                  Imprimir teste
                </button>
              </div>
            </div>

            {/* Impressora Caixa */}
            <div className="surface-card p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="icon-tile bg-sky-100 text-sky-800">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-ink">Caixa e balcão</h4>
                    <p className="text-xs text-ink-muted">Conferência e recibo</p>
                  </div>
                </div>
                <PrinterHealthTag jobs={jobs} sector="NONE" />
              </div>
              <p className="text-xs text-ink-secondary">
                Emite a conferência detalhada da comanda com taxa de serviço e comprovante não-fiscal de pagamento.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isSupabaseConfigured) { void requestTestPrint('NONE', 'o caixa/expedição'); return; }
                    const { job } = enqueuePrintJob({
                      order_id: 'test-cashier-01',
                      order_number: 903,
                      sector: 'BAR',
                      origin: 'SALAO',
                      table_number: 1,
                      customer_name: 'Mesa 1 (Conferência)',
                      items: [
                        { name: 'Cerveja Original 600ml', quantity: 3, notes: 'Bem gelada' },
                        { name: 'Água Mineral c/ Gás', quantity: 2, notes: 'Gelo e limão' },
                      ],
                    });
                    setSelectedJobId(job.id);
                  }}
                  className="btn-secondary w-full text-xs"
                >
                  <Printer className="h-4 w-4 text-sky-700" />
                  Imprimir teste
                </button>
              </div>
            </div>
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
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nome do restaurante</label>
            <input
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">CNPJ</label>
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Telefone e WhatsApp</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Endereço</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="store-delivery-eta" className="mb-1 block text-sm font-semibold text-ink-secondary">Tempo de entrega (cardápio)</label>
              <input id="store-delivery-eta" type="text" value={deliveryEta} onChange={(e) => setDeliveryEta(e.target.value)} placeholder="40–55 min" className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="store-pickup-eta" className="mb-1 block text-sm font-semibold text-ink-secondary">Tempo de retirada (cardápio)</label>
              <input id="store-pickup-eta" type="text" value={pickupEta} onChange={(e) => setPickupEta(e.target.value)} placeholder="30–40 min" className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-sm" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Taxa de serviço (%)</label>
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={serviceFee}
              onChange={(e) => setServiceFee(Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="pt-2">
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

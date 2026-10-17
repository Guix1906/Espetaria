# Correções de layout e UX — Ponto (Espetaria Sabor da Carne)

Origem: análise de layout feita em 17/10/2026 sobre `Guix1906/Espetaria@main` (pasta `src/`).
Este arquivo é para o **Claude Code**. O dono vai pedir **uma etapa por vez**, por exemplo:
"Leia docs/correcoes-layout.md e faça a Etapa 1".

---

## Regras para o Claude Code (valem para todas as etapas)

1. Faça **só a etapa pedida**. Não adiante tarefas de outras etapas.
2. Siga o `CLAUDE.md` da raiz (stack, regras do projeto, deploy, OneDrive/CRLF).
3. Não mude regra de negócio, RPC ou banco, a não ser quando a tarefa disser. Se uma tarefa exigir migração SQL nova:
   crie o arquivo em `supabase/migrations/` (próximo número), anexe em `supabase/setup_complete.sql`,
   **pare antes de publicar** e explique ao dono, em linguagem simples, que ele precisa rodar o SQL no Supabase.
4. Use só os tokens da marca (`tailwind.config.js` e `src/index.css`): `text-ink`, `text-ink-secondary`, `text-ink-muted`,
   `bg-canvas`, `bg-surface`, `bg-surface-soft`, `bg-surface-muted`, `border-line`, `border-line-strong`, `brand-*`.
   Não escreva hex à mão em componentes.
5. Textos sem maiúsculas em tudo e sem Title Case: "Ver cupom", não "Ver Cupom". Sem emojis.
6. Ao terminar cada etapa:
   - `npx tsc --noEmit -p .`, `npx vitest run` e `npx vite build` (build normal) precisam passar.
     Se um teste quebrar por mudança de texto ou classe, atualize o teste.
   - Confira no navegador: área do garçom em 320, 360, 375 e 414px, e o painel em celular e em notebook.
   - Publique só se tudo passar: `npx vercel@latest deploy --prod --yes`.
   - Explique ao dono, em linguagem simples, o que mudou e o que ele deve conferir no celular.
7. Marque `[x]` nas tarefas concluídas deste arquivo.

---

## Referência rápida do design system

**Mapa único de status** (usar no painel, no garçom, no caixa e no delivery):

| Situação | Visual | Classes sugeridas |
| --- | --- | --- |
| Livre | contorno verde | `border border-emerald-600 text-emerald-800` |
| Ocupada / Servido | neutro | `bg-surface-muted text-ink` |
| Em preparo | âmbar suave | `bg-amber-50 text-amber-800` |
| Pronto para servir | verde sólido | `bg-emerald-600 text-white` |
| Conta pedida | terracota sólido | `bg-brand-500 text-white` |
| Reservada | tracejado | `border border-dashed border-line-strong text-ink-secondary` |
| Atrasado / Esgotado / Cancelado | vermelho sólido | `bg-rose-600 text-white` |

Regra: **cor sólida só para o que pede ação agora**. O que é rotina fica neutro.

**Raios:** 4px em botões, campos e chips (`rounded-md`); 6px em cartões e diálogos (`rounded-2xl`, que no tema vale 6px);
12px só no topo das folhas que sobem de baixo. Não use `rounded-[14px]`, `rounded-[20px]`, `rounded-[22px]`, `rounded-3xl` customizado
nem `rounded-full` em botão retangular.

**Tamanhos:** alvo mínimo de toque de 44px. Botão principal no celular com 56px; ação principal de cartão no painel com 48px.
Texto mínimo de 13px no celular e de 14px no painel. Números (mesa, valor, quantidade, hora) em `font-mono`.

**Componentes:** reutilize `PageHeader`, `StatCard`, `FilterChip`, `SearchField`, `EmptyState`, `Dialog` e `useFeedback`.

---

## Etapa 1 — urgente (dinheiro, estoque e erro de pedido)

### 1.1 Ponto da carne obrigatório no garçom
Arquivo: `src/features/waiter/WaiterDonenessModal.tsx`
- [x] O estado inicial do ponto passa a ser `initial?.doneness ?? null`, sem `'AO_PONTO'` como padrão.
- [x] Quando o produto tem `allows_doneness` e nada foi escolhido, o botão de confirmar fica desabilitado e mostra "Escolha o ponto".
- [x] "Ao ponto" continua com o texto de apoio "padrão da casa", mas não vem marcado.
- [x] Ao **editar** um item que já tem ponto, o ponto atual continua marcado.
- [x] Ajuste os testes em `src/features/waiter/__tests__/` que dependiam do padrão.

### 1.2 Fechar turno com dinheiro contado obrigatório
Arquivo: `src/features/admin/ShiftCloseModal.tsx`
- [x] Remova o fallback `parseFloat(cashDrawerEnd.replace(',', '.')) || expectedCashDrawer`. Campo vazio **não** pode virar "caixa exato".
- [x] "Dinheiro contado" fica obrigatório. Sem esse valor não dá para avançar do passo 2.
- [x] Se houver diferença (sobra ou falta), o campo "Motivo da diferença" fica obrigatório e vai em `closingNotes`.
- [x] Os passos ficam lineares: as abas do topo não deixam pular para frente, só voltar.
- [x] Passo 1: produtos sem contagem aparecem em âmbar com o texto "não contado", e um aviso mostra quantos faltam
      (pode seguir, mas tem que ver o aviso).
- [x] Passo 3, "Resumo": mostre de verdade o faturamento do turno, o dinheiro esperado × contado com a diferença,
      a lista de diferenças de estoque e os itens não contados.
- [x] Remova o emoji "ℹ️" e corrija o Title Case: "Fechamento do turno", "Encerrar turno", "Estoque físico",
      "Gaveta do caixa", "Observações de encerramento".
- [x] Botões Voltar/Avançar com 48px e texto de 15px.

### 1.3 Abrir turno sem números inventados
Arquivo: `src/features/shifts/ShiftOpenModal.tsx`
- [x] Apague as quantidades fixas de `buildInitialPrep` (80 / 60 / 40 / 24 / 3 cubas / 15 porções por ID de produto)
      e o fundo de troco fixo de `150`.
- [x] Coloque o botão **"Repetir último turno"** no topo. Ele preenche com as quantidades iniciais (`initial_quantity`,
      `cubas_count`, `portions_per_cuba`) do último turno fechado e com o fundo de troco dele.
      Use os dados que já estão nos stores. Se não houver como buscar, explique ao dono antes de criar RPC nova.
- [x] Sem esse botão, os campos começam vazios. Campos não preenchidos ficam destacados e o resumo mostra "X produtos sem quantidade".
- [x] Para cubas, `portions_per_cuba` vem do cadastro do produto (`p.portions_per_cuba`), não de 15 fixo.
- [x] Os botões −5/+5 e os de cuba passam a ter no mínimo 44×44px. Os campos ficam com 16px no celular.
- [x] Remova o selo "CONTROLE POR CUBA" e a linha "Fórmula: …". Mostre na própria linha: "3 cubas × 15 = **45 porções**".
- [x] Corrija o Title Case: "Nome do turno", "Observações da noite (opcional)".

### 1.4 Configurações: classes que não existem
Arquivo: `src/features/settings/SettingsView.tsx` (e os cartões `PixAutoCard`, `WhatsAppAutoCard`, `WhatsAppBotCard`,
`PrintBridgeStatus`, `PrintTemplatesEditor`, `TableManagementView`, `DeliveryZonesView`, se usarem as mesmas classes)
- [x] Hoje as classes `card`, `badge-success`, `badge-warning`, `badge-brand` e `badge-rose` **não existem** no CSS, e os blocos aparecem sem
      borda, sem fundo e sem espaçamento. Troque `card` por `surface-card p-4 sm:p-5` e `badge-*` por `status-badge` com a cor do mapa de status.
      Faça um grep em `src/` por `className="card` e `badge-` para pegar todos os casos.
- [x] Impressoras: tire o "Ativa" fixo. O status vem do mesmo dado que o `PrintBridgeStatus` usa (ligada / sem sinal / sem configuração).
- [x] O aviso de "salvo" (`saveFeedback`) aparece logo acima ou ao lado do botão de salvar de cada formulário, não no topo da página.
- [x] Corrija o Title Case: "Chave PIX", "Prévia do QR Code", "Imprimir teste da churrasqueira", "Salvar dados da loja",
      "Reimprimir (2ª via)", "80 mm (bobina padrão)", "58 mm (bobina estreita)".

### 1.5 Caixa: textos internos e ênfase demais
Arquivo: `src/features/cashier/CashierModule.tsx`
- [x] Nas comandas encerradas, troque `{p.method}` pelo nome legível (`Dinheiro`, `PIX`, `Débito`, `Crédito`).
      Use o formatter que já existir em `src/lib/formatters.ts` ou `METHOD_LABELS` em `src/lib/financeData.ts`.
- [x] Troque `#{tab.id.slice(0, 6)}` pelo número do pedido ou da comanda, se existir. Se não existir, mostre só a mesa e o horário.
- [x] Cartão de conta pedida: tire o fundo âmbar, a borda de 2px e o anel. Fica cartão neutro com a etiqueta "Conta pedida há X min"
      (terracota sólido, mapa de status).
- [x] Botão "Fechar conta" com 48px e texto de 15px (hoje está em `text-xs`). "Ver Cupom" passa a ser "Ver cupom".
- [x] Junte os 4 `StatCard` (Dinheiro, PIX, Débito, Crédito) e o cartão solto "Recebido no turno" num cartão só:
      total grande, uma barra dividida por forma de pagamento e os 4 valores embaixo.

---

## Etapa 2 — cores oficiais e status unificado

### 2.1 Área do garçom: trocar cores escritas à mão
Arquivos: `src/features/waiter/WaiterOrderPad.tsx`, `WaiterDonenessModal.tsx`, `WaiterCartDrawer.tsx`,
`WaiterOpenTabSheet.tsx`, `WaiterModule.tsx`, `WaiterPortal.tsx`, `WaiterSheet.tsx`
- [x] Substitua (cerca de 80 ocorrências):

| Hoje | Trocar por |
| --- | --- |
| `#2A201B` | `ink` (`text-ink`, `bg-ink`, `border-ink`) |
| `#7A6C62`, `#9A8B80` | `ink-muted` |
| `#5E5048` | `ink-secondary` |
| `#FBF8F4` | `surface` |
| `#F4EEE7` | `canvas` |
| `#E3D9CE` | `line` |
| `#D9CEC2` | `line-strong` |
| `#B5502F` | `brand-500` |
| `#8E3B21` | `brand-700` |
| `#F9ECE5`, `#FCEFE8`, `#F4E6DE` | `brand-50` |
| `#E7B49E` | `brand-200` |
| `#A06A10` | `amber-700` |
| `#3E7A4E` | `emerald-600` |

- [x] Ao final, `grep -rn "#[0-9A-Fa-f]\{6\}" src/features/waiter` não pode retornar nada além das cores dos pontos da carne
      (`DONENESS_OPTIONS.swatch`).

### 2.2 Cardápio digital: trocar hex pelos tokens
Arquivo: `src/features/delivery/PublicMenuApp.tsx` (e `OrderStatusView.tsx` / `PublicOrderTrackingPage.tsx`, se tiverem hex)
- [x] Mesma troca da 2.1. As cores já estão certas, só precisam virar token (`#2B211C` → `ink`, `#6B5D53` → `ink-muted`,
      `#B5502E` → `brand-500`, `#8E3C20` → `brand-700`, `#E4DACB` → `line`, `#CFC2B2` → `line-strong`, `#FBF8F3` → `surface`,
      `#F5EFE6` → `canvas`, `#EFE8DD` → `surface-muted`, `#9B2C2C` → `rose-600`, `#3F7A4E` → `emerald-600`).
- [x] Raios: `rounded-[12px]`/`rounded-[10px]` passam para `rounded-md`, e a folha de produto usa `rounded-t-[12px]`.

### 2.3 Mapa único de status
- [x] Crie `src/lib/statusStyles.ts` com as classes do mapa da referência (livre, ocupada, em preparo, pronto,
      conta pedida, reservada, atrasado/esgotado) e um componente `src/components/ui/StatusTag.tsx`.
- [x] Use nos dois lados: `src/components/ui/TableCard.tsx` (`borderByStatus` e etiqueta) e `src/features/waiter/WaiterModule.tsx` (`statusChip`).
      Reservada deixa de ser `sky`, que vira cinza pelo remapeamento, e passa a ser tracejado. Conta pedida deixa de ser vermelho e passa a ser terracota.
- [x] Use também nos cartões de `src/features/delivery/DeliveryManagementView.tsx` (ver 4.5) e em `src/features/admin/MasterDashboardView.tsx`.

### 2.4 Raios e botões
- [x] Folhas do garçom (`WaiterSheet.tsx` e `index.css` → `.waiter-sheet`): 22px vira 12px, só nos cantos de cima.
- [x] Barra flutuante "Revisar e enviar" (`WaiterOrderPad.tsx`): `rounded-[14px]` vira `rounded-2xl` (6px).
- [x] Crie `src/components/ui/Button.tsx` com `variant` (primary, secondary, ghost, danger) e `size` (`md` = 44px / 15px,
      `lg` = 56px / 17px), usando as classes `btn-*` existentes. Use nos botões principais do garçom e do cardápio
      (enviar à produção, adicionar, abrir comanda, continuar, enviar pedido).

### 2.5 Produto esgotado legível
Arquivos: `WaiterOrderPad.tsx`, `PublicMenuApp.tsx`
- [x] Tire a `opacity` da linha inteira e o `line-through` do nome. O nome fica na cor normal, a foto e o preço ficam esmaecidos
      e aparece a etiqueta "Esgotado" (vermelho sólido, mapa de status).

---

## Etapa 3 — tela de pedido, auditoria, produtos e estoque

### 3.1 Tela de pedido do garçom
Arquivo: `src/features/waiter/WaiterOrderPad.tsx` (+ `TabItemsPanel.tsx`)
- [ ] **Um espaço de aviso só**: em vez de empilhar comanda encerrada, conta pedida, pedido enviado e trocando item,
      mostre só o mais recente e importante (prioridade: encerrada > trocando > enviado > conta pedida).
- [ ] O `TabItemsPanel` começa **recolhido** numa linha ("6 na mesa · 2 em preparo · 1 pronto — Ver") e expande ao tocar.
- [ ] Categorias em **uma linha só, com rolagem lateral** (`flex-nowrap overflow-x-auto`), fixas logo abaixo do cabeçalho.
- [ ] O "Conta R$ …" do topo vira um botão visível: borda, rótulo "Ver conta ›" e o valor embaixo.
- [ ] Troque os `scrollIntoView` (trocar item e categorias do cardápio) por `window.scrollTo` / `element.scrollTo`.
- [ ] Títulos de seção sem maiúsculas: tire o `uppercase tracking-[0.06em]` de "Mais pedidos", das categorias e de "Livres" em `WaiterModule.tsx`.

### 3.2 Auditoria completa
Arquivo: `src/features/audit/AuditLogView.tsx`
- [ ] Hoje a tela mostra só `stockMovements`. Ela passa a mostrar também: comanda anulada (`void_tab_atomic`), comanda reaberta,
      item cancelado, venda estornada e forma de pagamento corrigida (Financeiro), pedido de delivery cancelado e ajuste de contagem.
- [ ] Toda linha mostra **quem fez** (nome do funcionário), quando, o tipo e o motivo.
- [ ] Filtros: período (use `PeriodPicker`), funcionário e tipo. Anulações, estornos e cancelamentos com etiqueta vermelha.
- [ ] Se os dados de autoria (`updated_by` / `created_by`) não estiverem nos stores, crie uma RPC de leitura nova (migração),
      **pare** e explique ao dono antes de publicar (regra 3).

### 3.3 Cadastro de produtos no padrão do painel
Arquivo: `src/features/products/ProductCatalogManageView.tsx`
- [ ] Use `page-layout`, `PageHeader` (título, descrição e ações) e `FilterChip`/`SearchField` para setores e busca.
- [ ] Tire `bg-white`, `stone-*`, `rounded-3xl`/`rounded-2xl` customizados e os rótulos `uppercase` de 10–11px.
- [ ] Lista em tabela padrão: foto, nome, setor (nome em português, sem "GRILL" de 8px sobre a foto), preço, status ("Ativo" / "Pausado"
      pelo `StatusTag`) e ações **com texto** ("Pausar", "Editar"). "Excluir" vai para um menu "mais" com confirmação.
- [ ] Tire o "ID: prod-…" da tela.
- [ ] Botões só com ícone ganham `aria-label`.
- [ ] Junte os 5 cartões de contagem numa linha de filtros com contador (`FilterChip count`).

### 3.4 Estoque diário em tabela
Arquivo: `src/features/stock/DailyStockView.tsx`
- [ ] Troque os cartões por uma tabela compacta: produto, barra do restante (com o número em 15px), vendido, perda, ajuste e
      as ações "Esgotar"/"Reativar" e "Contagem" (44px).
- [ ] Selos sem maiúsculas ("Esgotado", "Disponível", "3 cubas").
- [ ] O cartão "Produtos esgotados" usa o tom de erro, não `info`.
- [ ] "Estoque baixo": em vez de 5 fixo, use um limite por produto se existir no cadastro. Se não existir, crie o campo
      `low_stock_threshold` (migração, regra 3) e um campo no `ProductFormModal`.
- [ ] Tire `bg-surface-muted` sobre `bg-surface-muted`: o cartão é `bg-surface` e as caixas internas são `bg-surface-soft`.
- [ ] Corrija o Title Case no modal: "Contagem física: …", "Nova quantidade contada", "Motivo da diferença", "Confirmar ajuste".

---

## Etapa 4 — painel mais enxuto

### 4.1 Visão geral
Arquivo: `src/features/admin/MasterDashboardView.tsx`
- [ ] No topo ficam só os alertas, 3 números grandes (faturamento realizado, mesas abertas, delivery em andamento) e as mesas em atendimento.
- [ ] Faturamento por canal, produção e impressora, recebido, mais vendidos, movimentações e perdas vão para abas
      (`FilterChip`) ou blocos `details` recolhidos.
- [ ] Remova "Turnos anteriores" e deixe o link para Relatórios → Turnos.
- [ ] Gráfico "Recebido": cada forma de pagamento com uma cor diferente da paleta. Hoje `stone-700` (Crédito) e `sky-700` (Débito)
      viram a mesma cor. Sugestão: PIX `emerald-600`, Crédito `brand-500`, Débito `tinta-700`, Dinheiro `amber-500`, Cartão na entrega `brand-300`.
- [ ] Os botões "Abrir turno", "Lançar pedido" e "Cobrar" deixam de ser `text-xs` e passam a ter 44px e 14–15px.

### 4.2 Salão e mesas sem janela paralela
Arquivos: `src/features/tables/TableGridView.tsx`, `src/components/layout/navigation.ts`
- [ ] Apague o modal próprio de "Lançar pedido", que tem 5 pontos e "Ao ponto" pré-marcado, e o modal próprio de "Abrir comanda".
      Use o `WaiterOrderPad` e o `WaiterOpenTabSheet` (mesmo fluxo do garçom).
- [ ] Junte "Atendimento" e "Salão e mesas" numa tela só, "Salão", e tire a entrada duplicada do menu (`NAVIGATION_GROUPS`, `ROLE_TABS`, `PAGE_TITLES`).
- [ ] "Cardápio digital" no menu passa a abrir `/cardapio` numa aba nova e a mostrar o QR Code para imprimir, em vez de renderizar a visão do cliente no painel.
- [ ] O extrato mostra o setor em português ("Churrasqueira", "Cozinha", "Bar"), não `GRILL`. Sem "ESGOTADO" em maiúsculas.

### 4.3 Financeiro
Arquivo: `src/features/finance/FinanceView.tsx`
- [ ] Troque `window.confirm` por `useFeedback` (`requestChoice` ou equivalente).
- [ ] A janela "Detalhes do lançamento", hoje uma `div fixed` feita à mão, passa a usar o `Dialog`.
- [ ] Em "Lançamentos do período", agrupe as vendas por dia e canal ("Vendas do salão · 12/10 · R$ 3.840"), com opção de abrir o detalhe.
      Contas a pagar/receber continuam individuais.
- [ ] Gráfico principal com 3 séries: entradas, saídas e saldo. As previsões ficam num botão "mostrar previsto".
- [ ] "Em aberto" vira dois números separados, "A receber" e "A pagar".
- [ ] Período padrão igual ao de Relatórios.

### 4.4 Cabeçalho do painel em uma linha no celular
Arquivo: `src/components/layout/Header.tsx`
- [ ] No celular, uma linha de 56px: menu, logo e perfil. Turno e som vão para o menu do perfil.
- [ ] O status "On-line" some. Quando estiver offline, aparece uma faixa vermelha "Sem conexão" abaixo do cabeçalho.
- [ ] O botão "Área do garçom" vai para o menu do perfil no celular.

### 4.5 Delivery (painel)
Arquivo: `src/features/delivery/DeliveryManagementView.tsx`
- [ ] Cartão neutro (`bg-surface`), sem fundo colorido por status e sem anel. Uma etiqueta só, pelo `StatusTag`. Entrega/Retirada vira texto simples.
- [ ] Endereço, itens e pagamento em 15px. Hora sem segundos (`hour: '2-digit', minute: '2-digit'`).
- [ ] Ação principal com 48px. Corrija o Title Case: "Itens para embalar", "Pagamentos dos entregadores".

### 4.6 Maiúsculas e Title Case no sistema todo
- [ ] Busque `uppercase` em `src/` e remova onde for rótulo ou título, incluindo `.nav-group-label` em `src/index.css`.
- [ ] Busque textos em Title Case nos botões e títulos ("Novo Produto", "Ver Cupom", "Abrir Comanda", "Fechamento do Turno", "Nome do Cliente") e passe para frase normal.

### 4.7 Limpezas
- [ ] `src/index.css`: remova as sobrescritas frágeis em `.waiter-portal` (`.table-card .py-4`, `min-height: 0 !important` etc.).
      Se ainda forem necessárias, passe a regra para o componente.
- [ ] `src/components/ui/StatCard.tsx`: implemente o `tone` (ícone colorido conforme o tom) ou remova a prop de todas as chamadas.
- [ ] `src/features/delivery/PublicMenuApp.tsx`: o tempo de entrega e de retirada ("40–55 min", "30–40 min") passa a vir de
      `restaurant_settings` (campo novo, migração, regra 3), editável em Configurações → Dados da loja.
- [ ] `src/features/team/TeamManagementView.tsx`: no celular, "Editar" fica visível e "Senha", "Desativar" e "Excluir" vão para um menu "mais".
      Os campos usam `border-line-strong`.

---

## Fora deste pacote
- KDS (churrasqueira, cozinha e bar): ficou de fora a pedido do dono.
- `src/features/cashier/TableSettlementModal.tsx` (fechamento da conta no caixa): ainda não foi analisado.

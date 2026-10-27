# Etapa 5 — garçom, delivery, cardápio digital e fechamento de conta

Origem: análise de 27/10/2026 sobre `Guix1906/Espetaria@main`.
Coloque este arquivo em `docs/` e peça ao Claude Code: **"Leia docs/correcoes-layout-etapa5.md e faça a parte 5.1"** (uma parte por vez).
Valem todas as regras de `docs/correcoes-layout.md` (tokens da marca, sem Title Case, testes, build, deploy, marcar `[x]`).

Referência visual: telas 1a, 1b e 1c do protótipo "Melhorias Layout".

---

## 5.1 Garçom — mesas (`src/features/waiter/WaiterModule.tsx`) — tela 1a
- [x] Grade "Todas": ocupada deixa de ser `bg-brand-500` e passa a neutra (`bg-surface-muted text-ink`). Conta pedida passa de `bg-amber-500` para `bg-brand-500 text-white`. Pronto continua `bg-emerald-600`. Atualize a legenda.
- [x] Lista de ocupadas: tire `border-l-[6px]` e os fundos coloridos (`bg-emerald-100`, `bg-amber-100`, `bg-brand-100`). Cartão `bg-surface border border-line rounded-2xl`; a cor fica só no `StatusTag`.
- [x] Etiqueta de pronto mostra "Pronto há X min" (use `ready_at` do item). Passou de 5 min: `StatusTag kind="alert"` (vermelho).
- [x] Raios: `rounded-[10px]`, `rounded-xl`, `rounded-lg` → `rounded-md` (controles) ou `rounded-2xl` (cartões).

## 5.2 Garçom — lançar pedido (`WaiterOrderPad.tsx`, `TabItemsPanel.tsx`) — tela 1b
- [x] Nome do produto: `text-[23px] font-bold` → `text-[18px] font-semibold`. Preço/estoque: `text-[19px]` → `text-[15px]`. Título de seção: `text-[20px] font-bold` → `text-[18px] font-semibold`. **(Não aplicado a pedido do dono em 27/10: letras do garçom continuam grandes.)**
- [x] Chips de categoria: `h-12 text-[18px]` → `h-10 text-[15px]`. **(Mantido grande a pedido do dono.)**
- [x] Linha com item no carrinho: tire `border-brand-200 bg-brand-50`; a linha fica `bg-surface border-line`. Só o contador fica terracota.
- [x] Botão "+" e contador com a mesma altura, 48px (hoje 52px e 46px).
- [x] Linha do produto com `rounded-2xl` (hoje `rounded-xl`).
- [x] "Liberar mesa": deixa de ser borda vermelha grossa; vira botão `ghost` com texto `text-rose-700` (a confirmação continua).
- [x] Espeto **sem acompanhamento** que tem `allows_doneness` sempre abre o `WaiterDonenessModal` antes de entrar no carrinho (nada de "Mal passada" automático). Confira também o `+` do stepper, que repete a última linha.

## 5.3 Painel de delivery (`src/features/delivery/DeliveryManagementView.tsx`) — tela 1c
- [x] Remova os 3 `StatCard` do topo; os filtros já mostram a contagem. Filtros no formato "Prontos 2" (número em `font-mono`, sem parênteses).
- [x] Cartão em ordem: nº + cliente | total + hora → etiqueta de status com tempo na etapa ("Na brasa · 12 min") + "Entrega · Bairro" → endereço e telefone (15px) → linha "4 itens · Ver itens" (recolhida, abre a lista) → pagamento numa linha só → ação principal (48px) → WhatsApp + menu "mais".
- [x] Pagamento numa linha: "PIX · pago 20:06", "PIX · aguardando [PIX recebido]", "Dinheiro · troco p/ R$ 100 · receber na entrega". Tire o bloco "Forma:" e o fundo colorido (`bg-emerald-50`/`bg-amber-50`) da confirmação.
- [x] Pedido atrasado: passou da previsão (`settings.delivery_eta` / `pickup_eta`), mostra `StatusTag kind="alert"` "Atrasado X min".
- [x] "Cancelar" vai para o menu "mais" (com confirmação, como hoje).
- [x] Mensagens do WhatsApp ficam dentro de "Ver itens" (recolhidas).
- [x] Ícones: `MapPin` vermelho e `MessageCircle` verde passam para `text-ink-muted`.
- [x] Use só "Entregador" (tire "Motoboy").
- [x] "Aguardando PIX" ganha ação principal "Reenviar link do PIX".

## 5.4 Cardápio digital (`PublicMenuApp.tsx`, `OrderStatusView.tsx`)
- [x] `OrderStatusView`: a previsão "Chega entre…" / "Pronto entre…" usa `settings.delivery_eta` / `pickup_eta` (hoje fixo em 40–55 / 30–40). Crie um helper que lê "40–55 min" e devolve os dois números.
- [x] Troque `#B5502E` e `#FBEFE8` do quadro do ponto por `border-brand-500` / `bg-brand-50` / `ring-brand-500/30`.
- [x] Troque os 2 `scrollIntoView` (ponto obrigatório e campo de observação) por `window.scrollTo` / `element.scrollTo`.
- [x] Botão sem ponto escolhido: tire o `!bg-ink-muted`; fica terracota com o texto "Escolha o ponto da carne".
- [x] Aviso de loja fechada: um só componente, igual no cardápio e no carrinho (`rounded-md`, tons amber do mapa).
- [x] Carrinho com título "Sua sacola" (o acompanhamento continua "Seu pedido").
- [x] Raios: `rounded-xl`/`rounded-2xl` em avisos → `rounded-md`; `bg-white` → `bg-surface`.
- [x] Telefone: recuse DDD inválido (menor que 11) e números repetidos (00000000000) com a mensagem "Confira o WhatsApp com DDD".
- [ ] Texto do combo: mostre os acompanhamentos que realmente vão, ou peça ao dono para confirmar a frase antes de mudar. **(Aguardando o dono confirmar quais acompanhamentos vão.)**

## 5.5 Fechamento de conta (`src/features/cashier/TableSettlementModal.tsx`)
- [ ] `bg-white` → `bg-surface`, `border-stone-*` → `border-line`, `rounded-xl` → `rounded-md`.
- [ ] Método de pagamento legível (`METHOD_LABELS`), não `{p.method}`.
- [ ] Textos: "Itens lançados", "Total devido", "Total pago", "Encerrar conta e liberar mesa", "Aguardando pagamento total".
- [ ] "Conta pedida" via `StatusTag kind="bill"` (terracota), não amber.
- [ ] "Encerrar conta" com 56px/17px; "Lançar" com 48px/15px; métodos e atalhos 1/2, 1/3 com 44px.
- [ ] Atalho extra "Por pessoa (N)" usando `currentTab.people_count`.
- [ ] Remover pagamento pede confirmação (`requestChoice`) e o botão tem 44×44px.
- [ ] Desconto maior que zero pede motivo (`requestText`), salvo nas notas da comanda.
- [ ] Hora de abertura sem segundos.

## 5.6 Em todas as telas
- [ ] Um nome por etapa em cliente, painel e garçom: "Recebido", "Na brasa", "Pronto", "Saiu para entrega", "Entregue". Centralize em `src/lib/statusStyles.ts`.
- [ ] Tempo na etapa com o mesmo componente (`KDSElapsedTimer`) em mesas e delivery.

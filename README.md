# 🥩 ESPETARIA SABOR DA CARNE — SISTEMA INTEGRADO DE GESTÃO OPERACIONAL E FINANCEIRA

## Area dedicada do garcom no celular

- Acesso direto: acrescente `#/garcom` ao endereco do sistema. A aba Atendimento do painel tambem oferece um link para essa area. O hash dispensa regras extras de redirecionamento no servidor.
- Interface propria, sem menu administrativo, troca de cargo, cadastro de produtos, abertura de turno ou fechamento financeiro. O perfil GARCOM tambem e direcionado para essa interface.
- Fluxo: identificacao, selecao/busca de mesa, abertura de comanda, categorias e busca de produtos, ponto da carne e observacoes, revisao da rodada, consumo, itens prontos para servir e solicitacao da conta. Rascunhos permanecem em memoria ao trocar de mesa ou quando a validacao do envio falha; recarregar a pagina encerra a sessao local e perde esses dados.
- Sem Supabase configurado, a identificacao e demonstrativa, por nome, sem senha. Com Supabase configurado, o acesso usa e-mail/senha do Supabase Auth e exige registro ativo de papel GARCOM em `profiles`, com o mesmo ID do usuario autenticado. Nao ha criacao automatica de contas nem senhas padrao.
- **Limite atual:** os stores operacionais de mesas, pedidos, estoque e turnos ainda executam a operacao em memoria. Login real e broadcasts existentes NAO tornam esses dados persistentes ou sincronizados entre aparelhos. A area exibe aviso de demonstracao mesmo com Supabase configurado. Nao utilizar em atendimento real antes de integrar leitura/escrita transacional, permissoes de backend e sincronizacao completa dos stores com o banco comum.
- Para demonstrar o fluxo com os mesmos dados, abra o turno no painel e use o link da area do garcom na mesma aba, sem recarregar. No celular, use o endereco publicado ou o IP do computador na mesma rede (servidor Vite na porta 3000); `localhost` no celular aponta para o proprio celular. Acesso em rede nao significa compartilhamento de dados no modo local.
- A separacao de interface nao substitui autorizacao no servidor; o painel legado ainda utiliza um seletor demonstrativo de perfis. A implantacao publica requer autenticar e autorizar tambem o painel.


> **Sistema Completo de Gestão em Tempo Real para Espetaria, Salão, Churrasqueira KDS, Cozinha por Cubas, Bar, Caixa Térmico, Delivery Próprio, PIX Dinâmico BACEN, WhatsApp e DRE Executivo.**

---

## 📋 SUMÁRIO EXECUTIVO

1. [Visão Geral & Contexto do Negócio](#-visão-geral--contexto-do-negócio)
2. [Arquitetura Tecnológica](#-arquitetura-tecnológica)
3. [Módulos do Sistema & Funcionalidades](#-módulos-do-sistema--funcionalidades)
   - [Mise en Place & Controle por Cubas Gastronômicas](#1-abertura-de-turno-mise-en-place--cubas)
   - [App do Garçom (PWA Mobile-First)](#2-app-do-garçom-pwa-mobile-first)
   - [KDS Churrasqueira, Cozinha & Bar](#3-kds-de-produção-churrasqueira-cozinha-e-bar)
   - [Esgotamento Instantâneo em Tempo Real (<100ms)](#4-esgotamento-instantâneo-em-tempo-real)
   - [Módulo do Caixa, Fechamento & Cupom Térmico](#5-módulo-do-caixa-fechamento-e-cupom-térmico)
   - [Delivery Próprio & Cardápio Digital](#6-delivery-próprio-e-cardápio-digital)
   - [PIX Dinâmico BACEN & Notificações WhatsApp](#7-pix-dinâmico-bacen-e-notificações-whatsapp)
   - [Painel Master, DRE & Reconciliação de Turno](#8-painel-master-dre-e-reconciliação-de-turno)
   - [PWA, Instalação na Tela Inicial & Resiliência Offline](#9-pwa-instalação-e-resiliência-offline)
4. [Estrutura do Repositório](#-estrutura-do-repositório)
5. [Instalação e Execução Local](#-instalação-e-execução-local)
6. [Configuração do Banco PostgreSQL no Supabase](#-configuração-do-banco-postgresql-no-supabase)
7. [Manual de Operação da Equipe Noturna](#-manual-de-operação-da-equipe-noturna)
8. [Garantia de Qualidade & Testes Automatizados](#-garantia-de-qualidade--testes-automatizados)

---

## 🎯 VISÃO GERAL & CONTEXTO DO NEGÓCIO

Uma espetaria possui uma dinâmica operacional única e de altíssima velocidade que difere radicalmente de um restaurante convencional:

- **Estoque Noturno Fracionado:** O estoque crítico da noite não é a peça inteira de carne no freezer, mas sim a quantidade exata de **espetos montados** disponíveis para assar na noite e as **cubas gastronômicas** de acompanhamentos (arroz branco, feijão tropeiro, farofa especial, mandioca cozida).
- **Produção Descentralizada em Tempo Real:** Ao lançar um pedido, os espetos caem instantaneamente na tela do churrasqueiro com especificação obrigatória de ponto da carne, as porções de cubas caem na cozinha e as bebidas no bar.
- **Prevenção Rígida de Furo de Estoque (Anti-Overselling):** Concorrência em nível de banco de dados (`SELECT ... FOR UPDATE`) garante que duas mesas ou pedidos de delivery concorrendo pelo último espeto de picanha nunca gerem estoque negativo.
- **Esgotamento com 1 Toque:** Se um corte acabar na brasa ou a mandioca esgotar na cuba, a equipe bloqueia o produto com 1 toque em menos de 100ms no salão, no delivery e no KDS.
- **Fechamento com Reconciliação Física:** Ao final da noite, o sistema apura a quebra de espetos na grelha e a divergência entre a contagem física final e o estoque teórico, além de conciliar centavo a centavo o gaveteiro do caixa.

---

## 🛠️ ARQUITETURA TECNOLÓGICA

| Camada | Tecnologia | Função no Sistema |
| :--- | :--- | :--- |
| **Linguagem** | **TypeScript 5.6 (Strict)** | Tipagem estática integral em todas as entidades (comandas, itens, estoque, financeiro, DRE). |
| **Interface** | **React 18** | Renderização reativa e componentes declarativos mobile-first. |
| **Build & Bundler** | **Vite 6** | Compilação ultra-rápida em Rust/ESM, hot-reload instantâneo e minificação máxima. |
| **Estilização** | **Tailwind CSS 3.4** | Tema claro com cores semânticas, contraste legível e componentes compartilhados em todas as telas. |
| **PWA & Offline** | **Vite PWA (Workbox)** | Service Worker com pré-cache estático, atalho de instalação nativo e manifest standalone. |
| **Banco de Dados** | **PostgreSQL 15 (Supabase)** | Banco relacional robusto com RLS, índices, triggers e funções transacionais atômicas. |
| **Realtime WebSockets**| **Supabase Realtime** | Sincronização bidirecional de pedidos, dispensas e esgotamentos em menos de 100ms. |
| **Áudio Sintetizado** | **Web Audio API** | Síntese de frequências nativa para alertas sonoros sem depender de arquivos MP3 externos. |
| **Testes Unitários** | **Vitest 2.1** | Suíte completa com testes automatizados de regras de negócio e concorrência. |

---

### Interface e usabilidade

O sistema usa uma identidade visual única no atendimento, salão, produção (churrasqueira, cozinha e bar), caixa, delivery, cardápio, gestão, estoque e auditoria, incluindo os respectivos formulários, carrinhos e modais.

- **Cores:** superfícies claras, texto escuro e verde-petróleo nas ações principais. Verde indica disponibilidade/conclusão; âmbar indica espera/atenção; vermelho indica bloqueio, cancelamento ou atraso. Os estados também possuem rótulos e/ou ícones.
- **Navegação:** menu lateral no computador e menu compacto no celular, com indicação da tela ativa e contadores operacionais. A abertura de turno e o controle de som permanecem acessíveis em telas pequenas.
- **Legibilidade e acesso:** textos secundários com contraste mínimo de 4,5:1 nas superfícies do tema, foco de teclado visível, controles de pelo menos 44px, zoom habilitado e respeito à preferência por movimento reduzido.
- **Janelas:** diálogos nativos com foco contido, fechamento por Escape, retorno do foco à origem e rolagem interna. PIX e recibos ficam acima do fechamento de conta, sem sobrepor indevidamente a navegação.
- **Consistência:** os tokens ficam em `src/index.css` e `tailwind.config.js`; os componentes compartilhados estão em `src/components/ui`. Novas telas devem reutilizar `PageHeader`, `StatCard`, `FilterChip`, `SearchField`, `EmptyState` e `Dialog`, sem reintroduzir cores escuras fixas. Confirmações e solicitações de motivo usam `useFeedback` e `FeedbackProvider`, no lugar dos alertas e prompts nativos do navegador.
- **PIX:** a interface identifica o QR como prévia ilustrativa e a confirmação como manual, conforme a implementação atual. O código Copia e Cola permanece disponível; o recebimento deve ser conferido no banco antes de ser registrado.
- **PWA e impressão:** ícones e cores de instalação acompanham a marca; a interface aceita orientação vertical e horizontal. A impressão do recibo mantém apenas o cupom, em preto sobre branco, adaptado à largura do papel.

## ⚡ MÓDULOS DO SISTEMA & FUNCIONALIDADES

### 1. Abertura de Turno (Mise en Place & Cubas)
- **Cadastro de Fundo de Caixa:** Registro do valor inicial em dinheiro no gaveteiro (`cash_drawer_start`).
- **Mise en Place de Espetos:** Quantidade exata de espetos espetados e temperados disponíveis para o turno (Picanha, Alcatra, Queijo Coalho, Kafta, Tulipa, Panceta).
- **Conversão Automática de Cubas Gastronômicas:** Configuração de quantidade de cubas (GN 1/2 ou 1/1) e fator de conversão em porções individuais (ex: 3 cubas de arroz × 15 porções = 45 porções).
- **Auditoria de Produção:** Criação automática de movimentações do tipo `PRODUCAO` no log de auditoria.

### 2. App do Garçom (PWA Mobile-First)
- **Operação na Palma da Mão:** Interface ergonômica com botões com áreas de toque de no mínimo 44px, utilizável com apenas uma mão.
- **Seletor Visual de Ponto da Carne:** Modal obrigatório para espetos bovinos com as opções oficiais:
  - `MAL PASSADA`
  - `AO PONTO PARA MAL`
  - `AO PONTO`
  - `AO PONTO PARA BEM`
  - `BEM PASSADA`
- **Carrinho Multi-Itens por Mesa:** Adição de múltiplos itens com observações rápidas ("Sem cebola", "Pouco sal", "Gelo e limão").
- **Lançamento Atômico:** Validação do estoque no momento do envio; produtos esgotados ficam desabilitados com rótulo de indisponibilidade com contraste e ação desabilitada.
- **Consulta de Comanda na Mesa:** O garçom vê instantaneamente o consumo acumulado da mesa, taxa de serviço de 10% e divisão sugerida por pessoa (`total / people_count`).

### 3. KDS de Produção (Churrasqueira, Cozinha e Bar)
- **Filtro Setorial Automático:**
  - **Churrasqueira (`GRILL`):** Fila de espetos com painel resumo vivo mostrando a quantidade exata por corte e ponto que estão aguardando e assando na brasa.
  - **Cozinha (`KITCHEN`):** Acompanhamentos, porções quentes e **Monitor de Nível de Cubas** (ex: 35/45 porções restantes com barra percentual dinâmica e alerta de reposição).
  - **Bar (`BAR`):** Bebidas e chopps expedidos para retirada imediata no balcão.
- **Ciclo de Vida do Item:** `RECEBIDO` ➔ `NA BRASA / PREPARANDO` ➔ `PRONTO`.
- **SLA Visual de Tempo Decorrido:**
  - Menor que 10 minutos: Verde.
  - Entre 10 e 20 minutos: Âmbar.
  - Acima de 20 minutos: Vermelho com ícone e rótulo **Atrasado**, sem depender de animação.
- **Web Audio API:** Alertas sonoros sintetizados para novos pedidos, itens prontos e pedidos urgentes.

### 4. Esgotamento Instantâneo em Tempo Real
- **Bloqueio com 1 Toque:** Se um corte acabar no meio da noite, o churrasqueiro ou cozinheiro pressiona `Esgotar` no KDS.
- **Auditoria Obrigatória de Motivo:** Registro de motivo no sistema ("Acabou o lote preparado", "Fogo queimou o espeto", "Carne reservada").
- **Propagação Relâmpago:** Em menos de 100ms, o item é desativado via WebSocket em todos os celulares de garçons, no delivery e no caixa.

### 5. Módulo do Caixa, Fechamento e Cupom Térmico
- **Painel de Mesas Ocupadas & Fila de Encerramento:** Destaque com rótulo e cor de atenção para mesas com status `AGUARDANDO_CONTA`.
- **Conferência Detalhada:** Exibição de cada item consumido com hora de lançamento e quem atendeu.
- **Divisão Flexível de Pagamentos:** Permite receber a conta em até 4 formas de pagamento na mesma comanda (ex: R$ 50 no PIX, R$ 30 em dinheiro e R$ 40 no cartão).
- **Cálculo Automático de Troco:** Input de valor recebido em espécie com cálculo instantâneo de troco a devolver.
- **Trava Rígida de Quitação:** A comanda só é liberada se `total_pago >= total_da_conta`.
- **Impressão Térmica 80mm / 58mm:** Layout formatado para cupom de impressora térmica com comando `window.print()` e cabeçalho fiscal/não-fiscal da espetaria.

### 6. Delivery Próprio & Cardápio Digital
- **Cardápio Digital para Clientes:** Visualização de todo o cardápio em layout responsivo com categorias, busca, preços e seleção de ponto da carne.
- **Anti-Overselling Integrado:** O delivery consome o mesmo estoque diário da espetaria física. Se a picanha esgotar no salão, fica indisponível para delivery no mesmo instante.
- **Tabela de Taxas por Bairro:** Cálculo automático de taxa de entrega com base no endereço do cliente.
- **Painel Interno de Despacho:** Atribuição de motoboy, avanço de status (`CONFIRMED` ➔ `PREPARING` ➔ `OUT_FOR_DELIVERY` ➔ `DELIVERED`) e cancelamento com estorno automático de estoque.
- **Rastreamento ao Vivo:** Linha do tempo visual para o cliente acompanhar o status do pedido em tempo real.

### 7. PIX Dinâmico BACEN & Notificações WhatsApp
- **BR Code / EMV QRCPS-MPM:** Gerador nativo de payload Pix Copia e Cola e matriz SVG de QR Code com cálculo oficial de checksum CRC16-CCITT (`0x1021`, inicial `0xFFFF`).
- **Simulação de Webhook Instantâneo:** Confirmação em 1 clique com bipe sonoro harmônico de caixa registradora.
- **"API Zap" (Deep Links Oficiais):**
  - Envio da conta detalhada com Copia e Cola para o WhatsApp do cliente.
  - Notificação de confirmação e previsão de entrega do delivery.
  - Aviso automático de saída do motoboy para entrega.
  - Mensagem de substituição amigável caso um espeto esgote.

### 8. Painel Master, DRE & Reconciliação de Turno
- **DRE Executivo em Tempo Real:**
  - Faturamento Bruto (Salão + Delivery).
  - Taxa de Serviço arrecadada (10% dos garçons).
  - Descontos aplicados.
  - Faturamento Líquido.
  - Ticket Médio por Mesa e por Pessoa.
- **Curva ABC:** Ranking de espetos e produtos mais rentáveis e mais vendidos.
- **Conferência Física vs Teórica:** Wizard de 3 passos para inserção da contagem final de espetos crus e cubas, com cálculo de quebra/perda (`count_difference`).
- **Auditoria de Gaveteiro:** Conferência de saldo inicial + vendas em dinheiro vs dinheiro físico contado, com apuração de sobra ou falta de caixa.
- **Exportação CSV:** Download de relatório consolidado em 1 clique.

### 9. PWA, Instalação e Resiliência Offline
- **PWA Standalone:** Funciona como aplicativo nativo em Android, iOS e Windows.
- **Prompt Inteligente de Instalação:** Banner com detecção de dispositivo (Safari iOS e Chrome Android).
- **Mobile Safe Areas:** Adaptação para iPhone notches e barras de navegação com `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)`.

---

## 📁 ESTRUTURA DO REPOSITÓRIO

```
espetaria-sabor-da-carne/
├── public/
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx                 # Topo com perfil, áudio e status de turno
│   │   │   └── NavigationTabs.tsx         # Navegação por abas com badges ao vivo
│   │   └── pwa/
│   │       └── PWAInstallBanner.tsx       # Banner de instalação mobile PWA
│   ├── features/
│   │   ├── admin/                         # Etapa 8: Painel Master, DRE & Fechamento
│   │   │   ├── MasterDashboardView.tsx    # DRE, Curva ABC, formas de pagamento
│   │   │   ├── ShiftCloseModal.tsx        # Reconciliação física e auditoria de caixa
│   │   │   └── __tests__/shift_reconciliation.test.ts
│   │   ├── cashier/                       # Etapa 5: Caixa & Fechamento de Mesas
│   │   │   ├── CashierModule.tsx          # Fila de contas a receber
│   │   │   ├── TableSettlementModal.tsx   # Divisão de pagamentos e PIX
│   │   │   ├── ReceiptModal.tsx           # Impressão térmica 80mm
│   │   │   └── __tests__/cashier_flow.test.ts
│   │   ├── delivery/                      # Etapa 6: Delivery & Cardápio Digital
│   │   │   ├── DeliveryCatalogView.tsx    # Cardápio digital mobile para clientes
│   │   │   ├── DeliveryCartDrawer.tsx     # Checkout de endereço e taxa por bairro
│   │   │   ├── DeliveryManagementView.tsx # Despacho e controle de motoboys
│   │   │   ├── DeliveryTrackingModal.tsx  # Rastreamento ao vivo
│   │   │   └── __tests__/delivery_flow.test.ts
│   │   ├── kds/                           # Etapa 4: Telas de Produção KDS
│   │   │   ├── KDSModule.tsx              # Hub com seleção automática por perfil
│   │   │   ├── GrillKDSView.tsx           # Tela escura da Churrasqueira
│   │   │   ├── GrillLiveSummary.tsx       # Contagem viva por corte e ponto
│   │   │   ├── GrillExhaustModal.tsx      # Esgotamento instantâneo com motivo
│   │   │   ├── KitchenKDSView.tsx         # Cozinha & Monitor de Cubas Gastronômicas
│   │   │   ├── BarKDSView.tsx             # Expedição de bebidas e chopps
│   │   │   ├── KDSElapsedTimer.tsx        # SLA visual (verde/âmbar/vermelho)
│   │   │   └── __tests__/kds_workflow.test.ts
│   │   ├── pix/                           # Etapa 7: PIX Dinâmico & WhatsApp
│   │   │   ├── PixPaymentModal.tsx        # QR Code SVG, Copia e Cola e Webhook
│   │   │   └── __tests__/pix_whatsapp.test.ts
│   │   ├── stock/                         # Gestão de Estoque Diário
│   │   │   └── DailyStockView.tsx         # Visão de estoque e botões de esgotar
│   │   ├── tables/                        # Salão
│   │   │   └── TableGridView.tsx          # Visão panorâmica das mesas
│   │   └── waiter/                        # Etapa 3: App do Garçom PWA
│   │       ├── WaiterModule.tsx           # Hub móvel do salão
│   │       ├── WaiterOrderPad.tsx         # Bloco de pedidos rápido
│   │       ├── WaiterDonenessModal.tsx    # Seletor obrigatório de ponto de carne
│   │       ├── WaiterCartDrawer.tsx       # Gaveta do carrinho
│   │       ├── WaiterViewTab.tsx          # Visualização da comanda na mesa
│   │       └── __tests__/waiter_flow.test.ts
│   ├── lib/
│   │   ├── audio.ts                       # Web Audio API (tons sintetizados)
│   │   ├── formatters.ts                  # Moeda BRL, datas, enums em português
│   │   ├── pix.ts                         # BR Code EMV, CRC16 e matriz de QR Code
│   │   ├── realtime.ts                    # Broadcast WebSockets
│   │   ├── supabase.ts                    # Cliente Supabase
│   │   ├── whatsapp.ts                    # Deep links wa.me e mensagens operacionais
│   │   └── __tests__/realtime_audio.test.ts
│   ├── stores/
│   │   ├── useAuthStore.ts                # Perfis operacionais e permissões
│   │   ├── useDeliveryStore.ts            # Carrinho e pedidos de entrega
│   │   ├── useShiftStore.ts               # Abertura e encerramento de turno
│   │   ├── useStockStore.ts               # Baixa atômica e cubas
│   │   ├── useTableStore.ts               # Mesas, comandas e pagamentos
│   │   └── __tests__/stock_rules.test.ts
│   ├── types/
│   │   ├── domain.ts                      # Interfaces estritas de negócio
│   │   └── enums.ts                       # Enums PostgreSQL
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── migrations/
│   │   ├── 00001_initial_schema.sql       # Tabelas, chaves e enums
│   │   ├── 00002_stock_atomic_functions.sql # Procedures atômicas com locks
│   │   └── 00003_rls_policies.sql         # Políticas de segurança RLS
│   └── seed/
│       └── seed.sql                       # Cardápio base, mesas e perfis
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 INSTALAÇÃO E EXECUÇÃO LOCAL

### 1. Pré-requisitos
- **Node.js**: Versão 20+ (Recomendado v22 ou v24)
- **NPM**: Versão 10+

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Crie o arquivo `.env` na raiz do projeto:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
```

### 4. Executar em Modo de Desenvolvimento
```bash
npm run dev
```
O sistema estará rodando em `http://localhost:3000` (ou IP local para acesso via celular na mesma rede Wi-Fi).

### 5. Executar os Testes Automatizados
```bash
npm test
```
Executa a suíte de 45 testes com Vitest cobrindo todas as etapas e regras críticas.

### 6. Validar Tipos e Gerar Build de Produção
```bash
npm run build
```
Executa `tsc --noEmit` em modo estrito e compila os bundles minificados e Service Workers do PWA no diretório `dist/`.

---

## 🗄️ CONFIGURAÇÃO DO BANCO POSTGRESQL NO SUPABASE

1. Crie um projeto no console do [Supabase](https://supabase.com).
2. Abra o **SQL Editor** do Supabase.
3. Copie e execute o script das migrations:
   - Execute `supabase/migrations/00001_initial_schema.sql` (Criação de tipos ENUM, tabelas com constraints, chaves estrangeiras e índices otimizados).
   - Execute `supabase/migrations/00002_stock_atomic_functions.sql` (Funções PL/pgSQL com transações atômicas `SELECT ... FOR UPDATE`, procedure de inicialização de turno, baixa unificada de pedido e esgotamento imediato).
   - Execute `supabase/migrations/00003_rls_policies.sql` (Políticas de segurança Row Level Security para cada perfil).
4. Carregue o seed inicial executando `supabase/seed/seed.sql` (Popula os espetos, cortes nobres, cubas de acompanhamentos, mesas 01 a 20 e os perfis operacionais).

---

## 👨‍🍳 MANUAL DE OPERAÇÃO DA EQUIPE NOTURNA

### 👑 Perfil: Master / Gerente
1. **Início da Noite:**
   - Acesse o botão **"Abrir Turno da Noite"** no cabeçalho.
   - Digite o fundo inicial da gaveta de dinheiro (ex: R$ 400,00).
   - Lance o estoque de mise en place preparado pelo açougueiro (ex: 80 Picanhas, 60 Alcatras, 50 Kaftas) e as cubas de acompanhamento da cozinha (ex: 3 cubas de Arroz, 2 cubas de Farofa).
   - Clique em **"Iniciar Turno da Noite"**.
2. **Durante o Atendimento:**
   - Acompanhe no **Painel Master (DRE)** o faturamento bruto em tempo real, curva ABC de vendas e tempo de espera das mesas.
3. **Fechamento da Noite:**
   - Clique em **"Fechar Turno (Reconciliação)"**.
   - No **Passo 1**, digite a contagem física real dos espetos crus que restaram no freezer e as porções das cubas. O sistema aponta quebras e perdas automaticamente.
   - No **Passo 2**, confira o dinheiro do gaveteiro contra as vendas do sistema.
   - No **Passo 3**, insira observações e encerre definitivamente o turno. Exporte o relatório em CSV com 1 clique.

### 📱 Perfil: Garçom
1. Acesse o **"App do Garçom"** no celular.
2. Selecione a mesa desejada no salão (ex: Mesa 04). Se estiver livre, abra a comanda informando o nome do cliente e número de pessoas.
3. Toque nos itens para adicionar ao pedido. Para espetos bovinos, selecione o ponto da carne solicitado pelo cliente.
4. Revise no carrinho e toque em **"Lançar Pedido na Brasa"**. O pedido é transmitido em tempo real para a churrasqueira e cozinha.
5. Quando o cliente pedir a conta, toque em **"Solicitar Fechamento da Conta"**.

### 🥩 Perfil: Churrasqueiro
1. Mantenha o tablet fixado na parede da churrasqueira na aba **"KDS Produção"**.
2. Olhe para o **Resumo da Grelha no Topo**: ele indica exatamente quantos espetos de cada corte e ponto devem estar assando.
3. Quando colocar os espetos na grelha, clique em **"Colocar na Brasa"**.
4. Quando assarem no ponto correto, clique em **"Pronto para Servir"**. O garçom receberá uma notificação sonora imediatamente.
5. **Se algum corte acabar:** toque imediatamente no botão vermelho **"Esgotar Espeto"**, selecione o motivo e confirme. O item será bloqueado na hora para todos os garçons e delivery.

### 🍲 Perfil: Cozinha (Cubas)
1. Acompanhe a fila de acompanhamentos (Arroz, Mandioca, Feijão Tropeiro, Batata Frita).
2. Monitore o card de **Cubas Gastronômicas**: quando a cuba estiver acabando (ex: menos de 5 porções), providencie uma nova panela ou clique em **"Esgotar Cuba"** para travar pedidos.

### 💵 Perfil: Caixa
1. Fique atento às mesas com o indicador **"Conta solicitada"**.
2. Abra a mesa no módulo de Caixa, confira os itens consumidos e confirme a inclusão ou não da taxa de 10%.
3. Selecione o meio de pagamento (PIX, Dinheiro, Débito, Crédito). Se for PIX, clique em **"Gerar QR Code PIX Dinâmico"** para mostrar o QR Code na tela ou enviar a conta com Copia e Cola direto no WhatsApp do cliente.
4. Após registrar a quitação integral, clique em **"Encerrar Conta e Liberar Mesa"** para imprimir o cupom térmico e liberar a mesa para novos clientes.

### 🛵 Perfil: Expedição de Delivery & Motoboys
1. Acesse a aba **"Delivery & Motoboys"**.
2. Ao receber um pedido novo, confirme o preparo.
3. Quando a cozinha/churrasqueira finalizar, clique em **"Despachar com Motoboy"**, informe o nome do entregador e clique no botão do **WhatsApp** para avisar o cliente com mensagem pronta.

---

## 🧪 GARANTIA DE QUALIDADE & TESTES AUTOMATIZADOS

O sistema conta com uma suíte de **45 testes automatizados** cobrindo todas as etapas de negócio:

```bash
npm test
```

### Matriz de Testes Executados:
- `src/stores/__tests__/stock_rules.test.ts` (7 testes):
  - Cálculo de estoque inicial a partir de cubas gastronômicas.
  - Venda da última unidade e esgotamento automático ao zerar.
  - Bloqueio de concorrência com estoque negativo (`anti-overselling`).
  - Esgotamento imediato com 1 toque e auditoria de motivo.
  - Cancelamento em estado `RECEIVED` com devolução comercializável.
  - Cancelamento em estado `IN_PREPARATION` com registro de `PERDA`.
  - Ajuste de contagem física de estoque.
- `src/lib/__tests__/realtime_audio.test.ts` (4 testes):
  - Ativação e persistência do sintetizador Web Audio API.
  - Disparo de sons harmônicos para pedidos, itens prontos e alertas urgentes.
  - Gestão de canais WebSocket Realtime.
- `src/features/waiter/__tests__/waiter_flow.test.ts` (4 testes):
  - Fluxo completo do garçom, carrinho, abertura de comanda e baixa atômica de estoque.
- `src/features/kds/__tests__/kds_workflow.test.ts` (5 testes):
  - Fila KDS da churrasqueira, cozinha e bar.
  - Progressão de status `RECEBIDO` ➔ `NA BRASA` ➔ `PRONTO`.
  - Esgotamento rápido de espeto e cubas.
- `src/features/cashier/__tests__/cashier_flow.test.ts` (5 testes):
  - Solicitação de conta pelo garçom.
  - Aplicação de taxa de 10% e descontos.
  - Pagamentos múltiplos e cálculo de troco.
  - Trava de encerramento sem quitação total e reabertura auditada.
- `src/features/delivery/__tests__/delivery_flow.test.ts` (5 testes):
  - Carrinho de delivery e cálculo de taxa por bairro.
  - Pedido atômico com baixa unificada de estoque físico.
  - Bloqueio imediato caso o item esteja esgotado na espetaria.
  - Ciclo de vida completo do delivery e despacho de motoboy.
  - Cancelamento de delivery com estorno de estoque.
- `src/features/pix/__tests__/pix_whatsapp.test.ts` (11 testes):
  - Padrão EMV TLV e checksum CRC16-CCITT oficial do BACEN.
  - Geração de BR Code com valor e TxID.
  - Geração de matriz SVG de QR Code com Finder Patterns.
  - Normalização de telefones (+55 DDD).
  - Geração de templates de mensagens operacionais para o WhatsApp Zap.
- `src/features/admin/__tests__/shift_reconciliation.test.ts` (4 testes):
  - Abertura de turno com mise en place e fundo de caixa.
  - Reconciliação física vs teórica com apuração de quebras e perdas.
  - Auditoria e fechamento do gaveteiro de caixa.
  - Bloqueio de turnos simultâneos.

---

**Espetaria Sabor da Carne** — Sistema desenvolvido com excelência técnica para operação contínua em ambientes de alta demanda gastronômica. 🔥🥩

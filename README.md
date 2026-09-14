# 🥩 Espetaria Sabor da Carne — Sistema Integrado de Gestão

Sistema completo de gestão operacional e financeira desenvolvido para espetarias e churrascarias, com arquitetura em tempo real, controle diário de mise en place, acompanhamentos por cubas gastronômicas, KDS setorial (churrasqueira/cozinha) e baixa atômica de estoque no PostgreSQL.

---

## 🚀 Tecnologias Principais

- **Frontend:** React 18, TypeScript 5.6 (strict mode), Vite 6, Tailwind CSS, Lucide Icons, PWA (Progressive Web App).
- **Backend & Database:** PostgreSQL via Supabase, PostgREST, Supabase Auth, Row Level Security (RLS).
- **Transações Atômicas:** PL/pgSQL com locks de concorrência (`SELECT ... FOR UPDATE`).
- **Estado & Cache:** Zustand e TanStack Query v5.
- **Testes Unitários:** Vitest.

---

## 📦 Estrutura do Projeto

```
espetaria-sabor-da-carne/
├── public/
├── src/
│   ├── components/       # Componentes de layout, header, navegação
│   ├── features/
│   │   ├── audit/        # Trilha de auditoria e movimentações de estoque
│   │   ├── shifts/       # Abertura da noite (mise en place & cubas)
│   │   ├── stock/        # Estoque diário e botões de esgotar imediato
│   │   └── tables/       # Mesas 01 a 20, comandas e pedidos rápidos
│   ├── lib/              # Formatadores BRL, logger, cliente Supabase
│   ├── stores/           # Gerenciamento de estado transacional (Zustand)
│   ├── types/            # Enums e interfaces TypeScript estritas
│   ├── App.tsx           # Aplicação principal
│   └── main.tsx          # Ponto de entrada
├── supabase/
│   ├── migrations/
│   │   ├── 00001_initial_schema.sql         # Tabelas, enums e índices
│   │   ├── 00002_stock_atomic_functions.sql # Procedures atômicas PL/pgSQL
│   │   └── 00003_rls_policies.sql           # Políticas de segurança e auditoria
│   └── seed/
│       └── seed.sql                         # Cardápio, mesas e usuários
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛠️ Como Instalar e Rodar Localmente

### 1. Pré-requisitos
- **Node.js**: Versão 20+ (Recomendado v22 ou v24)
- **NPM**: Versão 10+

### 2. Instalação das Dependências
```bash
npm install
```

### 3. Configuração de Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
Preencha as variáveis com as credenciais do seu projeto Supabase:
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica-anon
```
> **Nota de Segurança:** NUNCA insira sua `service_role` key no frontend.

### 4. Executar em Modo de Desenvolvimento
```bash
npm run dev
```
O sistema estará acessível em `http://localhost:3000`.

### 5. Executar os Testes Automatizados
```bash
npm test
```

### 6. Validação de Tipos e Build de Produção
```bash
npm run typecheck
npm run build
```

---

## 🗄️ Configuração do Banco de Dados no Supabase

1. Crie um novo projeto no [Supabase](https://supabase.com).
2. Acesse o **SQL Editor** do projeto.
3. Execute as migrations na ordem:
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_stock_atomic_functions.sql`
   - `supabase/migrations/00003_rls_policies.sql`
4. Carregue os dados de desenvolvimento:
   - `supabase/seed/seed.sql`

---

## 🥩 Regras Críticas de Negócio Implementadas

1. **Gestão de Cubas Gastronômicas:**
   - Acompanhamentos (ex: Arroz, Feijão Tropeiro, Mandioca) são inseridos em **cubas** no início da noite.
   - O sistema multiplica: `Cubas × Rendimento por Cuba = Total de Porções Disponíveis`.
2. **Prevenção de Estoque Negativo:**
   - Travamento por linha (`SELECT ... FOR UPDATE`) no PostgreSQL impede que garçons concorrentes vendam a última unidade simultaneamente.
3. **Cancelamento Condicional:**
   - Itens com status `RECEIVED` (não foram para a grelha) são devolvidos ao saldo comercializável (`CANCELAMENTO_RETORNO`).
   - Itens com status `IN_PREPARATION` ou `READY` não retornam ao estoque e são contabilizados como `PERDA / DESCARTE`.
4. **Botão Esgotar Imediato:**
   - O churrasqueiro ou cozinheiro pode congelar a venda de qualquer item instantaneamente com 1 toque, sincronizando com os garçons e delivery.

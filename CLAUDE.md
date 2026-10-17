# Ponto — sistema da Espetaria Sabor da Carne

Sistema de gestão de restaurante (espetaria): salão/mesas, área do garçom no celular,
produção (churrasqueira, cozinha, bar), caixa, delivery com cardápio digital, estoque
diário, financeiro e relatórios. Dono: Guilherme (fala português, não é programador —
explicar passo a passo, em linguagem simples, e sempre verificar no navegador).

## Stack
- React 18 + TypeScript + Vite + Tailwind + Zustand (stores em `src/stores`). PWA.
- Supabase (Postgres + RLS + Realtime + Edge Function `manage-staff`). Migrações em `supabase/migrations` (00001 a 00032).
  `supabase/setup_complete.sql` acumula todas — ao criar migração nova, anexar o conteúdo nele também.
- Gráficos: ApexCharts (`src/components/charts/Chart.tsx`, carregado sob demanda).
- `printer-bridge/`: programa Node que roda no PC da loja, lê `print_queue` do Supabase e imprime ESC/POS nas térmicas Epson (porta 9100).
- Publicação: Vercel, projeto `espetaria` → https://sabordacarne.vercel.app (`npx vercel@latest deploy --prod --yes`).
  As chaves do site (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) estão cadastradas na Vercel, não em arquivo local.
  `.vercelignore` impede enviar `printer-bridge/`, `supabase/` e `.env*`.

## Como rodar e testar
- Demonstração local (sem banco, entra direto como Master): `.claude/launch.json` → "demo" (porta 3003).
- `npx tsc --noEmit -p .` · `npx vitest run` (210 testes) · `npx vite build` (sempre build normal, nunca `--mode demo`, antes de publicar).
- printer-bridge: `cd printer-bridge; npm start` (modo `PRINT_MODE=simulate` grava cupons em `impressoes-simuladas/`). Testes: `npx vitest run`.
  Para o dono (duplo clique): `1-CONFIGURAR-IMPRESSORAS.bat` (assistente `src/setup.js`: pergunta IPs, testa porta 9100, grava `.env`),
  `2-IMPRIMIR-TESTE.bat` (check + `test-print ALL`), `3-INICIAR-IMPRESSAO.bat` (worker).

## Regras do projeto
- Toda ação de negócio grava no banco via RPC (`callRpc` em `src/lib/remote.ts`, com atualização otimista + re-hidratação se o banco recusar). Produtos gravam via `src/lib/productSync.ts`.
- Nunca apagar venda/comanda: "excluir comanda" = anular (`void_tab_atomic`), fica na auditoria.
- Espeto "X com acompanhamento" usa o estoque do espeto "X" + 1 "Arroz" (regra pelo nome; 00031, gatilhos em
  `daily_prep_stock` repassam qualquer baixa/devolução do combo; saldo do combo = min(espeto, arroz)). No app: `src/lib/comboStock.ts`.
- Área do garçom (celular): Mesas (lista de ocupadas + grade de livres) / Prontos / Ajustes na barra inferior; avatar com Som e Sair;
  folhas `WaiterSheet` (abrir comanda, ponto da carne só com 3 pontos, revisar pedido). Painel admin continua com `TableCard`.
- Visão geral: cálculos puros em `src/features/admin/dashboardMetrics.ts` (testados): alertas, casa × delivery agora, faturamento
  por canal (produtos sem taxas; delivery realizado = entregue ou pago). "Lançar pedido"/"Cobrar" abrem a mesa via `useNavFocusStore`.
- Estoque amarrado: garçom vê saldo por item e o carrinho bloqueia acima do estoque (`assertStock` em `useCartStore`). Gerente bloqueia/libera item no quadro "Espetos e porções disponíveis" (Visão geral).
- Login: abas Proprietário/Garçom na mesma moldura (`src/features/auth/AuthShell.tsx`). Perfil GARCOM sempre cai na área do garçom (`#/garcom`).
- Marca "Ponto": paleta terracota/tinta/papel (tokens em `src/index.css` e `tailwind.config.js`; cores padrão do Tailwind remapeadas para a paleta), fontes Jost e JetBrains Mono (números), logo `PontoLogo` em `BrandMark.tsx`. Visual sóbrio: cantos pequenos, sem emojis, sem pílulas com borda, textos sem Maiúsculas Em Tudo.
- Área do garçom precisa funcionar perfeitamente no celular (testar em 320, 360, 375 e 414px).
- WhatsApp automático do delivery: fila `whatsapp_outbox` → Edge Function `whatsapp-dispatch` (Z-API, deploy com `--no-verify-jwt`).
  Eventos: recebido, PIX confirmado, pronto (status `READY`), saiu, entregue, cancelado. Textos editáveis em Configurações → WhatsApp
  (`restaurant_settings.whatsapp_templates`); `{link}` aponta para a página pública `#/pedido/<id>` (RPC `get_delivery_tracking`, 00027); padrões em `src/lib/whatsappTemplates.ts` e cópia em `supabase/functions/whatsapp-dispatch/templates.ts` (teste garante que são iguais).
- Fluxo da churrasqueira (00028): espeto enviado já entra "Na brasa" (item GRILL nasce IN_PREPARATION por trigger; delivery/retirada nasce PREPARING).
  Churrasqueiro tem só "Espeto pronto" (`GrillKDSView`, 4 s para desfazer). Mesa → aviso na cozinha (`GrillReadyAlerts`); retirada → WhatsApp READY;
  delivery → pronto interno, cliente só é avisado no "Saiu para entrega". Retirada = `delivery_orders.order_type = 'PICKUP'` (cardápio digital, sem endereço/taxa).
  Cancelar algo na brasa pergunta se volta ao estoque (`p_return_stock` em cancel_order_item_atomic, void_tab_atomic, cancel_delivery_order).
  Horários: `preparing_at/ready_at/cancelled_at` + tabela `delivery_order_status_history`.
- Robô de atendimento no WhatsApp (00029): Edge Function `whatsapp-bot` recebe o webhook "Ao receber" da Z-API (`?token=WHATSAPP_BOT_TOKEN`)
  e responde com o Gemini (chave do dono, `GEMINI_API_KEY`; modelo `GEMINI_MODEL`, padrão gemini-3.8-flash, via REST generateContent)
  usando cardápio/estoque/pedidos reais. Lógica pura em `logic.ts`
  (testada por `src/lib/__tests__/whatsapp_bot.test.ts` via import dinâmico, porque `supabase/` não vai para a Vercel).
  Config em `restaurant_settings.whatsapp_bot` (cartão em Configurações → WhatsApp): modo OFF/TEST/ALL — o mesmo número é usado
  pelo robô do Anota AI, então só ligar ALL quando o do Anota for desligado. Pausa quando chama atendente ou a equipe responde.
  Ativação: `supabase/ATIVAR-ROBO-WHATSAPP.bat` (pede a chave do Gemini, grava secrets, publica, copia a URL do webhook).
- PIX automático (00030, Mercado Pago): com `restaurant_settings.pix_auto_enabled`, pedido do cardápio por PIX nasce
  `AWAITING_PAYMENT` (estoque reservado, sem cupom nem produção). Edge Function `pix-mercadopago` (deploy `--no-verify-jwt`;
  secrets `MP_ACCESS_TOKEN`, `PIX_WEBHOOK_TOKEN`) gera o QR do pedido e, aprovado, chama `release_paid_delivery_order`
  (só service_role) → PREPARING + `enqueue_delivery_production`. "PIX recebido" manual também libera. Vence em
  `pix_auto_minutes` (`expire_unpaid_pix_orders`, devolve estoque). Ativação: `supabase/ATIVAR-PIX-MERCADOPAGO.bat`.
- printer-bridge: espeto "com acompanhamento" gera cópia do cupom para a COZINHA (`sideDishCopy`); delivery sai em um cupom
  compacto por setor com cliente/endereço/pagamento (`compactDeliveryTicket`); expedição separada só com `PRINT_DELIVERY_SUMMARY=true`.
- Impressão: modelos estilo Anota AI ("Produção" e "Completo") configuráveis em Configurações → Modelos de cupom (`restaurant_settings.print_templates`); etiqueta de delivery com dados do cliente.

- Dados da loja (nome, CNPJ, endereço, telefone, chave PIX) vêm SEMPRE de `restaurant_settings`; nada de valores de exemplo
  no código (sem chave PIX não gera QR Code). Telas ficam dentro de `ErrorBoundary` (uma tela quebrada não derruba o sistema).

## Chaves e credenciais — NÃO pedir ao usuário
Antes de pedir qualquer chave, procurar nos lugares abaixo e verificar o login. Nunca mostrar valores no chat, em código ou em commits.
- **Vercel (site)**: chaves de deploy e variáveis do site ficam NA VERCEL (projeto `espetaria`, conta `guigos191-1905`):
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Login da CLI salvo neste PC → verificar com `npx vercel@latest whoami`.
  Ligação da pasta ao projeto: `.vercel/project.json`. Ver variáveis: `npx vercel@latest env ls`.
- **Supabase CLI**: login salvo neste PC → verificar com `npx supabase projects list`. Project ref `byamgmjeqawznkagouwd`
  (está em `supabase/ativar-*.ps1`).
- **Segredos das Edge Functions** (ficam no Supabase, `npx supabase secrets list --project-ref byamgmjeqawznkagouwd`):
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `WHATSAPP_BOT_TOKEN`, `WHATSAPP_PROVIDER`, `ZAPI_INSTANCE_ID`, `ZAPI_CLIENT_TOKEN`,
  `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`,
  `MP_ACCESS_TOKEN`, `MP_PAYER_EMAIL`, `PIX_WEBHOOK_TOKEN`, `ALLOWED_ORIGIN`, `APP_URL`
  (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` o Supabase injeta sozinho).
- **printer-bridge/.env** (só no PC da loja): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRINT_MODE`, `PRINTER_GRILL`,
  `PRINTER_KITCHEN`, `PRINTER_BAR`, `PRINTER_CASHIER`, `PAPER_COLUMNS`, `RESTAURANT_NAME`, `BEEP_ON_ORDER`,
  `PRINT_TIMEOUT_MS`, `POLL_INTERVAL_MS`, `OUTPUT_DIR`, `WORKER_NAME`, `PORT` (modelo em `printer-bridge/.env.example`).
- **.env.demo** (raiz): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — usado só pelo modo demonstração (`--mode demo`).
- **GitHub**: `gh` logado na conta `Guix1906` (verificar `gh auth status`). A pasta não usa Git hoje.
- `.gitignore` cobre `.env*`, `.vercel` e `printer-bridge/.env`; `.vercelignore` impede enviar `.env*`, `supabase/` e `printer-bridge/`.

## Ferramentas
Node está em `C:\Program Files\nodejs` (já no PATH). Git e gh ficam em `C:\Users\guigo\devtools`. No PowerShell:
`$env:Path = "C:\Users\guigo\devtools\git\cmd;C:\Users\guigo\devtools\gh\bin;C:\Program Files\nodejs;$env:Path"`
Vercel e Supabase CLI rodam via `npx` (`npx vercel@latest`, `npx supabase`).

## Deploy (o Claude faz sozinho depois de cada alteração)
1. `npx tsc --noEmit -p .` · `npx vitest run` · `npx vite build` (build normal, nunca `--mode demo`). Só publicar se tudo passar.
2. `npx vercel@latest deploy --prod --yes` (publica direto em produção → https://sabordacarne.vercel.app; não há etapa preview/promote).
3. Conferir no navegador (o app é PWA: se aparecer versão antiga, limpar service worker/cache da aba).
- Edge Functions (quando mudarem): `npx supabase functions deploy <nome> --project-ref byamgmjeqawznkagouwd`
  (`whatsapp-dispatch`, `whatsapp-bot` e `pix-mercadopago` com `--no-verify-jwt`).
- Migrações SQL novas: o DONO roda no SQL Editor do Supabase; avisar antes de publicar código que depende delas.

## Arquivos com segredo (não commitar nem publicar)
- `printer-bridge/.env` — `SUPABASE_SERVICE_ROLE_KEY` e IPs das impressoras.

## Atenção ao editar no Windows/OneDrive
- O OneDrive às vezes trava arquivos. `Set-Content` que falha pode deixar o arquivo VAZIO — preferir as ferramentas de edição ou `[IO.File]::WriteAllText` e conferir arquivos com 0 bytes depois.
- Arquivos têm mistura de quebras de linha LF/CRLF; considerar isso em substituições de texto.

## Situação em 11/10/2026
- Produção: projeto Vercel `espetaria`, endereço atual **https://sabordacarne.vercel.app** (o antigo espetaria-red também aponta para ele). A pasta NÃO tem Git: deploy é pela CLI.
- Migrações 00001–00025 aplicadas no banco de produção (00024 e 00025 rodadas pelo dono em 11/10).
  00028 (12/10, inclui o que 00026/00027 fazem) precisa ser rodada ANTES de publicar o site novo.
  00031 (15/10, espeto com acompanhamento baixa espeto + arroz) rodada pelo dono em 15/10.
  00032 (15/10, `delete_print_jobs`: excluir cupons em Configurações → Fila de impressão) rodada pelo dono e publicada em 15/10.
  Arquivo único para aplicar: `supabase/APLICAR_00017_a_00023.sql` (tudo idempotente).
- A 00019 ORIGINAL (de outra sessão) convertia `updated_by` para UUID e status/forma de pagamento do delivery para ENUM, e tirava `delivery_orders` do Realtime — isso quebraria 12 funções (abrir mesa, pedido, cancelar, conta, turno, excluir comanda, delivery). Foi reescrita mantendo só o seguro; a 00023 desfaz caso a antiga tenha rodado. NÃO reintroduzir essas conversões sem reescrever todas as funções que gravam `updated_by = v_uid::TEXT`.
- O código depende das RPCs da 00017 (financeiro e produtos), da 00020 (`driver_payouts`), 00021 (mesas) e 00022 (bairros).
- Endereço do cardápio: **/cardapio** (rewrite em `vercel.json`; `#/cardapio` antigo continua). Cancelar delivery: `useCancelDeliveryOrder`
  (painel Delivery e janela de acompanhamento, só equipe logada).
- Cardápio público lê `restaurant_settings_public` sem login, com reserva para a tabela.
- Impressoras da loja ainda em teste (Anota AI continua oficial; não alterar a configuração das impressoras de lá).
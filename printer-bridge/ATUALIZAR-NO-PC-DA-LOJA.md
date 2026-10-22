# Atualizar o programa de impressão no PC da loja (instruções para o Claude Code)

Objetivo: deixar o `printer-bridge` deste PC igual ao do GitHub (via do entregador + "PIX PAGO / NÃO CONFIRMADO"
nos cupons, commit 1a7e444 ou mais novo) sem perder a configuração das impressoras.

1. Achar a pasta do printer-bridge que está rodando aqui (procure `3-INICIAR-IMPRESSAO.bat` e um `.env` ao lado).
   - Se for um clone git de https://github.com/Guix1906/Espetaria: `git pull` na raiz do repositório.
   - Se não for git: baixar o repositório (`git clone https://github.com/Guix1906/Espetaria` numa pasta nova, ou o ZIP
     do GitHub) e copiar SÓ a pasta `printer-bridge/src` e os `.bat`/`package*.json` por cima da pasta atual.
2. NUNCA apagar, sobrescrever ou mostrar o `.env` (tem a SUPABASE_SERVICE_ROLE_KEY e os IPs). Fazer cópia dele antes
   (`.env.bak`) e conferir depois que continua igual.
3. `npm install` dentro de `printer-bridge`, depois `npx vitest run` (precisa passar, inclui `driver.test.js`).
4. Parar o programa antigo (fechar a janela do `3-INICIAR-IMPRESSAO.bat` / processo `node src/index.js`) e iniciar de novo
   com `3-INICIAR-IMPRESSAO.bat`. Conferir no log que conectou ao Supabase.
5. Teste: no site, pedido de delivery de teste → "Saiu para entrega" com nome do motoboy → deve sair "VIA DO ENTREGADOR"
   na impressora do caixa (ou cozinha, se não houver PRINTER_CASHIER). A migração 00037 já foi rodada no banco.
6. Explicar ao dono (Guilherme) em português simples o que foi feito.

# Auditoria completa — 22/10/2026 (site oficial sabordacarne.pontopdv.tech)

Testado no site oficial, com pedidos de teste (nome "TESTE Auditoria").

## O que foi simulado e FUNCIONOU
- Garçom (celular 375px): abrir Mesa 03, 3 pessoas, picanha com acompanhamento (ponto obrigatório), alcatra, Red Bull → enviado.
- Estoque baixou na hora (picanha 39→38, combo segue o arroz). Carrinho reserva o estoque.
- Painel recebeu na hora: Visão geral, Churrasqueira (pedido #16 com ponto), Bar (Red Bull), Cozinha recebeu "Mesa 03 — mandar bandeja".
- "Espeto pronto" e "Liberar bebidas" funcionam.
- Caixa: Mesa 02 sem consumo encerrada; Mesa 04 paga dividida (R$ 50 dinheiro + R$ 16 crédito); Mesa 03 com desconto R$ 5 e PIX (QR gerado com a chave real) → R$ 106,10. Taxa de 10% certa. Cupom certo.
- Cardápio digital: pedido #1007 (entrega, Centro, dinheiro troco p/ R$ 100) → chegou ao Delivery → Pronto → Saiu (com nome do entregador) → Entregue. Página de acompanhamento do cliente funciona.
- Cadastro de produto: criar e salvar no banco OK; "Excluir" desativa (guarda histórico). Auditoria registra tudo.
- Financeiro e Relatórios: salão bate (R$ 288,70 = PIX 222,70 + dinheiro 50 + crédito 16).

## Erros encontrados e CORRIGIDOS no código (falta publicar)
1. **Grave — faturamento do turno sumia ao recarregar a página.** Depois de F5 (ou em outro aparelho), Visão geral e Caixa só viam mesas abertas: "Recebido no turno" caiu de R$ 288,70 para R$ 116,60 e "Faturamento realizado" ficou R$ 0. O fechamento do turno (dinheiro esperado na gaveta) usava esse número errado.
   Correção: `src/lib/syncService.ts` agora carrega também as comandas fechadas do turno atual.
2. **Delivery entregue não entrava no Financeiro/Relatórios** se ninguém clicasse "Marcar pago" (dinheiro/cartão recebido na porta). Visão geral contava, Financeiro não.
   Correção: `src/lib/financeData.ts` conta delivery pago **ou** entregue (mesma regra da Visão geral e do fechamento do turno).
3. **Preço de produto novo vinha preenchido com 22.00**; digitar por cima gerava valor errado (testei 9.99 → salvou R$ 22,01).
   Correção: campo começa vazio e só aceita número válido (ex.: 24 ou 24,90).
4. **Link do WhatsApp com caracteres estranhos** ("ï»¿https://…"): a variável do endereço foi gravada com um caractere invisível. O link chegaria quebrado para o cliente.
   Correção: site e funções do WhatsApp (`whatsapp-dispatch`, `whatsapp-bot`) ignoram esse lixo.

## O que VOCÊ precisa ajustar antes de abrir (Configurações)
- **Dados da loja**: telefone está (11) 99999-9999 e endereço "Rua dos Espetos, 100 — São Paulo/SP", sem CNPJ. Sai no cupom e no botão "Falar com a loja no WhatsApp" do cardápio.
- **Bairros e taxas**: são de exemplo (Morumbi, Jardim das Américas, Bairro Alto…). Cadastrar os bairros reais de Lago da Pedra.
- **Fechar o turno de 14/10** (está aberto há 8 dias) e abrir o de hoje com o estoque real. Anular a Mesa 01 "Gui" (teste antigo, R$ 182,60).
- **Equipe**: só existe 1 garçom (Rogério). Criar login de cada garçom/caixa.
- **Impressora**: o painel avisa "1 cupom parado" — o programa da impressora (printer-bridge) não está rodando no PC da loja.

## Pontos de atenção (não corrigidos, decidir depois)
- Espeto sem acompanhamento (ex.: Alcatra) entra no carrinho já marcado "Mal passada" sem perguntar; só dá para trocar na revisão. Risco de sair ponto errado.
- O cardápio digital aceita telefone inválido (testei 00000000000).
- A tela da Cozinha não lista o arroz do combo: depende do cupom impresso.
- Categorias e 19 produtos de demonstração (pausados) ainda no cadastro; "Espetos Nobres" (demo) é a categoria padrão de produto novo.
- Desconto no caixa não pede motivo.
- Relatório "Faturamento" conta dinheiro recebido (inclui pagamento parcial de mesa ainda aberta); "Total das mesas" conta só mesas fechadas.
- Cardápio diz "Acompanha arroz, vinagrete, farofa e purê", mas o estoque só baixa o arroz.
- Excluir produto que já teve venda/estoque só desativa (correto para histórico, mas a mensagem não avisa).

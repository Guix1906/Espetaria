# O que sai em cada impressora

Data: 03/11/2026. Fonte: regras em uso no banco de produção e código do programa de impressão, com os cupons gerados em simulação. **Nada foi conferido em papel.** Os cupons abaixo mostram a versão nova do programa; se o PC da loja ainda não foi atualizado, entrega e consumo saem diferentes (ver "Versão do programa").

Impressoras: **Churrasqueira** 192.168.3.17 e **Cozinha** 192.168.3.12. Não há impressora de Bar nem de Caixa: o que seria deles sai na Churrasqueira.

## Resumo

| Item do pedido | Salão (mesa e QR) | Entrega, Consumir ou Retirada, com espeto no pedido |
|---|---|---|
| Espeto sem acompanhamento | Churrasqueira | Churrasqueira |
| Espeto com acompanhamento | Churrasqueira + Cozinha (ver Problema 1) | Churrasqueira + Cozinha (ver Problema 1) |
| Porção, batata, arroz, pastéis | Cozinha | Cozinha + listado no cupom da Churrasqueira |
| Cebola assada (cadastrada na Churrasqueira) | Churrasqueira | Churrasqueira |
| Suco, jarra | Cozinha | Cozinha + listado no cupom da Churrasqueira |
| Cerveja, refrigerante, água, drinks | **Não imprime** (ver Problema 2) | Só listado no cupom da Churrasqueira |

No cardápio digital, a **Churrasqueira recebe o pedido inteiro**, com cliente e pagamento. A **Cozinha recebe só o que ela prepara**, com cliente e pagamento também.

## O que cada cupom informa

| Informação | Salão | Entrega | Consumir no local | Retirada |
|---|---|---|---|---|
| Título | CONSUMO NO LOCAL, Pedido, Mesa, Garçom | DELIVERY #nº | CONSUMIR NO LOCAL #nº | RETIRADA #nº |
| Setor e hora | Sim | Sim | Sim | Sim |
| Quantidade e item | Sim | Sim | Sim | Sim |
| Ponto da carne | Só Churrasqueira | Só Churrasqueira | Só Churrasqueira | Só Churrasqueira |
| Arroz, "Sem farofa", observação | Sim | Sim | Sim | Sim |
| Nome e telefone | Não | Sim | Sim | Sim |
| Endereço, bairro, referência | Não | Sim | Não | Não |
| Pagamento e total | Não | Sim, com "COBRAR" ou "PAGO" | Sim | Sim |
| Troco | Não | Sim, se dinheiro | Sim, se dinheiro | Sim, se dinheiro |
| Preço por item e taxa | Não | Não | Não | Não |

O pedido pelo QR da mesa usa o cupom do salão, sem garçom e sem arroz nem observação.

## Exemplos

Pedido de exemplo: 1 Alcatra com acompanhamento, 2 Frango, 1 Refrigerante, 1 Suco, 1 Batata.

### Salão: Churrasqueira
```text
CONSUMO NO LOCAL
03/11/2026 19:00 · ESPETARIA SABOR DA CARNE
Pedido 137 · Mesa 12 · Garçom: Antonio
[ CHURRASQUEIRA ]
(1) Alcatra com acompanhamento
    Ponto: [ AO PONTO ]
    *** OBS: BAIÃO DE DOIS, SEM FAROFA ***
(2) Frango
```

### Salão: Cozinha
```text
CONSUMO NO LOCAL
Pedido 137 · Mesa 12 · Garçom: Antonio
[ COZINHA ]
(1) Alcatra com acompanhamento
    *** OBS: BAIÃO DE DOIS, SEM FAROFA ***
(1) Batata frita
(1) Suco de maracujá
```
Refrigerante não aparece em nenhum cupom do salão.

### Entrega: Churrasqueira (pedido inteiro)
```text
DELIVERY #50
CHURRASQUEIRA                  03/11, 19:00
(1) Alcatra com acompanhamento
  Ponto: [ AO PONTO ]
  *** OBS: BAIÃO DE DOIS, SEM FAROFA ***
(2) Frango
(1) Refrigerante lata
(1) Suco de maracujá
(1) Batata frita
Ana Souza - 99999999999
Rua das Flores, 10
Bairro: Centro
Ref: Perto da praça
DINHEIRO                          R$ 133,00
COBRAR DINHEIRO
Troco p/ R$ 150,00 (levar R$ 17,00)
```

### Entrega: Cozinha
```text
DELIVERY #50
COZINHA                        03/11, 19:00
(1) Alcatra com acompanhamento
  *** OBS: BAIÃO DE DOIS, SEM FAROFA ***
(1) Batata frita
(1) Suco de maracujá
Ana Souza - 99999999999
Rua das Flores, 10 · Bairro: Centro
DINHEIRO                          R$ 133,00
COBRAR DINHEIRO
```

### Consumir no local: parte diferente
```text
CONSUMIR NO LOCAL #50
Ana Souza - 99999999999
CONSUMIR NO LOCAL
CARTÃO NO LOCAL                   R$ 128,00
COBRAR CARTÃO NO LOCAL
```

### Retirada: parte diferente
```text
RETIRADA #50
Ana Souza - 99999999999
RETIRADA NO LOCAL
PIX                               R$ 128,00
PIX PAGO - NÃO COBRAR
```

## Pedidos sem espeto (cardápio digital)

| Pedido | Churrasqueira | Cozinha |
|---|---|---|
| Só bebida | A bebida | Nada |
| Só suco ou porção | Nada | Pedido inteiro |
| Porção + bebida | A bebida | Porção + bebida (bebida em 2 cupons) |

## Outros cupons

| Cupom | Quando sai | Onde |
|---|---|---|
| Cancelamento do salão | Item cancelado | No setor do item; bebida pronta não imprime |
| Cancelamento do cardápio | Pedido cancelado | No setor dos itens; o de bar sai na Churrasqueira |
| Conta da mesa | "Pediu a conta" ou "Imprimir conta" | Churrasqueira |
| Via do motoboy separada | Só com `PRINT_DELIVERY_SUMMARY=true` | Churrasqueira, ou Cozinha se não houver espeto |
| Via do entregador com assinatura | **Nunca**: nenhuma tela usa esse cupom | |

## Problemas que podem causar erro

1. **Acompanhamento em dobro: corrigido no programa novo.** Até atualizar o PC da loja, a Cozinha ainda recebe 2 cupons por combo.
2. **Bebida do salão não imprime.** Cerveja, refrigerante, água e drinks da mesa não saem em nenhuma impressora. A regra do banco diz que é de propósito, mas drinks preparados, como caipirinha, também ficam de fora.
3. **Nada na Cozinha diz "bebida da Churrasqueira".** No cardápio, o cupom da Churrasqueira lista batata, suco e bebida junto com os espetos, sem separar o que é de cada setor. O churrasqueiro pode achar que precisa providenciar tudo.
4. **Impressora da Cozinha sem resposta.** O último status registrado (01:03 de 03/11) dizia "inalcançável".
5. **Sem via do motoboy.** Na versão nova, a entrega depende do cupom da Churrasqueira, que é o mesmo usado para preparar.
6. **Nome do "Consumir no local" no salão.** O pedido da mesa sai como "CONSUMO NO LOCAL", e o do cardápio como "CONSUMIR NO LOCAL". Os nomes parecidos podem confundir; o número da mesa é o que diferencia.

## Versão do programa

Até atualizar o PC da loja com `Ponto-Atualizacao-Impressao.zip`:
- Consumir no local sai como "RETIRADA" com "OBS: CONSUMIR NO LOCAL".
- A entrega sai com um papel a mais, a via do motoboy.

Não consegui confirmar daqui se o PC já foi atualizado.

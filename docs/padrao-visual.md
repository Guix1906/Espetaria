# Padrão visual do Ponto (etapa 1 da repaginação, 20/11/2026)

## Botões (classes em `src/index.css`)
- `btn-primary` (terracota): a ação principal da área. Uma por cartão/janela.
- `btn-secondary` (contorno): ações comuns.
- `btn-success` (verde): só para confirmar que algo deu certo (pronto, recebido, entregue).
- `btn-danger` (vermelho cheio): só dentro de confirmação de ação perigosa.
- `btn-danger-soft` (contorno vermelho): ação perigosa em lista (esgotar, bloquear, cancelar).
- Nada de botão preto (`bg-ink text-white`) como ação.

## Opção escolhida
Forma de pagamento, nº de pessoas, ponto da carne, categoria: borda e fundo terracota claro
(`border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-600`) ou a classe `.choice` + `is-selected`.

## Abas
- Trocar o assunto da tela: `SectionTabs` (`src/components/ui/SectionTabs.tsx`), sublinhado terracota.
- Filtrar uma lista: `FilterChip` (contorno discreto; o escolhido em terracota claro).
- No máximo uma fileira de cada por tela.

## Etiquetas
`status-badge` / `StatusTag` sem borda e sem cantos arredondados de pílula. Não mostrar etiqueta
para o estado normal (ex.: "Disponível"); só para o que pede atenção.

## Cores
Terracota = ação; verde = deu certo; amarelo = atenção; vermelho = erro ou perigo. Mesa livre é neutra,
mesa ocupada é a que tem destaque.

## Texto
Letra mínima 12 px (`text-xs`). Só a primeira palavra com maiúscula ("Encerrar turno", não "Encerrar Turno").

## Janelas
`WaiterSheet` mostra a alça de arrastar só no celular; no computador fecha pelo X ou Cancelar.

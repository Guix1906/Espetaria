type RequestChoice = (options: {
  title: string;
  message: string;
  choices: { value: string; label: string; description?: string }[];
}) => Promise<string | null>;

/**
 * Espetos entram direto "Na brasa". No cancelamento, quem cancela diz se ainda
 * dá para devolver ao estoque (não foi para o fogo) ou se vira perda.
 * Retorna true (devolver), false (perda) ou null (desistiu de cancelar).
 */
export async function askReturnToStock(requestChoice: RequestChoice, what: string): Promise<boolean | null> {
  const answer = await requestChoice({
    title: 'O que fazer com o estoque?',
    message: `Na brasa: ${what}. O espeto entra no fogo assim que o pedido é enviado.`,
    choices: [
      { value: 'return', label: 'Ainda não foi pro fogo', description: 'Devolve ao estoque para vender de novo.' },
      { value: 'loss', label: 'Já estava no fogo', description: 'Conta como perda no estoque do dia.' },
    ],
  });
  if (answer === null) return null;
  return answer === 'return';
}

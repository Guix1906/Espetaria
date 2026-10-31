/**
 * Emite uma vibração suave no aparelho celular (haptic feedback).
 * Dá confirmação física ao garçom no salão barulhento ao adicionar/remover itens.
 */
export function triggerHaptic(durationMs = 30) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(durationMs);
    }
  } catch {}
}

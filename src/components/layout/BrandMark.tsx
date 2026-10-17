/**
 * Logo "p●nto" (MARCA.md, opção 2a): Jost 600, minúsculas, o "o" é o símbolo de alvo.
 * inverted: versão terracota clara sobre tinta (menu lateral escuro).
 */
export function PontoSymbol({ className = 'h-6 w-6', color = '#B5502E' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="17" fill="none" stroke={color} strokeWidth="7" />
      <circle cx="24" cy="24" r="6" fill={color} />
    </svg>
  );
}

export function PontoLogo({ size = 28, inverted = false }: { size?: number; inverted?: boolean }) {
  const accent = inverted ? '#E08A63' : '#B5502E';
  return (
    <span
      className={`inline-flex items-center font-semibold leading-none ${inverted ? 'text-[#F5EFE6]' : 'text-[#B5502E]'}`}
      style={{ fontFamily: 'Jost, sans-serif', letterSpacing: '-0.04em', fontSize: size }}
      role="img"
      aria-label="Ponto"
    >
      p<PontoSymbol className="mx-[0.02em] h-[0.66em] w-[0.66em] translate-y-[0.07em]" color={accent} />nto
    </span>
  );
}

export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return <PontoLogo size={30} inverted={inverted} />;
}

import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, ShieldCheck, UserRound } from 'lucide-react';
import { PontoLogo, PontoSymbol } from '../../components/layout/BrandMark';
import { useSettingsStore } from '../../stores/useSettingsStore';

/**
 * Moldura das telas de acesso (layout "2d" da marca Ponto):
 * painel terracota com logo e slogan à esquerda, formulário à direita.
 * No celular o painel vira uma faixa fina só com o logo, para o formulário
 * caber na tela mesmo com o teclado aberto.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  // Nome da loja vem de restaurant_settings (sem valor fixo no código)
  const storeLabel = useSettingsStore((s) => s.settings.name);
  return (
    <div className="flex min-h-[100dvh] items-stretch justify-center bg-[#EFE7DB] lg:items-center lg:p-10">
      <div className="flex w-full flex-col overflow-hidden bg-white lg:min-h-[600px] lg:max-w-[1040px] lg:flex-row lg:rounded-[20px] lg:shadow-[0_30px_80px_-30px_rgba(43,33,28,0.35)]">
        <aside className="relative flex shrink-0 flex-col justify-end gap-3 overflow-hidden bg-[#B5502E] px-5 py-4 text-[#F5EFE6] lg:w-[44%] lg:gap-4 lg:p-12" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          {/* Alvo da marca em grande escala, como textura do painel */}
          <PontoSymbol className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 opacity-[0.1] lg:-right-32 lg:-top-20 lg:h-[560px] lg:w-[560px] lg:opacity-[0.09]" color="#F5EFE6" />
          <span className="relative hidden text-sm text-[#FBE9DF]/80 lg:absolute lg:left-12 lg:top-12 lg:block">{storeLabel}</span>
          <div className="relative">
            <span className="lg:hidden"><PontoLogo size={30} inverted /></span>
            <span className="hidden lg:inline"><PontoLogo size={64} inverted /></span>
          </div>
          <p className="relative hidden max-w-xs text-xl leading-snug text-[#FBE9DF] lg:block">Seu restaurante sempre no ponto.</p>
          <div className="relative mt-2 hidden h-px w-16 bg-[#F5EFE6]/40 lg:block" aria-hidden="true" />
          <p className="relative hidden text-sm text-[#FBE9DF]/80 lg:block">Salão, churrasqueira, cozinha e delivery em um só lugar.</p>
        </aside>
        <main className="flex flex-1 flex-col justify-start bg-white px-5 py-6 sm:px-12 sm:py-10 lg:justify-center lg:px-[72px]">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Abas Proprietário / Garçom. As duas telas usam a mesma moldura,
 * então trocar de aba só troca o formulário.
 */
export function AccessTabs({ active }: { active: 'owner' | 'waiter' }) {
  const base = 'flex h-10 items-center justify-center gap-2 rounded-[8px] text-sm font-medium transition-colors';
  const on = `${base} bg-white text-[#2B211C] shadow-[0_1px_2px_rgba(43,33,28,0.08)]`;
  const off = `${base} text-[#6B5D53] hover:text-[#2B211C]`;
  return (
    <div role="tablist" aria-label="Tipo de acesso" className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#F5EFE6] p-1">
      <a role="tab" aria-selected={active === 'owner'} href="#/" className={active === 'owner' ? on : off}><ShieldCheck className={`h-4 w-4 ${active === 'owner' ? 'text-[#B5502E]' : ''}`} aria-hidden="true" />Proprietário</a>
      <a role="tab" aria-selected={active === 'waiter'} href="#/garcom" className={active === 'waiter' ? on : off}><UserRound className={`h-4 w-4 ${active === 'waiter' ? 'text-[#B5502E]' : ''}`} aria-hidden="true" />Garçom</a>
    </div>
  );
}

/** Senha com botão de mostrar/ocultar. */
export function PasswordField({ id, value, onChange, autoComplete = 'current-password', minLength }: { id: string; value: string; onChange: (value: string) => void; autoComplete?: string; minLength?: number }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} className={`${authInput} pr-12 ${visible ? '' : 'tracking-[0.08em]'}`} type={visible ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} required value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-1 top-[calc(50%+3px)] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[8px] text-[#6B5D53] hover:text-[#2B211C]" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>
        {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Ajuda para quem esqueceu a senha (as contas são criadas pela gerência). */
export function ForgotPassword() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button type="button" className="!min-h-0 !min-w-0 text-[#8E3C20] underline-offset-2 hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Esqueci minha senha</button>
      {open && <p className="mt-2 rounded-[10px] bg-[#F5EFE6] px-3.5 py-3 text-[#6B5D53]">Peça ao gerente ou ao proprietário para definir uma nova senha em <strong className="font-medium text-[#2B211C]">Equipe → Editar</strong>.</p>}
    </div>
  );
}

const EMAIL_KEY = 'ponto_ultimo_email';
/** E-mail lembrado neste aparelho (só conveniência; falha silenciosa sem armazenamento). */
export function rememberedEmail(kind: 'owner' | 'waiter' | 'waiter-login'): string {
  try { return localStorage.getItem(`${EMAIL_KEY}_${kind}`) ?? ''; } catch { return ''; }
}
export function rememberEmail(kind: 'owner' | 'waiter' | 'waiter-login', email: string) {
  try { localStorage.setItem(`${EMAIL_KEY}_${kind}`, email.trim()); } catch { /* sem armazenamento */ }
}

/** Mensagens técnicas do login em português claro. */
export function friendlyAuthError(failure: unknown, fallback = 'Não foi possível entrar.'): string {
  const message = failure instanceof Error ? failure.message : '';
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('invalid_grant')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado. Fale com a gerência.';
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Sem conexão com a internet. Verifique o Wi-Fi e tente de novo.';
  if (m.includes('too many') || m.includes('rate limit')) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  if (m.includes('banned') || m.includes('disabled') || m.includes('inativ')) return 'Este acesso está desativado. Fale com a gerência.';
  return message || fallback;
}

/** Campo no estilo da marca: rótulo discreto, borda clara, foco em terracota. */
export const authInput =
  'mt-1.5 h-12 w-full rounded-[10px] border border-[#E4DACB] bg-white px-3.5 text-base text-[#2B211C] outline-none transition-[border-color,box-shadow] focus:border-[#B5502E] focus:shadow-[0_0_0_1px_#B5502E]';
export const authLabel = 'text-sm text-[#6B5D53]';
export const authButton =
  'flex h-[52px] w-full items-center justify-center rounded-[10px] bg-[#2B211C] text-[17px] font-medium text-[#F5EFE6] transition-colors hover:bg-[#B5502E] disabled:opacity-60';
export const authError = 'rounded-[10px] bg-[#F8ECEC] px-3.5 py-3 text-sm text-[#9B2C2C]';

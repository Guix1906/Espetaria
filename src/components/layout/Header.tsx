import { PontoLogo } from './BrandMark';
import { CalendarDays, Check, ChevronDown, Clock3, LogOut, Menu, Smartphone, UserRound, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { audioService } from '../../lib/audio';
import { formatRole } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { BrandMark } from './BrandMark';
import { PAGE_TITLES, type ActiveTab } from './navigation';

interface HeaderProps {
  activeTab: ActiveTab;
  onOpenShiftClick: () => void;
  onMenuClick: () => void;
  isMenuOpen: boolean;
}

export function Header({ activeTab, onOpenShiftClick, onMenuClick, isMenuOpen }: HeaderProps) {
  const { currentProfile, availableProfiles, switchProfile, canSwitchProfile, signOut } = useAuthStore();
  const { currentShift } = useShiftStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => audioService.getAudioEnabled());
  const headerRef = useRef<HTMLElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileId = useId();
  const isManager = currentProfile.role === 'MASTER' || currentProfile.role === 'GERENTE';
  const toggleAudio = () => { const next = !isAudioEnabled; audioService.setAudioEnabled(next); setIsAudioEnabled(next); if (next) audioService.playNewOrderSound(); };

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!roleDropdownOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !profileRef.current?.contains(event.target)) setRoleDropdownOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setRoleDropdownOpen(false); profileButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [roleDropdownOpen]);

  return (
    <header ref={headerRef} className="app-header">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 sm:h-auto sm:flex-wrap sm:py-3 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label="Abrir menu de navegação" aria-expanded={isMenuOpen} onClick={onMenuClick} className="icon-button lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="hidden xs:block lg:hidden"><BrandMark /></div>
          <div className="flex items-center gap-2 xs:hidden"><div><PontoLogo size={20} /><p className="text-xs text-ink-muted">{PAGE_TITLES[activeTab]}</p></div></div>
          <div className="hidden lg:block">
            <div className="flex items-center gap-2 text-sm"><span className="text-ink-muted">Espetaria</span><span className="text-ink-muted" aria-hidden="true">/</span><span className="font-semibold text-ink">{PAGE_TITLES[activeTab]}</span></div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {currentShift?.status === 'ABERTO' ? (
            <div className="status-badge max-w-full bg-emerald-50 py-2 text-emerald-800" title={currentShift.name}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
              <span className="max-w-[170px] truncate">Turno aberto</span>
            </div>
          ) : null}
          {isManager && (
            <a href="#/garcom" className="btn-secondary min-h-[44px]" title="Ver e usar a tela do garçom com o seu login">
              <Smartphone className="h-4 w-4" aria-hidden="true" />Área do garçom
            </a>
          )}
          {currentShift?.status === 'ABERTO' ? null : isManager ? (
            <button type="button" onClick={onOpenShiftClick} className="btn-primary min-h-[44px]"><Clock3 className="h-4 w-4" aria-hidden="true" />Abrir turno</button>
          ) : (
            <span className="status-badge bg-amber-50 py-2 text-amber-800">Turno fechado</span>
          )}
          <button
            type="button"
            aria-label={isAudioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'}
            aria-pressed={isAudioEnabled}
            title={isAudioEnabled ? 'Alertas sonoros ativados' : 'Alertas sonoros desativados'}
            onClick={toggleAudio}
            className={`icon-button h-11 w-11 ${isAudioEnabled ? 'bg-brand-50 text-brand-700' : ''}`}
          >
            {isAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
        <div ref={profileRef} className="relative shrink-0">
          <button ref={profileButtonRef} type="button" aria-label={`Perfil: ${currentProfile.name}. Trocar perfil operacional`} aria-expanded={roleDropdownOpen} aria-controls={profileId} onClick={() => setRoleDropdownOpen(!roleDropdownOpen)} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-1.5 pr-2.5 text-left hover:bg-surface-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-brand-50 text-brand-800"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
            <span className="hidden xl:block"><span className="block text-sm font-semibold text-ink">{currentProfile.name.split(' ')[0]}</span><span className="block text-xs text-ink-muted">{formatRole(currentProfile.role)}</span></span>
            <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          </button>
          {roleDropdownOpen && (
            <div id={profileId} className="absolute right-0 z-50 mt-3 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-floating">
              <div className="space-y-1 border-b border-line p-2 sm:hidden">
                <p className="px-1 py-1 text-[13px] text-ink-muted">{currentShift?.status === 'ABERTO' ? `Turno aberto · ${currentShift.name}` : 'Turno fechado'}</p>
                {currentShift?.status !== 'ABERTO' && isManager && <button type="button" onClick={() => { setRoleDropdownOpen(false); onOpenShiftClick(); }} className="btn-primary min-h-[44px] w-full"><Clock3 className="h-4 w-4" aria-hidden="true" />Abrir turno</button>}
                <button type="button" aria-pressed={isAudioEnabled} onClick={toggleAudio} className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-ink hover:bg-surface-muted">{isAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{isAudioEnabled ? 'Som ligado' : 'Som desligado'}</button>
                {isManager && <a href="#/garcom" className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-ink hover:bg-surface-muted"><Smartphone className="h-4 w-4" aria-hidden="true" />Área do garçom</a>}
              </div>
              <p className="border-b border-line px-3 py-3 text-[13px] font-semibold text-ink-muted">{canSwitchProfile ? 'Perfil operacional (demonstração)' : 'Sessão'}</p>
              {!canSwitchProfile && (
                <div className="space-y-2 p-3">
                  <p className="text-sm font-semibold">{currentProfile.name}</p>
                  <p className="text-xs text-ink-muted">{currentProfile.email} · {formatRole(currentProfile.role)}</p>
                  <button type="button" className="btn-secondary w-full" onClick={() => { setRoleDropdownOpen(false); void signOut(); }}><LogOut className="h-4 w-4" aria-hidden="true" />Sair</button>
                </div>
              )}
              <div className="max-h-[60dvh] space-y-1 overflow-y-auto pt-2">
                {canSwitchProfile && availableProfiles.map((profile) => (
                  <button key={profile.id} type="button" aria-pressed={profile.id === currentProfile.id} onClick={() => { switchProfile(profile.role); setRoleDropdownOpen(false); }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${profile.id === currentProfile.id ? 'bg-brand-50 text-brand-800' : 'text-ink-secondary hover:bg-surface-muted'}`}>
                    <span><span className="block text-sm font-semibold">{profile.name}</span><span className="block text-xs text-ink-muted">{formatRole(profile.role)}</span></span>
                    {profile.id === currentProfile.id && <Check className="h-4 w-4" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {!isOnline && <div className="flex items-center justify-center gap-2 bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white" role="alert"><WifiOff className="h-4 w-4" aria-hidden="true" />Sem conexão</div>}
    </header>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, Menu, UserRound, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { audioService } from '../../lib/audio';
import { formatRole } from '../../lib/formatters';
import { BrandMark } from './BrandMark';
import { PAGE_TITLES, type ActiveTab } from './navigation';

interface HeaderProps {
  activeTab: ActiveTab;
  onOpenShiftClick: () => void;
  onMenuClick: () => void;
  isMenuOpen: boolean;
}

export function Header({ activeTab, onOpenShiftClick, onMenuClick, isMenuOpen }: HeaderProps) {
  const { currentProfile, availableProfiles, switchProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => audioService.getAudioEnabled());
  const headerRef = useRef<HTMLElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileId = useId();

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
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" aria-label="Abrir menu de navegação" aria-expanded={isMenuOpen} onClick={onMenuClick} className="icon-button lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="hidden xs:block lg:hidden"><BrandMark /></div>
          <div className="xs:hidden"><p className="text-sm font-bold text-brand-950">Sabor da Carne</p><p className="text-xs text-ink-muted">{PAGE_TITLES[activeTab]}</p></div>
          <div className="hidden lg:block">
            <div className="flex items-center gap-2 text-sm"><span className="text-ink-muted">Espetaria</span><span className="text-line-strong" aria-hidden="true">/</span><span className="font-semibold text-ink">{PAGE_TITLES[activeTab]}</span></div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>
          </div>
        </div>

        <div className="order-3 flex w-full flex-wrap items-center gap-2 border-t border-line pt-3 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
          {currentShift?.status === 'ABERTO' ? (
            <div className="status-badge max-w-full border-emerald-200 bg-emerald-50 py-2 text-emerald-800" title={currentShift.name}>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
              <span className="max-w-[170px] truncate">Turno aberto</span>
            </div>
          ) : (
            <button type="button" onClick={onOpenShiftClick} className="btn-primary"><Clock3 className="h-4 w-4" aria-hidden="true" />Abrir turno</button>
          )}
          <button
            type="button"
            aria-label={isAudioEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'}
            aria-pressed={isAudioEnabled}
            title={isAudioEnabled ? 'Alertas sonoros ativados' : 'Alertas sonoros desativados'}
            onClick={() => { const next = !isAudioEnabled; audioService.setAudioEnabled(next); setIsAudioEnabled(next); if (next) audioService.playNewOrderSound(); }}
            className={`icon-button ${isAudioEnabled ? 'border-brand-200 bg-brand-50 text-brand-700' : ''}`}
          >
            {isAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <div className={`flex items-center gap-1.5 px-1 text-xs font-medium ${isOnline ? 'text-ink-muted' : 'text-rose-700'}`} role="status">
            {isOnline ? <Wifi className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
            <span>{isOnline ? 'On-line' : 'Sem conexão'}</span>
          </div>
        </div>

        <div ref={profileRef} className="relative shrink-0">
          <button ref={profileButtonRef} type="button" aria-label={`Perfil: ${currentProfile.name}. Trocar perfil operacional`} aria-expanded={roleDropdownOpen} aria-controls={profileId} onClick={() => setRoleDropdownOpen(!roleDropdownOpen)} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-1.5 pr-2.5 text-left hover:bg-surface-soft">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-800"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
            <span className="hidden xl:block"><span className="block text-sm font-semibold text-ink">{currentProfile.name.split(' ')[0]}</span><span className="block text-xs text-ink-muted">{formatRole(currentProfile.role)}</span></span>
            <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          </button>
          {roleDropdownOpen && (
            <div id={profileId} className="absolute right-0 z-50 mt-3 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-floating">
              <p className="border-b border-line px-3 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Perfil operacional</p>
              <div className="max-h-[60dvh] space-y-1 overflow-y-auto pt-2">
                {availableProfiles.map((profile) => (
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
    </header>
  );
}

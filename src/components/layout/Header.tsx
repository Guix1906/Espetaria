import React, { useState, useEffect } from 'react';
import { Flame, Wifi, WifiOff, User, Clock3, ChevronDown, Check, Volume2, VolumeX } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { audioService } from '../../lib/audio';
import { formatRole } from '../../lib/formatters';
import { AppRole } from '../../types/enums';

interface HeaderProps { onOpenShiftClick: () => void; }

export const Header: React.FC<HeaderProps> = ({ onOpenShiftClick }) => {
  const { currentProfile, availableProfiles, switchProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(() => audioService.getAudioEnabled());

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#090a0f]/90 backdrop-blur-2xl px-3 sm:px-6 py-2.5">
      <div className="mx-auto flex max-w-[1520px] items-center justify-between gap-3">
        
        {/* Brand Emblem & Casa */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-orange-600 via-amber-600 to-orange-500 text-white shadow-lg shadow-orange-500/25 ring-1 ring-white/20">
            <Flame className="h-5 w-5" strokeWidth={2.2} />
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#090a0f] bg-emerald-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base sm:text-lg font-black tracking-tight text-white font-brand">
                Sabor da Carne
              </h1>
              <span className="hidden sm:inline-flex items-center rounded-md bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-orange-400">
                ESPETARIA
              </span>
            </div>
            <p className="truncate text-[11px] text-stone-400 flex items-center gap-1.5">
              <span>Operação em Tempo Real</span>
              <span className="text-stone-600">•</span>
              <span className="text-amber-400 font-medium">Salão & Delivery</span>
            </p>
          </div>
        </div>

        {/* Turno, Som e Status de Rede */}
        <div className="hidden items-center gap-2 md:flex">
          {currentShift?.status === 'ABERTO' ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-300 shadow-sm shadow-emerald-950/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{currentShift.name}</span>
            </div>
          ) : (
            <button 
              onClick={onOpenShiftClick} 
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-1.5 text-xs font-black text-white shadow-md shadow-orange-500/20 hover:brightness-110 active:scale-95 transition"
            >
              <Clock3 className="h-3.5 w-3.5" /> Abrir Turno
            </button>
          )}

          <button 
            onClick={() => { 
              const next = !isAudioEnabled; 
              audioService.setAudioEnabled(next); 
              setIsAudioEnabled(next); 
              if (next) audioService.playNewOrderSound(); 
            }} 
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
              isAudioEnabled 
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' 
                : 'border-white/10 bg-white/5 text-stone-400 hover:text-white'
            }`}
          >
            {isAudioEnabled ? <Volume2 className="h-3.5 w-3.5 text-amber-400" /> : <VolumeX className="h-3.5 w-3.5" />} 
            <span>{isAudioEnabled ? 'Bip Ativo' : 'Mudo'}</span>
          </button>

          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
            isOnline 
              ? 'border-white/10 bg-white/5 text-stone-300' 
              : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
          }`}>
            {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-rose-400" />} 
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {/* Perfil Operacional Switcher */}
        <div className="relative shrink-0">
          <button 
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)} 
            className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#14151f] px-3 py-1.5 text-left hover:border-orange-500/40 transition active:scale-95 shadow-sm"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 text-orange-400 border border-orange-500/20">
              <User className="h-4 w-4" />
            </div>
            <div className="hidden min-w-0 md:block">
              <div className="text-xs font-bold text-white leading-tight">
                {currentProfile.name.split(' ')[0]}
              </div>
              <div className="text-[10px] text-stone-400 font-medium">
                {formatRole(currentProfile.role)}
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/15 bg-[#14151f] p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500 border-b border-white/5">
                Trocar Perfil Operacional
              </div>
              <div className="py-1 space-y-0.5">
                {availableProfiles.map((p) => {
                  const isSelected = p.role === currentProfile.role;
                  return (
                    <button 
                      key={p.id} 
                      onClick={() => { 
                        switchProfile(p.role as AppRole); 
                        setRoleDropdownOpen(false); 
                      }} 
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                        isSelected 
                          ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/10 text-orange-300 border border-orange-500/30' 
                          : 'text-stone-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold">{p.name}</div>
                        <div className="text-[10px] text-stone-400">{formatRole(p.role as AppRole)}</div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-orange-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {!isOnline && (
        <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300 md:hidden">
          <WifiOff className="h-3.5 w-3.5" /> Sem conexão com a internet
        </div>
      )}
    </header>
  );
};

import React, { useState, useEffect } from 'react';
import { Flame, Wifi, WifiOff, User, Clock, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { formatRole } from '../../lib/formatters';
import { AppRole } from '../../types/enums';

interface HeaderProps {
  onOpenShiftClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenShiftClick }) => {
  const { currentProfile, availableProfiles, switchProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 py-2.5 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        
        {/* Marca & Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-rose-600 to-red-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
            <Flame className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-1.5">
              Sabor da Carne
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-mono">
                ESPETARIA
              </span>
            </h1>
            <p className="text-xs text-slate-400 hidden xs:block">
              Gestão Integrada & Tempo Real
            </p>
          </div>
        </div>

        {/* Status do Turno & Indicadores Centrais */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentShift && currentShift.status === 'ABERTO' ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs sm:text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="truncate max-w-[120px] sm:max-w-none">{currentShift.name}</span>
            </div>
          ) : (
            <button
              onClick={onOpenShiftClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-semibold transition active:scale-95 shadow-md shadow-amber-950/50"
            >
              <Clock className="w-4 h-4" />
              <span>Abrir Turno da Noite</span>
            </button>
          )}

          {/* Status de Conexão */}
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
            isOnline 
              ? 'bg-slate-800/80 border-slate-700 text-slate-300' 
              : 'bg-rose-950/80 border-rose-700 text-rose-300 animate-bounce'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span className="font-bold">SEM CONEXÃO</span>
              </>
            )}
          </div>
        </div>

        {/* Seletor Rápido de Perfil / Role */}
        <div className="relative">
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition text-xs sm:text-sm active:scale-95"
            title="Trocar perfil operacional"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-600/30 text-rose-400 flex items-center justify-center font-bold">
              <User className="w-4 h-4" />
            </div>
            <div className="text-left hidden md:block">
              <div className="font-semibold leading-tight text-white">{currentProfile.name.split(' ')[0]}</div>
              <div className="text-[11px] text-slate-400 leading-tight">{formatRole(currentProfile.role)}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {/* Dropdown de Roles */}
          {roleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
              <div className="px-3 py-1.5 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Simular Perfil Operacional
              </div>
              {availableProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    switchProfile(p.role as AppRole);
                    setRoleDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs sm:text-sm flex items-center justify-between hover:bg-slate-800 transition ${
                    p.role === currentProfile.role ? 'text-rose-400 font-semibold bg-rose-950/20' : 'text-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-white font-medium">{p.name}</div>
                    <div className="text-[11px] text-slate-400">{formatRole(p.role as AppRole)}</div>
                  </div>
                  {p.role === currentProfile.role && <CheckCircle2 className="w-4 h-4 text-rose-500" />}
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Banner de Aviso Sem Conexão se offline */}
      {!isOnline && (
        <div className="sm:hidden mt-2 bg-rose-950 border border-rose-700 px-3 py-1.5 rounded-lg text-rose-300 text-xs font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 text-rose-400" />
          <span>SEM CONEXÃO COM A INTERNET</span>
        </div>
      )}
    </header>
  );
};

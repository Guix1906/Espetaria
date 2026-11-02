import { useWhatsAppStatus } from '../../features/whatsapp/useWhatsAppStatus';
import { useWhatsAppConversations } from '../../features/whatsapp/useWhatsAppConversations';
import { PontoLogo } from './BrandMark';

interface TopTabsProps {
  whatsappActive: boolean;
  canUseWhatsApp: boolean;
  onSystem: () => void;
  onWhatsApp: () => void;
  /** Só no programa do PC: WhatsApp Web completo dentro da aba. */
  desktopWeb?: { active: boolean; onOpen: () => void };
}

const tabClass = (active: boolean) => `flex h-9 items-center gap-2 rounded-t-lg px-4 text-sm font-medium ${active ? 'bg-canvas text-ink' : 'text-stone-300 hover:text-white'}`;

function WhatsAppTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { status } = useWhatsAppStatus(true);
  const { unreadCount } = useWhatsAppConversations(true);
  const disconnected = status && !status.connected;
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={`${label}${disconnected ? ' desconectado' : ''}${unreadCount ? `, ${unreadCount} não lidas` : ''}`} className={tabClass(active)}>
      {label}
      {disconnected && <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />}
      {!disconnected && unreadCount > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white" aria-hidden="true">{unreadCount}</span>}
    </button>
  );
}

/** Faixa do topo: alterna entre o sistema e o WhatsApp da loja. */
export function TopTabs({ whatsappActive, canUseWhatsApp, onSystem, onWhatsApp, desktopWeb }: TopTabsProps) {
  const webActive = !!desktopWeb?.active;
  const systemActive = !whatsappActive && !webActive;
  return (
    <nav aria-label="Áreas do sistema" className="app-topbar">
      <div className="px-2 pb-2 lg:pr-4 [&_*]:!text-white"><PontoLogo size={20} /></div>
      <button type="button" onClick={onSystem} aria-current={systemActive ? 'page' : undefined} className={tabClass(systemActive)}>Sistema</button>
      {canUseWhatsApp && desktopWeb && <button type="button" onClick={desktopWeb.onOpen} aria-current={webActive ? 'page' : undefined} className={tabClass(webActive)}>WhatsApp</button>}
      {canUseWhatsApp && !desktopWeb && <WhatsAppTab label="WhatsApp" active={whatsappActive} onClick={onWhatsApp} />}
    </nav>
  );
}

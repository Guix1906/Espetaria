import { useWhatsAppStatus } from '../../features/whatsapp/useWhatsAppStatus';
import { useWhatsAppConversations } from '../../features/whatsapp/useWhatsAppConversations';
import { PontoLogo } from './BrandMark';

interface TopTabsProps {
  whatsappActive: boolean;
  canUseWhatsApp: boolean;
  onSystem: () => void;
  onWhatsApp: () => void;
}

const tabClass = (active: boolean) => `flex h-9 items-center gap-2 rounded-t-lg px-4 text-sm font-medium ${active ? 'bg-canvas text-ink' : 'text-stone-300 hover:text-white'}`;

function WhatsAppTab({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { status } = useWhatsAppStatus(true);
  const { unreadCount } = useWhatsAppConversations(true);
  const disconnected = status && !status.connected;
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={`WhatsApp${disconnected ? ' desconectado' : ''}${unreadCount ? `, ${unreadCount} não lidas` : ''}`} className={tabClass(active)}>
      WhatsApp
      {disconnected && <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden="true" />}
      {!disconnected && unreadCount > 0 && <span className="rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white" aria-hidden="true">{unreadCount}</span>}
    </button>
  );
}

/** Faixa do topo: alterna entre o sistema e o WhatsApp da loja. */
export function TopTabs({ whatsappActive, canUseWhatsApp, onSystem, onWhatsApp }: TopTabsProps) {
  return (
    <nav aria-label="Áreas do sistema" className="app-topbar">
      <div className="px-2 pb-2 lg:pr-4 [&_*]:!text-white"><PontoLogo size={20} /></div>
      <button type="button" onClick={onSystem} aria-current={whatsappActive ? undefined : 'page'} className={tabClass(!whatsappActive)}>Sistema</button>
      {canUseWhatsApp && <WhatsAppTab active={whatsappActive} onClick={onWhatsApp} />}
    </nav>
  );
}

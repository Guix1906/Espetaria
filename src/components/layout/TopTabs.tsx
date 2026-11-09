import { PontoLogo } from './BrandMark';

interface TopTabsProps {
  onSystem: () => void;
}

const tabClass = (active: boolean) => `flex h-9 items-center gap-2 rounded-t-lg px-4 text-sm font-medium ${active ? 'bg-canvas text-ink' : 'text-stone-300 hover:text-white'}`;

/** Faixa do topo: exibe a marca e área principal do sistema. */
export function TopTabs({ onSystem }: TopTabsProps) {
  return (
    <nav aria-label="Áreas do sistema" className="app-topbar">
      <div className="px-2 pb-2 lg:pr-4 [&_*]:!text-white"><PontoLogo size={20} /></div>
      <button type="button" onClick={onSystem} aria-current="page" className={tabClass(true)}>Sistema</button>
    </nav>
  );
}

/**
 * Endereço oficial do site (QR Code do cardápio, links de WhatsApp).
 * Vem de VITE_PUBLIC_APP_URL (cadastrada na Vercel); sem ela usa o endereço aberto no navegador.
 */
export function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim().replace(/\/$/, '');
  return configured || window.location.origin;
}

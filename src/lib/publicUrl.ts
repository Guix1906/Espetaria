/**
 * Endereço oficial do site (QR Code do cardápio, links de WhatsApp).
 * Vem de VITE_PUBLIC_APP_URL (cadastrada na Vercel); sem ela usa o endereço aberto no navegador.
 */
export function publicAppUrl(): string {
  // Pega só o endereço: a variável já foi gravada com BOM invisível ("ï»¿") antes do https, o que quebrava o link no WhatsApp
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.match(/https?:\/\/[^\s]+/)?.[0].replace(/\/$/, '');
  return configured || window.location.origin;
}

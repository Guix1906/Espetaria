/**
 * Otimiza URLs de imagens para miniaturas de alta performance no celular.
 * Se a imagem for do Pexels ou serviço similar que suporta redimensionamento via query params,
 * substitui por resolução e qualidade exatas para o tamanho exibido (ex.: 112x112 ~4KB em vez de 600x600 ~50KB).
 */
export function optimizeThumbnailUrl(url: string | null | undefined, size = 112): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Pexels CDN: reduz de 600x600 (~50KB) para 112x112 (~4KB)
  if (trimmed.includes('images.pexels.com')) {
    let opt = trimmed.replace(/w=\d+/, `w=${size}`).replace(/h=\d+/, `h=${size}`);
    if (!opt.includes('auto=compress')) opt += '&auto=compress';
    if (!opt.includes('cs=tinysrgb')) opt += '&cs=tinysrgb';
    return opt;
  }

  // Unsplash CDN
  if (trimmed.includes('images.unsplash.com')) {
    let opt = trimmed.replace(/w=\d+/, `w=${size}`).replace(/h=\d+/, `h=${size}`);
    if (!opt.includes('q=')) opt += '&q=75';
    if (!opt.includes('auto=format')) opt += '&auto=format';
    return opt;
  }

  return trimmed;
}

/**
 * Foto no tamanho certo para o cardápio: fotos da loja usam a versão leve (scripts/optimize-photos.mjs);
 * Pexels redimensiona pelo endereço. Qualquer outro link segue como está.
 */
export function menuPhotoUrl(url: string | null | undefined, variant: 'm' | 's'): string {
  const trimmed = url?.trim() ?? '';
  const own = trimmed.match(/^(.*\/produtos)\/([^/?#]+)\.(?:jpe?g|png|webp)$/i);
  if (own) return `${own[1]}/${variant}/${own[2]}.webp`;
  if (trimmed.includes('images.pexels.com')) {
    const [width, height] = variant === 'm' ? [720, 405] : [240, 240];
    const base = trimmed.replace(/[?&](w|h|fit|auto|cs|dpr)=[^&]*/g, '').replace(/[?&]$/, '');
    return `${base}${base.includes('?') ? '&' : '?'}auto=compress&cs=tinysrgb&fit=crop&w=${width}&h=${height}`;
  }
  return trimmed;
}

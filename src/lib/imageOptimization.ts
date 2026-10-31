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

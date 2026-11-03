/** Abertura do cardápio: já com a cara final, enquanto os dados chegam. */
export function MenuSplash() {
  return (
    <div role="status" aria-label="Carregando cardápio" style={{ minHeight: '100vh', background: '#17120f', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
      <img src="/brand/logo-sabor-da-carne-288.webp" alt="" width={128} height={128} style={{ borderRadius: '50%', border: '2px solid #e8b64a' }} />
    </div>
  );
}

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../../lib/logger';

interface Props {
  children: ReactNode;
  /** Nome da área (aparece no registro de erros). */
  area?: string;
  /** Mostra a versão compacta (dentro de uma tela) em vez da página inteira. */
  inline?: boolean;
}

interface State { error: Error | null }

/**
 * Se uma tela quebrar por um erro inesperado, mostra um aviso com botão para
 * tentar de novo, em vez de deixar o sistema inteiro em branco.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error({ context: 'ErrorBoundary', message: `Erro na tela ${this.props.area ?? 'principal'}`, error, data: { stack: info.componentStack } });
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const box = (
      <div className="surface-card p-4 sm:p-5 mx-auto max-w-md space-y-3 text-center" role="alert">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-rose-50 text-rose-700"><AlertCircle className="h-6 w-6" aria-hidden="true" /></span>
        <h2 className="text-lg font-bold text-ink">Esta tela teve um problema</h2>
        <p className="text-sm text-ink-muted">Nenhum dado foi perdido. Tente abrir de novo. Se continuar, recarregue a página.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-primary" onClick={this.retry}><RotateCcw className="h-4 w-4" aria-hidden="true" />Tentar de novo</button>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>Recarregar página</button>
        </div>
      </div>
    );
    return this.props.inline ? <div className="p-6">{box}</div> : <div className="flex min-h-screen items-center justify-center bg-canvas p-4">{box}</div>;
  }
}

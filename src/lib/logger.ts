// Standardized Structured Logger for Espetaria Sabor da Carne
// Avoids random console.log in production and prepares for observability pipelines

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: unknown;
}

class Logger {
  private isDev = import.meta.env.DEV;

  private formatMessage(level: LogLevel, payload: LogPayload): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]${payload.context ? ` [${payload.context}]` : ''}`;
    return `${prefix} ${payload.message}`;
  }

  debug(payload: LogPayload): void {
    if (this.isDev) {
      console.debug(this.formatMessage('debug', payload), payload.data || '');
    }
  }

  info(payload: LogPayload): void {
    console.info(this.formatMessage('info', payload), payload.data || '');
  }

  warn(payload: LogPayload): void {
    console.warn(this.formatMessage('warn', payload), payload.data || '');
  }

  error(payload: LogPayload): void {
    console.error(
      this.formatMessage('error', payload),
      payload.data || '',
      payload.error || ''
    );
  }
}

export const logger = new Logger();

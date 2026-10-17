import { logger } from './logger';

class AudioService {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = false;

  constructor() {
    // Carrega preferência do usuário salva no navegador
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('espetaria_audio_enabled');
      this.isEnabled = saved === 'true';
    }
  }

  public getAudioEnabled(): boolean {
    return this.isEnabled;
  }

  public setAudioEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('espetaria_audio_enabled', String(enabled));
    }
    if (enabled && !this.ctx) {
      this.initContext();
    }
  }

  private initContext(): AudioContext | null {
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch (err) {
      logger.warn({ context: 'AudioService', message: 'Falha ao inicializar Web Audio API', error: err });
      return null;
    }
  }

  /**
   * Bipe harmônico para NOVO PEDIDO na churrasqueira ou cozinha
   * 2 tons agudos agradáveis: 587Hz (D5) -> 880Hz (A5)
   */
  public playNewOrderSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Primeiro tom
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Segundo tom
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.15); // A5
      gain2.gain.setValueAtTime(0.25, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.4);
    } catch (err) {
      logger.error({ context: 'AudioService', message: 'Erro ao reproduzir som de novo pedido', error: err });
    }
  }

  /**
   * Som de PEDIDO PRONTO para servir na mesa (3 notas ascendentes)
   */
  public playOrderReadySound(): void {
    if (!this.isEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5 -> E5 -> G5

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + idx * 0.12;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.18, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + 0.2);
      });
    } catch (err) {
      logger.error({ context: 'AudioService', message: 'Erro ao reproduzir som de pedido pronto', error: err });
    }
  }

  /**
   * Alarme de PEDIDO ATRASADO (pulsante)
   */
  public playUrgentAlertSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.3);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (err) {
      logger.error({ context: 'AudioService', message: 'Erro ao reproduzir som de alerta urgente', error: err });
    }
  }

  /**
   * Som de PAGAMENTO CONFIRMADO (Chime suave e gratificante de caixa: C5 -> G5 -> C6)
   */
  public playPaymentSuccessSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 783.99, 1046.5]; // C5 -> G5 -> C6

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + idx * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0.2, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(noteStart);
        osc.stop(noteStart + 0.3);
      });
    } catch (err) {
      logger.error({ context: 'AudioService', message: 'Erro ao reproduzir som de pagamento', error: err });
    }
  }
}

export const audioService = new AudioService();

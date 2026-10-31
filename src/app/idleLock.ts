export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/**
 * Déclenche `onIdle` après `timeoutMs` sans activité. Les minuteurs sont suspendus quand un
 * téléphone met la page en veille : `check()` compare donc aussi l'heure réelle, et doit être
 * appelé au retour de la page (visibilitychange / focus).
 */
export class IdleTimer {
  private lastActivity = 0;
  private timer: number | null = null;
  private running = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onIdle: () => void,
    private readonly clock: Clock = realClock,
  ) {}

  start(): void {
    this.running = true;
    this.touch();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  /** Signale une activité de l'utilisateur. */
  touch(): void {
    if (!this.running) return;
    this.lastActivity = this.clock.now();
    this.clearTimer();
    this.timer = this.clock.setTimeout(() => this.check(), this.timeoutMs);
  }

  /** Verrouille si le délai est dépassé selon l'heure réelle. Renvoie true si verrouillé. */
  check(): boolean {
    if (!this.running) return false;
    if (this.clock.now() - this.lastActivity >= this.timeoutMs) {
      this.stop();
      this.onIdle();
      return true;
    }
    // Minuteur déclenché trop tôt : on le réarme pour le temps restant.
    this.clearTimer();
    this.timer = this.clock.setTimeout(
      () => this.check(),
      this.timeoutMs - (this.clock.now() - this.lastActivity),
    );
    return false;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

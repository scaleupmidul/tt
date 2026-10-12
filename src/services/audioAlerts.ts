import { SetupState } from '../types/market';

class SoundAlertService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;
  private desktopEnabled: boolean = true;
  private lastAlertTime: number = 0;
  private alertCooldownMs: number = 3 * 60 * 1000; // 3 min default cooldown

  constructor() {
    // Lazy audio context on user interaction
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setSoundEnabled(val: boolean) {
    this.soundEnabled = val;
  }

  public setDesktopEnabled(val: boolean) {
    this.desktopEnabled = val;
  }

  public async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  public playStateAlert(state: SetupState, direction: 'BUY' | 'SELL', symbol: string, price: number) {
    const now = Date.now();
    if (now - this.lastAlertTime < 10000) {
      // Avoid rapid spamming within 10 seconds
      return;
    }
    this.lastAlertTime = now;

    if (this.soundEnabled) {
      if (state === 'SETUP_READY') {
        this.playReadyChime();
      } else if (state === 'CONFIRMATION_NEEDED') {
        this.playConfirmationChime();
      } else if (state === 'SETUP_FORMING') {
        this.playFormingTone();
      }
    }

    if (this.desktopEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      let title = `GEP-5: [${state.replace('_', ' ')}] on ${symbol}`;
      let body = `${direction} setup forming at $${price.toFixed(2)}. Review chart.`;
      if (state === 'SETUP_READY') {
        title = `GEP-5 HIGH PRIORITY: ${direction} SETUP READY!`;
        body = `All mandatory conditions passed on ${symbol} @ $${price.toFixed(2)}. Verify chart manually before entry.`;
      }
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch {
        // Ignore notification errors in iframe sandbox
      }
    }
  }

  // Play High-Priority READY 3-tone arpeggio (C5 - E5 - G5)
  private playReadyChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0.01, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.5);
    });
  }

  // Play 2-tone alert for Confirmation Needed
  private playConfirmationChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    [440, 554.37].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);

      gain.gain.setValueAtTime(0.01, ctx.currentTime + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + idx * 0.15 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.15);
      osc.stop(ctx.currentTime + idx * 0.15 + 0.4);
    });
  }

  // Play subtle single ping for Setup Forming
  private playFormingTone() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5

    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.32);
  }
}

export const alertSoundService = new SoundAlertService();

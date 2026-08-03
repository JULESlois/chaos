/**
 * Procedural audio.
 *
 * Every cue is synthesised with the Web Audio API — no asset files, no network
 * requests. Nothing is created until the user explicitly enables audio, which
 * also satisfies browser autoplay policies.
 */

export type AudioCue =
  | 'button'
  | 'power-on'
  | 'power-off'
  | 'static'
  | 'switch'
  | 'cut';

interface CueSpec {
  /** Peak gain, kept low by design — no jump scares. */
  gain: number;
  duration: number;
}

const CUES: Record<AudioCue, CueSpec> = {
  button: { gain: 0.09, duration: 0.06 },
  'power-on': { gain: 0.11, duration: 0.55 },
  'power-off': { gain: 0.1, duration: 0.42 },
  static: { gain: 0.05, duration: 0.22 },
  switch: { gain: 0.07, duration: 0.18 },
  cut: { gain: 0.08, duration: 0.12 },
};

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = false;
  private disposed = false;

  /** Lazily constructs the AudioContext. Must be called from a user gesture. */
  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.context) return this.context;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    try {
      const context = new Ctor();
      const master = context.createGain();
      master.gain.value = 0.0001;
      master.connect(context.destination);
      this.context = context;
      this.master = master;
      return context;
    } catch {
      return null;
    }
  }

  private ensureNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    if (!enabled) {
      this.stopHum();
      if (this.master && this.context) {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.05);
      }
      return;
    }

    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return;
      }
    }
    this.master.gain.setTargetAtTime(0.5, context.currentTime, 0.08);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Low-level electrical hum, active while the TV is powered. */
  startHum(): void {
    if (!this.enabled || this.hum) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 51;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(this.master);
    osc.start();
    gain.gain.setTargetAtTime(0.022, context.currentTime, 0.6);
    this.hum = { osc, gain };
  }

  stopHum(): void {
    if (!this.hum || !this.context) return;
    const { osc, gain } = this.hum;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.15);
    try {
      osc.stop(now + 0.6);
    } catch {
      // Already stopped.
    }
    window.setTimeout(() => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // Nodes may already be detached.
      }
    }, 800);
    this.hum = null;
  }

  play(cue: AudioCue): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context || !this.master) return;
    if (context.state === 'suspended') return;

    const spec = CUES[cue];
    const now = context.currentTime;

    if (cue === 'static' || cue === 'switch') {
      const source = context.createBufferSource();
      source.buffer = this.ensureNoiseBuffer(context);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = cue === 'switch' ? 2400 : 1400;
      filter.Q.value = 0.7;
      const gain = context.createGain();
      gain.gain.setValueAtTime(spec.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(now);
      source.stop(now + spec.duration);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      return;
    }

    const osc = context.createOscillator();
    const gain = context.createGain();

    if (cue === 'button') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + spec.duration);
    } else if (cue === 'power-on') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(70, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + spec.duration * 0.7);
    } else if (cue === 'power-off') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + spec.duration);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + spec.duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Called when the tab is hidden. */
  suspend(): void {
    if (this.context && this.context.state === 'running') {
      void this.context.suspend().catch(() => undefined);
    }
  }

  resume(): void {
    if (this.enabled && this.context && this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopHum();
    this.noiseBuffer = null;
    if (this.context) {
      void this.context.close().catch(() => undefined);
      this.context = null;
      this.master = null;
    }
  }
}

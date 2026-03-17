type AudioContextCtor = typeof AudioContext;

type ToneStep = {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  detune?: number;
  filterFrequency?: number;
  when?: number;
  glideTo?: number;
};

type ToneVariant = {
  steps: ToneStep[];
  minIntervalMs: number;
  detuneJitter?: number;
  timingJitter?: number;
  gainScaleRange?: [number, number];
  filterJitter?: number;
  durationScaleRange?: [number, number];
};

function withTweaks(base: ToneStep[], tweaks: Array<Partial<ToneStep>>): ToneStep[] {
  return base.map((step, index) => ({ ...step, ...(tweaks[index] ?? {}) }));
}

class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private unlocked = false;
  private enabled = true;
  private masterVolume = 0.55;
  private lastPlayed = new Map<string, number>();
  private lastVariantIndex = new Map<string, number>();

  private getAudioContextCtor(): AudioContextCtor | null {
    if (typeof window === 'undefined') return null;
    const withWebkit = window as Window & { webkitAudioContext?: AudioContextCtor };
    return window.AudioContext ?? withWebkit.webkitAudioContext ?? null;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Ctor = this.getAudioContextCtor();
    if (!Ctor) return null;

    this.context = new Ctor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.syncMasterGain();
    return this.context;
  }

  private syncMasterGain() {
    if (!this.masterGain || !this.context) return;
    const target = this.enabled ? this.masterVolume : 0;
    this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
    this.masterGain.gain.setTargetAtTime(target, this.context.currentTime, 0.03);
  }

  private shouldThrottle(key: string, minIntervalMs: number): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < minIntervalMs) return true;
    this.lastPlayed.set(key, now);
    return false;
  }

  async unlock(): Promise<boolean> {
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
      this.unlocked = true;
      this.syncMasterGain();
      return true;
    } catch {
      return false;
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.syncMasterGain();
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.syncMasterGain();
  }

  private canPlay(): boolean {
    return !!this.context && !!this.masterGain && this.unlocked && this.enabled;
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomSigned(maxAbs: number): number {
    return this.randomBetween(-maxAbs, maxAbs);
  }

  private chooseVariantIndex(key: string, count: number): number {
    if (count <= 1) return 0;
    const previous = this.lastVariantIndex.get(key);
    let next = Math.floor(Math.random() * count);
    if (previous !== undefined && next === previous) {
      next = (next + 1) % count;
    }
    this.lastVariantIndex.set(key, next);
    return next;
  }

  private humanizeStep(step: ToneStep, variant: ToneVariant): ToneStep {
    const detuneJitter = variant.detuneJitter ?? 0;
    const timingJitter = variant.timingJitter ?? 0;
    const filterJitter = variant.filterJitter ?? 0;
    const [gainMin, gainMax] = variant.gainScaleRange ?? [0.995, 1.005];
    const [durationMin, durationMax] = variant.durationScaleRange ?? [0.998, 1.006];
    const gainScale = this.randomBetween(gainMin, gainMax);
    const durationScale = this.randomBetween(durationMin, durationMax);

    return {
      ...step,
      duration: Math.max(0.03, step.duration * durationScale),
      gain: step.gain !== undefined ? step.gain * gainScale : step.gain,
      when: Math.max(0, (step.when ?? 0) + this.randomSigned(timingJitter)),
      detune: (step.detune ?? 0) + this.randomSigned(detuneJitter),
      filterFrequency: step.filterFrequency !== undefined
        ? Math.max(250, step.filterFrequency + this.randomSigned(filterJitter))
        : step.filterFrequency,
    };
  }

  private playStep(step: ToneStep) {
    const context = this.ensureContext();
    if (!context || !this.masterGain || !this.canPlay()) return;

    const startAt = context.currentTime + (step.when ?? 0);
    const attack = step.attack ?? 0.008;
    const release = step.release ?? Math.max(0.04, step.duration * 0.8);
    const stopAt = startAt + step.duration + release;

    const oscillator = context.createOscillator();
    oscillator.type = step.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(step.frequency, startAt);
    if (step.glideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(step.glideTo, startAt + step.duration);
    }
    if (step.detune) {
      oscillator.detune.setValueAtTime(step.detune, startAt);
    }

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(step.filterFrequency ?? 1800, startAt);
    filter.Q.value = 0.8;

    const gain = context.createGain();
    const peak = step.gain ?? 0.05;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    oscillator.start(startAt);
    oscillator.stop(stopAt + 0.01);
  }

  private playVariant(key: string, variants: ToneVariant[]) {
    if (variants.length === 0) return;
    const variantIndex = this.chooseVariantIndex(key, variants.length);
    const variant = variants[variantIndex];
    if (this.shouldThrottle(key, variant.minIntervalMs)) return;
    for (const step of variant.steps) {
      this.playStep(this.humanizeStep(step, variant));
    }
  }

  playNavigate() {
    const base: ToneStep[] = [
      { frequency: 430, glideTo: 470, duration: 0.07, gain: 0.014, when: 0, type: 'sine', attack: 0.012, release: 0.08, filterFrequency: 950 },
      { frequency: 520, duration: 0.05, gain: 0.008, when: 0.05, type: 'sine', attack: 0.01, release: 0.07, filterFrequency: 1150 },
    ];

    this.playVariant('ui-navigate', [
      {
        minIntervalMs: 80,
        detuneJitter: 0.9,
        timingJitter: 0.001,
        filterJitter: 12,
        gainScaleRange: [0.995, 1.004],
        durationScaleRange: [0.998, 1.006],
        steps: base,
      },
      {
        minIntervalMs: 80,
        detuneJitter: 1,
        timingJitter: 0.0012,
        filterJitter: 14,
        gainScaleRange: [0.995, 1.004],
        durationScaleRange: [0.998, 1.006],
        steps: withTweaks(base, [
          { frequency: 434, glideTo: 474, filterFrequency: 958 },
          { frequency: 524, when: 0.051, filterFrequency: 1158 },
        ]),
      },
    ]);
  }

  playConfirm() {
    const base: ToneStep[] = [
      { frequency: 320, glideTo: 390, duration: 0.1, gain: 0.018, when: 0, type: 'triangle', attack: 0.014, release: 0.12, filterFrequency: 900 },
      { frequency: 480, duration: 0.08, gain: 0.008, when: 0.065, type: 'sine', attack: 0.012, release: 0.1, filterFrequency: 1200 },
    ];

    this.playVariant('ui-confirm', [
      {
        minIntervalMs: 120,
        detuneJitter: 1,
        timingJitter: 0.0012,
        filterJitter: 14,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: base,
      },
      {
        minIntervalMs: 120,
        detuneJitter: 1.1,
        timingJitter: 0.0014,
        filterJitter: 16,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: withTweaks(base, [
          { frequency: 324, glideTo: 394, filterFrequency: 910 },
          { frequency: 484, when: 0.066, filterFrequency: 1210 },
        ]),
      },
    ]);
  }

  playSave() {
    const base: ToneStep[] = [
      { frequency: 280, duration: 0.09, gain: 0.017, when: 0, type: 'triangle', attack: 0.014, release: 0.11, filterFrequency: 850 },
      { frequency: 360, duration: 0.08, gain: 0.011, when: 0.07, type: 'sine', attack: 0.012, release: 0.1, filterFrequency: 1000 },
      { frequency: 450, duration: 0.07, gain: 0.006, when: 0.13, type: 'sine', attack: 0.012, release: 0.1, filterFrequency: 1200 },
    ];

    this.playVariant('ui-save', [
      {
        minIntervalMs: 160,
        detuneJitter: 1,
        timingJitter: 0.0012,
        filterJitter: 14,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: base,
      },
      {
        minIntervalMs: 160,
        detuneJitter: 1.1,
        timingJitter: 0.0014,
        filterJitter: 16,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: withTweaks(base, [
          { frequency: 284, filterFrequency: 860 },
          { frequency: 364, when: 0.071, filterFrequency: 1012 },
          { frequency: 454, when: 0.131, filterFrequency: 1212 },
        ]),
      },
    ]);
  }

  playManufacturingComplete(count: number) {
    const emphasis = Math.min(0.009, count * 0.0008);
    const base: ToneStep[] = [
      { frequency: 350, duration: 0.11, gain: 0.018 + emphasis, when: 0, type: 'triangle', attack: 0.016, release: 0.14, filterFrequency: 950 },
      { frequency: 470, duration: 0.1, gain: 0.011 + emphasis, when: 0.07, type: 'sine', attack: 0.014, release: 0.12, filterFrequency: 1150 },
      { frequency: 590, duration: 0.09, gain: 0.005 + emphasis * 0.35, when: 0.14, type: 'sine', attack: 0.014, release: 0.11, filterFrequency: 1350 },
    ];

    this.playVariant('mfg-complete', [
      {
        minIntervalMs: 300,
        detuneJitter: 1.2,
        timingJitter: 0.0015,
        filterJitter: 16,
        gainScaleRange: [0.995, 1.006],
        durationScaleRange: [0.998, 1.007],
        steps: base,
      },
      {
        minIntervalMs: 300,
        detuneJitter: 1.3,
        timingJitter: 0.0016,
        filterJitter: 18,
        gainScaleRange: [0.995, 1.006],
        durationScaleRange: [0.998, 1.007],
        steps: withTweaks(base, [
          { frequency: 354, filterFrequency: 962 },
          { frequency: 474, when: 0.071, filterFrequency: 1162 },
          { frequency: 594, when: 0.141, filterFrequency: 1362 },
        ]),
      },
    ]);
  }

  playSkillAdvance(count: number) {
    const emphasis = Math.min(0.008, count * 0.001);
    const base: ToneStep[] = [
      { frequency: 390, glideTo: 460, duration: 0.1, gain: 0.017 + emphasis, when: 0, type: 'sine', attack: 0.014, release: 0.13, filterFrequency: 1100 },
      { frequency: 560, glideTo: 620, duration: 0.1, gain: 0.008 + emphasis * 0.5, when: 0.08, type: 'sine', attack: 0.014, release: 0.12, filterFrequency: 1300 },
    ];

    this.playVariant('skill-advance', [
      {
        minIntervalMs: 300,
        detuneJitter: 1.1,
        timingJitter: 0.0014,
        filterJitter: 15,
        gainScaleRange: [0.995, 1.006],
        durationScaleRange: [0.998, 1.007],
        steps: base,
      },
      {
        minIntervalMs: 300,
        detuneJitter: 1.2,
        timingJitter: 0.0015,
        filterJitter: 16,
        gainScaleRange: [0.995, 1.006],
        durationScaleRange: [0.998, 1.007],
        steps: withTweaks(base, [
          { frequency: 394, glideTo: 464, filterFrequency: 1110 },
          { frequency: 564, glideTo: 624, when: 0.081, filterFrequency: 1310 },
        ]),
      },
    ]);
  }

  playAlert() {
    const base: ToneStep[] = [
      { frequency: 220, duration: 0.11, gain: 0.015, when: 0, type: 'triangle', attack: 0.018, release: 0.15, filterFrequency: 700 },
      { frequency: 270, duration: 0.1, gain: 0.008, when: 0.12, type: 'sine', attack: 0.015, release: 0.13, filterFrequency: 900 },
    ];

    this.playVariant('ui-alert', [
      {
        minIntervalMs: 500,
        detuneJitter: 0.9,
        timingJitter: 0.0012,
        filterJitter: 12,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: base,
      },
      {
        minIntervalMs: 500,
        detuneJitter: 1,
        timingJitter: 0.0013,
        filterJitter: 14,
        gainScaleRange: [0.995, 1.005],
        durationScaleRange: [0.998, 1.006],
        steps: withTweaks(base, [
          { frequency: 224, filterFrequency: 710 },
          { frequency: 274, when: 0.121, filterFrequency: 910 },
        ]),
      },
    ]);
  }
}

export const audioManager = new AudioManager();
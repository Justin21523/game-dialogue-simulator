type AudioNodePair = {
    osc?: OscillatorNode;
    gain?: GainNode;
};

export type SoundType =
    | 'coin'
    | 'hit'
    | 'launch'
    | 'boost'
    | 'button'
    | 'door'
    | 'success'
    | 'error'
    | 'achievement'
    | 'levelup'
    | 'hover'
    | 'arrival'
    | 'transform_ready'
    | 'mission_complete';

export type BgmTrack = 'menu' | 'hangar' | 'flight' | 'results';

type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class AudioManager {
    private ctx: AudioContext | null = null;

    private masterGain: GainNode | null = null;
    private bgmGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;

    private engineOsc: OscillatorNode | null = null;
    private engineGain: GainNode | null = null;

    private bgmNodes: AudioNodePair[] = [];
    private bgmInterval: number | null = null;
    private currentBgm: BgmTrack | null = null;

    private isMuted = false;
    private bgmVolume = 0.3;
    private sfxVolume = 0.5;

    private readonly notes: Record<string, number> = {
        C3: 130.81,
        D3: 146.83,
        E3: 164.81,
        F3: 174.61,
        G3: 196.0,
        A3: 220.0,
        B3: 246.94,
        C4: 261.63,
        D4: 293.66,
        E4: 329.63,
        F4: 349.23,
        G4: 392.0,
        A4: 440.0,
        B4: 493.88,
        C5: 523.25,
        D5: 587.33,
        E5: 659.25,
        F5: 698.46,
        G5: 783.99,
        A5: 880.0,
        B5: 987.77,
        C6: 1046.5
    };

    private ensureContext(): AudioContext | null {
        if (this.ctx) return this.ctx;
        if (typeof window === 'undefined') return null;

        const ctor = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
        if (!ctor) return null;

        const ctx = new ctor();
        this.ctx = ctx;

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(ctx.destination);

        this.bgmGain = ctx.createGain();
        this.bgmGain.gain.value = this.bgmVolume;
        this.bgmGain.connect(this.masterGain);

        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.masterGain);

        return ctx;
    }

    async resume(): Promise<void> {
        const ctx = this.ensureContext();
        if (!ctx) return;
        if (ctx.state !== 'suspended') return;
        try {
            await ctx.resume();
        } catch {
            // Ignore autoplay rejections.
        }
    }

    startEngine(): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.sfxGain) return;
        if (this.engineOsc) return;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 100;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        const gain = ctx.createGain();
        gain.gain.value = 0.1;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start();

        this.engineOsc = osc;
        this.engineGain = gain;
    }

    setEnginePitch(speedRatio: number): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.engineOsc) return;

        const targetFreq = 80 + speedRatio * 120;
        this.engineOsc.frequency.setTargetAtTime(targetFreq, ctx.currentTime, 0.1);
    }

    stopEngine(): void {
        if (!this.engineOsc) return;
        try {
            this.engineOsc.stop();
        } catch {
            // Ignore.
        }
        this.engineOsc = null;
        this.engineGain = null;
    }

    playSound(type: SoundType): void {
        if (this.isMuted) return;

        const ctx = this.ensureContext();
        if (!ctx || !this.sfxGain) return;

        if (ctx.state === 'suspended') {
            void this.resume();
        }

        const now = ctx.currentTime;

        if (type === 'success') {
            this.playArpeggio(['C5', 'E5', 'G5', 'C6'], 0.1, 'sine', 0.3);
            return;
        }
        if (type === 'achievement') {
            this.playArpeggio(['G4', 'C5', 'E5', 'G5'], 0.15, 'triangle', 0.4);
            window.setTimeout(() => {
                this.playArpeggio(['A4', 'D5', 'F5', 'A5'], 0.1, 'triangle', 0.3);
            }, 400);
            return;
        }
        if (type === 'levelup') {
            this.playArpeggio(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], 0.08, 'sine', 0.3);
            return;
        }
        if (type === 'mission_complete') {
            this.playArpeggio(['C5', 'E5', 'G5'], 0.12, 'triangle', 0.4);
            window.setTimeout(() => {
                this.playArpeggio(['D5', 'F5', 'A5', 'C6'], 0.1, 'sine', 0.35);
            }, 400);
            return;
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        switch (type) {
            case 'coin':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(1800, now + 0.1);
                gain.gain.setValueAtTime(0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'hit':
                osc.type = 'square';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
                gain.gain.setValueAtTime(0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'launch':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(800, now + 1.0);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0, now + 1.5);
                osc.start(now);
                osc.stop(now + 1.5);
                break;

            case 'boost':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.linearRampToValueAtTime(600, now + 0.5);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;

            case 'button':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;

            case 'door':
                osc.type = 'square';
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'error':
                osc.type = 'square';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.setValueAtTime(150, now + 0.1);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'hover':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;

            case 'arrival':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.8);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
                osc.start(now);
                osc.stop(now + 1.0);
                break;

            case 'transform_ready':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.5);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;
        }
    }

    playArpeggio(notes: string[], interval: number, waveType: OscillatorType = 'sine', volume = 0.3): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.sfxGain) return;

        notes.forEach((note, i) => {
            window.setTimeout(() => {
                if (!this.ctx || !this.sfxGain) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.type = waveType;
                const freq = this.notes[note] ?? 440;
                const now = this.ctx.currentTime;

                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(volume, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                osc.start(now);
                osc.stop(now + 0.3);
            }, i * interval * 1000);
        });
    }

    startBGM(track: BgmTrack = 'menu'): void {
        const ctx = this.ensureContext();
        if (!ctx) return;
        if (this.isMuted) return;

        if (ctx.state === 'suspended') {
            void this.resume();
        }

        this.stopBGM();
        this.currentBgm = track;

        switch (track) {
            case 'menu':
                this.playMenuBGM();
                break;
            case 'hangar':
                this.playHangarBGM();
                break;
            case 'flight':
                this.playFlightBGM();
                break;
            case 'results':
                this.playResultsBGM();
                break;
        }
    }

    stopBGM(): void {
        const ctx = this.ensureContext();
        if (!ctx) return;

        if (this.bgmInterval) {
            window.clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }

        this.bgmNodes.forEach((node) => {
            try {
                node.gain?.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                window.setTimeout(() => {
                    try {
                        node.osc?.stop();
                    } catch {
                        // Ignore.
                    }
                }, 600);
            } catch {
                // Ignore.
            }
        });
        this.bgmNodes = [];
        this.currentBgm = null;
    }

    getCurrentBGM(): BgmTrack | null {
        return this.currentBgm;
    }

    crossfadeBGM(newTrack: BgmTrack, durationMs = 1000): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.bgmGain) return;
        const oldGain = this.bgmGain.gain.value;

        this.bgmGain.gain.setTargetAtTime(0, ctx.currentTime, durationMs / 3000);

        window.setTimeout(() => {
            this.stopBGM();
            if (!this.bgmGain || !this.ctx) return;
            this.bgmGain.gain.value = 0;
            this.startBGM(newTrack);
            this.bgmGain.gain.setTargetAtTime(oldGain, this.ctx.currentTime, durationMs / 3000);
        }, durationMs / 2);
    }

    setBGMVolume(volume: number): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.bgmGain) return;
        this.bgmVolume = clamp(volume, 0, 1);
        this.bgmGain.gain.setTargetAtTime(this.bgmVolume, ctx.currentTime, 0.1);
    }

    setSFXVolume(volume: number): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.sfxGain) return;
        this.sfxVolume = clamp(volume, 0, 1);
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume, ctx.currentTime, 0.1);
    }

    setMasterVolume(volume: number): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.masterGain) return;
        this.masterGain.gain.setTargetAtTime(clamp(volume, 0, 1), ctx.currentTime, 0.1);
    }

    toggleMute(): boolean {
        const ctx = this.ensureContext();
        if (!ctx || !this.masterGain) return this.isMuted;

        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
            this.stopBGM();
            this.stopEngine();
        } else {
            this.masterGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
        }
        return this.isMuted;
    }

    private playMenuBGM(): void {
        const melody = ['C4', 'E4', 'G4', 'E4', 'C4', 'G3', 'E4', 'C4'];
        const bass = ['C3', 'C3', 'G3', 'G3', 'A3', 'A3', 'F3', 'G3'];
        let beat = 0;

        this.bgmInterval = window.setInterval(() => {
            if (this.isMuted) return;
            this.playBGMNote(melody[beat % melody.length], 'sine', 0.15, 0.4);
            if (beat % 2 === 0) {
                this.playBGMNote(bass[Math.floor(beat / 2) % bass.length], 'triangle', 0.1, 0.8);
            }
            beat += 1;
        }, 500);
    }

    private playHangarBGM(): void {
        const melody = ['G4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', 'E4'];
        const bass = ['G3', 'G3', 'D3', 'D3', 'E3', 'E3', 'C3', 'D3'];
        let beat = 0;

        this.bgmInterval = window.setInterval(() => {
            if (this.isMuted) return;
            this.playBGMNote(melody[beat % melody.length], 'sine', 0.12, 0.35);
            if (beat % 2 === 0) {
                this.playBGMNote(bass[Math.floor(beat / 2) % bass.length], 'triangle', 0.08, 0.6);
            }
            beat += 1;
        }, 400);
    }

    private playFlightBGM(): void {
        const melody = ['E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'E5', 'D5', 'D5', 'D5', 'E5', 'G5', 'G5'];
        const bass = ['C3', 'C3', 'G3', 'G3', 'A3', 'A3', 'E3', 'E3'];
        let beat = 0;

        this.bgmInterval = window.setInterval(() => {
            if (this.isMuted) return;
            this.playBGMNote(melody[beat % melody.length], 'sawtooth', 0.08, 0.25);
            if (beat % 2 === 0) {
                this.playBGMNote(bass[Math.floor(beat / 2) % bass.length], 'square', 0.06, 0.4);
            }
            beat += 1;
        }, 200);
    }

    private playResultsBGM(): void {
        const melody = ['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'C5', 'G4'];
        const bass = ['C3', 'E3', 'G3', 'C4', 'G3', 'E3', 'C3', 'G2'];
        let beat = 0;

        this.bgmInterval = window.setInterval(() => {
            if (this.isMuted) return;
            this.playBGMNote(melody[beat % melody.length], 'sine', 0.15, 0.5);
            this.playBGMNote(bass[beat % bass.length], 'triangle', 0.1, 0.8);
            beat += 1;
        }, 600);
    }

    private playBGMNote(note: string, waveType: OscillatorType, volume: number, duration: number): void {
        const ctx = this.ensureContext();
        if (!ctx || !this.bgmGain) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.type = waveType;
        const freq = this.notes[note] ?? this.notes.C4;
        const now = ctx.currentTime;

        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start(now);
        osc.stop(now + duration + 0.1);

        this.bgmNodes.push({ osc, gain });
        if (this.bgmNodes.length > 20) {
            this.bgmNodes = this.bgmNodes.slice(-10);
        }
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export const audioManager = new AudioManager();

export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master gain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);

        // Separate BGM and SFX gain nodes
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.3;
        this.bgmGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.masterGain);

        // Engine sound nodes
        this.engineOsc = null;
        this.engineGain = null;

        // BGM state
        this.bgmNodes = [];
        this.currentBgm = null;
        this.bgmInterval = null;

        // Settings
        this.isMuted = false;
        this.bgmVolume = 0.3;
        this.sfxVolume = 0.5;

        // Note frequencies for music
        this.notes = {
            'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61,
            'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
            'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
            'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
            'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46,
            'G5': 783.99, 'A5': 880.00, 'B5': 987.77
        };
    }

    startEngine() {
        if (this.engineOsc) return;

        // Create engine drone
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 100;

        // Filter to make it sound muffled/engine-like
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.1;

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.sfxGain);
        
        this.engineOsc.start();
    }

    setEnginePitch(speedRatio) {
        if (!this.engineOsc) return;
        // Pitch goes from 80Hz to 200Hz based on speed
        const targetFreq = 80 + (speedRatio * 120);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineOsc) {
            this.engineOsc.stop();
            this.engineOsc = null;
        }
    }

    playSound(type) {
        if (this.isMuted) return;

        // Resume context if suspended (browser autoplay policy)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.sfxGain);

        const now = this.ctx.currentTime;

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

            case 'success':
                // Happy ascending arpeggio
                this.playArpeggio(['C5', 'E5', 'G5', 'C6'], 0.1, 'sine', 0.3);
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

            case 'achievement':
                // Fanfare-like sound
                this.playArpeggio(['G4', 'C5', 'E5', 'G5'], 0.15, 'triangle', 0.4);
                setTimeout(() => {
                    this.playArpeggio(['A4', 'D5', 'F5', 'A5'], 0.1, 'triangle', 0.3);
                }, 400);
                break;

            case 'levelup':
                // Rising scale
                this.playArpeggio(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'], 0.08, 'sine', 0.3);
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
                // Descending whoosh for landing
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.8);
                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
                osc.start(now);
                osc.stop(now + 1.0);
                break;

            case 'transform_ready':
                // Power-up charging sound
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.5);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;

            case 'mission_complete':
                // Victory fanfare
                this.playArpeggio(['C5', 'E5', 'G5'], 0.12, 'triangle', 0.4);
                setTimeout(() => {
                    this.playArpeggio(['D5', 'F5', 'A5', 'C6'], 0.1, 'sine', 0.35);
                }, 400);
                break;
        }
    }

    /**
     * Play an arpeggio sequence
     */
    playArpeggio(notes, interval, waveType = 'sine', volume = 0.3) {
        notes.forEach((note, i) => {
            setTimeout(() => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.type = waveType;
                const freq = this.notes[note] || 440;
                const now = this.ctx.currentTime;

                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(volume, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

                osc.start(now);
                osc.stop(now + 0.3);
            }, i * interval * 1000);
        });
    }

    // ===== BGM System =====

    /**
     * Start background music
     * @param {string} track - Track name: 'menu', 'hangar', 'flight', 'results'
     */
    startBGM(track = 'menu') {
        if (this.isMuted) return;

        // Resume context if suspended
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
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
            default:
                this.playMenuBGM();
        }
    }

    /**
     * Stop background music
     */
    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }

        // Fade out existing nodes
        this.bgmNodes.forEach(node => {
            try {
                if (node.gain) {
                    node.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
                }
                setTimeout(() => {
                    try { node.osc?.stop(); } catch (e) {}
                }, 600);
            } catch (e) {}
        });
        this.bgmNodes = [];
        this.currentBgm = null;
    }

    /**
     * Menu BGM - Calm, gentle melody
     */
    playMenuBGM() {
        const melody = ['C4', 'E4', 'G4', 'E4', 'C4', 'G3', 'E4', 'C4'];
        const bass = ['C3', 'C3', 'G3', 'G3', 'A3', 'A3', 'F3', 'G3'];
        let beat = 0;

        this.bgmInterval = setInterval(() => {
            if (this.isMuted) return;

            // Melody
            this.playBGMNote(melody[beat % melody.length], 'sine', 0.15, 0.4);

            // Bass (every other beat)
            if (beat % 2 === 0) {
                this.playBGMNote(bass[(beat / 2) % bass.length], 'triangle', 0.1, 0.8);
            }

            beat++;
        }, 500);
    }

    /**
     * Hangar BGM - Upbeat, anticipation
     */
    playHangarBGM() {
        const melody = ['G4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', 'E4'];
        const bass = ['G3', 'G3', 'D3', 'D3', 'E3', 'E3', 'C3', 'D3'];
        let beat = 0;

        this.bgmInterval = setInterval(() => {
            if (this.isMuted) return;

            this.playBGMNote(melody[beat % melody.length], 'sine', 0.12, 0.35);

            if (beat % 2 === 0) {
                this.playBGMNote(bass[(beat / 2) % bass.length], 'triangle', 0.08, 0.6);
            }

            beat++;
        }, 400);
    }

    /**
     * Flight BGM - Energetic, fast-paced
     */
    playFlightBGM() {
        const melody = ['E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'E5', 'D5', 'D5', 'D5', 'E5', 'G5', 'G5'];
        const bass = ['C3', 'C3', 'G3', 'G3', 'A3', 'A3', 'E3', 'E3'];
        let beat = 0;

        this.bgmInterval = setInterval(() => {
            if (this.isMuted) return;

            this.playBGMNote(melody[beat % melody.length], 'sawtooth', 0.08, 0.25);

            if (beat % 2 === 0) {
                this.playBGMNote(bass[(beat / 2) % bass.length], 'square', 0.06, 0.4);
            }

            beat++;
        }, 200);
    }

    /**
     * Results BGM - Victory fanfare / calm
     */
    playResultsBGM() {
        const melody = ['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'C5', 'G4'];
        const bass = ['C3', 'E3', 'G3', 'C4', 'G3', 'E3', 'C3', 'G2'];
        let beat = 0;

        this.bgmInterval = setInterval(() => {
            if (this.isMuted) return;

            this.playBGMNote(melody[beat % melody.length], 'sine', 0.15, 0.5);
            this.playBGMNote(bass[beat % bass.length], 'triangle', 0.1, 0.8);

            beat++;
        }, 600);
    }

    /**
     * Play a single BGM note
     */
    playBGMNote(note, waveType, volume, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.type = waveType;
        const freq = this.notes[note] || this.notes['C4'];
        const now = this.ctx.currentTime;

        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.start(now);
        osc.stop(now + duration + 0.1);

        // Track nodes for cleanup
        this.bgmNodes.push({ osc, gain });

        // Auto-cleanup old nodes
        if (this.bgmNodes.length > 20) {
            this.bgmNodes = this.bgmNodes.slice(-10);
        }
    }

    // ===== Volume Controls =====

    /**
     * Set BGM volume (0-1)
     */
    setBGMVolume(volume) {
        this.bgmVolume = Math.max(0, Math.min(1, volume));
        this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.1);
    }

    /**
     * Set SFX volume (0-1)
     */
    setSFXVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
        this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.1);
    }

    /**
     * Set master volume (0-1)
     */
    setMasterVolume(volume) {
        this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.1);
    }

    /**
     * Mute/unmute all audio
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
            this.stopBGM();
        } else {
            this.masterGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.1);
        }
        return this.isMuted;
    }

    /**
     * Get current BGM track name
     */
    getCurrentBGM() {
        return this.currentBgm;
    }

    /**
     * Crossfade to new BGM track
     */
    crossfadeBGM(newTrack, duration = 1000) {
        const oldGain = this.bgmGain.gain.value;

        // Fade out
        this.bgmGain.gain.setTargetAtTime(0, this.ctx.currentTime, duration / 3000);

        setTimeout(() => {
            this.stopBGM();
            this.bgmGain.gain.value = 0;
            this.startBGM(newTrack);

            // Fade in
            this.bgmGain.gain.setTargetAtTime(oldGain, this.ctx.currentTime, duration / 3000);
        }, duration / 2);
    }

    /**
     * Resume audio context (call after user interaction)
     */
    resume() {
        if (this.ctx.state === 'suspended') {
            return this.ctx.resume();
        }
        return Promise.resolve();
    }
}

export const audioManager = new AudioManager();

// Make available globally
window.audioManager = audioManager;

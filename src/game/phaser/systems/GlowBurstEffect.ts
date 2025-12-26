type GlowWave = {
    startTimeMs: number;
    radius: number;
    opacity: number;
};

type GlowConfig = {
    waveCount: number;
    waveIntervalMs: number;
    maxRadius: number;
    waveWidth: number;
    expansionDurationMs: number;
    startOpacity: number;
    glowIntensity: number;
};

type CenterGlowState = {
    active: boolean;
    startTimeMs: number;
    durationMs: number;
    maxRadius: number;
};

export class GlowBurstEffect {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;

    private waves: GlowWave[] = [];
    private isRunning = false;

    private config: GlowConfig = {
        waveCount: 4,
        waveIntervalMs: 150,
        maxRadius: 1500,
        waveWidth: 60,
        expansionDurationMs: 800,
        startOpacity: 0.9,
        glowIntensity: 0.6
    };

    private color = '#E31D2B';
    private centerX = 0;
    private centerY = 0;

    private centerGlow: CenterGlowState = {
        active: false,
        startTimeMs: 0,
        durationMs: 300,
        maxRadius: 150
    };

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.centerX = width / 2;
        this.centerY = height / 2;
    }

    startBurst(timeMs: number, color: string, centerX?: number, centerY?: number): void {
        this.color = color;
        if (typeof centerX === 'number') this.centerX = centerX;
        if (typeof centerY === 'number') this.centerY = centerY;

        this.waves = [];
        this.isRunning = true;

        this.centerGlow.active = true;
        this.centerGlow.startTimeMs = timeMs;

        for (let i = 0; i < this.config.waveCount; i += 1) {
            this.waves.push({
                startTimeMs: timeMs + i * this.config.waveIntervalMs,
                radius: 0,
                opacity: this.config.startOpacity
            });
        }
    }

    update(timeMs: number): boolean {
        if (!this.isRunning) return true;

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        this.drawCenterGlow(timeMs);

        let allComplete = true;
        for (const wave of this.waves) {
            const elapsed = timeMs - wave.startTimeMs;
            if (elapsed < 0) {
                allComplete = false;
                continue;
            }

            const progress = Math.min(elapsed / this.config.expansionDurationMs, 1);
            if (progress < 1) {
                allComplete = false;
            }

            const easedProgress = this.easeOutCubic(progress);
            wave.radius = easedProgress * this.config.maxRadius;
            wave.opacity = this.config.startOpacity * (1 - this.easeOutQuad(progress));

            if (wave.opacity > 0.01) {
                this.drawWave(wave);
            }
        }

        const centerGlowElapsed = timeMs - this.centerGlow.startTimeMs;
        if (centerGlowElapsed > this.centerGlow.durationMs) {
            this.centerGlow.active = false;
        }

        if (allComplete && !this.centerGlow.active && this.waves.every((wave) => wave.opacity <= 0.01)) {
            this.isRunning = false;
            return true;
        }

        return false;
    }

    clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    destroy(): void {
        this.isRunning = false;
        this.waves = [];
        this.clear();
    }

    private easeOutQuad(t: number): number {
        return t * (2 - t);
    }

    private easeOutCubic(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    }

    private drawWave(wave: GlowWave): void {
        const outerRadius = wave.radius;
        const innerRadius = Math.max(0, wave.radius - this.config.waveWidth);

        const gradient = this.ctx.createRadialGradient(this.centerX, this.centerY, innerRadius, this.centerX, this.centerY, outerRadius);
        const colorRgb = this.hexToRgb(this.color);
        gradient.addColorStop(0, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);
        gradient.addColorStop(0.3, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${wave.opacity})`);
        gradient.addColorStop(0.7, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${wave.opacity * 0.8})`);
        gradient.addColorStop(1, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, outerRadius, 0, Math.PI * 2);
        this.ctx.arc(this.centerX, this.centerY, innerRadius, 0, Math.PI * 2, true);
        this.ctx.closePath();

        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    private drawCenterGlow(timeMs: number): void {
        if (!this.centerGlow.active) return;

        const elapsed = timeMs - this.centerGlow.startTimeMs;
        const progress = Math.min(elapsed / this.centerGlow.durationMs, 1);

        let intensity: number;
        if (progress < 0.3) {
            intensity = this.easeOutQuad(progress / 0.3);
        } else {
            intensity = 1 - this.easeOutQuad((progress - 0.3) / 0.7);
        }

        const radius = this.centerGlow.maxRadius * (0.5 + 0.5 * intensity);
        const opacity = this.config.glowIntensity * intensity;
        const colorRgb = this.hexToRgb(this.color);

        const gradient = this.ctx.createRadialGradient(this.centerX, this.centerY, 0, this.centerX, this.centerY, radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
        gradient.addColorStop(0.2, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.9})`);
        gradient.addColorStop(0.5, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, ${opacity * 0.5})`);
        gradient.addColorStop(1, `rgba(${colorRgb.r}, ${colorRgb.g}, ${colorRgb.b}, 0)`);

        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    private hexToRgb(hex: string): { r: number; g: number; b: number } {
        const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
        if (normalized.length !== 6) return { r: 255, g: 255, b: 255 };
        const r = Number.parseInt(normalized.slice(0, 2), 16);
        const g = Number.parseInt(normalized.slice(2, 4), 16);
        const b = Number.parseInt(normalized.slice(4, 6), 16);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return { r: 255, g: 255, b: 255 };
        return { r, g, b };
    }
}


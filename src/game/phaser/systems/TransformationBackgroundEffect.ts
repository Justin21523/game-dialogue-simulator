export type TransformationLine = {
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    speedMultiplier: number;
    phase: number;
};

type TransformationBackgroundConfig = {
    lineCount: number;
    lineWidthMin: number;
    lineWidthMax: number;
    lineGapMin: number;
    lineGapMax: number;
    baseSpeed: number;
    speedVariation: number;
    rhythmCycle: number;
    opacityMin: number;
    opacityMax: number;
};

type FadeState = {
    progress: number;
    target: number;
    durationMs: number;
    startTimeMs: number;
};

type AccelState = {
    active: boolean;
    originalSpeed: number;
    targetMultiplier: number;
    durationMs: number;
    startTimeMs: number;
};

export class TransformationBackgroundEffect {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly lines: TransformationLine[] = [];

    public config: TransformationBackgroundConfig = {
        lineCount: 60,
        lineWidthMin: 2,
        lineWidthMax: 5,
        lineGapMin: 12,
        lineGapMax: 30,
        baseSpeed: 800,
        speedVariation: 0.4,
        rhythmCycle: 2500,
        opacityMin: 0.5,
        opacityMax: 0.95
    };

    public colors = {
        background: '#1A237E',
        lines: '#FFD700'
    };

    private startTimeMs = 0;
    private lastFrameTimeMs = 0;
    private isRunning = false;

    private fade: FadeState = {
        progress: 0,
        target: 0,
        durationMs: 500,
        startTimeMs: 0
    };

    private accel: AccelState = {
        active: false,
        originalSpeed: 800,
        targetMultiplier: 1,
        durationMs: 1000,
        startTimeMs: 0
    };

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
    }

    setColors(backgroundColor: string, lineColor: string): void {
        this.colors.background = backgroundColor;
        this.colors.lines = lineColor;
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.initLines();
    }

    start(timeMs: number): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.startTimeMs = timeMs;
        this.lastFrameTimeMs = timeMs;
    }

    stop(): void {
        this.isRunning = false;
    }

    fadeIn(timeMs: number, durationMs = 500): void {
        this.fade.durationMs = durationMs;
        this.fade.startTimeMs = timeMs;
        this.fade.target = 1;
    }

    fadeOut(timeMs: number, durationMs = 500): void {
        this.fade.durationMs = durationMs;
        this.fade.startTimeMs = timeMs;
        this.fade.target = 0;
    }

    accelerate(timeMs: number, targetSpeedMultiplier = 3, durationMs = 1000): void {
        this.accel.active = true;
        this.accel.originalSpeed = this.config.baseSpeed;
        this.accel.targetMultiplier = targetSpeedMultiplier;
        this.accel.durationMs = durationMs;
        this.accel.startTimeMs = timeMs;
    }

    update(timeMs: number, deltaMs: number): void {
        if (!this.isRunning) return;

        this.updateFade(timeMs);
        this.updateAcceleration(timeMs);

        const deltaTimeSec = Math.min(deltaMs / 1000, 0.1);
        const elapsedTimeMs = timeMs - this.startTimeMs;
        this.lastFrameTimeMs = timeMs;

        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        this.ctx.globalAlpha = this.fade.progress;
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, w, h);

        const rhythmMultiplier = this.getRhythmMultiplier(elapsedTimeMs);

        for (const line of this.lines) {
            const linePhaseOffset = Math.sin(elapsedTimeMs / 1000 + line.phase) * 0.2;
            const speed = this.config.baseSpeed * line.speedMultiplier * rhythmMultiplier * (1 + linePhaseOffset);
            line.y += speed * deltaTimeSec;

            if (line.y > h) {
                line.y = -line.height;
                line.opacity = this.randomRange(this.config.opacityMin, this.config.opacityMax);
            }

            this.ctx.globalAlpha = this.fade.progress * line.opacity;
            this.ctx.fillStyle = this.colors.lines;
            this.ctx.fillRect(line.x, line.y, line.width, line.height);
        }

        this.ctx.globalAlpha = 1;
    }

    destroy(): void {
        this.stop();
        this.lines.length = 0;
    }

    private initLines(): void {
        this.lines.length = 0;
        const { lineCount, lineWidthMin, lineWidthMax, lineGapMin, lineGapMax, opacityMin, opacityMax, speedVariation } = this.config;

        let xPos = 0;
        for (let i = 0; i < lineCount; i += 1) {
            const gap = this.randomRange(lineGapMin, lineGapMax);
            xPos += gap;

            if (xPos > this.canvas.width) {
                xPos = this.randomRange(0, lineGapMax);
            }

            this.lines.push({
                x: xPos,
                y: this.randomRange(-this.canvas.height, 0),
                width: this.randomRange(lineWidthMin, lineWidthMax),
                height: this.canvas.height * this.randomRange(0.3, 0.8),
                opacity: this.randomRange(opacityMin, opacityMax),
                speedMultiplier: 1 + this.randomRange(-speedVariation, speedVariation),
                phase: this.randomRange(0, Math.PI * 2)
            });
        }
    }

    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private getRhythmMultiplier(timeMs: number): number {
        const phase = ((timeMs % this.config.rhythmCycle) / this.config.rhythmCycle) * Math.PI * 2;
        return 0.8 + 0.4 * Math.sin(phase);
    }

    private updateFade(timeMs: number): void {
        if (this.fade.progress === this.fade.target) return;

        const elapsed = timeMs - this.fade.startTimeMs;
        const progress = Math.min(elapsed / this.fade.durationMs, 1);

        if (this.fade.target > this.fade.progress) {
            this.fade.progress = progress;
        } else {
            this.fade.progress = 1 - progress;
        }

        if (progress >= 1) {
            this.fade.progress = this.fade.target;
        }
    }

    private updateAcceleration(timeMs: number): void {
        if (!this.accel.active) return;
        const elapsed = timeMs - this.accel.startTimeMs;
        const progress = Math.min(elapsed / this.accel.durationMs, 1);
        const eased = progress * progress;
        this.config.baseSpeed = this.accel.originalSpeed * (1 + (this.accel.targetMultiplier - 1) * eased);

        if (progress >= 1) {
            this.config.baseSpeed = this.accel.originalSpeed;
            this.accel.active = false;
        }
    }
}


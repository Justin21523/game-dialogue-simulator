type LandingLine = {
    x: number;
    y: number;
    length: number;
    speed: number;
    opacity: number;
    thickness: number;
};

type LandingBackgroundConfig = {
    lineCount: number;
    lengthMin: number;
    lengthMax: number;
    speedMin: number;
    speedMax: number;
    opacityMin: number;
    opacityMax: number;
    thicknessMin: number;
    thicknessMax: number;
};

export class LandingBackgroundEffect {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly lines: LandingLine[] = [];

    public config: LandingBackgroundConfig = {
        lineCount: 100,
        lengthMin: 80,
        lengthMax: 280,
        speedMin: 400,
        speedMax: 1000,
        opacityMin: 0.3,
        opacityMax: 0.8,
        thicknessMin: 2,
        thicknessMax: 5
    };

    private isRunning = false;

    constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
        this.canvas = canvas;
        this.ctx = ctx;
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.initLines();
    }

    start(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        if (this.lines.length === 0) {
            this.initLines();
        }
    }

    stop(): void {
        this.isRunning = false;
    }

    update(deltaMs: number, planeVY: number): void {
        if (!this.isRunning) return;

        const dt = Math.min(deltaMs / 1000, 0.1);
        const speedMultiplier = this.getSpeedMultiplier(planeVY);

        for (const line of this.lines) {
            line.y += line.speed * speedMultiplier * dt;
            if (line.y > this.canvas.height + line.length) {
                line.y = -line.length;
                line.x = Math.random() * this.canvas.width;
            }
        }

        this.draw();
    }

    destroy(): void {
        this.stop();
        this.lines.length = 0;
    }

    private draw(): void {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const gradient = this.ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#0a1a2e');
        gradient.addColorStop(0.5, '#1a3050');
        gradient.addColorStop(1, '#2a5080');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, w, h);

        for (const line of this.lines) {
            this.ctx.globalAlpha = line.opacity;
            this.ctx.lineWidth = line.thickness;

            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            this.ctx.strokeStyle = '#ffffff';

            this.ctx.beginPath();
            this.ctx.moveTo(line.x, line.y);
            this.ctx.lineTo(line.x, line.y + line.length);
            this.ctx.stroke();
        }

        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1;
    }

    private initLines(): void {
        this.lines.length = 0;

        for (let i = 0; i < this.config.lineCount; i += 1) {
            this.lines.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                length: this.randomRange(this.config.lengthMin, this.config.lengthMax),
                speed: this.randomRange(this.config.speedMin, this.config.speedMax),
                opacity: this.randomRange(this.config.opacityMin, this.config.opacityMax),
                thickness: this.randomRange(this.config.thicknessMin, this.config.thicknessMax)
            });
        }
    }

    private getSpeedMultiplier(planeVY: number): number {
        const speed = Math.abs(planeVY);
        const normalized = Math.min(speed / 260, 1);
        return 0.75 + normalized * 1.25;
    }

    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
}

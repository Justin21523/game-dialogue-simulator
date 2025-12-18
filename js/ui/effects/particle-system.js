/**
 * Particle System for Super Wings Simulator
 * Canvas-based particle effects for celebrations, level ups, etc.
 */

class ParticleSystem {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.isRunning = false;
        this.animationId = null;

        this.presets = {
            confetti: this.createConfettiConfig,
            sparkle: this.createSparkleConfig,
            coinBurst: this.createCoinBurstConfig,
            levelUp: this.createLevelUpConfig,
            stars: this.createStarsConfig,
            firework: this.createFireworkConfig
        };

        this.init();
    }

    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'particle-canvas';
        this.canvas.className = 'particle-canvas';
        this.ctx = this.canvas.getContext('2d');

        // Style canvas
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9998;
        `;

        document.body.appendChild(this.canvas);
        this.resize();

        // Handle resize
        window.addEventListener('resize', () => this.resize());

        // Subscribe to events
        this.subscribeToEvents();
    }

    subscribeToEvents() {
        if (!window.eventBus) return;

        // Achievement unlocked
        window.eventBus.on('ACHIEVEMENT_UNLOCKED', () => {
            this.confetti();
        });

        // Level up
        window.eventBus.on('LEVEL_UP', () => {
            this.levelUp();
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Emit particles with configuration
     * @param {object} config - Particle configuration
     */
    emit(config) {
        const {
            count = 50,
            origin = { x: 0.5, y: 0.5 },
            spread = 360,
            angle = -90,
            velocity = { min: 5, max: 15 },
            size = { min: 5, max: 10 },
            colors = ['#E31D2B', '#0077BE', '#FFD700', '#4CAF50', '#9C27B0'],
            gravity = 0.3,
            friction = 0.98,
            lifetime = { min: 60, max: 120 },
            shape = 'rect',
            rotation = true,
            fade = true
        } = config;

        const startX = this.canvas.width * origin.x;
        const startY = this.canvas.height * origin.y;
        const spreadRad = (spread / 2) * (Math.PI / 180);
        const angleRad = angle * (Math.PI / 180);

        for (let i = 0; i < count; i++) {
            const particleAngle = angleRad + (Math.random() - 0.5) * 2 * spreadRad;
            const particleVelocity = velocity.min + Math.random() * (velocity.max - velocity.min);
            const particleSize = size.min + Math.random() * (size.max - size.min);
            const particleLifetime = lifetime.min + Math.random() * (lifetime.max - lifetime.min);

            this.particles.push({
                x: startX,
                y: startY,
                vx: Math.cos(particleAngle) * particleVelocity,
                vy: Math.sin(particleAngle) * particleVelocity,
                size: particleSize,
                color: colors[Math.floor(Math.random() * colors.length)],
                gravity,
                friction,
                lifetime: particleLifetime,
                maxLifetime: particleLifetime,
                rotation: rotation ? Math.random() * Math.PI * 2 : 0,
                rotationSpeed: rotation ? (Math.random() - 0.5) * 0.3 : 0,
                shape,
                fade
            });
        }

        this.start();
    }

    /**
     * Start animation loop
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.animate();
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.isRunning) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Update physics
            p.vy += p.gravity;
            p.vx *= p.friction;
            p.vy *= p.friction;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.lifetime--;

            // Calculate opacity
            const opacity = p.fade
                ? Math.max(0, p.lifetime / p.maxLifetime)
                : 1;

            // Draw particle
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation);
            this.ctx.globalAlpha = opacity;
            this.ctx.fillStyle = p.color;

            switch (p.shape) {
                case 'circle':
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                    this.ctx.fill();
                    break;
                case 'star':
                    this.drawStar(0, 0, p.size / 2, 5);
                    break;
                case 'rect':
                default:
                    this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }

            this.ctx.restore();

            // Remove dead particles
            if (p.lifetime <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Stop if no particles left
        if (this.particles.length === 0) {
            this.isRunning = false;
            return;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * Draw a star shape
     */
    drawStar(cx, cy, radius, points) {
        const inner = radius * 0.4;
        this.ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? radius : inner;
            const angle = (i * Math.PI) / points - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * Clear all particles
     */
    clear() {
        this.particles = [];
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ===== Preset Effects =====

    /**
     * Confetti explosion
     */
    confetti(options = {}) {
        this.emit({
            count: options.count || 100,
            origin: options.origin || { x: 0.5, y: 0.6 },
            spread: 180,
            angle: -90,
            velocity: { min: 8, max: 20 },
            size: { min: 6, max: 12 },
            colors: ['#E31D2B', '#0077BE', '#FFD700', '#4CAF50', '#9C27B0', '#FF9800'],
            gravity: 0.4,
            friction: 0.97,
            lifetime: { min: 80, max: 150 },
            shape: 'rect',
            rotation: true,
            fade: true
        });
    }

    /**
     * Sparkle effect
     */
    sparkle(options = {}) {
        this.emit({
            count: options.count || 30,
            origin: options.origin || { x: 0.5, y: 0.5 },
            spread: 360,
            angle: -90,
            velocity: { min: 2, max: 6 },
            size: { min: 3, max: 8 },
            colors: ['#FFD700', '#FFFFFF', '#FFF9C4'],
            gravity: 0,
            friction: 0.95,
            lifetime: { min: 30, max: 60 },
            shape: 'star',
            rotation: true,
            fade: true
        });
    }

    /**
     * Coin burst effect
     */
    coinBurst(options = {}) {
        this.emit({
            count: options.count || 20,
            origin: options.origin || { x: 0.5, y: 0.5 },
            spread: 90,
            angle: -90,
            velocity: { min: 10, max: 18 },
            size: { min: 10, max: 16 },
            colors: ['#FFD700', '#FFA500', '#FFEB3B'],
            gravity: 0.5,
            friction: 0.98,
            lifetime: { min: 60, max: 100 },
            shape: 'circle',
            rotation: false,
            fade: true
        });
    }

    /**
     * Level up effect (ring of particles)
     */
    levelUp(options = {}) {
        const origin = options.origin || { x: 0.5, y: 0.5 };
        const colors = options.colors || ['#FFD700', '#FFC107', '#FFEB3B', '#FFFFFF'];

        // Burst upward
        this.emit({
            count: 60,
            origin,
            spread: 120,
            angle: -90,
            velocity: { min: 10, max: 20 },
            size: { min: 4, max: 10 },
            colors,
            gravity: 0.3,
            friction: 0.97,
            lifetime: { min: 60, max: 120 },
            shape: 'star',
            rotation: true,
            fade: true
        });

        // Ring effect
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                this.emit({
                    count: 20,
                    origin,
                    spread: 360,
                    angle: 0,
                    velocity: { min: 3, max: 5 },
                    size: { min: 3, max: 6 },
                    colors,
                    gravity: 0,
                    friction: 0.96,
                    lifetime: { min: 40, max: 60 },
                    shape: 'circle',
                    rotation: false,
                    fade: true
                });
            }, i * 50);
        }
    }

    /**
     * Floating stars effect
     */
    stars(options = {}) {
        this.emit({
            count: options.count || 50,
            origin: options.origin || { x: 0.5, y: 1.1 },
            spread: 60,
            angle: -90,
            velocity: { min: 2, max: 5 },
            size: { min: 4, max: 8 },
            colors: ['#FFFFFF', '#E3F2FD', '#BBDEFB'],
            gravity: -0.1,
            friction: 0.99,
            lifetime: { min: 100, max: 200 },
            shape: 'star',
            rotation: true,
            fade: true
        });
    }

    /**
     * Firework effect
     */
    firework(options = {}) {
        const origin = options.origin || { x: Math.random() * 0.6 + 0.2, y: Math.random() * 0.3 + 0.2 };
        const color = options.color || ['#E31D2B', '#FFD700', '#0077BE', '#4CAF50', '#9C27B0'][Math.floor(Math.random() * 5)];
        const colors = [color, this.lightenColor(color, 30), this.lightenColor(color, 60)];

        this.emit({
            count: 80,
            origin,
            spread: 360,
            angle: 0,
            velocity: { min: 5, max: 12 },
            size: { min: 3, max: 6 },
            colors,
            gravity: 0.15,
            friction: 0.97,
            lifetime: { min: 60, max: 100 },
            shape: 'circle',
            rotation: false,
            fade: true
        });
    }

    /**
     * Multiple fireworks
     */
    fireworks(count = 5, delay = 300) {
        for (let i = 0; i < count; i++) {
            setTimeout(() => this.firework(), i * delay);
        }
    }

    /**
     * Lighten a hex color
     */
    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    }

    /**
     * Test all effects
     */
    test() {
        this.confetti();
        setTimeout(() => this.sparkle(), 500);
        setTimeout(() => this.coinBurst(), 1000);
        setTimeout(() => this.levelUp(), 1500);
        setTimeout(() => this.fireworks(3), 2000);
    }
}

// Create singleton instance
const particleSystem = new ParticleSystem();

// Make available globally
window.particleSystem = particleSystem;

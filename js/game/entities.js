export class Entity {
    constructor(x, y, width, height, type = 'entity') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
        this.markedForDeletion = false;
    }

    update(dt, speed) {
        this.x -= speed * dt;
        if (this.x + this.width < 0) this.markedForDeletion = true;
    }

    draw(ctx) {
        // Debug box
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
    
    get bounds() {
        const padding = this.width * 0.2; // 20% padding for forgiveness
        return {
            left: this.x + padding,
            right: this.x + this.width - padding,
            top: this.y + padding,
            bottom: this.y + this.height - padding
        };
    }
}

export class Cloud extends Entity {
    constructor(gameWidth, gameHeight) {
        const size = 60 + Math.random() * 80;
        super(gameWidth, Math.random() * (gameHeight - size), size, size * 0.6, 'cloud');
        this.speedFactor = 0.8 + Math.random() * 0.4; // Moves at different parallax speed
        this.alpha = 0.3 + Math.random() * 0.4;
    }

    update(dt, speed) {
        // Clouds might move faster or slower than the ground
        super.update(dt, speed * this.speedFactor);
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = '#FFFFFF';
        
        const r = this.width / 3;
        ctx.beginPath();
        ctx.arc(this.x + r, this.y + r, r, 0, Math.PI * 2);
        ctx.arc(this.x + r * 2, this.y + r, r * 1.2, 0, Math.PI * 2);
        ctx.arc(this.x + r * 1.5, this.y + r * 0.5, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

export class Obstacle extends Entity {
    constructor(gameWidth, gameHeight) {
        const size = 80;
        super(gameWidth, Math.random() * (gameHeight - size), size, size, 'obstacle');
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = '#555'; // Dark Grey Storm Cloud
        ctx.strokeStyle = '#FF5252'; // Red warning outline
        ctx.lineWidth = 2;
        
        // Draw jagged storm cloud
        ctx.beginPath();
        ctx.arc(this.x + 30, this.y + 30, 30, 0, Math.PI * 2);
        ctx.arc(this.x + 60, this.y + 30, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Lightning bolt symbol
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.moveTo(this.x + 40, this.y + 20);
        ctx.lineTo(this.x + 30, this.y + 50);
        ctx.lineTo(this.x + 50, this.y + 50);
        ctx.lineTo(this.x + 40, this.y + 80);
        ctx.fill();
        
        ctx.restore();
    }
}

export class Collectible extends Entity {
    constructor(gameWidth, gameHeight) {
        const size = 40;
        super(gameWidth, Math.random() * (gameHeight - size), size, size, 'collectible');
        this.oscillationOffset = Math.random() * Math.PI * 2;
        this.baseY = this.y;
        this.timer = 0;
    }

    update(dt, speed) {
        super.update(dt, speed);
        // Bobbing animation
        this.timer += dt * 5;
        this.y = this.baseY + Math.sin(this.timer + this.oscillationOffset) * 10;
    }

    draw(ctx) {
        ctx.save();
        // Glow effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#FFD700";
        
        ctx.fillStyle = '#FFD700'; // Gold Coin/Star
        ctx.beginPath();
        const r = this.width / 2;
        ctx.arc(this.x + r, this.y + r, r, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner detail
        ctx.fillStyle = '#FFFACD';
        ctx.beginPath();
        ctx.arc(this.x + r, this.y + r, r * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
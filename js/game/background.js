export class Background {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.image = new Image();
        // Attempt to load a generated background if available, else fallback
        this.image.src = "assets/images/backgrounds/sky/sky_blue_gradient_v2.png"; 
        
        this.x1 = 0;
        this.x2 = width;
        this.scrollSpeed = 0.5; // Background moves slower than foreground (Parallax)
    }

    update(dt, speed) {
        // Infinite scrolling logic
        const effectiveSpeed = speed * this.scrollSpeed;
        
        this.x1 -= effectiveSpeed * dt;
        this.x2 -= effectiveSpeed * dt;

        if (this.x1 <= -this.width) this.x1 = this.width + this.x2 - effectiveSpeed * dt;
        if (this.x2 <= -this.width) this.x2 = this.width + this.x1 - effectiveSpeed * dt;
    }

    draw(ctx) {
        if (this.image.complete && this.image.naturalWidth !== 0) {
            // Draw image twice for seamless loop
            ctx.drawImage(this.image, this.x1, 0, this.width, this.height);
            ctx.drawImage(this.image, this.x2, 0, this.width, this.height);
        } else {
            // Fallback: Procedural Sky
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, "#1E90FF");
            grad.addColorStop(1, "#87CEEB");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, this.width, this.height);
            
            // Draw some distant mountains
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.beginPath();
            ctx.moveTo(this.x1, this.height);
            ctx.lineTo(this.x1 + this.width/2, this.height - 200);
            ctx.lineTo(this.x1 + this.width, this.height);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(this.x2, this.height);
            ctx.lineTo(this.x2 + this.width/2, this.height - 200);
            ctx.lineTo(this.x2 + this.width, this.height);
            ctx.fill();
        }
    }
}

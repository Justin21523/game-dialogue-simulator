import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { eventBus } from '../../core/event-bus.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class HangarScreen {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.unsubscribe = null;
        this.selectedId = null;
        this.carouselIndex = 0;
        this.profileCache = new Map();
        this.profileVariants = ['heroic', 'ready', 'flying', 'smile'];

        // 動畫播放相關
        this.animationMode = false;
        this.animationFrames = [];
        this.animationIndex = 0;
        this.animationTimer = null;
        this.animationCache = new Map();
    }

    render() {
        const characters = gameState.getAllCharacters();
        if (!this.selectedId && characters.length) {
            this.selectedId = characters[0].id;
        }
        
        this.container.innerHTML = `
            <div class="screen hangar-screen anim-fade-in">
                <header class="screen-header">
                    <h2>Super Wings Hangar</h2>
                    <div class="resources-display">
                        <span class="res-item money-tag">💰 <span id="res-money">${gameState.resources.money}</span></span>
                        <span class="res-item fuel-tag">⛽ <span id="res-fuel">${gameState.resources.fuel}</span> / ${CONFIG.MAX_FUEL}</span>
                        <button id="btn-refuel-action" class="btn-icon" title="Refuel All">➕</button>
                    </div>
                </header>

                <div class="hangar-body">
                    <div class="character-grid">
                        ${characters.map(char => this.renderCharacterCard(char)).join('')}
                    </div>

                    <div class="character-detail">
                        ${this.renderDetail(characters)}
                    </div>
                </div>

                <div class="action-bar">
                        <button id="btn-back" class="btn btn-secondary">◀ MAIN MENU</button>
                        <button id="btn-dispatch" class="btn btn-primary pulse-btn">MISSION BOARD ➔</button>
                </div>
            </div>
        `;

        this.attachEvents();
        
        // Subscribe to updates
        const updateRes = (data) => {
            const elMoney = document.getElementById('res-money');
            const elFuel = document.getElementById('res-fuel');
            
            if (data.type === 'money' && elMoney) elMoney.innerText = Math.floor(data.value);
            if (data.type === 'fuel' && elFuel) elFuel.innerText = Math.floor(data.value);
        };
        eventBus.on('RESOURCE_UPDATED', updateRes);
        
        // Cleanup listener when screen changes (Not fully implemented in this simple router, 
        // but good practice. In this simple app, we might leak listeners slightly if not careful,
        // but it's acceptable for now).
    }

    renderCharacterCard(char) {
        const statusClass = char.status.toLowerCase();
        const selectedClass = this.selectedId === char.id ? 'selected' : '';

        return `
            <div class="char-card ${statusClass} ${selectedClass}" data-id="${char.id}">
                <div class="char-img-container" style="background: radial-gradient(circle, ${CONFIG.CHARACTERS[char.id].color}40 0%, transparent 70%);">
                    <img src="${aiAssetManager.getCharacterPlaceholder(char.id)}" data-role="grid-portrait" data-char-id="${char.id}" alt="${char.name}" loading="lazy">
                </div>
                <div class="char-info">
                    <div class="char-header">
                        <h3>${char.name}</h3>
                        <span class="char-type-badge">${char.type}</span>
                    </div>
                    <div class="char-stats">
                        <div class="stat-row">
                            <span>Lvl ${char.level}</span>
                            <span>⚡ ${char.energy}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="fill" style="width: ${char.energy}%; background-color: ${this.getEnergyColor(char.energy)}"></div>
                        </div>
                    </div>
                    <div class="char-status tag-${statusClass}">${char.status}</div>
                </div>
            </div>
        `;
    }

    getEnergyColor(val) {
        if (val > 70) return 'var(--color-success)';
        if (val > 30) return 'var(--color-warning)';
        return 'var(--color-danger)';
    }

    renderDetail(characters) {
        if (!this.selectedId) return '<div class="detail-empty">Select a character to view details.</div>';
        const char = characters.find(c => c.id === this.selectedId);
        if (!char) return '<div class="detail-empty">Character not found.</div>';

        const variant = this.getCurrentVariant();
        const cachedKey = this.getCacheKey(char.id, variant);
        const cached = this.profileCache.get(cachedKey);
        const imgSrc = cached || aiAssetManager.getCharacterPlaceholder(char.id);

        return `
            <div class="detail-card">
                <div class="detail-header">
                    <h3>${char.name}</h3>
                    <span class="badge">${char.type}</span>
                </div>

                    <div class="detail-body">
                        <div class="detail-carousel">
                            <button id="char-img-prev" class="carousel-btn">⟵</button>
                            <div class="carousel-img">
                                <img id="detail-portrait-img" src="${imgSrc}" data-role="detail-portrait" data-char-id="${char.id}" data-variant="${variant}" alt="${char.name}">
                            </div>
                            <button id="char-img-next" class="carousel-btn">⟶</button>
                        </div>

                        <div class="animation-controls">
                            <button id="btn-toggle-animation" class="btn btn-secondary">
                                ${this.animationMode ? '⏸️ 靜態圖片' : '▶️ 播放變身動畫'}
                            </button>
                        </div>

                    <div class="detail-stats">
                        <div class="stat-line"><span>Level</span><strong>${char.level}</strong></div>
                        <div class="stat-line"><span>Energy</span><strong>${char.energy}%</strong></div>
                        <div class="stat-line"><span>Speed</span><strong>${char.speed}</strong></div>
                        <div class="stat-line"><span>Reliability</span><strong>${char.reliability}%</strong></div>
                        <div class="stat-line"><span>Status</span><strong>${char.status}</strong></div>
                    </div>

                    <div class="detail-notes">
                        <p>Specialty: ${char.type} missions are a great match.</p>
                        <p>Tip: Keep energy above 20% before dispatch; leveling up improves speed and reliability.</p>
                    </div>
                </div>
            </div>
        `;
    }

    stepCarousel(dir) {
        this.carouselIndex += dir;
        this.render();
    }

    attachEvents() {
        document.getElementById('btn-back').addEventListener('click', () => {
            window.game.renderMainMenu();
        });
        
        document.getElementById('btn-dispatch').addEventListener('click', () => {
            window.game.renderMissionBoard();
        });

        document.getElementById('btn-refuel-action').addEventListener('click', () => {
            if(gameState.refuel()) {
                // simple feedback
                const btn = document.getElementById('btn-refuel-action');
                btn.innerText = "✅";
                setTimeout(() => btn.innerText = "➕", 1000);
            } else {
                alert("Cannot refuel (Full or Insufficient Funds)");
            }
        });

        // Select character cards
        this.container.querySelectorAll('.char-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                this.selectedId = id;
                this.carouselIndex = 0;
                this.render();
            });
        });

        // Carousel controls
        const btnPrev = this.container.querySelector('#char-img-prev');
        const btnNext = this.container.querySelector('#char-img-next');
        if (btnPrev) btnPrev.addEventListener('click', () => this.stepCarousel(-1));
        if (btnNext) btnNext.addEventListener('click', () => this.stepCarousel(1));

        // Animation toggle
        const btnToggleAnim = this.container.querySelector('#btn-toggle-animation');
        if (btnToggleAnim) {
            btnToggleAnim.addEventListener('click', () => this.toggleAnimation());
        }

        // AI 圖片補載
        const characters = gameState.getAllCharacters();
        this.loadGridPortraits(characters);
        this.loadDetailPortrait();

        // 如果之前在動畫模式,重新啟動動畫
        if (this.animationMode && this.selectedId) {
            this.startAnimation();
        }
    }

    getCurrentVariant() {
        const len = this.profileVariants.length;
        const idx = ((this.carouselIndex % len) + len) % len;
        return this.profileVariants[idx];
    }

    getCacheKey(charId, variant) {
        return `${charId}:${variant}`;
    }

    getVariantContext(variant) {
        switch (variant) {
            case 'flying':
                return { action: 'flying', game_state: 'hangar_showcase', context: 'showcasing flight mode' };
            case 'ready':
                return { action: 'ready', emotion: 'focused', game_state: 'mission_start' };
            case 'smile':
                return { action: 'idle', emotion: 'happy', context: 'friendly wave' };
            case 'heroic':
            default:
                return { action: 'heroic_pose', emotion: 'determined', context: 'hangar hero pose' };
        }
    }

    async loadGridPortraits(characters) {
        for (const char of characters) {
            await this.loadProfileImage(char.id, 'heroic');
        }
    }

    async loadDetailPortrait() {
        if (!this.selectedId) return;
        const variant = this.getCurrentVariant();
        await this.loadProfileImage(this.selectedId, variant);
    }

    async loadProfileImage(charId, variant) {
        const cacheKey = this.getCacheKey(charId, variant);
        let src = this.profileCache.get(cacheKey);

        if (!src) {
            try {
                const { selection } = await aiAssetManager.preloadProfileImage(charId, this.getVariantContext(variant));
                src = selection?.primary || aiAssetManager.getCharacterPlaceholder(charId);
                this.profileCache.set(cacheKey, src);
            } catch (e) {
                src = aiAssetManager.getCharacterPlaceholder(charId);
            }
        }

        this.container.querySelectorAll(`img[data-char-id="${charId}"]`).forEach(img => {
            if (img.dataset.role === 'detail-portrait' && img.dataset.variant !== variant) return;
            img.src = src;
        });
    }

    /**
     * 切換動畫播放模式
     */
    async toggleAnimation() {
        this.animationMode = !this.animationMode;

        if (this.animationMode) {
            // 啟動動畫播放
            await this.startAnimation();
        } else {
            // 停止動畫
            this.stopAnimation();
            this.render();
        }
    }

    /**
     * 啟動動畫播放
     */
    async startAnimation() {
        if (!this.selectedId) return;

        // 停止之前的動畫
        this.stopAnimation();

        // 檢查緩存
        const cached = this.animationCache.get(this.selectedId);
        if (cached) {
            this.animationFrames = cached;
            this.playAnimation();
            return;
        }

        // 載入動畫幀
        console.log(`[Hangar] Loading animation frames for ${this.selectedId}...`);
        const btnToggle = this.container.querySelector('#btn-toggle-animation');
        if (btnToggle) btnToggle.textContent = '⏳ 載入中...';

        try {
            const { frames, cache } = await aiAssetManager.getTransformFrames(this.selectedId, {
                useInterpolated: true,
                reverse: false
            });

            console.log(`[Hangar] ========================================`);
            console.log(`[Hangar] Frame paths returned: ${frames.length}`);
            console.log(`[Hangar] First frame path: ${frames[0]}`);
            console.log(`[Hangar] Last frame path: ${frames[frames.length - 1]}`);
            console.log(`[Hangar] Cache size: ${Object.keys(cache).length}`);
            console.log(`[Hangar] ========================================`);

            // 將緩存的圖片存儲到數組中
            this.animationFrames = frames.map(path => cache[path]).filter(img => img);

            console.log(`[Hangar] Successfully loaded images: ${this.animationFrames.length}/${frames.length}`);

            if (this.animationFrames.length > 0) {
                this.animationCache.set(this.selectedId, this.animationFrames);
                console.log(`[Hangar] Starting playback with ${this.animationFrames.length} frames @ 30fps`);
                console.log(`[Hangar] Expected duration: ${(this.animationFrames.length / 30).toFixed(2)}s`);
                this.playAnimation();
            } else {
                console.warn('[Hangar] No frames loaded');
                this.animationMode = false;
                this.render();
            }
        } catch (e) {
            console.error('[Hangar] Failed to load animation:', e);
            this.animationMode = false;
            this.render();
        }
    }

    /**
     * 播放動畫循環 (12fps 慢速播放，讓變身過程更清晰)
     */
    playAnimation() {
        if (!this.animationFrames.length) return;

        this.animationIndex = 0;
        const img = this.container.querySelector('#detail-portrait-img');
        if (!img) return;

        // 30 fps 播放速度 (與變身畫面一致)
        const fps = 30;
        const frameInterval = 1000 / fps;  // ~33.33ms

        const updateFrame = () => {
            if (!this.animationMode || !this.animationFrames.length) {
                this.stopAnimation();
                return;
            }

            // 顯示當前幀
            const frameToShow = this.animationIndex % this.animationFrames.length;
            const frame = this.animationFrames[frameToShow];

            if (frame && img) {
                img.src = frame.src;
            }

            this.animationIndex++;

            // 循環播放
            if (this.animationIndex >= this.animationFrames.length) {
                this.animationIndex = 0;
            }

            this.animationTimer = setTimeout(updateFrame, frameInterval);
        };

        updateFrame();
    }

    /**
     * 停止動畫播放
     */
    stopAnimation() {
        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = null;
        }
    }
}

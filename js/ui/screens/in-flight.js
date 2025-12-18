import { gameState } from '../../core/game-state.js';
import { CONFIG } from '../../config.js';
import { FlightEngine } from '../../game/flight-engine.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';
import { aiService } from '../../core/ai-service.js';

export class InFlightScreen {
    constructor(containerId, missionId) {
        this.container = document.getElementById(containerId);
        this.missionId = missionId;
        this.engine = null;
        this.flightImage = null;
        this.narrationText = '';
    }

    async render() {
        // ===== 🆕 支援召喚任務：直接使用 missionData 物件 =====
        let mission;
        if (typeof this.missionId === 'object') {
            // missionId 實際上是 missionData 物件（召喚任務）
            mission = this.missionId;
            this.missionId = mission.id;
            console.log('[InFlight] Using summon mission data directly:', mission);
        } else {
            // 正常任務：從 gameState 查找
            mission = gameState.activeMissions.find(m => m.id === this.missionId);
            if (!mission) {
                console.error("Mission not found active!");
                window.game.renderHangar();
                return;
            }
        }

        const char = gameState.getCharacter(mission.assignedCharId);

        // AI 選圖（飛行階段角色）
        try {
            const { selection } = await aiAssetManager.preloadMissionImage(char.id, mission.type, 'in_flight');
            this.flightImage = selection?.primary || aiAssetManager.getCharacterPlaceholder(char.id);
        } catch (e) {
            this.flightImage = aiAssetManager.getCharacterPlaceholder(char.id);
        }

        // AI 選擇飛行背景（動態天氣、時間）
        this.flightBackground = null;
        try {
            const { selection } = await this.loadAIFlightBackground(mission);
            this.flightBackground = selection?.primary || null;
            console.log('[InFlight] AI Flight Background:', this.flightBackground);
        } catch (e) {
            console.warn('[InFlight] Failed to load AI flight background:', e);
        }

        this.container.innerHTML = `
            <div class="screen in-flight-screen">
                <canvas id="flight-canvas" width="1280" height="720"></canvas>
                
                <div class="flight-controls-hint">
                    <div class="hud-section title">FLIGHT CONTROLS</div>
                    
                    <div class="hud-row">
                        <div class="keys"><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></div>
                        <div class="desc">MOVE</div>
                    </div>
                    
                    <div class="hud-row">
                        <div class="keys"><span class="key space">SPACE</span></div>
                        <div class="desc">TURBO BOOST (HOLD)</div>
                    </div>

                    <div class="hud-divider"></div>

                    <div class="hud-row">
                        <div class="icon storm">⚡</div>
                        <div class="desc warning">AVOID STORMS (-HP)</div>
                    </div>

                    <div class="hud-row">
                        <div class="icon coin">⭐</div>
                        <div class="desc bonus">COLLECT BONUS (+PTS)</div>
                    </div>

                    <div class="hud-footer">
                        🔊 Sound On Recommended
                    </div>
                </div>

                <div class="mission-overlay">
                    <h3>${mission.title}</h3>
                    <div class="flight-narration" id="flight-narration"></div>
                </div>
            </div>
        `;

        // ===== 🆕 傳遞完整 mission 物件而不是 mission.id =====
        this.initGame(char.id, this.flightImage, mission);

        // Narration (non-blocking)
        this.loadNarration(mission, char);

        this.addStyles();
    }

    initGame(charId, imgPath, missionData) {
        // ===== 🆕 支援完整 mission 物件和 mission ID =====
        let mission;
        let isSummonMission = false;

        if (typeof missionData === 'object') {
            // missionData 是完整的 mission 物件
            mission = missionData;
            isSummonMission = missionData.isSummonMission || false;
            if (isSummonMission) {
                console.log('[InFlight] Summon mission detected:', mission.characterId);
            }
        } else {
            // missionData 是 mission ID（字符串），從 gameState 查找
            mission = gameState.activeMissions.find(m => m.id === missionData);
        }

        if (!mission) {
            console.error('[InFlight] Mission not found in initGame!');
            window.game.renderHangar();
            return;
        }

        const canvas = document.getElementById('flight-canvas');

        // Resize canvas
        this.fitCanvas(canvas);
        window.addEventListener('resize', () => this.fitCanvas(canvas));

        // 傳遞 AI 背景到 FlightEngine
        const engineOptions = {
            useParallax: true,
            weather: 'clear'
        };

        // ===== 召喚任務簡化飛行 =====
        if (isSummonMission && mission.simplifiedFlight) {
            engineOptions.duration = 30000;    // 30秒
            engineOptions.difficulty = 'easy';
            engineOptions.spawnRate = 0.5;
            console.log('[InFlight] Using simplified flight for summon mission');
        }

        if (this.flightBackground) {
            engineOptions.customBackground = this.flightBackground;
            console.log('[InFlight] Using AI custom background:', this.flightBackground);
        }

        this.engine = new FlightEngine(canvas, charId, imgPath, (gameResult) => {
            this.handleCompletion(missionData, gameResult, isSummonMission);
        }, mission.type, engineOptions);

        // AI 生成的起飛/飛行音效（非阻塞）
        this.playAISound('flight', 'ambient');
    }

    fitCanvas(canvas) {
        // Full screen canvas
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // Update engine dimensions if running
        if (this.engine) {
            this.engine.width = canvas.width;
            this.engine.height = canvas.height;
        }
    }

    handleCompletion(missionData, gameResult = { score: 0 }, isSummonMission = false) {
        // Short delay before next screen
        setTimeout(() => {
            // ===== 所有任務都進入 Arrival 動畫 =====
            console.log('[InFlight] Mission complete, going to Arrival animation');
            window.game.renderArrival(missionData, gameResult.score);
        }, 1000);
    }

    async loadAIFlightBackground(mission) {
        try {
            // 隨機天氣和時間增加多樣性
            const timeOfDay = ['morning', 'afternoon', 'evening', 'night'][Math.floor(Math.random() * 4)];
            const weather = ['clear', 'cloudy', 'sunset', 'stormy'][Math.floor(Math.random() * 4)];

            // 根據任務類型調整場景
            const altitude = mission.type === 'Delivery' ? 'high' : 'medium';

            const flightContext = {
                time_of_day: timeOfDay,
                weather: weather,
                altitude: altitude,
                mission_type: mission.type,
                destination: mission.location || 'unknown',
                style: 'cartoon'
            };

            console.log('[InFlight] Loading AI background with context:', flightContext);

            const { selection, cache } = await aiAssetManager.preloadFlightBackground(flightContext);

            return { selection, cache };
        } catch (error) {
            console.warn('[InFlight] Failed to load AI flight background:', error);
            return { selection: { primary: null }, cache: {} };
        }
    }

    async playAISound(category, soundType) {
        try {
            const sound = await aiService.generateSound(category, soundType, { durationMs: 4000 });
            if (sound?.audio_url) {
                const audio = new Audio(sound.audio_url);
                audio.loop = false;
                audio.play();
            }
        } catch (e) {
            // ignore
        }
    }

    async loadNarration(mission, char) {
        try {
            const res = await aiService.generateNarration({
                characterId: char?.id,
                phase: 'in_flight',
                location: mission?.location,
                problem: mission?.description,
                result: 'en_route'
            });
            this.narrationText = res?.narration || '';
            const el = document.getElementById('flight-narration');
            if (el && this.narrationText) {
                el.textContent = this.narrationText;
            }
            if (res?.offline) {
                aiService.notifyOffline('Flight narration');
            }
        } catch (e) {
            // ignore
        }
    }

    addStyles() {
        if (document.getElementById('in-flight-styles')) return;
        const style = document.createElement('style');
        style.id = 'in-flight-styles';
        style.textContent = `
            .mission-overlay {
                position: absolute;
                top: 20px;
                left: 20px;
                background: rgba(0,0,0,0.4);
                padding: 10px 16px;
                border-radius: 8px;
                color: #fff;
                z-index: 5;
            }
            .flight-narration {
                margin-top: 8px;
                max-width: 360px;
                background: rgba(0,0,0,0.55);
                color: #e6f7ff;
                padding: 8px 12px;
                border-left: 3px solid #FFD700;
                border-radius: 6px;
                font-size: 13px;
                line-height: 1.4;
            }
        `;
        document.head.appendChild(style);
    }
}

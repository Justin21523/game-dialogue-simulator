/**
 * PartnerSystem - 夥伴呼叫與切換系統
 * 管理多角色同時在場、入場序列、即時切換
 */

import { eventBus } from '../core/event-bus.js';
import { PlayerCharacter } from '../game/entities/player-character.js';

export class PartnerSystem {
    constructor(world, options = {}) {
        this.world = world;

        // 當前控制角色
        this.currentPlayer = null;

        // 所有在場夥伴
        this.activePartners = new Map();

        // 可用角色列表
        this.availableCharacters = new Map();

        // 呼叫設定
        this.callCooldown = options.callCooldown ?? 5000;  // 5 秒冷卻
        this.lastCallTime = 0;

        // ===== Stage 4: Remove partner limit, add performance threshold =====
        this.maxActivePartners = Infinity;  // No limit!
        this.performanceThreshold = options.performanceThreshold ?? 8;  // Warn at 8 partners

        // 入場設定
        this.arrivalDuration = options.arrivalDuration ?? 4500;  // 入場序列總時間
        this.landingPosition = { x: 0, y: 0 };

        // 入場狀態
        this.arrivalInProgress = false;
        this.arrivingCharacter = null;

        // AI 控制更新間隔
        this.aiUpdateInterval = 100;  // 100ms
        this.lastAiUpdate = 0;

        // 跟隨設定
        this.followDistance = 150;
        this.followSpeed = 200;

        // ===== Stage 7: Performance optimization =====
        this.performanceManager = new PerformanceManager(this);

        // 事件監聽
        this.setupEventListeners();
    }

    /**
     * 設定事件監聽 (Stage 4: Add Q/E switching)
     */
    setupEventListeners() {
        eventBus.on('CALL_PARTNER', (data) => this.callPartner(data.characterId));
        eventBus.on('SWITCH_TO_PARTNER', (data) => this.switchTo(data.characterId));
        eventBus.on('DISMISS_PARTNER', (data) => this.dismissPartner(data.characterId));
        eventBus.on('PARTNER_LANDING', (data) => this.onPartnerLanding(data));

        // ===== Stage 4: Q/E character switching =====
        eventBus.on('SWITCH_CHARACTER_PREV', () => this.switchToPrevious());
        eventBus.on('SWITCH_CHARACTER_NEXT', () => this.switchToNext());
    }

    /**
     * 初始化系統
     * @param {string} startingCharacterId - 初始角色 ID
     * @param {Object} characterData - 角色資料
     */
    initialize(startingCharacterId, characterData) {
        // 設定可用角色
        this.loadAvailableCharacters(characterData);

        // 創建初始玩家
        const startingChar = this.availableCharacters.get(startingCharacterId);
        if (startingChar) {
            const player = new PlayerCharacter(startingCharacterId, startingChar);
            player.x = 200;
            player.y = 400;
            player.isAIControlled = false;

            this.currentPlayer = player;
            this.activePartners.set(startingCharacterId, player);
            this.world.addPlayer(player);

            eventBus.emit('CAMERA_FOLLOW', { target: player });
        }
    }

    /**
     * 設定當前玩家
     * @param {PlayerCharacter} player - 玩家角色
     */
    setCurrentPlayer(player) {
        this.currentPlayer = player;
        if (player && !this.activePartners.has(player.characterId)) {
            this.activePartners.set(player.characterId, player);
        }
    }

    /**
     * 載入可用角色
     */
    loadAvailableCharacters(characterData) {
        this.availableCharacters.clear();

        for (const [id, data] of Object.entries(characterData)) {
            this.availableCharacters.set(id, {
                id: id,
                name: data.name,
                color: data.color || '#FF6B6B',
                icon: data.icon || '✈️',
                abilities: data.abilities || [],
                portraitSrc: data.portraitSrc || null,
                spriteSrc: data.spriteSrc || null,
                isAvailable: data.isAvailable ?? true
            });
        }
    }

    /**
     * 呼叫夥伴
     * @param {string} characterId - 角色 ID
     * @returns {Promise<boolean>}
     */
    async callPartner(characterId) {
        // 檢查冷卻
        const now = Date.now();
        if (now - this.lastCallTime < this.callCooldown) {
            const remaining = Math.ceil((this.callCooldown - (now - this.lastCallTime)) / 1000);
            eventBus.emit('SHOW_TOAST', {
                message: `請稍候 ${remaining} 秒`,
                type: 'warning'
            });
            return false;
        }

        // 檢查是否已在場
        if (this.activePartners.has(characterId)) {
            eventBus.emit('SHOW_TOAST', {
                message: '該角色已經在場',
                type: 'info'
            });
            this.switchTo(characterId);
            return true;
        }

        // ===== Stage 4: Performance warning instead of hard limit =====
        if (this.activePartners.size >= this.performanceThreshold) {
            const proceed = await this.showPerformanceWarning(this.activePartners.size);
            if (!proceed) {
                return false;
            }
        }

        // 檢查角色是否可用
        const charData = this.availableCharacters.get(characterId);
        if (!charData || !charData.isAvailable) {
            eventBus.emit('SHOW_TOAST', {
                message: `${charData?.name || '該角色'} 目前無法出動`,
                type: 'error'
            });
            return false;
        }

        // ===== Sprint 3.2: 觸發完整召喚流程 =====
        // 不再使用簡化版入場動畫，改為觸發完整 Launch→Transform→Flight→Landing 流程
        this.lastCallTime = now;
        this.arrivalInProgress = true;
        this.arrivingCharacter = characterId;

        console.log(`[PartnerSystem] Triggering full summon flow for ${characterId}`);

        // 發送 CALL_PARTNER 事件，由 ExplorationScreen 處理
        eventBus.emit('CALL_PARTNER', {
            characterId: characterId,
            charData: charData
        });

        // ❌ 移除舊的簡化版入場動畫
        // await this.playArrivalSequence(characterId, charData);

        return true;
    }

    /**
     * 播放入場序列
     * @param {string} characterId - 角色 ID
     * @param {Object} charData - 角色資料
     */
    async playArrivalSequence(characterId, charData) {
        // 計算降落位置
        this.landingPosition = {
            x: this.currentPlayer.x + 200,
            y: this.currentPlayer.y
        };

        // 通知 UI 顯示入場動畫
        eventBus.emit('PARTNER_ARRIVAL_START', {
            characterId: characterId,
            charData: charData,
            phases: [
                { name: 'takeoff', duration: 1500 },
                { name: 'flying', duration: 1000 },
                { name: 'transform', duration: 2000 }
            ]
        });

        // 等待動畫完成
        await this.waitForArrival();

        // 創建角色並加入場景
        const partner = new PlayerCharacter(characterId, charData);
        partner.x = this.landingPosition.x;
        partner.y = -100;  // 從上方進入
        partner.isAIControlled = true;
        partner.targetY = this.landingPosition.y;
        partner.isLanding = true;

        this.activePartners.set(characterId, partner);
        this.world.addPlayer(partner);

        // 播放降落動畫
        eventBus.emit('PARTNER_LANDING', {
            characterId: characterId,
            position: this.landingPosition
        });

        this.arrivalInProgress = false;
        this.arrivingCharacter = null;

        eventBus.emit('PARTNER_ARRIVED', {
            characterId: characterId,
            partner: partner
        });

        eventBus.emit('SHOW_TOAST', {
            message: `${charData.name} 已抵達！`,
            type: 'success'
        });
    }

    /**
     * 等待入場完成
     */
    waitForArrival() {
        return new Promise(resolve => {
            setTimeout(resolve, this.arrivalDuration);
        });
    }

    /**
     * 夥伴降落回調
     */
    onPartnerLanding(data) {
        const partner = this.activePartners.get(data.characterId);
        if (partner) {
            partner.isLanding = false;
            partner.y = this.world.groundY || 500;
            partner.isGrounded = true;
        }
    }

    /**
     * 切換控制角色
     * @param {string} characterId - 角色 ID
     * @returns {boolean}
     */
    switchTo(characterId) {
        const partner = this.activePartners.get(characterId);
        if (!partner) {
            eventBus.emit('SHOW_TOAST', {
                message: '該角色不在場',
                type: 'warning'
            });
            return false;
        }

        if (partner === this.currentPlayer) {
            return true;  // 已經是當前角色
        }

        // 舊角色變 AI 控制
        if (this.currentPlayer) {
            this.currentPlayer.isAIControlled = true;
            this.currentPlayer.vx = 0;
        }

        // 新角色變玩家控制
        partner.isAIControlled = false;
        this.currentPlayer = partner;

        // 攝影機跟隨
        eventBus.emit('CAMERA_FOLLOW', { target: partner });

        // 通知 UI 更新
        eventBus.emit('PLAYER_SWITCHED', {
            characterId: characterId,
            partner: partner
        });

        return true;
    }

    /**
     * 解散夥伴
     * @param {string} characterId - 角色 ID
     * @returns {boolean}
     */
    dismissPartner(characterId) {
        const partner = this.activePartners.get(characterId);
        if (!partner) return false;

        // 不能解散當前控制的角色（除非只剩一人）
        if (partner === this.currentPlayer) {
            if (this.activePartners.size <= 1) {
                eventBus.emit('SHOW_TOAST', {
                    message: '無法解散最後一名夥伴',
                    type: 'warning'
                });
                return false;
            }

            // 切換到另一個角色
            const otherPartner = Array.from(this.activePartners.values()).find(p => p !== partner);
            if (otherPartner) {
                this.switchTo(otherPartner.characterId);
            }
        }

        // 播放離開動畫
        eventBus.emit('PARTNER_LEAVING', { characterId: characterId });

        // 從場景移除
        this.world.removePlayer(characterId);
        this.activePartners.delete(characterId);

        eventBus.emit('PARTNER_DISMISSED', { characterId: characterId });

        return true;
    }

    /**
     * Show performance warning (Stage 4)
     * @param {number} currentCount - Current partner count
     * @returns {Promise<boolean>} Whether to proceed
     */
    async showPerformanceWarning(currentCount) {
        return new Promise((resolve) => {
            eventBus.emit('SHOW_CONFIRM_DIALOG', {
                title: '⚠️ Performance Warning',
                message: `Currently ${currentCount} partners are active. This may affect performance. Continue calling?`,
                confirmText: 'Continue',
                cancelText: 'Cancel',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });

            // Fallback: if no dialog system, auto-confirm
            setTimeout(() => resolve(true), 100);
        });
    }

    /**
     * Switch to previous character (Stage 4 - Q key)
     * Circular switching through all active partners
     * @returns {boolean}
     */
    switchToPrevious() {
        const partners = Array.from(this.activePartners.values());
        if (partners.length <= 1) {
            eventBus.emit('SHOW_TOAST', {
                message: 'No other partners to switch to',
                type: 'info',
                duration: 2000
            });
            return false;
        }

        const currentIndex = partners.findIndex(p => p === this.currentPlayer);
        const prevIndex = (currentIndex - 1 + partners.length) % partners.length;

        return this.switchTo(partners[prevIndex].characterId);
    }

    /**
     * Switch to next character (Stage 4 - E key)
     * Circular switching through all active partners
     * @returns {boolean}
     */
    switchToNext() {
        const partners = Array.from(this.activePartners.values());
        if (partners.length <= 1) {
            eventBus.emit('SHOW_TOAST', {
                message: 'No other partners to switch to',
                type: 'info',
                duration: 2000
            });
            return false;
        }

        const currentIndex = partners.findIndex(p => p === this.currentPlayer);
        const nextIndex = (currentIndex + 1) % partners.length;

        return this.switchTo(partners[nextIndex].characterId);
    }

    /**
     * 更新系統
     * @param {number} dt - 時間差（秒）
     * @param {number} currentFps - 當前 FPS（選填）
     */
    update(dt, currentFps = 60) {
        const now = Date.now();

        // ===== Stage 7: Performance optimization =====
        // 優化夥伴更新頻率（基於距離）
        this.performanceManager.optimizePartnerUpdates(dt);

        // 監控效能並動態調整
        this.performanceManager.monitorPerformance(currentFps);

        // 更新 AI 控制的角色
        if (now - this.lastAiUpdate >= this.aiUpdateInterval) {
            this.updateAIControlledPartners(dt);
            this.lastAiUpdate = now;
        }

        // 更新降落中的角色
        for (const partner of this.activePartners.values()) {
            if (partner.isLanding) {
                this.updateLanding(partner, dt);
            }
        }
    }

    /**
     * 更新 AI 控制的夥伴
     */
    updateAIControlledPartners(dt) {
        if (!this.currentPlayer) return;

        const playerX = this.currentPlayer.x;
        const playerY = this.currentPlayer.y;

        let index = 0;
        for (const partner of this.activePartners.values()) {
            if (!partner.isAIControlled) continue;

            // ===== Stage 7: Skip update if performance manager says so =====
            if (partner.shouldUpdate === false) {
                index++;
                continue;
            }

            // 計算跟隨位置（排列在玩家後方）
            const targetX = playerX - this.followDistance * (index + 1);
            const targetY = playerY;

            // 移動向目標
            const dx = targetX - partner.x;
            const dy = targetY - partner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 30) {
                const speed = Math.min(this.followSpeed, dist * 2);
                partner.vx = (dx / dist) * speed;

                // 飛行模式跟隨
                if (this.currentPlayer.mode === 'flying') {
                    partner.mode = 'flying';
                    partner.isFlying = true;
                    partner.vy = (dy / dist) * speed;
                } else {
                    partner.mode = 'walking';
                    partner.isFlying = false;
                }

                partner.facingRight = dx > 0;
            } else {
                partner.vx = 0;
                if (!partner.isFlying) partner.vy = 0;
            }

            index++;
        }
    }

    /**
     * 更新降落動畫
     */
    updateLanding(partner, dt) {
        const targetY = this.world.groundY || 500;
        const landingSpeed = 400;

        partner.y += landingSpeed * dt;

        if (partner.y >= targetY) {
            partner.y = targetY;
            partner.isLanding = false;
            partner.isGrounded = true;
            partner.vy = 0;

            // 降落特效
            eventBus.emit('LANDING_EFFECT', {
                x: partner.x,
                y: partner.y
            });
        }
    }

    /**
     * 取得當前玩家
     * @returns {PlayerCharacter|null}
     */
    getCurrentPlayer() {
        return this.currentPlayer;
    }

    /**
     * 取得所有在場夥伴
     * @returns {Map}
     */
    getActivePartners() {
        return this.activePartners;
    }

    /**
     * 取得可用角色列表
     * @returns {Map}
     */
    getAvailableCharacters() {
        return this.availableCharacters;
    }

    /**
     * 取得可呼叫的角色（不在場的）
     * @returns {Array}
     */
    getCallableCharacters() {
        const callable = [];
        for (const [id, data] of this.availableCharacters) {
            if (!this.activePartners.has(id) && data.isAvailable) {
                callable.push({ id, ...data });
            }
        }
        return callable;
    }

    /**
     * 是否可以呼叫夥伴
     * @returns {boolean}
     */
    canCallPartner() {
        if (this.arrivalInProgress) return false;
        if (this.activePartners.size >= this.maxActivePartners) return false;

        const now = Date.now();
        return now - this.lastCallTime >= this.callCooldown;
    }

    /**
     * 取得呼叫冷卻剩餘時間
     * @returns {number} 毫秒
     */
    getCallCooldownRemaining() {
        const elapsed = Date.now() - this.lastCallTime;
        return Math.max(0, this.callCooldown - elapsed);
    }

    /**
     * 是否正在入場
     * @returns {boolean}
     */
    isArrivalInProgress() {
        return this.arrivalInProgress;
    }

    /**
     * 取得正在入場的角色 ID
     * @returns {string|null}
     */
    getArrivingCharacter() {
        return this.arrivingCharacter;
    }

    /**
     * 序列化
     * @returns {Object}
     */
    serialize() {
        return {
            currentPlayerId: this.currentPlayer?.characterId,
            activePartnerIds: Array.from(this.activePartners.keys()),
            partnerPositions: Array.from(this.activePartners.entries()).map(([id, p]) => ({
                id,
                x: p.x,
                y: p.y,
                mode: p.mode
            }))
        };
    }

    /**
     * 反序列化
     * @param {Object} data - 序列化資料
     */
    deserialize(data) {
        // 還原在場夥伴
        for (const pos of data.partnerPositions) {
            const charData = this.availableCharacters.get(pos.id);
            if (!charData) continue;

            if (!this.activePartners.has(pos.id)) {
                const partner = new PlayerCharacter(pos.id, charData);
                partner.x = pos.x;
                partner.y = pos.y;
                partner.mode = pos.mode || 'walking';
                partner.isAIControlled = pos.id !== data.currentPlayerId;

                this.activePartners.set(pos.id, partner);
                this.world.addPlayer(partner);
            }
        }

        // 設定當前玩家
        if (data.currentPlayerId) {
            this.currentPlayer = this.activePartners.get(data.currentPlayerId);
            if (this.currentPlayer) {
                this.currentPlayer.isAIControlled = false;
            }
        }
    }

    /**
     * 重置系統
     */
    reset() {
        // 移除所有夥伴
        for (const id of this.activePartners.keys()) {
            this.world.removePlayer(id);
        }

        this.activePartners.clear();
        this.currentPlayer = null;
        this.arrivalInProgress = false;
        this.arrivingCharacter = null;
        this.lastCallTime = 0;
    }

    /**
     * 銷毀
     */
    dispose() {
        this.reset();
        this.world = null;
        this.availableCharacters.clear();
    }
}

/**
 * PerformanceManager - 效能優化管理器 (Stage 7)
 *
 * 功能：
 * - 基於距離分級更新夥伴（遠距離降低更新頻率）
 * - 監控 FPS 並動態調整更新策略
 * - LOD (Level of Detail) 系統
 */
class PerformanceManager {
    constructor(partnerSystem) {
        this.partnerSystem = partnerSystem;

        // 距離分級設定
        this.distanceThresholds = {
            far: 1500,      // > 1500px: 1 秒更新一次
            medium: 750,    // 750-1500px: 500ms 更新一次
            near: 0         // < 750px: 正常頻率 (100ms)
        };

        // 更新間隔（毫秒）
        this.updateIntervals = {
            far: 1000,
            medium: 500,
            near: 100
        };

        // 每個夥伴的最後更新時間
        this.lastUpdateTimes = new Map();

        // FPS 監控
        this.fpsHistory = [];
        this.fpsCheckInterval = 1000;  // 每秒檢查 FPS
        this.lastFpsCheck = 0;
        this.targetFps = 45;  // 目標 FPS
        this.lowFpsThreshold = 30;  // 低於此值觸發降級

        // 效能等級
        this.performanceLevel = 'normal';  // 'normal', 'degraded', 'minimal'
    }

    /**
     * 優化夥伴更新頻率
     * @param {number} dt - Delta time
     */
    optimizePartnerUpdates(dt) {
        const currentPlayer = this.partnerSystem.currentPlayer;
        if (!currentPlayer) return;

        const now = Date.now();
        const playerX = currentPlayer.x;
        const playerY = currentPlayer.y;

        for (const [id, partner] of this.partnerSystem.activePartners) {
            if (partner === currentPlayer) continue;

            // 計算距離
            const dx = partner.x - playerX;
            const dy = partner.y - playerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 根據距離決定更新間隔
            const distanceLevel = this.getDistanceLevel(distance);
            const updateInterval = this.getUpdateInterval(distanceLevel);

            // 檢查是否需要更新
            const lastUpdate = this.lastUpdateTimes.get(id) || 0;
            if (now - lastUpdate >= updateInterval) {
                // 更新此夥伴
                partner.shouldUpdate = true;
                this.lastUpdateTimes.set(id, now);
            } else {
                // 跳過此次更新
                partner.shouldUpdate = false;
            }

            // LOD: 遠距離夥伴簡化渲染
            if (distanceLevel === 'far') {
                partner.lodLevel = 2;  // 最低細節
            } else if (distanceLevel === 'medium') {
                partner.lodLevel = 1;  // 中等細節
            } else {
                partner.lodLevel = 0;  // 完整細節
            }
        }
    }

    /**
     * 取得距離等級
     * @param {number} distance - 距離（像素）
     * @returns {string} 'far', 'medium', or 'near'
     */
    getDistanceLevel(distance) {
        if (distance > this.distanceThresholds.far) {
            return 'far';
        } else if (distance > this.distanceThresholds.medium) {
            return 'medium';
        } else {
            return 'near';
        }
    }

    /**
     * 取得更新間隔
     * @param {string} level - 距離等級
     * @returns {number} 更新間隔（毫秒）
     */
    getUpdateInterval(level) {
        // 效能降級時進一步延長間隔
        let interval = this.updateIntervals[level];

        if (this.performanceLevel === 'degraded') {
            interval *= 1.5;
        } else if (this.performanceLevel === 'minimal') {
            interval *= 2;
        }

        return interval;
    }

    /**
     * 監控並調整效能等級
     * @param {number} currentFps - 當前 FPS
     */
    monitorPerformance(currentFps) {
        const now = Date.now();

        if (now - this.lastFpsCheck < this.fpsCheckInterval) {
            return;
        }

        this.lastFpsCheck = now;
        this.fpsHistory.push(currentFps);

        // 只保留最近 5 秒的資料
        if (this.fpsHistory.length > 5) {
            this.fpsHistory.shift();
        }

        // 計算平均 FPS
        const avgFps = this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length;

        // 動態調整效能等級
        if (avgFps < this.lowFpsThreshold) {
            if (this.performanceLevel !== 'minimal') {
                this.performanceLevel = 'minimal';
                console.log('[PerformanceManager] Performance degraded to MINIMAL mode');
                eventBus.emit('PERFORMANCE_LEVEL_CHANGED', { level: 'minimal', fps: avgFps });
            }
        } else if (avgFps < this.targetFps) {
            if (this.performanceLevel !== 'degraded') {
                this.performanceLevel = 'degraded';
                console.log('[PerformanceManager] Performance degraded to DEGRADED mode');
                eventBus.emit('PERFORMANCE_LEVEL_CHANGED', { level: 'degraded', fps: avgFps });
            }
        } else {
            if (this.performanceLevel !== 'normal') {
                this.performanceLevel = 'normal';
                console.log('[PerformanceManager] Performance restored to NORMAL mode');
                eventBus.emit('PERFORMANCE_LEVEL_CHANGED', { level: 'normal', fps: avgFps });
            }
        }
    }

    /**
     * 取得效能統計
     * @returns {Object}
     */
    getStats() {
        const avgFps = this.fpsHistory.length > 0
            ? Math.round(this.fpsHistory.reduce((sum, fps) => sum + fps, 0) / this.fpsHistory.length)
            : 0;

        return {
            performanceLevel: this.performanceLevel,
            avgFps: avgFps,
            activePartners: this.partnerSystem.activePartners.size,
            updateCounts: {
                far: 0,
                medium: 0,
                near: 0
            }
        };
    }

    /**
     * 重置效能管理器
     */
    reset() {
        this.lastUpdateTimes.clear();
        this.fpsHistory = [];
        this.performanceLevel = 'normal';
    }
}

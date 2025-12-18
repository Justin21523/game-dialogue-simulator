/**
 * AbilitySystem - 能力系統管理器
 * 管理角色能力的使用、冷卻、效果
 */

import { eventBus } from '../../core/event-bus.js';
import { ABILITY_DEFINITIONS } from './ability-definitions.js';

export class AbilitySystem {
    constructor(options = {}) {
        // 能力定義
        this.definitions = new Map();

        // 冷卻狀態
        this.cooldowns = new Map();  // abilityId -> endTime

        // 啟用中的能力 (toggle 類型)
        this.activeAbilities = new Map();  // abilityId -> { startTime, duration }

        // 被動效果
        this.passiveEffects = new Map();  // characterId -> [effects]

        // 世界參考 (用於互動類型能力)
        this.world = null;

        // 配置
        this.globalCooldownReduction = options.cooldownReduction ?? 0;

        // 載入定義
        this.loadDefinitions();

        // 事件監聽
        this.setupEventListeners();
    }

    /**
     * 載入能力定義
     */
    loadDefinitions() {
        for (const [characterId, abilities] of Object.entries(ABILITY_DEFINITIONS)) {
            for (const ability of abilities) {
                const fullId = `${characterId}:${ability.id}`;
                this.definitions.set(fullId, {
                    ...ability,
                    characterId: characterId,
                    fullId: fullId
                });
            }
        }
    }

    /**
     * 設定事件監聽
     */
    setupEventListeners() {
        eventBus.on('USE_ABILITY', (data) => this.useAbility(data.characterId, data.abilityId, data.context));
        eventBus.on('USE_ABILITY_ON_BLOCKER', (data) => this.useAbilityOnBlocker(data.player, data.blocker));
        eventBus.on('TOGGLE_ABILITY', (data) => this.toggleAbility(data.characterId, data.abilityId));
    }

    /**
     * 設定世界參考
     * @param {ExplorationWorld} world
     */
    setWorld(world) {
        this.world = world;
    }

    /**
     * 使用能力
     * @param {string} characterId - 角色 ID
     * @param {string} abilityId - 能力 ID
     * @param {Object} context - 使用上下文
     * @returns {Object} 使用結果
     */
    useAbility(characterId, abilityId, context = {}) {
        const fullId = `${characterId}:${abilityId}`;
        const ability = this.definitions.get(fullId);

        if (!ability) {
            return { success: false, reason: '未知的能力' };
        }

        // 檢查冷卻
        if (this.isOnCooldown(fullId)) {
            const remaining = this.getCooldownRemaining(fullId);
            return {
                success: false,
                reason: `冷卻中 (${Math.ceil(remaining / 1000)}秒)`,
                cooldownRemaining: remaining
            };
        }

        // 根據類型執行
        let result;
        switch (ability.type) {
            case 'active':
                result = this.executeActiveAbility(ability, context);
                break;

            case 'toggle':
                result = this.executeToggleAbility(ability, context);
                break;

            case 'world_interact':
                result = this.executeWorldInteractAbility(ability, context);
                break;

            case 'passive':
                // 被動能力不需要手動使用
                return { success: false, reason: '被動能力無法手動使用' };

            default:
                return { success: false, reason: '未知的能力類型' };
        }

        // 如果成功，開始冷卻
        if (result.success && ability.cooldown) {
            this.startCooldown(fullId, ability.cooldown);
        }

        // 發送事件
        if (result.success) {
            eventBus.emit('ABILITY_USED', {
                characterId: characterId,
                abilityId: abilityId,
                ability: ability,
                result: result
            });
        }

        return result;
    }

    /**
     * 執行主動能力
     */
    executeActiveAbility(ability, context) {
        const effects = [];

        // 應用效果
        if (ability.effect) {
            for (const [effectType, effectValue] of Object.entries(ability.effect)) {
                const effect = this.applyEffect(effectType, effectValue, context);
                if (effect) effects.push(effect);
            }
        }

        // 觸發視覺效果
        eventBus.emit('ABILITY_EFFECT', {
            ability: ability,
            position: context.position || { x: context.player?.x, y: context.player?.y }
        });

        return {
            success: true,
            effects: effects
        };
    }

    /**
     * 執行切換能力
     */
    executeToggleAbility(ability, context) {
        const fullId = ability.fullId;
        const isActive = this.activeAbilities.has(fullId);

        if (isActive) {
            // 關閉
            this.deactivateAbility(fullId);
            return { success: true, activated: false };
        } else {
            // 開啟
            this.activateAbility(fullId, ability.duration || Infinity);
            return { success: true, activated: true };
        }
    }

    /**
     * 執行世界互動能力
     */
    executeWorldInteractAbility(ability, context) {
        if (!context.target) {
            return { success: false, reason: '沒有互動目標' };
        }

        const target = context.target;

        // 檢查目標類型是否匹配
        if (ability.targetType && target.blockerType !== ability.targetType) {
            return {
                success: false,
                reason: `此能力無法用於 ${target.blockerType}`
            };
        }

        // 執行互動
        const resolved = this.resolveBlocker(target, ability, context);

        if (resolved) {
            eventBus.emit('BLOCKER_RESOLVED', {
                blocker: target,
                ability: ability
            });
        }

        return {
            success: resolved,
            reason: resolved ? null : '無法解決此障礙'
        };
    }

    /**
     * 解決障礙物
     */
    resolveBlocker(blocker, ability, context) {
        if (blocker.isResolved) return false;

        // 根據障礙類型處理
        switch (blocker.blockerType) {
            case 'gap':
                // Donnie 建橋
                eventBus.emit('BUILD_BRIDGE', {
                    blocker: blocker,
                    position: { x: blocker.x, y: blocker.y }
                });
                break;

            case 'soft_ground':
            case 'blocked_path':
                // Todd 鑽探
                eventBus.emit('DIG_TUNNEL', {
                    blocker: blocker,
                    position: { x: blocker.x, y: blocker.y }
                });
                break;

            case 'animal':
                // Bello 動物溝通
                eventBus.emit('ANIMAL_COMMUNICATION', {
                    blocker: blocker,
                    animal: blocker.animalData
                });
                break;

            case 'traffic':
                // Paul 交通控制
                eventBus.emit('TRAFFIC_CONTROL', {
                    blocker: blocker
                });
                break;
        }

        blocker.isResolved = true;
        return true;
    }

    /**
     * 在障礙物上使用能力 (Stage 4: Check ALL partners for matching ability)
     */
    useAbilityOnBlocker(player, blocker) {
        // ===== Stage 4: Check ALL active partners for matching ability =====
        const allPartners = this.partnerSystem?.getActivePartners();
        if (!allPartners) {
            // Fallback: single player mode
            return this._useSinglePlayerAbility(player, blocker);
        }

        // Search for ANY partner with matching ability
        for (const [id, partner] of allPartners) {
            const characterId = partner.characterId;
            const characterAbilities = ABILITY_DEFINITIONS[characterId] || [];

            const matchingAbility = characterAbilities.find(ability =>
                ability.type === 'world_interact' &&
                ability.targetType === blocker.blockerType
            );

            if (matchingAbility) {
                // Found a matching character! Use their ability
                console.log(`[AbilitySystem] ${characterId} can resolve ${blocker.blockerType}`);

                eventBus.emit('SHOW_TOAST', {
                    message: `${partner.name || characterId} is using their ability!`,
                    type: 'success',
                    duration: 2000
                });

                return this.useAbility(characterId, matchingAbility.id, {
                    player: partner,
                    target: blocker
                });
            }
        }

        // No partner has matching ability
        eventBus.emit('SHOW_TOAST', {
            message: blocker.hintText || 'Need specific character ability to solve this obstacle',
            type: 'info'
        });
        return { success: false };
    }

    /**
     * Use ability for single player (fallback)
     * @private
     */
    _useSinglePlayerAbility(player, blocker) {
        const characterId = player.characterId;
        const characterAbilities = ABILITY_DEFINITIONS[characterId] || [];

        const matchingAbility = characterAbilities.find(ability =>
            ability.type === 'world_interact' &&
            ability.targetType === blocker.blockerType
        );

        if (!matchingAbility) {
            eventBus.emit('SHOW_TOAST', {
                message: blocker.hintText || 'Need specific ability to solve this obstacle',
                type: 'info'
            });
            return { success: false };
        }

        return this.useAbility(characterId, matchingAbility.id, {
            player: player,
            target: blocker
        });
    }

    /**
     * 啟用能力 (toggle)
     */
    activateAbility(fullId, duration) {
        const endTime = duration === Infinity ? Infinity : Date.now() + duration;
        this.activeAbilities.set(fullId, {
            startTime: Date.now(),
            duration: duration,
            endTime: endTime
        });

        eventBus.emit('ABILITY_ACTIVATED', { abilityId: fullId });

        // 設定自動停用
        if (duration !== Infinity) {
            setTimeout(() => {
                this.deactivateAbility(fullId);
            }, duration);
        }
    }

    /**
     * 停用能力
     */
    deactivateAbility(fullId) {
        if (this.activeAbilities.has(fullId)) {
            this.activeAbilities.delete(fullId);
            eventBus.emit('ABILITY_DEACTIVATED', { abilityId: fullId });
        }
    }

    /**
     * 切換能力開關
     */
    toggleAbility(characterId, abilityId) {
        const fullId = `${characterId}:${abilityId}`;

        if (this.activeAbilities.has(fullId)) {
            this.deactivateAbility(fullId);
        } else {
            const ability = this.definitions.get(fullId);
            if (ability && ability.type === 'toggle') {
                this.activateAbility(fullId, ability.duration || Infinity);
            }
        }
    }

    /**
     * 應用效果
     */
    applyEffect(effectType, value, context) {
        switch (effectType) {
            case 'speedMultiplier':
                if (context.player) {
                    context.player.speedMultiplier = value;
                }
                return { type: effectType, value: value };

            case 'jumpMultiplier':
                if (context.player) {
                    context.player.jumpMultiplier = value;
                }
                return { type: effectType, value: value };

            case 'clearPath':
                // 清除路徑上的障礙
                eventBus.emit('CLEAR_PATH', {
                    position: context.position,
                    radius: 200
                });
                return { type: effectType };

            default:
                return null;
        }
    }

    /**
     * 啟用角色的被動能力
     * @param {string} characterId - 角色 ID
     * @param {Object} player - 玩家實體
     */
    activatePassives(characterId, player) {
        const abilities = ABILITY_DEFINITIONS[characterId] || [];
        const passives = abilities.filter(a => a.type === 'passive');

        const activeEffects = [];

        for (const passive of passives) {
            if (passive.effect) {
                for (const [effectType, value] of Object.entries(passive.effect)) {
                    this.applyEffect(effectType, value, { player });
                    activeEffects.push({
                        abilityId: passive.id,
                        effectType: effectType,
                        value: value
                    });
                }
            }
        }

        this.passiveEffects.set(characterId, activeEffects);
    }

    /**
     * 停用角色的被動能力
     */
    deactivatePassives(characterId, player) {
        const effects = this.passiveEffects.get(characterId);
        if (!effects) return;

        // 還原效果
        for (const effect of effects) {
            switch (effect.effectType) {
                case 'speedMultiplier':
                    if (player) player.speedMultiplier = 1;
                    break;
                case 'jumpMultiplier':
                    if (player) player.jumpMultiplier = 1;
                    break;
            }
        }

        this.passiveEffects.delete(characterId);
    }

    /**
     * 開始冷卻
     */
    startCooldown(fullId, duration) {
        const adjustedDuration = duration * (1 - this.globalCooldownReduction);
        this.cooldowns.set(fullId, Date.now() + adjustedDuration);

        eventBus.emit('ABILITY_COOLDOWN_START', {
            abilityId: fullId,
            duration: adjustedDuration
        });
    }

    /**
     * 檢查是否在冷卻中
     */
    isOnCooldown(fullId) {
        const endTime = this.cooldowns.get(fullId);
        if (!endTime) return false;
        return Date.now() < endTime;
    }

    /**
     * 取得冷卻剩餘時間
     */
    getCooldownRemaining(fullId) {
        const endTime = this.cooldowns.get(fullId);
        if (!endTime) return 0;
        return Math.max(0, endTime - Date.now());
    }

    /**
     * 取得冷卻進度 (0-1)
     */
    getCooldownProgress(fullId) {
        const ability = this.definitions.get(fullId);
        if (!ability || !ability.cooldown) return 1;

        const remaining = this.getCooldownRemaining(fullId);
        if (remaining === 0) return 1;

        return 1 - (remaining / ability.cooldown);
    }

    /**
     * 重置冷卻
     */
    resetCooldown(fullId) {
        this.cooldowns.delete(fullId);
    }

    /**
     * 重置所有冷卻
     */
    resetAllCooldowns() {
        this.cooldowns.clear();
    }

    /**
     * 檢查能力是否啟用中
     */
    isAbilityActive(fullId) {
        return this.activeAbilities.has(fullId);
    }

    /**
     * 取得角色的所有能力
     * @param {string} characterId - 角色 ID
     * @returns {Array}
     */
    getCharacterAbilities(characterId) {
        return ABILITY_DEFINITIONS[characterId] || [];
    }

    /**
     * 取得能力定義
     * @param {string} characterId - 角色 ID
     * @param {string} abilityId - 能力 ID
     * @returns {Object|null}
     */
    getAbility(characterId, abilityId) {
        const fullId = `${characterId}:${abilityId}`;
        return this.definitions.get(fullId) || null;
    }

    /**
     * 取得能力狀態
     * @param {string} characterId - 角色 ID
     * @param {string} abilityId - 能力 ID
     * @returns {Object}
     */
    getAbilityState(characterId, abilityId) {
        const fullId = `${characterId}:${abilityId}`;
        const ability = this.definitions.get(fullId);

        if (!ability) return null;

        return {
            ...ability,
            isOnCooldown: this.isOnCooldown(fullId),
            cooldownRemaining: this.getCooldownRemaining(fullId),
            cooldownProgress: this.getCooldownProgress(fullId),
            isActive: this.isAbilityActive(fullId)
        };
    }

    /**
     * 更新系統
     * @param {number} dt - 時間差（秒）
     */
    update(dt) {
        const now = Date.now();

        // 清理過期的冷卻
        for (const [fullId, endTime] of this.cooldowns) {
            if (now >= endTime) {
                this.cooldowns.delete(fullId);
                eventBus.emit('ABILITY_COOLDOWN_END', { abilityId: fullId });
            }
        }

        // 檢查過期的啟用能力
        for (const [fullId, state] of this.activeAbilities) {
            if (state.endTime !== Infinity && now >= state.endTime) {
                this.deactivateAbility(fullId);
            }
        }
    }

    /**
     * 序列化
     */
    serialize() {
        return {
            cooldowns: Object.fromEntries(this.cooldowns),
            activeAbilities: Object.fromEntries(
                Array.from(this.activeAbilities.entries()).map(([k, v]) => [k, {
                    ...v,
                    remainingDuration: v.endTime === Infinity ? Infinity : Math.max(0, v.endTime - Date.now())
                }])
            )
        };
    }

    /**
     * 反序列化
     */
    deserialize(data) {
        const now = Date.now();

        // 還原冷卻
        this.cooldowns.clear();
        if (data.cooldowns) {
            for (const [fullId, endTime] of Object.entries(data.cooldowns)) {
                if (endTime > now) {
                    this.cooldowns.set(fullId, endTime);
                }
            }
        }

        // 還原啟用能力
        this.activeAbilities.clear();
        if (data.activeAbilities) {
            for (const [fullId, state] of Object.entries(data.activeAbilities)) {
                if (state.remainingDuration === Infinity || state.remainingDuration > 0) {
                    this.activateAbility(fullId, state.remainingDuration);
                }
            }
        }
    }

    /**
     * 重置系統
     */
    reset() {
        this.cooldowns.clear();
        this.activeAbilities.clear();
        this.passiveEffects.clear();
    }

    /**
     * 銷毀
     */
    dispose() {
        this.reset();
        this.definitions.clear();
        this.world = null;
    }
}

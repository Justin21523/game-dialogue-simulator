/**
 * ABILITY_DEFINITIONS - 8 位角色的能力定義
 * 每個角色有獨特的能力組合
 */

export const ABILITY_DEFINITIONS = {
    /**
     * Jett - 紅色噴射機，領隊
     * 特點：速度、召喚夥伴
     */
    jett: [
        {
            id: 'super_speed',
            name: '超速配送',
            description: '暫時提升移動速度 50%，持續 10 秒',
            icon: '⚡',
            type: 'active',
            cooldown: 30000,
            duration: 10000,
            effect: {
                speedMultiplier: 1.5
            },
            animation: 'speed_boost',
            sound: 'whoosh'
        },
        {
            id: 'call_partner',
            name: '召喚夥伴',
            description: '呼叫其他超級飛俠前來支援',
            icon: '📞',
            type: 'active',
            cooldown: 60000,
            action: 'OPEN_PARTNER_MENU',
            animation: 'call',
            sound: 'radio'
        }
    ],

    /**
     * Donnie - 黃色工程飛機
     * 特點：建造、修理
     */
    donnie: [
        {
            id: 'build_bridge',
            name: '建造橋樑',
            description: '在斷裂處建造臨時橋樑',
            icon: '🌉',
            type: 'world_interact',
            targetType: 'gap',
            cooldown: 15000,
            animation: 'build',
            sound: 'construction'
        },
        {
            id: 'deploy_tool',
            name: '工具部署',
            description: '放置有用的工具幫助任務',
            icon: '🔧',
            type: 'active',
            cooldown: 20000,
            action: 'DEPLOY_TOOL',
            animation: 'tool',
            sound: 'wrench'
        },
        {
            id: 'repair',
            name: '修理專家',
            description: '修理能力額外提升效率',
            icon: '🛠️',
            type: 'passive',
            effect: {
                repairBonus: 1.5
            }
        }
    ],

    /**
     * Todd - 棕色挖掘機
     * 特點：挖掘、地下通道
     */
    todd: [
        {
            id: 'drill',
            name: '地面鑽探',
            description: '鑽開鬆軟的地面，發現隱藏區域',
            icon: '⛏️',
            type: 'world_interact',
            targetType: 'soft_ground',
            cooldown: 15000,
            animation: 'drill',
            sound: 'drilling'
        },
        {
            id: 'tunnel',
            name: '隧道開挖',
            description: '在阻擋的路徑開挖隧道',
            icon: '🕳️',
            type: 'world_interact',
            targetType: 'blocked_path',
            cooldown: 20000,
            animation: 'tunnel',
            sound: 'digging'
        },
        {
            id: 'underground_sense',
            name: '地底感知',
            description: '可以感應到地下的物品和通道',
            icon: '📡',
            type: 'passive',
            effect: {
                detectUnderground: true
            }
        }
    ],

    /**
     * Chase - 藍色警車飛機
     * 特點：變形、追蹤
     */
    chase: [
        {
            id: 'transform_vehicle',
            name: '多重變形',
            description: '變形為不同的交通工具',
            icon: '🚗',
            type: 'active',
            cooldown: 25000,
            action: 'OPEN_TRANSFORM_MENU',
            animation: 'transform',
            sound: 'transform'
        },
        {
            id: 'stealth',
            name: '隱身模式',
            description: '暫時隱身，不被敵人發現',
            icon: '👻',
            type: 'toggle',
            cooldown: 45000,
            duration: 10000,
            effect: {
                invisible: true
            },
            animation: 'stealth',
            sound: 'cloak'
        },
        {
            id: 'tracker',
            name: '追蹤專家',
            description: '可以追蹤目標的位置',
            icon: '🎯',
            type: 'passive',
            effect: {
                showTargetMarker: true
            }
        }
    ],

    /**
     * Bello - 白色動物飛機
     * 特點：動物溝通、自然
     */
    bello: [
        {
            id: 'animal_talk',
            name: '動物溝通',
            description: '與動物對話，獲得線索或幫助',
            icon: '🦜',
            type: 'world_interact',
            targetType: 'animal',
            cooldown: 10000,
            animation: 'talk',
            sound: 'chirp'
        },
        {
            id: 'animal_help',
            name: '動物協助',
            description: '召喚動物夥伴幫忙完成任務',
            icon: '🐾',
            type: 'active',
            cooldown: 40000,
            duration: 30000,
            action: 'SUMMON_ANIMAL',
            animation: 'summon',
            sound: 'animal_call'
        },
        {
            id: 'nature_bond',
            name: '自然連結',
            description: '在自然環境中移動速度提升',
            icon: '🌿',
            type: 'passive',
            effect: {
                natureSpeedBonus: 1.2
            }
        }
    ],

    /**
     * Paul - 藍色警用飛機
     * 特點：交通控制、救援
     */
    paul: [
        {
            id: 'traffic_control',
            name: '交通控制',
            description: '控制交通號誌，清除道路',
            icon: '🚦',
            type: 'world_interact',
            targetType: 'traffic',
            cooldown: 15000,
            animation: 'signal',
            sound: 'siren_short'
        },
        {
            id: 'siren',
            name: '警笛開道',
            description: '啟動警笛，清除前方障礙',
            icon: '🚨',
            type: 'active',
            cooldown: 30000,
            duration: 5000,
            effect: {
                clearPath: true,
                speedMultiplier: 1.3
            },
            animation: 'siren',
            sound: 'siren'
        },
        {
            id: 'rescue_expert',
            name: '救援專家',
            description: '救援任務獎勵加成',
            icon: '🆘',
            type: 'passive',
            effect: {
                rescueBonus: 1.5
            }
        }
    ],

    /**
     * Flip - 紫色特技飛機
     * 特點：運動、跳躍
     */
    flip: [
        {
            id: 'athletic_jump',
            name: '運動跳躍',
            description: '跳躍高度永久提升 50%',
            icon: '🏃',
            type: 'passive',
            effect: {
                jumpMultiplier: 1.5
            }
        },
        {
            id: 'sports_challenge',
            name: '運動挑戰',
            description: '發起運動挑戰小遊戲',
            icon: '🏆',
            type: 'active',
            cooldown: 45000,
            action: 'START_SPORTS_CHALLENGE',
            animation: 'challenge',
            sound: 'whistle'
        },
        {
            id: 'acrobatic',
            name: '雜技大師',
            description: '可以在空中進行翻滾和特技動作',
            icon: '🤸',
            type: 'active',
            cooldown: 10000,
            action: 'PERFORM_ACROBATIC',
            animation: 'flip',
            sound: 'woosh'
        }
    ],

    /**
     * Jerome - 綠色特技飛機
     * 特點：表演、舞蹈
     */
    jerome: [
        {
            id: 'stunt_fly',
            name: '特技飛行',
            description: '進行華麗的特技飛行表演',
            icon: '🌀',
            type: 'active',
            cooldown: 20000,
            duration: 8000,
            effect: {
                invincible: true,
                speedMultiplier: 1.4
            },
            animation: 'stunt',
            sound: 'jet_swoosh'
        },
        {
            id: 'dance',
            name: '舞蹈表演',
            description: '表演舞蹈，吸引NPC注意或提升士氣',
            icon: '💃',
            type: 'active',
            cooldown: 30000,
            duration: 5000,
            action: 'PERFORM_DANCE',
            animation: 'dance',
            sound: 'music'
        },
        {
            id: 'showman',
            name: '表演者',
            description: '表演任務獲得額外獎勵',
            icon: '🎭',
            type: 'passive',
            effect: {
                performanceBonus: 1.5
            }
        }
    ]
};

/**
 * 能力類型說明
 */
export const ABILITY_TYPES = {
    passive: {
        name: '被動',
        description: '永久生效的能力，無需手動使用'
    },
    active: {
        name: '主動',
        description: '需要手動使用，有冷卻時間'
    },
    toggle: {
        name: '切換',
        description: '可以開關的能力，持續消耗或有時間限制'
    },
    world_interact: {
        name: '世界互動',
        description: '用於與場景中特定物件互動'
    }
};

/**
 * 障礙物類型與對應能力
 */
export const BLOCKER_ABILITY_MAP = {
    gap: {
        requiredCharacter: 'donnie',
        requiredAbility: 'build_bridge',
        hint: '需要 Donnie 的建造能力來架設橋樑'
    },
    soft_ground: {
        requiredCharacter: 'todd',
        requiredAbility: 'drill',
        hint: '需要 Todd 的鑽探能力來挖掘地面'
    },
    blocked_path: {
        requiredCharacter: 'todd',
        requiredAbility: 'tunnel',
        hint: '需要 Todd 的隧道能力來開闢道路'
    },
    animal: {
        requiredCharacter: 'bello',
        requiredAbility: 'animal_talk',
        hint: '需要 Bello 的動物溝通能力'
    },
    traffic: {
        requiredCharacter: 'paul',
        requiredAbility: 'traffic_control',
        hint: '需要 Paul 的交通控制能力'
    }
};

/**
 * 取得角色主要能力
 * @param {string} characterId - 角色 ID
 * @returns {Object|null}
 */
export function getPrimaryAbility(characterId) {
    const abilities = ABILITY_DEFINITIONS[characterId];
    if (!abilities || abilities.length === 0) return null;

    // 返回第一個非被動能力
    return abilities.find(a => a.type !== 'passive') || abilities[0];
}

/**
 * 取得角色被動能力
 * @param {string} characterId - 角色 ID
 * @returns {Array}
 */
export function getPassiveAbilities(characterId) {
    const abilities = ABILITY_DEFINITIONS[characterId];
    if (!abilities) return [];
    return abilities.filter(a => a.type === 'passive');
}

/**
 * 取得可解決特定障礙的角色
 * @param {string} blockerType - 障礙類型
 * @returns {Object|null}
 */
export function getCharacterForBlocker(blockerType) {
    return BLOCKER_ABILITY_MAP[blockerType] || null;
}

/**
 * 檢查角色是否有特定能力
 * @param {string} characterId - 角色 ID
 * @param {string} abilityId - 能力 ID
 * @returns {boolean}
 */
export function hasAbility(characterId, abilityId) {
    const abilities = ABILITY_DEFINITIONS[characterId];
    if (!abilities) return false;
    return abilities.some(a => a.id === abilityId);
}

/**
 * 取得所有可用的世界互動能力
 * @returns {Array}
 */
export function getAllWorldInteractAbilities() {
    const result = [];

    for (const [characterId, abilities] of Object.entries(ABILITY_DEFINITIONS)) {
        for (const ability of abilities) {
            if (ability.type === 'world_interact') {
                result.push({
                    ...ability,
                    characterId: characterId
                });
            }
        }
    }

    return result;
}

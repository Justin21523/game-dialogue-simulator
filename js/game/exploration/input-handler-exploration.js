/**
 * InputHandlerExploration - 探索模式輸入處理器
 * 處理鍵盤輸入，支援走路、飛行、互動等操作
 */
import { eventBus } from '../../core/event-bus.js';

export class InputHandlerExploration {
    constructor() {
        // 按鍵狀態
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false,
            jump: false,
            interact: false,
            ability1: false,
            ability2: false,
            partnerMenu: false
        };

        // 角色切換快捷鍵 (1-8)
        this.characterSwitch = null;

        // 長按狀態
        this.jumpHoldTime = 0;
        this.jumpHoldThreshold = 0.3; // 長按 0.3 秒進入飛行模式

        // 事件回調
        this.onInteract = null;
        this.onAbility1 = null;
        this.onAbility2 = null;
        this.onPartnerMenu = null;
        this.onCharacterSwitch = null;

        // 綁定事件
        this._boundKeyDown = this._handleKeyDown.bind(this);
        this._boundKeyUp = this._handleKeyUp.bind(this);

        this._attachListeners();
    }

    /**
     * 綁定事件監聽器
     */
    _attachListeners() {
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
    }

    /**
     * 處理按下按鍵
     */
    _handleKeyDown(e) {
        // 防止預設行為 (空白鍵捲動等)
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
            e.preventDefault();
        }

        switch (e.code) {
            // 移動
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'KeyW':
            case 'ArrowUp':
                this.keys.up = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.down = true;
                break;

            // 跳躍/飛行
            case 'Space':
                if (!this.keys.jump) {
                    this.keys.jump = true;
                    this.jumpHoldTime = 0;
                }
                break;

            // ===== Stage 4: Q/E for character switching =====
            // 角色切換 (Q 上一個, E 下一個)
            case 'KeyQ':
                e.preventDefault();
                eventBus.emit('SWITCH_CHARACTER_PREV');
                break;

            case 'KeyE':
                e.preventDefault();
                eventBus.emit('SWITCH_CHARACTER_NEXT');
                break;

            // 互動 (改為 F 鍵)
            case 'KeyF':
                if (!this.keys.interact) {
                    this.keys.interact = true;
                    if (this.onInteract) this.onInteract();
                }
                break;

            // 能力 (ability1 改為 Shift, ability2 保持 R)
            case 'ShiftLeft':
            case 'ShiftRight':
                if (!this.keys.ability1) {
                    this.keys.ability1 = true;
                    if (this.onAbility1) this.onAbility1();
                }
                break;
            case 'KeyR':
                if (!this.keys.ability2) {
                    this.keys.ability2 = true;
                    if (this.onAbility2) this.onAbility2();
                }
                break;

            // 夥伴選單
            case 'Tab':
                e.preventDefault();
                if (!this.keys.partnerMenu) {
                    this.keys.partnerMenu = true;
                    if (this.onPartnerMenu) this.onPartnerMenu();
                }
                break;

            // 角色切換 (1-8)
            case 'Digit1':
            case 'Digit2':
            case 'Digit3':
            case 'Digit4':
            case 'Digit5':
            case 'Digit6':
            case 'Digit7':
            case 'Digit8':
                const charIndex = parseInt(e.code.replace('Digit', '')) - 1;
                this.characterSwitch = charIndex;
                if (this.onCharacterSwitch) this.onCharacterSwitch(charIndex);
                break;

            // ESC - 暫停/選單
            case 'Escape':
                // 暫時不處理
                break;
        }
    }

    /**
     * 處理放開按鍵
     */
    _handleKeyUp(e) {
        switch (e.code) {
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'KeyW':
            case 'ArrowUp':
                this.keys.up = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.down = false;
                break;
            case 'Space':
                this.keys.jump = false;
                this.jumpHoldTime = 0;
                break;

            // ===== Stage 4: Updated key mappings =====
            case 'KeyF':  // Interact now F
                this.keys.interact = false;
                break;
            case 'ShiftLeft':  // Ability1 now Shift
            case 'ShiftRight':
                this.keys.ability1 = false;
                break;
            case 'KeyR':  // Ability2 stays R
                this.keys.ability2 = false;
                break;
            case 'Tab':
                this.keys.partnerMenu = false;
                break;
            // Q/E are now character switching (no key state to clear)
        }

        // 重置角色切換
        if (e.code.startsWith('Digit')) {
            this.characterSwitch = null;
        }
    }

    /**
     * 更新輸入狀態 (每幀調用)
     * @param {number} dt - 時間差 (秒)
     */
    update(dt) {
        // 追蹤跳躍長按時間
        if (this.keys.jump) {
            this.jumpHoldTime += dt;
        }
    }

    /**
     * 取得移動軸向
     * @returns {Object} - { x: -1~1, y: -1~1 }
     */
    get axis() {
        return {
            x: (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0),
            y: (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0)
        };
    }

    /**
     * 是否正在移動
     * @returns {boolean}
     */
    get isMoving() {
        return this.keys.left || this.keys.right || this.keys.up || this.keys.down;
    }

    /**
     * 是否觸發跳躍 (單次)
     * @returns {boolean}
     */
    get isJumping() {
        return this.keys.jump && this.jumpHoldTime < 0.05;
    }

    /**
     * 是否長按跳躍 (進入飛行)
     * @returns {boolean}
     */
    get isHoldingJump() {
        return this.keys.jump && this.jumpHoldTime >= this.jumpHoldThreshold;
    }

    /**
     * 是否按住下鍵 (降落)
     * @returns {boolean}
     */
    get isDescending() {
        return this.keys.down;
    }

    /**
     * 取得輸入狀態快照
     * @returns {Object}
     */
    getSnapshot() {
        return {
            left: this.keys.left,
            right: this.keys.right,
            up: this.keys.up,
            down: this.keys.down,
            jump: this.keys.jump,
            holdJump: this.isHoldingJump,
            interact: this.keys.interact,
            ability1: this.keys.ability1,
            ability2: this.keys.ability2
        };
    }

    /**
     * 設定互動回調
     * @param {Function} callback
     */
    setInteractCallback(callback) {
        this.onInteract = callback;
    }

    /**
     * 設定能力回調
     * @param {Function} callback1 - 能力 1 (Q)
     * @param {Function} callback2 - 能力 2 (R)
     */
    setAbilityCallbacks(callback1, callback2) {
        this.onAbility1 = callback1;
        this.onAbility2 = callback2;
    }

    /**
     * 設定夥伴選單回調
     * @param {Function} callback
     */
    setPartnerMenuCallback(callback) {
        this.onPartnerMenu = callback;
    }

    /**
     * 設定角色切換回調
     * @param {Function} callback - 參數為角色索引 (0-7)
     */
    setCharacterSwitchCallback(callback) {
        this.onCharacterSwitch = callback;
    }

    /**
     * 銷毀輸入處理器
     */
    destroy() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
    }
}

/**
 * NPCBehaviorController - NPC 行為控制器
 *
 * 實現狀態機來控制 NPC 的行為：
 * - Idle: 站著不動
 * - Wander: 在附近區域隨機走動
 * - Patrol: 沿著預設路徑巡邏
 * - Approach: 玩家靠近時面向玩家
 */

export class NPCBehaviorController {
    constructor(npc, options = {}) {
        this.npc = npc;

        // 狀態管理
        this.currentState = options.initialState || 'idle';
        this.previousState = null;
        this.stateTimer = 0;
        this.stateChangeTime = this.getRandomStateChangeTime();

        // Wander 參數
        this.wanderRadius = options.wanderRadius || 200;
        this.wanderSpeed = options.wanderSpeed || 50;
        this.wanderTarget = null;
        this.spawnPosition = { x: npc.x, y: npc.y };

        // Patrol 參數
        this.patrolPath = options.patrolPath || [];
        this.patrolIndex = 0;
        this.patrolSpeed = options.patrolSpeed || 60;
        this.patrolPauseTime = 0;
        this.patrolPauseDuration = 2; // 秒

        // Approach 參數
        this.playerDetectionRange = options.playerDetectionRange || 150;
        this.approachThreshold = options.approachThreshold || 100;

        // 世界邊界
        this.worldMinX = options.worldMinX || 100;
        this.worldMaxX = options.worldMaxX || 1900;

        // 行為權重（用於隨機選擇）
        this.behaviorWeights = {
            idle: 0.4,
            wander: 0.6
        };

        // Debug
        this.debug = options.debug || false;
    }

    /**
     * 主更新方法 - 每幀調用
     */
    update(dt, player) {
        this.stateTimer += dt;

        // 決策樹：根據玩家距離和時間切換狀態
        const distanceToPlayer = this.getDistanceToPlayer(player);

        // 優先級 1: 玩家靠近 → Approach
        if (distanceToPlayer < this.approachThreshold) {
            if (this.currentState !== 'approach') {
                this.transitionTo('approach');
            }
        }
        // 優先級 2: 有巡邏路徑 → Patrol
        else if (this.patrolPath.length > 0 && this.currentState !== 'patrol') {
            if (this.currentState !== 'patrol') {
                this.transitionTo('patrol');
            }
        }
        // 優先級 3: 時間到了切換 Idle/Wander
        else if (this.stateTimer > this.stateChangeTime) {
            if (this.currentState !== 'approach' && this.currentState !== 'patrol') {
                const nextState = this.chooseRandomBehavior();
                this.transitionTo(nextState);
            }
        }

        // 執行當前狀態邏輯
        this.executeState(dt, player);

        // 確保 NPC 不走出邊界
        this.enforceWorldBounds();
    }

    /**
     * 狀態轉換
     */
    transitionTo(newState) {
        if (this.currentState === newState) return;

        if (this.debug) {
            console.log(`[NPC] ${this.npc.id} switched behavior: ${this.currentState} → ${newState}`);
        }

        this.previousState = this.currentState;
        this.currentState = newState;
        this.stateTimer = 0;
        this.stateChangeTime = this.getRandomStateChangeTime();

        // 狀態進入時的初始化
        this.onStateEnter(newState);
    }

    /**
     * 狀態進入時的初始化
     */
    onStateEnter(state) {
        switch (state) {
            case 'idle':
                this.npc.vx = 0;
                this.npc.animState = 'idle';
                break;

            case 'wander':
                this.wanderTarget = null;
                this.generateWanderTarget();
                break;

            case 'patrol':
                this.patrolPauseTime = 0;
                break;

            case 'approach':
                this.npc.vx = 0;
                this.npc.animState = 'idle';
                break;
        }
    }

    /**
     * 執行當前狀態邏輯
     */
    executeState(dt, player) {
        switch (this.currentState) {
            case 'idle':
                this.executeIdle(dt);
                break;

            case 'wander':
                this.executeWander(dt);
                break;

            case 'patrol':
                this.executePatrol(dt);
                break;

            case 'approach':
                this.executeApproach(dt, player);
                break;
        }
    }

    /**
     * Idle 狀態：站著不動
     */
    executeIdle(dt) {
        this.npc.vx = 0;
        this.npc.animState = 'idle';
    }

    /**
     * Wander 狀態：在附近區域隨機走動
     */
    executeWander(dt) {
        // 如果沒有目標，生成新目標
        if (!this.wanderTarget) {
            this.generateWanderTarget();
        }

        // 移動到目標
        const dx = this.wanderTarget.x - this.npc.x;
        const distance = Math.abs(dx);

        if (distance < 5) {
            // 到達目標，切換到 idle
            this.npc.vx = 0;
            this.transitionTo('idle');
        } else {
            // 繼續移動
            const direction = Math.sign(dx);
            this.npc.vx = direction * this.wanderSpeed;
            this.npc.facingRight = direction > 0;
            this.npc.animState = 'walking';
        }
    }

    /**
     * Patrol 狀態：沿著路徑巡邏
     */
    executePatrol(dt) {
        if (this.patrolPath.length === 0) {
            this.transitionTo('idle');
            return;
        }

        // 檢查是否在暫停中
        if (this.patrolPauseTime > 0) {
            this.patrolPauseTime -= dt;
            this.npc.vx = 0;
            this.npc.animState = 'idle';
            return;
        }

        const target = this.patrolPath[this.patrolIndex];
        const dx = target.x - this.npc.x;
        const distance = Math.abs(dx);

        if (distance < 10) {
            // 到達巡邏點，暫停一下然後前往下一個點
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPath.length;
            this.patrolPauseTime = this.patrolPauseDuration;
            this.npc.vx = 0;
            this.npc.animState = 'idle';
        } else {
            // 移動到巡邏點
            const direction = Math.sign(dx);
            this.npc.vx = direction * this.patrolSpeed;
            this.npc.facingRight = direction > 0;
            this.npc.animState = 'walking';
        }
    }

    /**
     * Approach 狀態：面向玩家但不移動
     */
    executeApproach(dt, player) {
        // 面向玩家
        if (player && player.x !== undefined) {
            this.npc.facingRight = player.x > this.npc.x;
        }

        // 停止移動
        this.npc.vx = 0;
        this.npc.animState = 'idle';
    }

    /**
     * 生成隨機漫遊目標
     */
    generateWanderTarget() {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * this.wanderRadius;

        let targetX = this.spawnPosition.x + Math.cos(angle) * distance;

        // 確保目標在世界邊界內
        targetX = Math.max(this.worldMinX, Math.min(this.worldMaxX, targetX));

        this.wanderTarget = {
            x: targetX,
            y: this.npc.y
        };

        if (this.debug) {
            console.log(`[NPC] ${this.npc.id} wander target: ${targetX.toFixed(0)}`);
        }
    }

    /**
     * 計算到玩家的距離
     */
    getDistanceToPlayer(player) {
        if (!player || player.x === undefined) {
            return Infinity;
        }

        const dx = player.x - this.npc.x;
        const dy = (player.y || 0) - (this.npc.y || 0);
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 隨機選擇行為（Idle 或 Wander）
     */
    chooseRandomBehavior() {
        const rand = Math.random();
        return rand < this.behaviorWeights.idle ? 'idle' : 'wander';
    }

    /**
     * 獲取隨機狀態切換時間（5-10 秒）
     */
    getRandomStateChangeTime() {
        return 5 + Math.random() * 5;
    }

    /**
     * 確保 NPC 不走出世界邊界
     */
    enforceWorldBounds() {
        if (this.npc.x < this.worldMinX) {
            this.npc.x = this.worldMinX;
            this.npc.vx = 0;

            // 如果在 wander，重新生成目標
            if (this.currentState === 'wander') {
                this.wanderTarget = null;
            }
        }

        if (this.npc.x > this.worldMaxX) {
            this.npc.x = this.worldMaxX;
            this.npc.vx = 0;

            // 如果在 wander，重新生成目標
            if (this.currentState === 'wander') {
                this.wanderTarget = null;
            }
        }
    }

    /**
     * 獲取當前狀態
     */
    getState() {
        return this.currentState;
    }

    /**
     * 手動設置行為
     */
    setBehavior(behavior) {
        this.transitionTo(behavior);
    }

    /**
     * 設置巡邏路徑
     */
    setPatrolPath(path) {
        this.patrolPath = path;
        this.patrolIndex = 0;
    }

    /**
     * Debug 資訊
     */
    getDebugInfo() {
        return {
            id: this.npc.id,
            state: this.currentState,
            stateTimer: this.stateTimer.toFixed(1),
            position: `(${this.npc.x.toFixed(0)}, ${this.npc.y.toFixed(0)})`,
            velocity: this.npc.vx.toFixed(1),
            facingRight: this.npc.facingRight,
            wanderTarget: this.wanderTarget ? `(${this.wanderTarget.x.toFixed(0)}, ${this.wanderTarget.y.toFixed(0)})` : null,
            patrolIndex: this.patrolPath.length > 0 ? `${this.patrolIndex + 1}/${this.patrolPath.length}` : null
        };
    }
}

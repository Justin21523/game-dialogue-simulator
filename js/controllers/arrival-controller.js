/**
 * ArrivalController - 到達目的地後的總控制器
 *
 * 職責：
 * - 協調探索模式啟動
 * - 管理狀態機
 * - 協調各子系統（對話、任務、夥伴）
 */
import { eventBus } from '../core/event-bus.js';
import { ExplorationStateMachine } from '../state/exploration-state-machine.js';
import { DialogueManager } from '../managers/dialogue-manager.js';
import { MissionOrchestrator } from '../managers/mission-orchestrator.js';

export class ArrivalController {
    constructor(missionData, explorationScreen) {
        this.missionData = missionData;
        this.explorationScreen = explorationScreen;
        this.startTime = Date.now();

        // 狀態機
        this.stateMachine = new ExplorationStateMachine();

        // 子系統
        this.dialogueManager = new DialogueManager();
        this.missionOrchestrator = new MissionOrchestrator(missionData);

        this.setupEventListeners();

        console.log('[ArrivalController] 初始化完成，任務:', missionData.id || missionData);
    }

    /**
     * 開始探索流程
     */
    startExploration() {
        console.log('[ArrivalController] 開始探索模式');

        // 切換到 ARRIVING 狀態
        this.stateMachine.transition('ARRIVING');

        // 播放入場動畫（例如：主角降落、鏡頭拉遠）
        this.playArrivalAnimation();
    }

    playArrivalAnimation() {
        console.log('[ArrivalController] 播放入場動畫');

        // 2秒入場動畫
        setTimeout(() => {
            console.log('[ArrivalController] 入場動畫完成，切換到自由探索');
            this.stateMachine.transition('FREE_EXPLORE');

            eventBus.emit('SHOW_TOAST', {
                message: `已抵達 ${this.missionData.destination || '目的地'}！`,
                type: 'info',
                duration: 3000
            });
        }, 2000);
    }

    setupEventListeners() {
        // 監聽 NPC 互動
        eventBus.on('NPC_INTERACTION_START', (data) => {
            if (this.stateMachine.canTransition('IN_DIALOGUE')) {
                this.stateMachine.transition('IN_DIALOGUE');
                this.dialogueManager.startDialogue(data.npc);
            }
        });

        // 監聽對話結束
        eventBus.on('DIALOGUE_END', (data) => {
            if (data.missionAccepted) {
                this.stateMachine.transition('MISSION_ACTIVE');
                this.missionOrchestrator.activateMission(data.missionData);
            } else {
                this.stateMachine.transition('FREE_EXPLORE');
            }
        });

        // 監聽任務完成
        eventBus.on('MISSION_COMPLETED', () => {
            this.stateMachine.transition('FREE_EXPLORE');
            console.log('[ArrivalController] 任務完成，玩家可繼續探索');
        });

        // 監聽退出探索
        eventBus.on('EXIT_EXPLORATION_REQUESTED', () => {
            this.exitExploration();
        });
    }

    exitExploration() {
        console.log('[ArrivalController] 結束探索模式');
        this.stateMachine.transition('EXITING');

        // 停止探索畫面
        this.explorationScreen.stop();

        // 顯示結算畫面
        const results = this.calculateResults();
        window.game.renderResults(results);
    }

    calculateResults() {
        return {
            mission: this.missionData,
            rewards: {
                money: this.missionOrchestrator.getTotalMoney() || 100,
                exp: this.missionOrchestrator.getTotalExp() || 50
            },
            stats: {
                timeSpent: Date.now() - this.startTime,
                npcsInteracted: this.dialogueManager.getNPCInteractionCount(),
                itemsCollected: 0 // TODO: 實現物品系統
            }
        };
    }

    cleanup() {
        eventBus.off('NPC_INTERACTION_START');
        eventBus.off('DIALOGUE_END');
        eventBus.off('MISSION_COMPLETED');
        eventBus.off('EXIT_EXPLORATION_REQUESTED');
    }
}

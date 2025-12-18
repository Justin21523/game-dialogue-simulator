/**
 * ExplorationStateMachine - 探索模式狀態機
 */
import { eventBus } from '../core/event-bus.js';

export const ExplorationState = {
    ARRIVING: 'ARRIVING',
    FREE_EXPLORE: 'FREE_EXPLORE',
    IN_DIALOGUE: 'IN_DIALOGUE',
    MISSION_ACTIVE: 'MISSION_ACTIVE',
    PARTNER_SUMMONING: 'PARTNER_SUMMONING',
    EXITING: 'EXITING'
};

export class ExplorationStateMachine {
    constructor() {
        this.currentState = null;
        this.previousState = null;

        // 定義合法的狀態轉換
        this.transitions = {
            [ExplorationState.ARRIVING]: [ExplorationState.FREE_EXPLORE],
            [ExplorationState.FREE_EXPLORE]: [
                ExplorationState.IN_DIALOGUE,
                ExplorationState.PARTNER_SUMMONING,
                ExplorationState.EXITING
            ],
            [ExplorationState.IN_DIALOGUE]: [
                ExplorationState.FREE_EXPLORE,
                ExplorationState.MISSION_ACTIVE
            ],
            [ExplorationState.MISSION_ACTIVE]: [
                ExplorationState.FREE_EXPLORE,
                ExplorationState.IN_DIALOGUE,
                ExplorationState.PARTNER_SUMMONING,
                ExplorationState.EXITING
            ],
            [ExplorationState.PARTNER_SUMMONING]: [ExplorationState.FREE_EXPLORE],
            [ExplorationState.EXITING]: []
        };
    }

    transition(newState) {
        if (!this.canTransition(newState)) {
            console.warn(`[StateMachine] 非法狀態轉換: ${this.currentState} → ${newState}`);
            return false;
        }

        this.previousState = this.currentState;
        this.currentState = newState;

        console.log(`[StateMachine] 狀態轉換: ${this.previousState} → ${this.currentState}`);

        eventBus.emit('EXPLORATION_STATE_CHANGED', {
            from: this.previousState,
            to: this.currentState
        });

        return true;
    }

    canTransition(newState) {
        if (!this.currentState) return true; // 初始化
        const allowedTransitions = this.transitions[this.currentState] || [];
        return allowedTransitions.includes(newState);
    }

    getCurrentState() {
        return this.currentState;
    }

    is(state) {
        return this.currentState === state;
    }
}

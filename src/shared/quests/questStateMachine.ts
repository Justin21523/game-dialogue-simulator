import type { Quest } from './quest.js';
import { QuestStatus, type QuestStatus as QuestStatusValue } from './quest.js';

export class QuestStateMachine {
    private readonly transitions: Record<QuestStatusValue, QuestStatusValue[]> = {
        [QuestStatus.PENDING]: [QuestStatus.OFFERED, QuestStatus.ABANDONED],
        [QuestStatus.OFFERED]: [QuestStatus.ACTIVE, QuestStatus.ABANDONED],
        [QuestStatus.ACTIVE]: [QuestStatus.COMPLETED, QuestStatus.ABANDONED],
        [QuestStatus.COMPLETED]: [],
        [QuestStatus.ABANDONED]: [QuestStatus.OFFERED]
    };

    canTransition(from: QuestStatusValue, to: QuestStatusValue): boolean {
        return this.transitions[from]?.includes(to) ?? false;
    }

    transition(quest: Quest, newStatus: QuestStatusValue, reason: string | null = null): boolean {
        const current = quest.status as QuestStatusValue;
        if (!this.canTransition(current, newStatus)) return false;
        quest.status = newStatus;
        if (reason) {
            // keep for parity with legacy, but no side effects required
            void reason;
        }
        return true;
    }
}


/**
 * DialogueManager - 對話管理器
 *
 * 職責：
 * - 管理 NPC 對話流程
 * - 顯示對話 UI
 * - 處理玩家選擇（接受/拒絕任務）
 */
import { eventBus } from '../core/event-bus.js';

export class DialogueManager {
    constructor() {
        this.currentNPC = null;
        this.dialogueHistory = [];
        this.npcInteractionCount = 0;
    }

    startDialogue(npc) {
        console.log('[DialogueManager] 開始對話:', npc.name || npc.npcId);

        this.currentNPC = npc;
        this.npcInteractionCount++;

        // 顯示對話 UI
        this.showDialogueUI(npc);

        // 記錄對話歷史
        this.dialogueHistory.push({
            npcId: npc.npcId,
            timestamp: Date.now()
        });
    }

    showDialogueUI(npc) {
        // 階段 1: 使用固定文本
        const dialogueText = npc.dialogue || `你好！我是 ${npc.name}。`;

        eventBus.emit('SHOW_DIALOGUE_UI', {
            npc: npc,
            text: dialogueText,
            options: [
                { label: '繼續對話', action: 'continue' },
                { label: '結束對話', action: 'end' }
            ]
        });
    }

    handlePlayerChoice(choice) {
        console.log('[DialogueManager] 玩家選擇:', choice);

        if (choice.action === 'accept_mission') {
            eventBus.emit('DIALOGUE_END', {
                missionAccepted: true,
                missionData: choice.missionData
            });
        } else {
            eventBus.emit('DIALOGUE_END', {
                missionAccepted: false
            });
        }

        this.currentNPC = null;
    }

    getNPCInteractionCount() {
        return this.npcInteractionCount;
    }
}

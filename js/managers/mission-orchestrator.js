/**
 * MissionOrchestrator - 任務協調器
 *
 * 職責：
 * - 管理任務註冊
 * - 追蹤任務進度
 * - 計算獎勵
 */
import { eventBus } from '../core/event-bus.js';

export class MissionOrchestrator {
    constructor(initialMission) {
        this.initialMission = initialMission;
        this.activeMissions = [];
        this.completedMissions = [];
        this.totalMoney = 0;
        this.totalExp = 0;
    }

    activateMission(missionData) {
        console.log('[MissionOrchestrator] 激活任務:', missionData);

        this.activeMissions.push(missionData);

        eventBus.emit('MISSION_ACTIVATED', {
            mission: missionData
        });

        // 顯示任務追蹤器
        eventBus.emit('SHOW_MISSION_TRACKER', {
            mission: missionData
        });
    }

    completeMission(missionData, rewards) {
        console.log('[MissionOrchestrator] 完成任務:', missionData, rewards);

        this.activeMissions = this.activeMissions.filter(m => m.id !== missionData.id);
        this.completedMissions.push(missionData);

        this.totalMoney += rewards.money || 0;
        this.totalExp += rewards.exp || 0;

        eventBus.emit('MISSION_COMPLETED', {
            mission: missionData,
            rewards: rewards
        });

        eventBus.emit('SHOW_TOAST', {
            message: `✅ 任務完成！獲得 $${rewards.money} 和 ${rewards.exp} EXP`,
            type: 'success',
            duration: 5000
        });
    }

    getTotalMoney() {
        return this.totalMoney;
    }

    getTotalExp() {
        return this.totalExp;
    }
}

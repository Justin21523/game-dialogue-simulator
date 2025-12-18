import { CONFIG } from '../config.js';

export class Character {
    constructor(id, data) {
        this.id = id;
        this.name = data.name || "Unknown";
        this.type = data.type || "General";
        
        // Stats
        this.level = data.level || 1;
        this.exp = data.exp || 0;
        this.speed = data.speed || 5;
        this.reliability = data.reliability || 80;
        
        // Status
        this.status = data.status || 'IDLE'; // IDLE, MISSION, RESTING, REPAIR
        this.energy = data.energy !== undefined ? data.energy : 100;
        this.currentMissionId = data.currentMissionId || null;
        this.missionEndTime = data.missionEndTime || null;
    }

    get isAvailable() {
        return this.status === 'IDLE' && this.energy > 20;
    }

    addExp(amount) {
        this.exp += amount;
        // Simple leveling logic: level * 100 xp needed
        const needed = this.level * 100;
        if (this.exp >= needed) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.exp = 0;
        this.speed = Math.min(this.speed + 1, 10);
        return true;
    }
}

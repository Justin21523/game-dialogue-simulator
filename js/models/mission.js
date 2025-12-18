export class Mission {
    constructor(data) {
        this.id = data.id || `m_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        this.title = data.title || "Unknown Mission";
        this.type = data.type || "Delivery"; // Delivery, Rescue, Construction, etc.
        this.description = data.description || data.synopsis || "No description available.";
        this.location = data.location || "World Airport";
        this.campaignId = data.campaignId || data.campaign_id || null;
        this.campaignTheme = data.campaignTheme || data.theme || null;
        
        // Requirements
        this.levelReq = data.levelReq || 1;
        this.duration = data.duration || 60; // seconds
        this.fuelCost = data.fuelCost || 10;
        
        // Rewards
        this.rewardMoney = data.rewardMoney || 100;
        this.rewardExp = data.rewardExp || 50;
        this.rewardItems = data.rewardItems || data.reward_items || (data.rewards ? data.rewards.items : []) || [];
        
        // Status
        this.status = 'AVAILABLE'; // AVAILABLE, IN_PROGRESS, COMPLETED, FAILED
        this.assignedCharId = null;
        this.startTime = null;

        // Objectives (structured for TaskScreen)
        this.objectives = data.objectives || [];
    }

    start(charId) {
        this.status = 'IN_PROGRESS';
        this.assignedCharId = charId;
        this.startTime = Date.now();
    }

    complete() {
        this.status = 'COMPLETED';
    }

    getPrimaryObjective() {
        return (this.objectives && this.objectives.length > 0) ? this.objectives[0] : null;
    }
}

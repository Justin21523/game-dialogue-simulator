import { Mission } from '../models/mission.js';
import { CONFIG } from '../config.js';
import { apiClient } from '../core/api-client.js';

const LOCATIONS = [
    "Paris", "New York", "Beijing", "London", "Tokyo", 
    "Sydney", "Cairo", "Rio de Janeiro", "Moscow", "Rome"
];

const MISSION_TYPES = [
    { type: "Delivery", verb: "Deliver package to" },
    { type: "Rescue", verb: "Rescue stranded hiker in" },
    { type: "Construction", verb: "Build new bridge in" },
    { type: "Sports", verb: "Compete in tournament at" },
    { type: "Police", verb: "Direct traffic in" },
    { type: "Nature", verb: "Help animals in" }
];

export class MissionGenerator {
    static async generate(count = 15, level = 1) {
        console.log(`Generating ${count} missions...`);
        const missions = [];

        // 1) Health check once
        await apiClient.checkHealth();

        // 2) Try to fetch a campaign (structured, multi-mission)
        if (apiClient.isBackendAvailable) {
            try {
                const campaign = await apiClient.generateCampaign({
                    length: Math.min(5, Math.max(3, Math.floor(count / 3))),
                });
                if (campaign && campaign.missions) {
                    console.log(`Loaded campaign ${campaign.campaign_id || campaign.campaignId} with ${campaign.missions.length} missions`);
                    missions.push(
                        ...campaign.missions.map(m => this.fromCampaignMission(m, campaign))
                    );
                }
            } catch (e) {
                console.warn("Campaign fetch failed, skipping to single AI mission.", e);
            }
        }

        // 3) Fallback to single AI mission if we still want diversity
        if (missions.length === 0 && apiClient.isBackendAvailable) {
            try {
                console.log("Generating AI Mission...");
                const data = await apiClient.generateMission(level);
                missions.push(new Mission(data));
            } catch (e) {
                console.warn("AI mission gen failed, skipping to local.");
            }
        }

        // 4) Fill the rest with local missions
        const remaining = Math.max(0, count - missions.length);
        console.log(`Filling ${remaining} local missions...`);
        for (let i = 0; i < remaining; i++) {
            missions.push(this.createLocalMission(level));
        }

        console.log(`Total missions generated: ${missions.length}`);
        return missions;
    }

    static createLocalMission(level) {
        const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
        const template = MISSION_TYPES[Math.floor(Math.random() * MISSION_TYPES.length)];
        
        const baseReward = 100 * level;
        const duration = 30 + (level * 10); 
        
        return new Mission({
            title: `${template.type} in ${location}`,
            description: `${template.verb} ${location}. Standard procedure.`,
            type: template.type,
            location: location,
            levelReq: level,
            duration: duration,
            fuelCost: 10 + (level * 2),
            rewardMoney: Math.floor(baseReward * (0.8 + Math.random() * 0.4)),
            rewardExp: Math.floor(50 * level),
            objectives: this.buildObjectives(template.type),
        });
    }

    static buildObjectives(missionType) {
        const type = missionType.toLowerCase();
        if (type === "delivery") {
            return [{ type: "deliver", description: "將包裹送達指定 NPC", collectible_count: 1 }];
        }
        if (type === "rescue") {
            return [{ type: "rescue", description: "清除障礙並救援 NPC", time_limit: 120 }];
        }
        if (type === "sports") {
            return [{ type: "collect", description: "收集 8 個金幣並完成飛行", collectible_count: 8 }];
        }
        if (type === "construction") {
            return [{ type: "assemble", description: "搬運零件並組裝支架", collectible_count: 3 }];
        }
        if (type === "chase") {
            return [{ type: "chase", description: "追上目標，保持在視線內", time_limit: 90 }];
        }
        return [{ type: "assist", description: "協助完成任務互動" }];
    }

    static fromCampaignMission(mission, campaign) {
        const rewards = mission.rewards || {};
        return new Mission({
            id: mission.id,
            title: mission.title,
            type: mission.mission_type || mission.type,
            description: mission.synopsis || mission.description,
            location: mission.location,
            levelReq: 1,
            duration: 90,
            fuelCost: 15,
            rewardMoney: rewards.money || 120,
            rewardExp: rewards.exp || 80,
            rewardItems: rewards.items || [],
            objectives: mission.objectives || [],
            campaignId: campaign.campaign_id || campaign.campaignId,
            campaignTheme: campaign.theme,
        });
    }
}

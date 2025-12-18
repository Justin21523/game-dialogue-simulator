/**
 * Milestone Tracker for Super Wings Simulator
 * Tracks long-term progression milestones and syncs with backend
 *
 * Milestones are different from achievements:
 * - Achievements: Specific accomplishments with rewards
 * - Milestones: Long-term progression markers (e.g., 100 missions, 10 countries)
 */

class MilestoneTracker {
    constructor() {
        this.storageKey = 'sw_milestones';
        this.milestones = {};
        this.completedMilestones = [];
        this.lastBackendSync = 0;
        this.syncInterval = 5 * 60 * 1000; // 5 minutes

        this.init();
    }

    init() {
        this.loadState();
        this.defineDefaultMilestones();
        this.subscribeToEvents();
    }

    defineDefaultMilestones() {
        // Mission count milestones
        this.defineMilestone('missions_10', {
            name: 'First Flights',
            name_zh: '初次飛行',
            description: 'Complete 10 missions',
            description_zh: '完成 10 個任務',
            category: 'missions',
            target: 10,
            progressKey: 'missionsCompleted',
            rewards: { money: 500, experience: 100 },
        });

        this.defineMilestone('missions_50', {
            name: 'Experienced Pilot',
            name_zh: '經驗豐富的飛行員',
            description: 'Complete 50 missions',
            description_zh: '完成 50 個任務',
            category: 'missions',
            target: 50,
            progressKey: 'missionsCompleted',
            rewards: { money: 2500, experience: 500 },
        });

        this.defineMilestone('missions_100', {
            name: 'Century of Service',
            name_zh: '百次服務',
            description: 'Complete 100 missions',
            description_zh: '完成 100 個任務',
            category: 'missions',
            target: 100,
            progressKey: 'missionsCompleted',
            rewards: { money: 10000, experience: 2000 },
        });

        // Countries visited milestones
        this.defineMilestone('countries_5', {
            name: 'World Traveler',
            name_zh: '世界旅行者',
            description: 'Visit 5 different countries',
            description_zh: '訪問 5 個不同的國家',
            category: 'exploration',
            target: 5,
            progressKey: 'countriesVisited',
            rewards: { money: 1000, experience: 200 },
        });

        this.defineMilestone('countries_10', {
            name: 'Globe Trotter',
            name_zh: '環球旅行家',
            description: 'Visit 10 different countries',
            description_zh: '訪問 10 個不同的國家',
            category: 'exploration',
            target: 10,
            progressKey: 'countriesVisited',
            rewards: { money: 5000, experience: 1000 },
        });

        // Character mastery milestones
        this.defineMilestone('character_master_1', {
            name: 'Character Specialist',
            name_zh: '角色專家',
            description: 'Reach level 10 with any character',
            description_zh: '任意角色達到 10 級',
            category: 'characters',
            target: 10,
            progressKey: 'maxCharacterLevel',
            rewards: { money: 2000, experience: 500 },
        });

        // Time-based milestones
        this.defineMilestone('playtime_10h', {
            name: 'Dedicated Pilot',
            name_zh: '專注的飛行員',
            description: 'Play for 10 hours',
            description_zh: '遊玩 10 小時',
            category: 'time',
            target: 10 * 60 * 60 * 1000, // 10 hours in ms
            progressKey: 'totalPlayTime',
            rewards: { money: 3000, experience: 750 },
        });
    }

    defineMilestone(id, definition) {
        this.milestones[id] = {
            id,
            ...definition,
            progress: 0,
            completed: false,
        };
    }

    subscribeToEvents() {
        if (!window.eventBus) {
            console.warn('[MilestoneTracker] EventBus not available');
            return;
        }

        // Listen for mission completion
        window.eventBus.on('mission:complete', () => {
            this.checkMilestones();
        });

        // Listen for statistics updates
        window.eventBus.on('statistics:updated', () => {
            this.checkMilestones();
        });
    }

    checkMilestones() {
        if (!window.statisticsTracker) {
            return;
        }

        const stats = window.statisticsTracker.getAll();
        let newCompletions = false;

        for (const [id, milestone] of Object.entries(this.milestones)) {
            // Skip already completed
            if (this.completedMilestones.includes(id)) {
                continue;
            }

            // Get current progress
            const currentProgress = stats[milestone.progressKey] || 0;
            milestone.progress = currentProgress;

            // Check if completed
            if (currentProgress >= milestone.target) {
                this.completeMilestone(id);
                newCompletions = true;
            }
        }

        // Sync with backend if there are new completions
        if (newCompletions) {
            this.syncWithBackend();
        }

        this.saveState();
    }

    completeMilestone(milestoneId) {
        const milestone = this.milestones[milestoneId];
        if (!milestone || this.completedMilestones.includes(milestoneId)) {
            return;
        }

        // Mark as completed
        milestone.completed = true;
        this.completedMilestones.push(milestoneId);

        // Grant rewards
        if (milestone.rewards) {
            this.grantRewards(milestone.rewards);
        }

        // Emit event
        if (window.eventBus) {
            window.eventBus.emit('milestone:completed', {
                milestoneId,
                milestone,
            });
        }

        // Show notification
        this.showNotification(milestone);

        console.log(`[MilestoneTracker] Milestone completed: ${milestoneId}`, milestone);
    }

    grantRewards(rewards) {
        if (rewards.money && window.gameState) {
            window.gameState.addMoney(rewards.money);
        }

        if (rewards.experience && window.eventBus) {
            window.eventBus.emit('player:gainExperience', {
                amount: rewards.experience,
                source: 'milestone',
            });
        }
    }

    showNotification(milestone) {
        if (!window.eventBus) {
            return;
        }

        const lang = window.gameState?.settings?.language || 'en';
        const name = lang === 'zh' ? milestone.name_zh : milestone.name;
        const description = lang === 'zh' ? milestone.description_zh : milestone.description;

        window.eventBus.emit('ui:notification', {
            type: 'milestone',
            title: '🏆 Milestone Reached!',
            message: `${name}: ${description}`,
            duration: 5000,
        });
    }

    async syncWithBackend() {
        const now = Date.now();

        // Throttle sync requests
        if (now - this.lastBackendSync < this.syncInterval) {
            return;
        }

        this.lastBackendSync = now;

        try {
            const response = await fetch('/api/v1/progress/milestones', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Backend sync failed: ${response.status}`);
            }

            const data = await response.json();

            // Merge backend milestones
            if (data.milestones) {
                for (const serverMilestone of data.milestones) {
                    const localMilestone = this.milestones[serverMilestone.id];

                    if (localMilestone) {
                        // Update progress from server
                        if (serverMilestone.progress !== undefined) {
                            localMilestone.progress = Math.max(
                                localMilestone.progress,
                                serverMilestone.progress
                            );
                        }

                        // Mark as completed if server says so
                        if (serverMilestone.completed && !this.completedMilestones.includes(serverMilestone.id)) {
                            this.completeMilestone(serverMilestone.id);
                        }
                    }
                }
            }

            this.saveState();
            console.log('[MilestoneTracker] Synced with backend:', data);
            return data;
        } catch (error) {
            console.error('[MilestoneTracker] Backend sync failed:', error);
            return null;
        }
    }

    getMilestoneProgress(milestoneId) {
        const milestone = this.milestones[milestoneId];
        if (!milestone) {
            return null;
        }

        return {
            id: milestoneId,
            ...milestone,
            percentage: Math.min(100, Math.round((milestone.progress / milestone.target) * 100)),
        };
    }

    getAllMilestones() {
        return Object.values(this.milestones).map(milestone => ({
            ...milestone,
            percentage: Math.min(100, Math.round((milestone.progress / milestone.target) * 100)),
        }));
    }

    getCompletedMilestones() {
        return this.completedMilestones.map(id => this.milestones[id]).filter(Boolean);
    }

    getMilestonesByCategory(category) {
        return this.getAllMilestones().filter(m => m.category === category);
    }

    saveState() {
        const state = {
            completedMilestones: this.completedMilestones,
            milestoneProgress: Object.fromEntries(
                Object.entries(this.milestones).map(([id, m]) => [id, m.progress])
            ),
        };

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (error) {
            console.error('[MilestoneTracker] Failed to save state:', error);
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const state = JSON.parse(saved);
                this.completedMilestones = state.completedMilestones || [];

                // Restore progress
                if (state.milestoneProgress) {
                    for (const [id, progress] of Object.entries(state.milestoneProgress)) {
                        if (this.milestones[id]) {
                            this.milestones[id].progress = progress;
                        }
                    }
                }

                // Mark completed milestones
                for (const id of this.completedMilestones) {
                    if (this.milestones[id]) {
                        this.milestones[id].completed = true;
                    }
                }
            }
        } catch (error) {
            console.error('[MilestoneTracker] Failed to load state:', error);
        }
    }

    reset() {
        this.completedMilestones = [];
        for (const milestone of Object.values(this.milestones)) {
            milestone.progress = 0;
            milestone.completed = false;
        }
        this.saveState();
    }
}

// Create singleton instance
const milestoneTracker = new MilestoneTracker();

// Make available globally
window.milestoneTracker = milestoneTracker;

export default milestoneTracker;

/**
 * Achievement Popup for Super Wings Simulator
 * Toast-style notification when achievements are unlocked
 */

class AchievementPopup {
    constructor() {
        this.container = null;
        this.queue = [];
        this.isShowing = false;
        this.displayDuration = 4000;  // ms
        this.animationDuration = 500;  // ms

        this.init();
    }

    init() {
        // Create container element
        this.container = document.createElement('div');
        this.container.id = 'achievement-popup-container';
        this.container.className = 'achievement-popup-container';
        document.body.appendChild(this.container);

        // Add styles
        this.addStyles();

        // Subscribe to achievement events
        this.subscribeToEvents();
    }

    subscribeToEvents() {
        if (window.eventBus) {
            window.eventBus.on('ACHIEVEMENT_UNLOCKED', (data) => {
                this.queueAchievement(data);
            });
        }
    }

    /**
     * Queue an achievement for display
     */
    queueAchievement(data) {
        this.queue.push(data);

        if (!this.isShowing) {
            this.showNext();
        }
    }

    /**
     * Show the next achievement in queue
     */
    async showNext() {
        if (this.queue.length === 0) {
            this.isShowing = false;
            return;
        }

        this.isShowing = true;
        const data = this.queue.shift();

        await this.displayAchievement(data);
        await this.sleep(this.displayDuration);
        await this.hideAchievement();

        // Show next if any
        this.showNext();
    }

    /**
     * Display an achievement popup
     */
    async displayAchievement(data) {
        const { achievement, points, totalPoints } = data;
        const rarityColor = this.getRarityColor(achievement.rarity);
        const rarityName = this.getRarityName(achievement.rarity);

        const popup = document.createElement('div');
        popup.className = 'achievement-popup';
        popup.innerHTML = `
            <div class="achievement-popup-glow" style="background: ${rarityColor};"></div>
            <div class="achievement-popup-content">
                <div class="achievement-popup-header">
                    <span class="achievement-popup-badge" style="background: ${rarityColor};">
                        ${this.getIcon(achievement.category)}
                    </span>
                    <div class="achievement-popup-title">
                        <span class="achievement-popup-label">Achievement Unlocked!</span>
                        <span class="achievement-popup-rarity" style="color: ${rarityColor};">${rarityName}</span>
                    </div>
                </div>
                <div class="achievement-popup-body">
                    <h3 class="achievement-popup-name">${achievement.name || achievement.name_zh}</h3>
                    <p class="achievement-popup-desc">${achievement.description || achievement.description_zh}</p>
                </div>
                <div class="achievement-popup-footer">
                    <span class="achievement-popup-points">+${points} pts</span>
                    ${achievement.reward ? this.renderReward(achievement.reward) : ''}
                </div>
            </div>
            <div class="achievement-popup-progress">
                <div class="achievement-popup-progress-bar" style="background: ${rarityColor};"></div>
            </div>
        `;

        this.container.appendChild(popup);

        // Trigger entrance animation
        await this.sleep(50);
        popup.classList.add('show');

        // Animate progress bar
        const progressBar = popup.querySelector('.achievement-popup-progress-bar');
        progressBar.style.width = '100%';

        // Store reference for hiding
        this.currentPopup = popup;
    }

    /**
     * Hide current achievement popup
     */
    async hideAchievement() {
        if (!this.currentPopup) return;

        this.currentPopup.classList.remove('show');
        this.currentPopup.classList.add('hide');

        await this.sleep(this.animationDuration);

        if (this.currentPopup && this.currentPopup.parentNode) {
            this.currentPopup.parentNode.removeChild(this.currentPopup);
        }
        this.currentPopup = null;
    }

    /**
     * Get rarity color
     */
    getRarityColor(rarity) {
        const colors = {
            common: '#9e9e9e',
            uncommon: '#4caf50',
            rare: '#2196f3',
            epic: '#9c27b0',
            legendary: '#ff9800'
        };
        return colors[rarity] || colors.common;
    }

    /**
     * Get rarity display name
     */
    getRarityName(rarity) {
        const names = {
            common: 'Common',
            uncommon: 'Uncommon',
            rare: 'Rare',
            epic: 'Epic',
            legendary: 'Legendary'
        };
        return names[rarity] || 'Common';
    }

    /**
     * Get category icon
     */
    getIcon(category) {
        const icons = {
            milestone: '★',
            mission_type: '✈',
            exploration: '🌍',
            character: '👤',
            performance: '🏆',
            progression: '⬆',
            economy: '💰',
            special: '✨'
        };
        return icons[category] || '★';
    }

    /**
     * Render reward display
     */
    renderReward(reward) {
        let html = '<span class="achievement-popup-reward">';
        if (reward.money) {
            html += `<span class="reward-item">💰 +${reward.money}</span>`;
        }
        if (reward.experience) {
            html += `<span class="reward-item">⭐ +${reward.experience} XP</span>`;
        }
        html += '</span>';
        return html;
    }

    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Add component styles
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .achievement-popup-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                pointer-events: none;
            }

            .achievement-popup {
                position: relative;
                width: 360px;
                background: var(--bg-card, #ffffff);
                border-radius: var(--radius-lg, 16px);
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                overflow: hidden;
                transform: translateX(120%);
                opacity: 0;
                transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: auto;
            }

            .achievement-popup.show {
                transform: translateX(0);
                opacity: 1;
            }

            .achievement-popup.hide {
                transform: translateX(120%);
                opacity: 0;
            }

            .achievement-popup-glow {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 0.1;
                pointer-events: none;
            }

            .achievement-popup-content {
                position: relative;
                padding: 16px;
            }

            .achievement-popup-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
            }

            .achievement-popup-badge {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                color: white;
                animation: achievementPulse 1s ease-in-out infinite;
            }

            @keyframes achievementPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }

            .achievement-popup-title {
                display: flex;
                flex-direction: column;
            }

            .achievement-popup-label {
                font-size: 12px;
                color: var(--text-muted, #999);
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            .achievement-popup-rarity {
                font-size: 14px;
                font-weight: 600;
                text-transform: uppercase;
            }

            .achievement-popup-body {
                margin-bottom: 12px;
            }

            .achievement-popup-name {
                font-size: 18px;
                font-weight: 700;
                color: var(--text-main, #333);
                margin: 0 0 4px 0;
            }

            .achievement-popup-desc {
                font-size: 14px;
                color: var(--text-secondary, #666);
                margin: 0;
            }

            .achievement-popup-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 12px;
                border-top: 1px solid var(--border-color, rgba(0,0,0,0.1));
            }

            .achievement-popup-points {
                font-size: 16px;
                font-weight: 700;
                color: var(--color-accent, #FFD700);
            }

            .achievement-popup-reward {
                display: flex;
                gap: 12px;
            }

            .reward-item {
                font-size: 13px;
                color: var(--text-secondary, #666);
            }

            .achievement-popup-progress {
                height: 4px;
                background: var(--bg-secondary, #f0f0f0);
            }

            .achievement-popup-progress-bar {
                height: 100%;
                width: 0%;
                transition: width ${this.displayDuration}ms linear;
            }

            /* Celebration particles */
            .achievement-popup::before,
            .achievement-popup::after {
                content: '';
                position: absolute;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                opacity: 0;
            }

            .achievement-popup.show::before {
                background: var(--color-accent, #FFD700);
                animation: confettiLeft 0.6s ease-out forwards;
            }

            .achievement-popup.show::after {
                background: var(--color-primary, #E31D2B);
                animation: confettiRight 0.6s ease-out forwards;
            }

            @keyframes confettiLeft {
                0% { top: 50%; left: 50%; opacity: 1; transform: translate(-50%, -50%); }
                100% { top: -20px; left: -20px; opacity: 0; transform: translate(-50%, -50%) rotate(360deg); }
            }

            @keyframes confettiRight {
                0% { top: 50%; right: 50%; opacity: 1; transform: translate(50%, -50%); }
                100% { top: -20px; right: -20px; opacity: 0; transform: translate(50%, -50%) rotate(-360deg); }
            }

            /* Mobile responsive */
            @media (max-width: 480px) {
                .achievement-popup-container {
                    top: 10px;
                    right: 10px;
                    left: 10px;
                }

                .achievement-popup {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Manually trigger a test achievement popup
     */
    test() {
        this.queueAchievement({
            achievement: {
                name: 'Test Achievement',
                description: 'This is a test achievement',
                category: 'milestone',
                rarity: 'rare',
                reward: { money: 500, experience: 250 }
            },
            points: 50,
            totalPoints: 100
        });
    }
}

// Create singleton instance
const achievementPopup = new AchievementPopup();

// Make available globally
window.achievementPopup = achievementPopup;

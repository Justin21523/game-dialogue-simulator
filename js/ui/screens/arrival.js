/**
 * ArrivalScreen - Arrival animation before transformation
 * Shows "Arrived at [destination]" with character bounce animation
 */

import { audioManager } from '../../core/audio-manager.js';
import { gameState } from '../../core/game-state.js';
import { aiAssetManager } from '../../core/ai-asset-manager.js';

export class ArrivalScreen {
    constructor(containerId, missionData, flightScore) {
        this.container = document.getElementById(containerId);
        this.missionData = missionData;
        this.flightScore = flightScore;
        this.characterImage = null;
    }

    async render() {
        console.log('[Arrival] Showing arrival animation');

        // Get mission from active missions (like Transform screen)
        let mission;
        if (typeof this.missionData === 'string') {
            mission = gameState.activeMissions.find(m => m.id === this.missionData);
        } else {
            mission = this.missionData;
        }

        if (!mission && gameState.activeMissions.length > 0) {
            mission = gameState.activeMissions[0];
        }

        // Get character ID and character data
        const charId = mission?.assignedCharId || mission?.characterId || 'jett';
        const char = gameState.getCharacter(charId);

        console.log('[Arrival] Character ID:', charId, 'Character:', char?.name);

        // Get destination name
        const destination = mission?.location || mission?.destination || 'Destination';

        // Load character image using AI asset manager (same as Transform)
        this.characterImage = aiAssetManager.getCharacterPlaceholder(charId);

        // Create arrival screen HTML
        this.container.innerHTML = `
            <div class="screen arrival-screen">
                <!-- Background -->
                <div class="arrival-background"></div>

                <!-- Character container -->
                <div class="arrival-character-container">
                    <img src="${this.characterImage}"
                         class="arrival-character-image"
                         alt="${char?.name || 'Character'}">
                </div>

                <!-- Arrival message -->
                <div class="arrival-message">
                    <h1 class="arrival-title">ARRIVED!</h1>
                    <h2 class="arrival-destination">${destination}</h2>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();

        // Play arrival sound
        audioManager.playSound('success');

        // Auto-transition to transformation after 2 seconds
        setTimeout(() => {
            console.log('[Arrival] Transitioning to transformation');
            window.game.renderTransformation(this.missionData, this.flightScore);
        }, 2000);
    }

    addStyles() {
        if (document.getElementById('arrival-screen-styles')) return;

        const style = document.createElement('style');
        style.id = 'arrival-screen-styles';
        style.textContent = `
            .arrival-screen {
                position: relative;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                background: linear-gradient(135deg, #1a2a44 0%, #2c4875 50%, #446dff 100%);
            }

            .arrival-background {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%);
                animation: arrivalPulse 2s ease-in-out infinite;
            }

            @keyframes arrivalPulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
            }

            .arrival-character-container {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 500px;
                height: 500px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2;
                animation: characterBounce 0.8s ease-out;
            }

            @keyframes characterBounce {
                0% { transform: translate(-50%, -150%); opacity: 0; }
                60% { transform: translate(-50%, -45%); opacity: 1; }
                80% { transform: translate(-50%, -55%); }
                100% { transform: translate(-50%, -50%); }
            }

            .arrival-character-image {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
                filter: drop-shadow(0 0 40px rgba(255, 255, 255, 0.6));
                animation: characterGlow 1.5s ease-in-out infinite;
            }

            @keyframes characterGlow {
                0%, 100% {
                    filter: drop-shadow(0 0 40px rgba(255, 255, 255, 0.6));
                }
                50% {
                    filter: drop-shadow(0 0 60px rgba(255, 255, 255, 0.9));
                }
            }

            .arrival-message {
                position: absolute;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);
                text-align: center;
                z-index: 3;
                animation: messageFadeIn 0.8s ease-out 0.3s backwards;
            }

            @keyframes messageFadeIn {
                from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }

            .arrival-title {
                font-size: 4rem;
                font-weight: bold;
                color: #FFD700;
                text-shadow:
                    0 0 10px rgba(255, 215, 0, 0.5),
                    0 0 20px rgba(255, 215, 0, 0.3),
                    2px 2px 4px rgba(0, 0, 0, 0.5);
                margin: 0;
                margin-bottom: 10px;
                animation: titlePulse 1.5s ease-in-out infinite;
            }

            @keyframes titlePulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            .arrival-destination {
                font-size: 2rem;
                font-weight: 600;
                color: #ffffff;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
                margin: 0;
                text-transform: uppercase;
                letter-spacing: 2px;
            }

            @media (max-width: 768px) {
                .arrival-character-container {
                    width: 350px;
                    height: 350px;
                }

                .arrival-title {
                    font-size: 3rem;
                }

                .arrival-destination {
                    font-size: 1.5rem;
                }
            }

            @media (max-width: 480px) {
                .arrival-character-container {
                    width: 250px;
                    height: 250px;
                }

                .arrival-title {
                    font-size: 2rem;
                }

                .arrival-destination {
                    font-size: 1.2rem;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

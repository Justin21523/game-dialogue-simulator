import { gameState } from '../core/game-state.js';
import { CONFIG } from '../config.js';

export class DebugOverlay {
    constructor() {
        if (!CONFIG.DEBUG_MODE) return;
        this.render();
        this.attachEvents();
    }

    render() {
        const div = document.createElement('div');
        div.id = 'debug-overlay';
        div.innerHTML = `
            <div class="debug-header">
                <span class="debug-title">🛠️ DEBUG</span>
                <span id="debug-fps" class="debug-fps">60 FPS</span>
                <button class="debug-toggle-btn" id="debug-toggle">▼</button>
            </div>
            <div class="debug-content" style="display: none;">
                <button class="debug-btn" id="dbg-fuel">⛽ Fill Fuel</button>
                <button class="debug-btn" id="dbg-money">💰 +1000 Money</button>
                <button class="debug-btn" id="dbg-reset">⚠️ Reset Save</button>
            </div>
        `;
        document.body.appendChild(div);

        // Add styles dynamically
        const style = document.createElement('style');
        style.textContent = `
            #debug-overlay {
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.85);
                color: #0f0;
                padding: 6px 10px;
                border-radius: 6px;
                font-family: monospace;
                font-size: 11px;
                z-index: 9999;
                border: 2px solid #0f0;
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
                min-width: auto;
                transition: all 0.2s ease;
            }
            #debug-overlay.collapsed {
                padding: 4px 8px;
                min-width: auto;
            }
            .debug-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                font-weight: bold;
                user-select: none;
                margin-bottom: 0;
            }
            .debug-title {
                font-size: 13px;
            }
            .debug-fps {
                font-size: 11px;
                color: #0f0;
                opacity: 0.8;
            }
            .debug-toggle-btn {
                background: transparent;
                border: none;
                color: #0f0;
                cursor: pointer;
                font-size: 14px;
                padding: 2px 4px;
                line-height: 1;
                transition: transform 0.2s;
            }
            .debug-toggle-btn:hover {
                opacity: 0.7;
            }
            .debug-toggle-btn.expanded {
                transform: rotate(180deg);
            }
            .debug-content {
                display: flex;
                flex-direction: column;
                gap: 5px;
                margin-top: 8px;
                transition: all 0.3s ease;
            }
            .debug-content.collapsed {
                display: none;
            }
            .debug-btn {
                background: #1a1a1a;
                color: #0f0;
                border: 1px solid #0f0;
                padding: 6px 10px;
                cursor: pointer;
                font-family: monospace;
                font-size: 11px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .debug-btn:hover {
                background: #2a2a2a;
                box-shadow: 0 0 8px rgba(0, 255, 0, 0.3);
            }
        `;
        document.head.appendChild(style);

        // FPS Counter
        this.lastTime = performance.now();
        this.frames = 0;
        requestAnimationFrame(this.loop.bind(this));
    }

    attachEvents() {
        const content = document.querySelector('.debug-content');
        const toggleBtn = document.getElementById('debug-toggle');

        console.log('[DebugOverlay] Attaching events, content:', content, 'toggleBtn:', toggleBtn);

        // Toggle button click
        if (toggleBtn && content) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = content.style.display === 'none';
                console.log('[DebugOverlay] Toggle clicked, currently hidden:', isHidden);

                // Toggle display
                content.style.display = isHidden ? 'flex' : 'none';
                toggleBtn.textContent = isHidden ? '▲' : '▼';
                toggleBtn.classList.toggle('expanded');

                // Toggle collapsed class on overlay
                const overlay = document.getElementById('debug-overlay');
                if (overlay) {
                    if (isHidden) {
                        overlay.classList.remove('collapsed');
                    } else {
                        overlay.classList.add('collapsed');
                    }
                }

                console.log('[DebugOverlay] After toggle, display:', content.style.display);
            });
        } else {
            console.error('[DebugOverlay] Failed to attach toggle event - missing elements');
        }

        document.getElementById('dbg-fuel').addEventListener('click', () => {
            gameState.resources.fuel = CONFIG.MAX_FUEL;
            gameState.save(); // Force save
            // Force UI update via event bus hack (game state emits on consume but not direct set usually)
            // But we added refuel method which emits, so let's call that logic or emit manually
            // gameState.refuel() checks money, we want FREE fuel
            import('../core/event-bus.js').then(({eventBus}) => {
                eventBus.emit('RESOURCE_UPDATED', { type: 'fuel', value: CONFIG.MAX_FUEL });
            });
        });

        document.getElementById('dbg-money').addEventListener('click', () => {
            gameState.addMoney(1000);
        });

        document.getElementById('dbg-reset').addEventListener('click', () => {
            if(confirm('Reset all progress?')) {
                gameState.reset();
                location.reload();
            }
        });
    }

    loop(time) {
        this.frames++;
        if (time - this.lastTime >= 1000) {
            document.getElementById('debug-fps').innerText = this.frames;
            this.frames = 0;
            this.lastTime = time;
        }
        requestAnimationFrame(this.loop.bind(this));
    }
}

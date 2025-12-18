/**
 * Streaming Analysis Component
 * Displays AI-generated text with typewriter effect using WebSocket streaming
 */

import websocketClient from '../../core/websocket-client.js';

class StreamingAnalysis {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[StreamingAnalysis] Container not found: ${containerId}`);
            return;
        }

        this.currentText = '';
        this.isStreaming = false;
        this.typewriterSpeed = 30; // ms per character

        this.init();
    }

    init() {
        // Create UI elements
        this.container.innerHTML = `
            <div class="streaming-analysis">
                <div class="streaming-header">
                    <h3>🤖 AI Analysis</h3>
                    <div class="streaming-status"></div>
                </div>
                <div class="streaming-content"></div>
                <div class="streaming-controls">
                    <button class="btn-secondary" data-action="skip">Skip Animation</button>
                </div>
            </div>
        `;

        this.statusEl = this.container.querySelector('.streaming-status');
        this.contentEl = this.container.querySelector('.streaming-content');
        this.controlsEl = this.container.querySelector('.streaming-controls');

        // Bind controls
        this.controlsEl.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action === 'skip') {
                this.skipAnimation();
            }
        });

        // Hide controls initially
        this.controlsEl.style.display = 'none';
    }

    /**
     * Start streaming analysis from backend
     * @param {Object} params - Analysis parameters
     */
    async startStreaming(params) {
        if (this.isStreaming) {
            console.warn('[StreamingAnalysis] Already streaming');
            return;
        }

        this.isStreaming = true;
        this.currentText = '';
        this.contentEl.textContent = '';
        this.controlsEl.style.display = 'flex';
        this.updateStatus('Connecting...');

        try {
            // Request streaming from WebSocket
            const fullText = await websocketClient.requestStreamingDialogue(
                params,
                (chunk, accumulated) => {
                    this.onChunkReceived(chunk, accumulated);
                }
            );

            this.updateStatus('Complete ✓');
            this.controlsEl.style.display = 'none';
        } catch (error) {
            console.error('[StreamingAnalysis] Streaming failed:', error);
            this.updateStatus('Error: ' + error.message);
            this.contentEl.textContent = 'Failed to generate analysis. Please try again.';
        } finally {
            this.isStreaming = false;
        }
    }

    /**
     * Handle received text chunk
     * @param {string} chunk - New text chunk
     * @param {string} accumulated - Accumulated text so far
     */
    onChunkReceived(chunk, accumulated) {
        this.updateStatus('Receiving...');

        // Store accumulated text
        this.currentText = accumulated;

        // Update display with typewriter effect
        this.displayWithTypewriter(accumulated);
    }

    /**
     * Display text with typewriter effect
     * @param {string} text - Text to display
     */
    displayWithTypewriter(text) {
        const currentLength = this.contentEl.textContent.length;
        const targetLength = text.length;

        if (currentLength >= targetLength) {
            return;
        }

        // Add one character at a time
        const nextChar = text[currentLength];
        this.contentEl.textContent += nextChar;

        // Schedule next character
        setTimeout(() => {
            if (this.contentEl.textContent.length < text.length) {
                this.displayWithTypewriter(text);
            }
        }, this.typewriterSpeed);
    }

    /**
     * Skip typewriter animation and show full text
     */
    skipAnimation() {
        if (this.currentText) {
            this.contentEl.textContent = this.currentText;
        }
    }

    /**
     * Update status indicator
     * @param {string} status - Status text
     */
    updateStatus(status) {
        this.statusEl.textContent = status;

        // Add visual indicator
        if (status.includes('Connecting') || status.includes('Receiving')) {
            this.statusEl.className = 'streaming-status active';
        } else if (status.includes('Complete')) {
            this.statusEl.className = 'streaming-status complete';
        } else if (status.includes('Error')) {
            this.statusEl.className = 'streaming-status error';
        } else {
            this.statusEl.className = 'streaming-status';
        }
    }

    /**
     * Clear content
     */
    clear() {
        this.currentText = '';
        this.contentEl.textContent = '';
        this.updateStatus('');
        this.controlsEl.style.display = 'none';
    }

    /**
     * Set typewriter speed
     * @param {number} speed - Speed in ms per character
     */
    setTypewriterSpeed(speed) {
        this.typewriterSpeed = speed;
    }
}

export default StreamingAnalysis;

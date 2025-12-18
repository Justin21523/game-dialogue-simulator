/**
 * WebSocket Client for Super Wings Simulator
 * Manages WebSocket connections with automatic reconnection
 * Supports streaming responses from backend AI agents
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.url = this._getWebSocketURL();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.isIntentionallyClosed = false;
        this.messageQueue = [];
        this.eventHandlers = new Map();
        this.connectionState = 'disconnected'; // disconnected, connecting, connected, error

        this.init();
    }

    /**
     * Get WebSocket URL based on current location
     */
    _getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        return `${protocol}//${host}/api/v1/ws`;
    }

    /**
     * Initialize WebSocket connection
     */
    init() {
        this.connect();
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log('[WebSocket] Already connected or connecting');
            return;
        }

        this.connectionState = 'connecting';
        this.isIntentionallyClosed = false;

        console.log('[WebSocket] Connecting to:', this.url);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => this._onOpen();
            this.ws.onclose = (event) => this._onClose(event);
            this.ws.onerror = (error) => this._onError(error);
            this.ws.onmessage = (event) => this._onMessage(event);
        } catch (error) {
            console.error('[WebSocket] Connection failed:', error);
            this.connectionState = 'error';
            this._scheduleReconnect();
        }
    }

    /**
     * Handle connection open
     */
    _onOpen() {
        console.log('[WebSocket] Connected');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay

        // Send queued messages
        this._flushMessageQueue();

        // Emit connected event
        this._emit('connected', {});
    }

    /**
     * Handle connection close
     */
    _onClose(event) {
        console.log('[WebSocket] Disconnected', event.code, event.reason);
        this.connectionState = 'disconnected';

        this._emit('disconnected', { code: event.code, reason: event.reason });

        // Reconnect if not intentionally closed
        if (!this.isIntentionallyClosed) {
            this._scheduleReconnect();
        }
    }

    /**
     * Handle connection error
     */
    _onError(error) {
        console.error('[WebSocket] Error:', error);
        this.connectionState = 'error';

        this._emit('error', { error });
    }

    /**
     * Handle incoming message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);

            // Handle different message types
            if (data.type) {
                this._emit(data.type, data);
            }

            // Always emit raw message event
            this._emit('message', data);
        } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
            // Handle non-JSON messages (streaming text)
            this._emit('stream', { text: event.data });
        }
    }

    /**
     * Schedule reconnection attempt
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WebSocket] Max reconnect attempts reached');
            this._emit('max-reconnect-attempts', {});
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
            if (!this.isIntentionallyClosed) {
                this.connect();
            }
        }, delay);
    }

    /**
     * Send message to server
     * @param {Object} data - Data to send
     */
    send(data) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            console.warn('[WebSocket] Not connected, queueing message');
            this.messageQueue.push(message);

            // Attempt to connect if not already
            if (this.connectionState === 'disconnected') {
                this.connect();
            }
        }
    }

    /**
     * Flush queued messages
     */
    _flushMessageQueue() {
        if (this.messageQueue.length === 0) {
            return;
        }

        console.log(`[WebSocket] Flushing ${this.messageQueue.length} queued messages`);

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(message);
            }
        }
    }

    /**
     * Subscribe to WebSocket events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Unsubscribe from WebSocket events
     * @param {string} event - Event name
     * @param {Function} handler - Event handler to remove
     */
    off(event, handler) {
        if (!this.eventHandlers.has(event)) {
            return;
        }

        const handlers = this.eventHandlers.get(event);
        const index = handlers.indexOf(handler);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }

    /**
     * Emit event to handlers
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    _emit(event, data) {
        if (!this.eventHandlers.has(event)) {
            return;
        }

        const handlers = this.eventHandlers.get(event);
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`[WebSocket] Error in event handler for '${event}':`, error);
            }
        });
    }

    /**
     * Close WebSocket connection
     */
    close() {
        this.isIntentionallyClosed = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = 'disconnected';
    }

    /**
     * Get connection state
     * @returns {string} Connection state
     */
    getState() {
        return this.connectionState;
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connectionState === 'connected' && this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Request streaming dialogue
     * @param {Object} params - Dialogue parameters
     * @param {Function} onChunk - Callback for each text chunk
     * @returns {Promise<string>} Complete dialogue text
     */
    async requestStreamingDialogue(params, onChunk) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error('WebSocket not connected'));
                return;
            }

            const requestId = `dialogue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            let fullText = '';

            // Set up streaming handler
            const streamHandler = (data) => {
                if (data.requestId === requestId) {
                    if (data.chunk) {
                        fullText += data.chunk;
                        if (onChunk) {
                            onChunk(data.chunk, fullText);
                        }
                    }

                    if (data.done) {
                        this.off('dialogue:stream', streamHandler);
                        resolve(fullText);
                    }

                    if (data.error) {
                        this.off('dialogue:stream', streamHandler);
                        reject(new Error(data.error));
                    }
                }
            };

            this.on('dialogue:stream', streamHandler);

            // Send request
            this.send({
                type: 'dialogue:request',
                requestId,
                params,
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (fullText === '') {
                    this.off('dialogue:stream', streamHandler);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
}

// Create singleton instance
const websocketClient = new WebSocketClient();

// Make available globally
window.websocketClient = websocketClient;

export default websocketClient;

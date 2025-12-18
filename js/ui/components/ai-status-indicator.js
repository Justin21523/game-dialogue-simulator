/**
 * AIStatusIndicator - AI 狀態指示器
 *
 * 功能：
 * - 顯示「🤖 AI 思考中...」狀態
 * - 顯示「✅ AI 完成」狀態
 * - 顯示「❌ AI 錯誤」狀態
 * - 顯示當前 AI 操作的詳細資訊
 * - 支援多個並發 AI 請求的追蹤
 */

import { eventBus } from '../../core/event-bus.js';

export class AIStatusIndicator {
    constructor(container, options = {}) {
        this.container = container;

        // 配置
        this.showDetails = options.showDetails ?? true;
        this.autoHide = options.autoHide ?? true;
        this.autoHideDelay = options.autoHideDelay ?? 3000;

        // 狀態追蹤
        this.activeRequests = new Map(); // requestId -> { type, startTime, status }
        this.requestHistory = []; // 最近的請求歷史

        // DOM 參考
        this.indicatorElement = null;
        this.statusIcon = null;
        this.statusText = null;
        this.detailsList = null;

        // 計時器
        this.hideTimer = null;

        // 初始化
        this.createDOM();
        this.setupEventListeners();
    }

    /**
     * 建立 DOM 結構
     */
    createDOM() {
        this.indicatorElement = document.createElement('div');
        this.indicatorElement.className = 'ai-status-indicator hidden';

        this.indicatorElement.innerHTML = `
            <div class="indicator-main">
                <div class="status-icon">🤖</div>
                <div class="status-content">
                    <div class="status-text">AI Ready</div>
                    <div class="status-details ${this.showDetails ? '' : 'hidden'}"></div>
                </div>
                <button class="indicator-close" title="Close">×</button>
            </div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        `;

        this.container.appendChild(this.indicatorElement);

        // 獲取 DOM 元素參考
        this.statusIcon = this.indicatorElement.querySelector('.status-icon');
        this.statusText = this.indicatorElement.querySelector('.status-text');
        this.statusDetails = this.indicatorElement.querySelector('.status-details');
        this.progressBar = this.indicatorElement.querySelector('.progress-fill');
        this.closeButton = this.indicatorElement.querySelector('.indicator-close');

        // 按鈕事件
        this.closeButton.addEventListener('click', () => this.hide());
    }

    /**
     * 設定事件監聽器
     */
    setupEventListeners() {
        // AI 請求開始
        eventBus.on('AI_REQUEST_START', (data) => {
            this.onRequestStart(data);
        });

        // AI 請求完成
        eventBus.on('AI_REQUEST_SUCCESS', (data) => {
            this.onRequestSuccess(data);
        });

        // AI 請求錯誤
        eventBus.on('AI_REQUEST_ERROR', (data) => {
            this.onRequestError(data);
        });

        // AI 離線模式
        eventBus.on('AI_OFFLINE_MODE', (data) => {
            this.showOfflineStatus(data);
        });
    }

    /**
     * AI 請求開始
     */
    onRequestStart(data) {
        const requestId = data.requestId || `req_${Date.now()}`;
        const requestType = data.type || 'Unknown';

        this.activeRequests.set(requestId, {
            id: requestId,
            type: requestType,
            startTime: Date.now(),
            status: 'pending'
        });

        this.updateDisplay('thinking');
        this.show();
    }

    /**
     * AI 請求成功
     */
    onRequestSuccess(data) {
        const requestId = data.requestId;

        if (this.activeRequests.has(requestId)) {
            const request = this.activeRequests.get(requestId);
            request.status = 'success';
            request.endTime = Date.now();
            request.duration = request.endTime - request.startTime;

            // 移至歷史
            this.requestHistory.unshift(request);
            if (this.requestHistory.length > 10) {
                this.requestHistory.pop();
            }

            this.activeRequests.delete(requestId);
        }

        // 如果沒有更多活躍請求，顯示成功狀態
        if (this.activeRequests.size === 0) {
            this.updateDisplay('success');
            this.scheduleAutoHide();
        } else {
            // 還有其他請求在進行
            this.updateDisplay('thinking');
        }
    }

    /**
     * AI 請求錯誤
     */
    onRequestError(data) {
        const requestId = data.requestId;

        if (this.activeRequests.has(requestId)) {
            const request = this.activeRequests.get(requestId);
            request.status = 'error';
            request.error = data.error || 'Unknown error';
            request.endTime = Date.now();

            // 移至歷史
            this.requestHistory.unshift(request);
            if (this.requestHistory.length > 10) {
                this.requestHistory.pop();
            }

            this.activeRequests.delete(requestId);
        }

        // 顯示錯誤狀態
        this.updateDisplay('error', data.error);
        this.scheduleAutoHide(5000); // 錯誤訊息顯示更久
    }

    /**
     * 顯示離線模式狀態
     */
    showOfflineStatus(data) {
        this.updateDisplay('offline');
        this.scheduleAutoHide(4000);
    }

    /**
     * 更新顯示狀態
     */
    updateDisplay(status, message = '') {
        // 清除之前的狀態類別
        this.indicatorElement.classList.remove('thinking', 'success', 'error', 'offline');

        // 添加新狀態類別
        this.indicatorElement.classList.add(status);

        switch (status) {
            case 'thinking':
                this.statusIcon.textContent = '🤖';
                this.statusText.textContent = 'AI Thinking...';
                this.updateProgress(true);
                this.updateDetails();
                break;

            case 'success':
                this.statusIcon.textContent = '✅';
                this.statusText.textContent = 'AI Complete';
                this.updateProgress(false);
                this.updateDetails();
                break;

            case 'error':
                this.statusIcon.textContent = '❌';
                this.statusText.textContent = message || 'AI Error';
                this.updateProgress(false);
                this.statusDetails.textContent = message || 'Request failed';
                break;

            case 'offline':
                this.statusIcon.textContent = '📴';
                this.statusText.textContent = 'AI Offline Mode';
                this.updateProgress(false);
                this.statusDetails.textContent = 'Using template fallback';
                break;

            default:
                this.statusIcon.textContent = '🤖';
                this.statusText.textContent = 'AI Ready';
                this.updateProgress(false);
                this.statusDetails.textContent = '';
        }
    }

    /**
     * 更新詳細資訊
     */
    updateDetails() {
        if (!this.showDetails) return;

        if (this.activeRequests.size > 0) {
            // 顯示活躍請求
            const requests = Array.from(this.activeRequests.values());
            const details = requests.map(req => {
                const elapsed = Math.round((Date.now() - req.startTime) / 1000);
                return `• ${this.formatRequestType(req.type)} (${elapsed}s)`;
            }).join('\n');

            this.statusDetails.textContent = details;
        } else if (this.requestHistory.length > 0) {
            // 顯示最近完成的請求
            const lastRequest = this.requestHistory[0];
            const duration = lastRequest.duration ? `${lastRequest.duration}ms` : 'N/A';
            this.statusDetails.textContent = `Last: ${this.formatRequestType(lastRequest.type)} (${duration})`;
        } else {
            this.statusDetails.textContent = '';
        }
    }

    /**
     * 格式化請求類型
     */
    formatRequestType(type) {
        const typeNames = {
            'mission_graph': 'Mission Graph',
            'npc_dialogue': 'NPC Dialogue',
            'mission_evaluation': 'Mission Eval',
            'interaction_evaluation': 'Interaction Eval',
            'rag_query': 'RAG Query',
            'content_generation': 'Content Gen'
        };
        return typeNames[type] || type;
    }

    /**
     * 更新進度條
     */
    updateProgress(active) {
        if (active) {
            this.progressBar.classList.add('active');
        } else {
            this.progressBar.classList.remove('active');
        }
    }

    /**
     * 顯示指示器
     */
    show() {
        this.indicatorElement.classList.remove('hidden');
        this.cancelAutoHide();
    }

    /**
     * 隱藏指示器
     */
    hide() {
        this.indicatorElement.classList.add('hidden');
        this.cancelAutoHide();
    }

    /**
     * 排程自動隱藏
     */
    scheduleAutoHide(delay) {
        if (!this.autoHide) return;

        this.cancelAutoHide();

        this.hideTimer = setTimeout(() => {
            if (this.activeRequests.size === 0) {
                this.hide();
            }
        }, delay || this.autoHideDelay);
    }

    /**
     * 取消自動隱藏
     */
    cancelAutoHide() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
    }

    /**
     * 獲取統計資訊
     */
    getStats() {
        const successCount = this.requestHistory.filter(r => r.status === 'success').length;
        const errorCount = this.requestHistory.filter(r => r.status === 'error').length;
        const avgDuration = this.requestHistory
            .filter(r => r.duration)
            .reduce((sum, r) => sum + r.duration, 0) / (successCount || 1);

        return {
            active: this.activeRequests.size,
            success: successCount,
            error: errorCount,
            avgDuration: Math.round(avgDuration)
        };
    }

    /**
     * 清除歷史
     */
    clearHistory() {
        this.requestHistory = [];
        this.updateDetails();
    }

    /**
     * 銷毀
     */
    destroy() {
        eventBus.off('AI_REQUEST_START');
        eventBus.off('AI_REQUEST_SUCCESS');
        eventBus.off('AI_REQUEST_ERROR');
        eventBus.off('AI_OFFLINE_MODE');

        this.cancelAutoHide();

        if (this.indicatorElement) {
            this.indicatorElement.remove();
        }
    }
}

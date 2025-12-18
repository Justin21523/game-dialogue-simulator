/**
 * AIRequestQueue - AI 請求隊列管理器 (Stage 7)
 *
 * 功能：
 * - 限制最多 3 個並發 AI 請求
 * - 快取 AI 回應（30 秒 TTL）
 * - 避免重複請求
 * - 請求優先級管理
 */

export class AIRequestQueue {
    constructor(options = {}) {
        // 配置
        this.maxConcurrent = options.maxConcurrent ?? 3;  // 最多 3 個並發請求
        this.cacheTTL = options.cacheTTL ?? 30000;  // 快取 30 秒
        this.requestTimeout = options.requestTimeout ?? 10000;  // 請求超時 10 秒

        // 隊列
        this.pendingQueue = [];  // 等待中的請求
        this.activeRequests = new Map();  // 正在執行的請求 (requestId -> Promise)
        this.requestCount = 0;  // 用於生成 requestId

        // 快取
        this.cache = new Map();  // cacheKey -> { data, timestamp }

        // 去重（防止短時間內重複請求）
        this.recentRequests = new Map();  // cacheKey -> timestamp
        this.dedupeWindow = 1000;  // 1 秒內的重複請求視為重複

        // 統計
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            deduped: 0,
            errors: 0,
            avgResponseTime: 0
        };
    }

    /**
     * 發送 AI 請求（帶隊列和快取）
     * @param {string} endpoint - API 端點
     * @param {Object} params - 請求參數
     * @param {Object} options - 選項 { priority, bypassCache, ttl }
     * @returns {Promise<any>}
     */
    async request(endpoint, params, options = {}) {
        this.stats.totalRequests++;

        // 生成快取鍵
        const cacheKey = this.generateCacheKey(endpoint, params);

        // 檢查快取
        if (!options.bypassCache) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                console.log(`[AIRequestQueue] Cache HIT: ${endpoint}`);
                return cached;
            }
            this.stats.cacheMisses++;
        }

        // 去重檢查
        const now = Date.now();
        const lastRequestTime = this.recentRequests.get(cacheKey);
        if (lastRequestTime && now - lastRequestTime < this.dedupeWindow) {
            this.stats.deduped++;
            console.log(`[AIRequestQueue] Deduped: ${endpoint} (too recent)`);

            // 等待之前的請求完成
            return this.waitForDuplicate(cacheKey);
        }

        this.recentRequests.set(cacheKey, now);

        // 創建請求
        const requestId = `req_${++this.requestCount}`;
        const priority = options.priority ?? 'normal';

        const requestItem = {
            id: requestId,
            endpoint,
            params,
            cacheKey,
            priority,
            ttl: options.ttl ?? this.cacheTTL,
            resolve: null,
            reject: null,
            startTime: null
        };

        // 如果有空位，立即執行
        if (this.activeRequests.size < this.maxConcurrent) {
            return this.executeRequest(requestItem);
        }

        // 否則加入隊列
        console.log(`[AIRequestQueue] Queue: ${endpoint} (${this.activeRequests.size}/${this.maxConcurrent} slots)`);
        return new Promise((resolve, reject) => {
            requestItem.resolve = resolve;
            requestItem.reject = reject;
            this.addToQueue(requestItem);
        });
    }

    /**
     * 添加到隊列（根據優先級）
     * @param {Object} requestItem - 請求項目
     */
    addToQueue(requestItem) {
        // 根據優先級插入
        const priorities = { high: 0, normal: 1, low: 2 };
        const itemPriority = priorities[requestItem.priority] ?? 1;

        let inserted = false;
        for (let i = 0; i < this.pendingQueue.length; i++) {
            const queuePriority = priorities[this.pendingQueue[i].priority] ?? 1;
            if (itemPriority < queuePriority) {
                this.pendingQueue.splice(i, 0, requestItem);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this.pendingQueue.push(requestItem);
        }
    }

    /**
     * 執行請求
     * @param {Object} requestItem - 請求項目
     * @returns {Promise<any>}
     */
    async executeRequest(requestItem) {
        const { id, endpoint, params, cacheKey, ttl } = requestItem;
        requestItem.startTime = Date.now();

        console.log(`[AIRequestQueue] Executing: ${endpoint} (ID: ${id})`);

        const promise = (async () => {
            try {
                // 實際 API 調用（由外部提供的 fetcher）
                const response = await this.fetcher(endpoint, params);

                // 計算回應時間
                const responseTime = Date.now() - requestItem.startTime;
                this.updateAvgResponseTime(responseTime);

                // 快取結果
                this.cache.set(cacheKey, {
                    data: response,
                    timestamp: Date.now(),
                    ttl: ttl
                });

                console.log(`[AIRequestQueue] Success: ${endpoint} (${responseTime}ms)`);

                return response;
            } catch (error) {
                this.stats.errors++;
                console.error(`[AIRequestQueue] Error: ${endpoint}`, error);
                throw error;
            } finally {
                // 從活躍列表移除
                this.activeRequests.delete(id);

                // 處理下一個請求
                this.processNext();
            }
        })();

        this.activeRequests.set(id, promise);

        return promise;
    }

    /**
     * 處理下一個隊列請求
     */
    processNext() {
        if (this.pendingQueue.length === 0) return;
        if (this.activeRequests.size >= this.maxConcurrent) return;

        const nextItem = this.pendingQueue.shift();

        this.executeRequest(nextItem)
            .then(result => {
                if (nextItem.resolve) nextItem.resolve(result);
            })
            .catch(error => {
                if (nextItem.reject) nextItem.reject(error);
            });
    }

    /**
     * 等待重複請求完成
     * @param {string} cacheKey - 快取鍵
     * @returns {Promise<any>}
     */
    async waitForDuplicate(cacheKey) {
        // 等待一小段時間，檢查快取
        return new Promise((resolve, reject) => {
            const checkInterval = 100;
            const maxWait = 5000;
            let waited = 0;

            const checker = setInterval(() => {
                const cached = this.getFromCache(cacheKey);
                if (cached) {
                    clearInterval(checker);
                    resolve(cached);
                    return;
                }

                waited += checkInterval;
                if (waited >= maxWait) {
                    clearInterval(checker);
                    reject(new Error('Duplicate request timeout'));
                }
            }, checkInterval);
        });
    }

    /**
     * 生成快取鍵
     * @param {string} endpoint - API 端點
     * @param {Object} params - 參數
     * @returns {string}
     */
    generateCacheKey(endpoint, params) {
        // 簡單的序列化（可以改用更穩定的方法）
        const paramStr = JSON.stringify(params, Object.keys(params).sort());
        return `${endpoint}:${this.hashCode(paramStr)}`;
    }

    /**
     * 簡單的字串雜湊函數
     * @param {string} str - 字串
     * @returns {string}
     */
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * 從快取取得資料
     * @param {string} cacheKey - 快取鍵
     * @returns {any|null}
     */
    getFromCache(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (!cached) return null;

        const now = Date.now();
        const age = now - cached.timestamp;

        if (age > cached.ttl) {
            // 過期，刪除
            this.cache.delete(cacheKey);
            return null;
        }

        return cached.data;
    }

    /**
     * 清理過期快取
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            const age = now - cached.timestamp;
            if (age > cached.ttl) {
                this.cache.delete(key);
            }
        }

        // 清理舊的去重記錄
        for (const [key, timestamp] of this.recentRequests.entries()) {
            if (now - timestamp > this.dedupeWindow * 2) {
                this.recentRequests.delete(key);
            }
        }
    }

    /**
     * 更新平均回應時間
     * @param {number} responseTime - 回應時間（毫秒）
     */
    updateAvgResponseTime(responseTime) {
        const alpha = 0.2;  // 平滑因子
        if (this.stats.avgResponseTime === 0) {
            this.stats.avgResponseTime = responseTime;
        } else {
            this.stats.avgResponseTime = alpha * responseTime + (1 - alpha) * this.stats.avgResponseTime;
        }
    }

    /**
     * 設定 fetcher 函數
     * @param {Function} fetcher - 實際的 API 調用函數
     */
    setFetcher(fetcher) {
        this.fetcher = fetcher;
    }

    /**
     * 取得統計資訊
     * @returns {Object}
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.pendingQueue.length,
            activeRequests: this.activeRequests.size,
            cacheSize: this.cache.size,
            avgResponseTime: Math.round(this.stats.avgResponseTime)
        };
    }

    /**
     * 清空隊列和快取
     */
    clear() {
        this.pendingQueue = [];
        this.cache.clear();
        this.recentRequests.clear();
        // 不清空 activeRequests，讓它們完成
    }

    /**
     * 重置統計
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            deduped: 0,
            errors: 0,
            avgResponseTime: 0
        };
    }
}

// 全局實例
let globalQueue = null;

/**
 * 取得全局 AI 請求隊列
 * @returns {AIRequestQueue}
 */
export function getAIRequestQueue() {
    if (!globalQueue) {
        globalQueue = new AIRequestQueue();

        // 定期清理快取（每分鐘）
        setInterval(() => {
            globalQueue.cleanupCache();
        }, 60000);
    }
    return globalQueue;
}

/**
 * 初始化全局隊列
 * @param {Object} options - 配置選項
 */
export function initAIRequestQueue(options = {}) {
    globalQueue = new AIRequestQueue(options);

    // 定期清理快取
    setInterval(() => {
        globalQueue.cleanupCache();
    }, 60000);

    return globalQueue;
}

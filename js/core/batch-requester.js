/**
 * Batch Request Manager
 * Optimizes API calls by batching multiple requests together
 */

class BatchRequester {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.batchDelay = 50; // ms to wait before processing batch
        this.maxBatchSize = 10;
        this.timeoutId = null;
    }

    /**
     * Add a request to the batch queue
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise} Promise that resolves with the response
     */
    request(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });

            this.scheduleBatchProcess();
        });
    }

    /**
     * Schedule batch processing
     */
    scheduleBatchProcess() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        // Process immediately if queue is full
        if (this.queue.length >= this.maxBatchSize) {
            this.processBatch();
            return;
        }

        // Otherwise wait for more requests
        this.timeoutId = setTimeout(() => {
            this.processBatch();
        }, this.batchDelay);
    }

    /**
     * Process queued requests
     */
    async processBatch() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const batch = this.queue.splice(0, this.maxBatchSize);

        console.log(`[BatchRequester] Processing batch of ${batch.length} requests`);

        // Execute all requests in parallel
        await Promise.allSettled(
            batch.map(async (item) => {
                try {
                    const response = await fetch(item.url, item.options);
                    const data = await response.json();
                    item.resolve({ response, data });
                } catch (error) {
                    item.reject(error);
                }
            })
        );

        this.processing = false;

        // Process next batch if queue has items
        if (this.queue.length > 0) {
            this.scheduleBatchProcess();
        }
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            maxBatchSize: this.maxBatchSize,
            batchDelay: this.batchDelay
        };
    }
}

// Create singleton instance
const batchRequester = new BatchRequester();

// Make available globally
window.batchRequester = batchRequester;

export default batchRequester;

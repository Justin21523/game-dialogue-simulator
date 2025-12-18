/**
 * Error Tracker
 * Tracks and logs frontend errors for debugging and analysis
 */

class ErrorTracker {
    constructor() {
        this.errors = [];
        this.maxErrors = 100; // Keep last 100 errors
        this.storageKey = 'sw_error_log';
        this.reportingEnabled = false;
        this.reportEndpoint = '/api/v1/errors/report'; // Optional backend endpoint

        this.init();
    }

    /**
     * Initialize error tracking
     */
    init() {
        // Load previous errors from storage
        this.loadErrors();

        // Set up global error handlers
        this.setupGlobalHandlers();

        console.log('[ErrorTracker] Initialized');
    }

    /**
     * Set up global error handlers
     */
    setupGlobalHandlers() {
        // Catch unhandled errors
        window.addEventListener('error', (event) => {
            this.logError({
                type: 'runtime_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack,
                timestamp: Date.now()
            });
        });

        // Catch unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.logError({
                type: 'promise_rejection',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack,
                timestamp: Date.now()
            });
        });

        // Catch resource loading errors
        window.addEventListener('error', (event) => {
            if (event.target !== window) {
                this.logError({
                    type: 'resource_error',
                    message: `Failed to load: ${event.target.src || event.target.href}`,
                    element: event.target.tagName,
                    timestamp: Date.now()
                });
            }
        }, true); // Use capture phase
    }

    /**
     * Log an error
     * @param {Object} error - Error object
     */
    logError(error) {
        console.error('[ErrorTracker] Error logged:', error);

        // Add to errors array
        this.errors.unshift(error);

        // Trim to max size
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        // Save to storage
        this.saveErrors();

        // Report to backend if enabled
        if (this.reportingEnabled) {
            this.reportError(error);
        }
    }

    /**
     * Manually track an error
     * @param {string} message - Error message
     * @param {Object} context - Additional context
     */
    track(message, context = {}) {
        this.logError({
            type: 'manual',
            message,
            context,
            timestamp: Date.now(),
            stack: new Error().stack
        });
    }

    /**
     * Save errors to localStorage
     */
    saveErrors() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.errors));
        } catch (error) {
            console.error('[ErrorTracker] Failed to save errors:', error);
        }
    }

    /**
     * Load errors from localStorage
     */
    loadErrors() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.errors = JSON.parse(saved);
            }
        } catch (error) {
            console.error('[ErrorTracker] Failed to load errors:', error);
            this.errors = [];
        }
    }

    /**
     * Report error to backend
     * @param {Object} error - Error object
     */
    async reportError(error) {
        try {
            await fetch(this.reportEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error,
                    userAgent: navigator.userAgent,
                    url: window.location.href,
                    timestamp: Date.now()
                })
            });
        } catch (e) {
            console.error('[ErrorTracker] Failed to report error:', e);
        }
    }

    /**
     * Get all tracked errors
     * @returns {Array} Array of errors
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Get errors by type
     * @param {string} type - Error type
     * @returns {Array} Filtered errors
     */
    getErrorsByType(type) {
        return this.errors.filter(e => e.type === type);
    }

    /**
     * Get recent errors
     * @param {number} minutes - Number of minutes to look back
     * @returns {Array} Recent errors
     */
    getRecentErrors(minutes = 10) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.errors.filter(e => e.timestamp > cutoff);
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getStatistics() {
        const stats = {
            total: this.errors.length,
            byType: {},
            recent: {
                last5min: 0,
                last15min: 0,
                last60min: 0
            }
        };

        const now = Date.now();

        this.errors.forEach(error => {
            // Count by type
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;

            // Count recent
            const age = now - error.timestamp;
            if (age < 5 * 60 * 1000) stats.recent.last5min++;
            if (age < 15 * 60 * 1000) stats.recent.last15min++;
            if (age < 60 * 60 * 1000) stats.recent.last60min++;
        });

        return stats;
    }

    /**
     * Clear all errors
     */
    clearErrors() {
        this.errors = [];
        this.saveErrors();
        console.log('[ErrorTracker] All errors cleared');
    }

    /**
     * Enable error reporting to backend
     */
    enableReporting() {
        this.reportingEnabled = true;
        console.log('[ErrorTracker] Error reporting enabled');
    }

    /**
     * Disable error reporting to backend
     */
    disableReporting() {
        this.reportingEnabled = false;
        console.log('[ErrorTracker] Error reporting disabled');
    }

    /**
     * Export errors as JSON
     * @returns {string} JSON string
     */
    exportErrors() {
        return JSON.stringify({
            errors: this.errors,
            statistics: this.getStatistics(),
            exportDate: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Display error summary in console
     */
    printSummary() {
        const stats = this.getStatistics();

        console.log('\n' + '='.repeat(60));
        console.log('📊 ERROR TRACKER SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Errors: ${stats.total}`);
        console.log('\nBy Type:');
        Object.entries(stats.byType).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        console.log('\nRecent Activity:');
        console.log(`  Last 5 min:  ${stats.recent.last5min}`);
        console.log(`  Last 15 min: ${stats.recent.last15min}`);
        console.log(`  Last hour:   ${stats.recent.last60min}`);
        console.log('='.repeat(60) + '\n');
    }
}

// Create singleton instance
const errorTracker = new ErrorTracker();

// Make available globally
window.errorTracker = errorTracker;

export default errorTracker;

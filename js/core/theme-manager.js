/**
 * Theme Manager for Super Wings Simulator
 * Handles light/dark theme switching with localStorage persistence
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.storageKey = 'sw_theme';
        this.listeners = [];
    }

    /**
     * Initialize theme manager - load saved preference or system preference
     */
    init() {
        // Try to load saved theme
        const savedTheme = localStorage.getItem(this.storageKey);

        if (savedTheme) {
            this.currentTheme = savedTheme;
        } else {
            // Check system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.currentTheme = 'dark';
            }
        }

        // Apply theme
        this.applyTheme();

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                // Only auto-switch if user hasn't set a preference
                if (!localStorage.getItem(this.storageKey)) {
                    this.setTheme(e.matches ? 'dark' : 'light', false);
                }
            });
        }

        console.log(`[ThemeManager] Initialized with theme: ${this.currentTheme}`);
    }

    /**
     * Toggle between light and dark themes
     */
    toggle() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    /**
     * Set a specific theme
     * @param {string} theme - 'light' or 'dark'
     * @param {boolean} save - Whether to save to localStorage (default: true)
     */
    setTheme(theme, save = true) {
        if (theme !== 'light' && theme !== 'dark') {
            console.warn(`[ThemeManager] Invalid theme: ${theme}`);
            return;
        }

        this.currentTheme = theme;
        this.applyTheme();

        if (save) {
            localStorage.setItem(this.storageKey, theme);
        }

        // Notify listeners
        this.notifyListeners();

        // Emit event if EventBus exists
        if (window.eventBus) {
            window.eventBus.emit('THEME_CHANGED', { theme });
        }
    }

    /**
     * Apply current theme to DOM
     */
    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', this.currentTheme === 'dark' ? '#121212' : '#E0F7FA');
        }
    }

    /**
     * Get current theme
     * @returns {string} 'light' or 'dark'
     */
    getTheme() {
        return this.currentTheme;
    }

    /**
     * Check if current theme is dark
     * @returns {boolean}
     */
    isDark() {
        return this.currentTheme === 'dark';
    }

    /**
     * Add theme change listener
     * @param {Function} callback
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove theme change listener
     * @param {Function} callback
     */
    offChange(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    /**
     * Notify all listeners of theme change
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.currentTheme);
            } catch (e) {
                console.error('[ThemeManager] Listener error:', e);
            }
        });
    }

    /**
     * Reset theme to system preference
     */
    reset() {
        localStorage.removeItem(this.storageKey);

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.setTheme('dark', false);
        } else {
            this.setTheme('light', false);
        }
    }
}

// Export singleton instance
const themeManager = new ThemeManager();

// Make available globally
window.themeManager = themeManager;

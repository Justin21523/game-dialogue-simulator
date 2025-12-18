/**
 * Theme Toggle Component for Super Wings Simulator
 * A button/switch to toggle between light and dark themes
 */

class ThemeToggle {
    constructor(container, options = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.options = {
            style: options.style || 'button', // 'button', 'switch', 'icon'
            showLabel: options.showLabel !== false,
            size: options.size || 'medium', // 'small', 'medium', 'large'
            ...options
        };

        this.element = null;
        this.init();
    }

    init() {
        this.element = document.createElement('div');
        this.element.className = `theme-toggle theme-toggle--${this.options.style} theme-toggle--${this.options.size}`;

        this.render();
        this.attachEvents();

        if (this.container) {
            this.container.appendChild(this.element);
        }

        // Listen for theme changes
        if (window.themeManager) {
            window.themeManager.onChange(() => this.render());
        }
    }

    render() {
        const isDark = window.themeManager?.isDark() ?? false;

        switch (this.options.style) {
            case 'switch':
                this.renderSwitch(isDark);
                break;
            case 'icon':
                this.renderIcon(isDark);
                break;
            default:
                this.renderButton(isDark);
        }
    }

    renderButton(isDark) {
        const icon = isDark ? '&#9728;' : '&#9790;'; // Sun : Moon
        const label = this.options.showLabel
            ? (isDark ? ' Light Mode' : ' Dark Mode')
            : '';

        this.element.innerHTML = `
            <button class="theme-toggle-btn" aria-label="Toggle theme">
                <span class="theme-toggle-icon">${icon}</span>
                ${label ? `<span class="theme-toggle-label">${label}</span>` : ''}
            </button>
        `;
    }

    renderSwitch(isDark) {
        this.element.innerHTML = `
            <label class="theme-toggle-switch">
                <input type="checkbox" ${isDark ? 'checked' : ''} aria-label="Toggle dark mode">
                <span class="theme-toggle-slider">
                    <span class="theme-toggle-sun">&#9728;</span>
                    <span class="theme-toggle-moon">&#9790;</span>
                </span>
            </label>
            ${this.options.showLabel ? '<span class="theme-toggle-label">' + (isDark ? 'Dark' : 'Light') + '</span>' : ''}
        `;
    }

    renderIcon(isDark) {
        const icon = isDark ? '&#9728;' : '&#9790;';
        this.element.innerHTML = `
            <button class="theme-toggle-icon-btn" aria-label="Toggle theme">
                ${icon}
            </button>
        `;
    }

    attachEvents() {
        this.element.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) {
                this.toggle();
            }
        });
    }

    toggle() {
        if (window.themeManager) {
            window.themeManager.toggle();

            // Play click sound if audio manager exists
            if (window.audioManager) {
                window.audioManager.playSound('button');
            }
        }
    }

    /**
     * Create and return a standalone toggle element
     * @param {object} options
     * @returns {HTMLElement}
     */
    static create(options = {}) {
        const toggle = new ThemeToggle(null, options);
        return toggle.element;
    }
}

// Add CSS styles
const themeToggleStyles = document.createElement('style');
themeToggleStyles.textContent = `
    .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    /* Button Style */
    .theme-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        color: var(--text-main);
        cursor: pointer;
        font-size: 14px;
        font-family: var(--font-main);
        transition: all var(--transition-fast);
    }

    .theme-toggle-btn:hover {
        background: var(--bg-secondary);
        border-color: var(--border-color-strong);
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
    }

    .theme-toggle-btn:active {
        transform: translateY(0);
    }

    .theme-toggle-icon {
        font-size: 1.2em;
    }

    /* Switch Style */
    .theme-toggle-switch {
        position: relative;
        display: inline-block;
        width: 60px;
        height: 30px;
    }

    .theme-toggle-switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .theme-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-secondary);
        border-radius: 30px;
        transition: var(--transition-normal);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 6px;
    }

    .theme-toggle-slider::before {
        position: absolute;
        content: "";
        height: 24px;
        width: 24px;
        left: 3px;
        bottom: 3px;
        background: var(--bg-card);
        border-radius: 50%;
        transition: var(--transition-normal);
        box-shadow: var(--shadow-sm);
    }

    .theme-toggle-switch input:checked + .theme-toggle-slider {
        background: var(--color-primary);
    }

    .theme-toggle-switch input:checked + .theme-toggle-slider::before {
        transform: translateX(30px);
    }

    .theme-toggle-sun,
    .theme-toggle-moon {
        font-size: 14px;
        z-index: 1;
    }

    /* Icon Only Style */
    .theme-toggle-icon-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 50%;
        color: var(--text-main);
        cursor: pointer;
        font-size: 20px;
        transition: all var(--transition-fast);
    }

    .theme-toggle-icon-btn:hover {
        background: var(--bg-secondary);
        transform: scale(1.1);
        box-shadow: var(--shadow-md);
    }

    .theme-toggle-icon-btn:active {
        transform: scale(0.95);
    }

    /* Sizes */
    .theme-toggle--small .theme-toggle-btn {
        padding: 4px 10px;
        font-size: 12px;
    }

    .theme-toggle--small .theme-toggle-icon-btn {
        width: 32px;
        height: 32px;
        font-size: 16px;
    }

    .theme-toggle--large .theme-toggle-btn {
        padding: 12px 24px;
        font-size: 16px;
    }

    .theme-toggle--large .theme-toggle-icon-btn {
        width: 48px;
        height: 48px;
        font-size: 24px;
    }

    .theme-toggle-label {
        color: var(--text-secondary);
        font-size: 14px;
    }
`;
document.head.appendChild(themeToggleStyles);

// Make available globally
window.ThemeToggle = ThemeToggle;

/**
 * Page Transition Effects for Super Wings Simulator
 * Provides smooth transitions between game screens
 */

class PageTransition {
    constructor() {
        this.container = null;
        this.isTransitioning = false;
        this.defaultType = 'fade';
        this.defaultDuration = 300;

        this.init();
    }

    init() {
        // Create transition overlay container
        this.container = document.createElement('div');
        this.container.id = 'page-transition-overlay';
        this.container.className = 'page-transition-overlay';
        document.body.appendChild(this.container);

        this.addStyles();
    }

    /**
     * Perform a transition with callback
     * @param {string} type - Transition type: 'fade', 'slide-left', 'slide-right', 'zoom', 'iris'
     * @param {function} callback - Function to execute during transition (usually render new screen)
     * @param {number} duration - Transition duration in ms
     */
    async transition(type = this.defaultType, callback, duration = this.defaultDuration) {
        if (this.isTransitioning) return;

        this.isTransitioning = true;
        this.container.style.setProperty('--transition-duration', `${duration}ms`);

        // Transition out
        await this.transitionOut(type, duration);

        // Execute callback
        if (callback) {
            await callback();
        }

        // Transition in
        await this.transitionIn(type, duration);

        this.isTransitioning = false;

        // Emit event
        if (window.eventBus) {
            window.eventBus.emit('SCREEN_TRANSITION_COMPLETE', { type });
        }
    }

    /**
     * Transition out (cover screen)
     */
    async transitionOut(type, duration) {
        this.container.className = `page-transition-overlay ${type}`;
        this.container.classList.add('entering');

        await this.sleep(duration);
    }

    /**
     * Transition in (reveal screen)
     */
    async transitionIn(type, duration) {
        this.container.classList.remove('entering');
        this.container.classList.add('leaving');

        await this.sleep(duration);

        this.container.className = 'page-transition-overlay';
    }

    /**
     * Quick fade transition
     */
    async fade(callback, duration = 200) {
        return this.transition('fade', callback, duration);
    }

    /**
     * Slide left transition
     */
    async slideLeft(callback, duration = 300) {
        return this.transition('slide-left', callback, duration);
    }

    /**
     * Slide right transition
     */
    async slideRight(callback, duration = 300) {
        return this.transition('slide-right', callback, duration);
    }

    /**
     * Zoom transition
     */
    async zoom(callback, duration = 400) {
        return this.transition('zoom', callback, duration);
    }

    /**
     * Iris (circular) transition
     */
    async iris(callback, duration = 500) {
        return this.transition('iris', callback, duration);
    }

    /**
     * Wipe transition
     */
    async wipe(callback, duration = 400) {
        return this.transition('wipe', callback, duration);
    }

    /**
     * Flash transition (bright flash)
     */
    async flash(callback, duration = 200) {
        return this.transition('flash', callback, duration);
    }

    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if currently transitioning
     */
    isActive() {
        return this.isTransitioning;
    }

    /**
     * Set default transition type
     */
    setDefaultType(type) {
        this.defaultType = type;
    }

    /**
     * Set default duration
     */
    setDefaultDuration(duration) {
        this.defaultDuration = duration;
    }

    addStyles() {
        if (document.getElementById('page-transition-styles')) return;

        const style = document.createElement('style');
        style.id = 'page-transition-styles';
        style.textContent = `
            .page-transition-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 9999;
                pointer-events: none;
                --transition-duration: 300ms;
            }

            /* Fade transition */
            .page-transition-overlay.fade {
                background: var(--bg-main, #000);
                opacity: 0;
                transition: opacity var(--transition-duration) ease;
            }

            .page-transition-overlay.fade.entering {
                opacity: 1;
                pointer-events: all;
            }

            .page-transition-overlay.fade.leaving {
                opacity: 0;
            }

            /* Slide Left transition */
            .page-transition-overlay.slide-left {
                background: var(--bg-main, #000);
                transform: translateX(100%);
                transition: transform var(--transition-duration) ease;
            }

            .page-transition-overlay.slide-left.entering {
                transform: translateX(0);
                pointer-events: all;
            }

            .page-transition-overlay.slide-left.leaving {
                transform: translateX(-100%);
            }

            /* Slide Right transition */
            .page-transition-overlay.slide-right {
                background: var(--bg-main, #000);
                transform: translateX(-100%);
                transition: transform var(--transition-duration) ease;
            }

            .page-transition-overlay.slide-right.entering {
                transform: translateX(0);
                pointer-events: all;
            }

            .page-transition-overlay.slide-right.leaving {
                transform: translateX(100%);
            }

            /* Zoom transition */
            .page-transition-overlay.zoom {
                background: var(--bg-main, #000);
                transform: scale(0);
                border-radius: 50%;
                transition: transform var(--transition-duration) cubic-bezier(0.4, 0, 0.2, 1);
            }

            .page-transition-overlay.zoom.entering {
                transform: scale(2);
                border-radius: 0;
                pointer-events: all;
            }

            .page-transition-overlay.zoom.leaving {
                transform: scale(0);
                border-radius: 50%;
            }

            /* Iris transition */
            .page-transition-overlay.iris {
                background: var(--bg-main, #000);
                clip-path: circle(0% at 50% 50%);
                transition: clip-path var(--transition-duration) ease;
            }

            .page-transition-overlay.iris.entering {
                clip-path: circle(150% at 50% 50%);
                pointer-events: all;
            }

            .page-transition-overlay.iris.leaving {
                clip-path: circle(0% at 50% 50%);
            }

            /* Wipe transition */
            .page-transition-overlay.wipe {
                background: var(--bg-main, #000);
                clip-path: polygon(0 0, 0 0, 0 100%, 0 100%);
                transition: clip-path var(--transition-duration) ease;
            }

            .page-transition-overlay.wipe.entering {
                clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
                pointer-events: all;
            }

            .page-transition-overlay.wipe.leaving {
                clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%);
            }

            /* Flash transition */
            .page-transition-overlay.flash {
                background: white;
                opacity: 0;
                transition: opacity var(--transition-duration) ease;
            }

            .page-transition-overlay.flash.entering {
                opacity: 1;
                pointer-events: all;
            }

            .page-transition-overlay.flash.leaving {
                opacity: 0;
            }

            /* Character-themed transitions */
            .page-transition-overlay.jett {
                background: linear-gradient(135deg, #E31D2B 0%, #B31420 100%);
            }

            .page-transition-overlay.jerome {
                background: linear-gradient(135deg, #0077BE 0%, #005A8F 100%);
            }

            .page-transition-overlay.donnie {
                background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
            }
        `;
        document.head.appendChild(style);
    }
}

// Create singleton instance
const pageTransition = new PageTransition();

// Make available globally
window.pageTransition = pageTransition;

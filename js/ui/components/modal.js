export class Modal {
    constructor(id) {
        this.id = id;
        this.element = this.createModalElement();
        document.body.appendChild(this.element);
        this.bindEvents();
    }

    createModalElement() {
        const div = document.createElement('div');
        div.id = this.id;
        div.className = 'modal-overlay hidden';
        div.innerHTML = `
            <div class="modal-container anim-slide-up">
                <header class="modal-header">
                    <h3 class="modal-title">Title</h3>
                    <button class="modal-close-btn">&times;</button>
                </header>
                <div class="modal-body">
                    <!-- Content injected here -->
                </div>
                <div class="modal-footer">
                    <!-- Actions injected here -->
                </div>
            </div>
        `;
        return div;
    }

    bindEvents() {
        // Close on clicking X
        this.element.querySelector('.modal-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });

        // Close on clicking outside (overlay) - with stricter check
        this.element.addEventListener('click', (e) => {
            // Only close if clicking directly on the overlay (not on modal container or its children)
            if (e.target === this.element) {
                this.hide();
            }
        });

        // Prevent clicks inside modal container from bubbling to overlay
        const modalContainer = this.element.querySelector('.modal-container');
        if (modalContainer) {
            modalContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    show({ title, content, footer }) {
        this.element.querySelector('.modal-title').textContent = title || 'Info';
        this.element.querySelector('.modal-body').innerHTML = content || '';
        this.element.querySelector('.modal-footer').innerHTML = footer || '';
        
        this.element.classList.remove('hidden');
    }

    hide() {
        this.element.classList.add('hidden');
    }

    // Helper to find elements inside the current modal content
    querySelector(selector) {
        return this.element.querySelector(selector);
    }
    
    querySelectorAll(selector) {
        return this.element.querySelectorAll(selector);
    }
}

/**
 * Character Encyclopedia Screen
 * Displays all characters with search, filter, and detailed information
 * Integrates with Characters API endpoints
 */

import tutorialManager from '../../systems/tutorial-manager.js';

class CharacterEncyclopedia {
    constructor() {
        this.apiBase = '/api/v1/characters';
        this.characters = [];
        this.filteredCharacters = [];
        this.selectedCharacter = null;
        this.container = null;

        this.abilities = [];
        this.roles = [];
    }

    /**
     * Initialize the encyclopedia
     * @param {string} containerId - Container element ID
     */
    async init(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[CharacterEncyclopedia] Container not found:', containerId);
            return;
        }

        await this.loadAllCharacters();
        this.render();
    }

    /**
     * Load all characters from API
     */
    async loadAllCharacters() {
        try {
            const response = await fetch(`${this.apiBase}`);
            if (!response.ok) {
                throw new Error(`Failed to load characters: ${response.status}`);
            }

            const data = await response.json();
            this.characters = data.characters || [];
            this.filteredCharacters = [...this.characters];

            // Extract unique abilities and roles
            this.abilities = [...new Set(this.characters.flatMap(c => c.abilities || []))];
            this.roles = [...new Set(this.characters.map(c => c.role).filter(Boolean))];

            console.log('[CharacterEncyclopedia] Loaded', this.characters.length, 'characters');
        } catch (error) {
            console.error('[CharacterEncyclopedia] Failed to load characters:', error);
            this.characters = [];
            this.filteredCharacters = [];
        }
    }

    /**
     * Search characters semantically
     * @param {string} query - Search query
     */
    async searchSemantic(query) {
        if (!query || query.trim().length === 0) {
            this.filteredCharacters = [...this.characters];
            this.renderCharacterGrid();
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/search/semantic?query=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const data = await response.json();
            this.filteredCharacters = data.results || [];
            this.renderCharacterGrid();
        } catch (error) {
            console.error('[CharacterEncyclopedia] Semantic search failed:', error);
            // Fallback to simple text search
            this.searchSimple(query);
        }
    }

    /**
     * Simple text search (fallback)
     * @param {string} query - Search query
     */
    searchSimple(query) {
        const lowerQuery = query.toLowerCase();
        this.filteredCharacters = this.characters.filter(char => {
            return (
                char.name?.toLowerCase().includes(lowerQuery) ||
                char.personality?.toLowerCase().includes(lowerQuery) ||
                char.abilities?.some(a => a.toLowerCase().includes(lowerQuery))
            );
        });
        this.renderCharacterGrid();
    }

    /**
     * Filter characters by ability
     * @param {string} ability - Ability name
     */
    async filterByAbility(ability) {
        if (!ability) {
            this.filteredCharacters = [...this.characters];
            this.renderCharacterGrid();
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/by-ability/${encodeURIComponent(ability)}`);
            if (!response.ok) {
                throw new Error(`Filter failed: ${response.status}`);
            }

            const data = await response.json();
            this.filteredCharacters = data.characters || [];
            this.renderCharacterGrid();
        } catch (error) {
            console.error('[CharacterEncyclopedia] Filter by ability failed:', error);
            // Fallback to local filter
            this.filteredCharacters = this.characters.filter(c => c.abilities?.includes(ability));
            this.renderCharacterGrid();
        }
    }

    /**
     * Get character details
     * @param {string} characterId - Character ID
     */
    async getCharacterDetails(characterId) {
        try {
            const response = await fetch(`${this.apiBase}/${characterId}`);
            if (!response.ok) {
                throw new Error(`Failed to get character: ${response.status}`);
            }

            const data = await response.json();
            return data.character;
        } catch (error) {
            console.error('[CharacterEncyclopedia] Failed to get character details:', error);
            // Fallback to local data
            return this.characters.find(c => c.id === characterId);
        }
    }

    /**
     * Get character abilities details
     * @param {string} characterId - Character ID
     */
    async getCharacterAbilities(characterId) {
        try {
            const response = await fetch(`${this.apiBase}/${characterId}/abilities`);
            if (!response.ok) {
                throw new Error(`Failed to get abilities: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CharacterEncyclopedia] Failed to get abilities:', error);
            return { abilities: [] };
        }
    }

    /**
     * Get character visual configuration
     * @param {string} characterId - Character ID
     */
    async getCharacterVisualConfig(characterId) {
        try {
            const response = await fetch(`${this.apiBase}/${characterId}/visual-config`);
            if (!response.ok) {
                throw new Error(`Failed to get visual config: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[CharacterEncyclopedia] Failed to get visual config:', error);
            return null;
        }
    }

    /**
     * Show character details modal
     * @param {string} characterId - Character ID
     */
    async showCharacterModal(characterId) {
        const character = await this.getCharacterDetails(characterId);
        if (!character) {
            return;
        }

        const abilities = await this.getCharacterAbilities(characterId);
        const visualConfig = await this.getCharacterVisualConfig(characterId);

        this.selectedCharacter = character;
        this.renderModal(character, abilities, visualConfig);
    }

    /**
     * Render the encyclopedia UI
     */
    render() {
        this.container.innerHTML = `
            <div class="character-encyclopedia">
                <div class="encyclopedia-header">
                    <h2>📚 Character Encyclopedia</h2>
                    <p>Discover all Super Wings characters and their abilities</p>
                </div>

                <div class="encyclopedia-controls">
                    <div class="search-box">
                        <input
                            type="text"
                            id="char-search"
                            placeholder="Search characters (AI-powered)..."
                            class="search-input"
                        />
                        <button id="search-btn" class="btn-primary">🔍 Search</button>
                    </div>

                    <div class="filter-box">
                        <label for="ability-filter">Filter by Ability:</label>
                        <select id="ability-filter" class="filter-select">
                            <option value="">All Abilities</option>
                            ${this.abilities.map(a => `<option value="${a}">${a}</option>`).join('')}
                        </select>
                    </div>

                    <div class="filter-box">
                        <label for="role-filter">Filter by Role:</label>
                        <select id="role-filter" class="filter-select">
                            <option value="">All Roles</option>
                            ${this.roles.map(r => `<option value="${r}">${r}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="encyclopedia-stats">
                    <span>Total Characters: <strong>${this.characters.length}</strong></span>
                    <span>Showing: <strong>${this.filteredCharacters.length}</strong></span>
                </div>

                <div id="character-grid" class="character-grid">
                    ${this.renderCharacterCards()}
                </div>

                <div id="character-modal" class="modal hidden"></div>
            </div>
        `;

        this.attachEventListeners();
    }

    /**
     * Render character cards in grid
     */
    renderCharacterCards() {
        if (this.filteredCharacters.length === 0) {
            return '<div class="no-results">No characters found</div>';
        }

        return this.filteredCharacters.map(char => `
            <div class="character-card" data-character-id="${char.id}">
                <div class="character-avatar">
                    ${char.portrait_url ?
                        `<img src="${char.portrait_url}" alt="${char.name}" />` :
                        `<div class="avatar-placeholder">${char.name?.[0] || '?'}</div>`
                    }
                </div>
                <h3 class="character-name">${char.name || char.id}</h3>
                <p class="character-role">${char.role || 'Super Wings'}</p>
                <div class="character-abilities">
                    ${(char.abilities || []).slice(0, 3).map(a =>
                        `<span class="ability-badge">${a}</span>`
                    ).join('')}
                    ${char.abilities?.length > 3 ? `<span class="ability-more">+${char.abilities.length - 3}</span>` : ''}
                </div>
                <button class="btn-secondary btn-details" data-character-id="${char.id}">
                    View Details
                </button>
            </div>
        `).join('');
    }

    /**
     * Render character grid only (for updates)
     */
    renderCharacterGrid() {
        const grid = document.getElementById('character-grid');
        if (grid) {
            grid.innerHTML = this.renderCharacterCards();
            this.attachCardListeners();
        }

        // Update stats
        const statsEl = this.container.querySelector('.encyclopedia-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <span>Total Characters: <strong>${this.characters.length}</strong></span>
                <span>Showing: <strong>${this.filteredCharacters.length}</strong></span>
            `;
        }
    }

    /**
     * Render character details modal
     */
    renderModal(character, abilities, visualConfig) {
        const modal = document.getElementById('character-modal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-content character-modal-content">
                <button class="modal-close">&times;</button>

                <div class="modal-header">
                    <h2>${character.name || character.id}</h2>
                    <p class="character-catchphrase">"${character.catchphrase || 'Super Wings!'}"</p>
                </div>

                <div class="modal-body">
                    <div class="character-details-grid">
                        <div class="detail-section">
                            <h3>Basic Information</h3>
                            <p><strong>Role:</strong> ${character.role || 'N/A'}</p>
                            <p><strong>Personality:</strong> ${character.personality || 'N/A'}</p>
                            ${character.description ? `<p>${character.description}</p>` : ''}
                        </div>

                        <div class="detail-section">
                            <h3>Abilities & Skills</h3>
                            ${abilities.abilities?.length > 0 ? `
                                <ul class="abilities-list">
                                    ${abilities.abilities.map(a => `
                                        <li>
                                            <strong>${a.name}</strong>
                                            <p>${a.description || ''}</p>
                                        </li>
                                    `).join('')}
                                </ul>
                            ` : '<p>No detailed abilities information</p>'}
                        </div>

                        ${visualConfig ? `
                            <div class="detail-section">
                                <h3>Visual Configuration</h3>
                                <p><strong>Primary Color:</strong> <span class="color-sample" style="background: ${visualConfig.primary_color}"></span> ${visualConfig.primary_color}</p>
                                ${visualConfig.secondary_color ? `<p><strong>Secondary Color:</strong> <span class="color-sample" style="background: ${visualConfig.secondary_color}"></span> ${visualConfig.secondary_color}</p>` : ''}
                                ${visualConfig.style_notes ? `<p>${visualConfig.style_notes}</p>` : ''}
                            </div>
                        ` : ''}
                    </div>

                    <div class="modal-actions">
                        <button class="btn btn-secondary btn-tutorial" data-character-id="${character.id}">
                            📚 View Tutorial
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');

        // Close button
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.add('hidden');
        });

        // Tutorial button
        const btnTutorial = modal.querySelector('.btn-tutorial');
        if (btnTutorial) {
            btnTutorial.addEventListener('click', async () => {
                const charId = btnTutorial.dataset.characterId;
                await tutorialManager.showCharacterTutorial(charId, true); // force=true to show even if seen
            });
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Search
        const searchInput = document.getElementById('char-search');
        const searchBtn = document.getElementById('search-btn');

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const query = searchInput?.value || '';
                this.searchSemantic(query);
            });
        }

        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    this.searchSemantic(searchInput.value);
                }
            });
        }

        // Ability filter
        const abilityFilter = document.getElementById('ability-filter');
        if (abilityFilter) {
            abilityFilter.addEventListener('change', (e) => {
                this.filterByAbility(e.target.value);
            });
        }

        // Role filter (client-side)
        const roleFilter = document.getElementById('role-filter');
        if (roleFilter) {
            roleFilter.addEventListener('change', (e) => {
                const role = e.target.value;
                if (role) {
                    this.filteredCharacters = this.characters.filter(c => c.role === role);
                } else {
                    this.filteredCharacters = [...this.characters];
                }
                this.renderCharacterGrid();
            });
        }

        this.attachCardListeners();
    }

    /**
     * Attach listeners to character cards
     */
    attachCardListeners() {
        const detailButtons = document.querySelectorAll('.btn-details');
        detailButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const characterId = btn.dataset.characterId;
                this.showCharacterModal(characterId);
            });
        });

        // Also make cards clickable
        const cards = document.querySelectorAll('.character-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const characterId = card.dataset.characterId;
                this.showCharacterModal(characterId);
            });
        });
    }
}

// Make available globally
window.CharacterEncyclopedia = CharacterEncyclopedia;

export default CharacterEncyclopedia;

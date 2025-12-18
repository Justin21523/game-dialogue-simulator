/**
 * API Integration Tests
 * Tests all newly integrated API endpoints and features
 */

class APIIntegrationTests {
    constructor() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
        this.apiBase = '/api/v1';
    }

    /**
     * Run all tests
     */
    async runAll() {
        console.log('🧪 Starting API Integration Tests...\n');

        await this.testCharactersAPI();
        await this.testMissionsAPI();
        await this.testContentAPI();
        await this.testTutorialAPI();
        await this.testAssetsAPI();
        await this.testVoiceSoundAPI();
        await this.testDataPersistence();
        await this.testWebSocketConnection();

        this.printResults();
    }

    /**
     * Test helper
     */
    async test(name, testFn) {
        console.log(`Testing: ${name}...`);
        try {
            await testFn();
            this.passed++;
            this.results.push({ name, status: '✅ PASS' });
            console.log(`✅ ${name} - PASSED\n`);
        } catch (error) {
            this.failed++;
            this.results.push({ name, status: '❌ FAIL', error: error.message });
            console.error(`❌ ${name} - FAILED:`, error.message, '\n');
        }
    }

    /**
     * Characters API Tests
     */
    async testCharactersAPI() {
        console.log('\n📚 Testing Characters API...\n');

        // Test 1: Get all characters
        await this.test('GET /characters', async () => {
            const response = await fetch(`${this.apiBase}/characters`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.characters || !Array.isArray(data.characters)) {
                throw new Error('Invalid response format');
            }
        });

        // Test 2: Semantic search
        await this.test('GET /characters/search/semantic', async () => {
            const response = await fetch(`${this.apiBase}/characters/search/semantic?query=飛行專家`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.results) throw new Error('No results field');
        });

        // Test 3: Get character by ID
        await this.test('GET /characters/{id}', async () => {
            const response = await fetch(`${this.apiBase}/characters/jett`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.character) throw new Error('No character field');
        });

        // Test 4: Get character abilities
        await this.test('GET /characters/{id}/abilities', async () => {
            const response = await fetch(`${this.apiBase}/characters/jett/abilities`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.abilities) throw new Error('No abilities field');
        });

        // Test 5: Best character for mission type
        await this.test('GET /dispatch/best-for/{type}', async () => {
            const response = await fetch(`${this.apiBase}/dispatch/best-for/delivery`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.best_character) throw new Error('No best_character field');
        });
    }

    /**
     * Missions API Tests
     */
    async testMissionsAPI() {
        console.log('\n🎯 Testing Missions API...\n');

        // Test 1: Generate mission
        await this.test('POST /missions/generate', async () => {
            const response = await fetch(`${this.apiBase}/missions/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level: 1 })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.title) throw new Error('No title field');
        });

        // Test 2: Start mission session
        await this.test('POST /missions/start', async () => {
            const response = await fetch(`${this.apiBase}/missions/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mission_type: 'delivery',
                    location: 'Paris',
                    problem_description: 'Test mission',
                    character_id: 'jett'
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.session_id) throw new Error('No session_id field');
        });

        // Test 3: Get active missions
        await this.test('GET /missions/active', async () => {
            const response = await fetch(`${this.apiBase}/missions/active`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.sessions) throw new Error('No sessions field');
        });
    }

    /**
     * Content API Tests
     */
    async testContentAPI() {
        console.log('\n✨ Testing Content API...\n');

        // Test 1: Generate mission content
        await this.test('POST /content/mission', async () => {
            const response = await fetch(`${this.apiBase}/content/mission`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mission_type: 'delivery',
                    location: 'Paris',
                    difficulty: 1
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });

        // Test 2: Generate location
        await this.test('POST /content/location', async () => {
            const response = await fetch(`${this.apiBase}/content/location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    location_name: 'Paris',
                    context: 'mission'
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });

        // Test 3: Generate event
        await this.test('POST /content/event', async () => {
            const response = await fetch(`${this.apiBase}/content/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: 'in_flight',
                    difficulty: 1
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });

        // Test 4: Get mission types
        await this.test('GET /content/mission-types', async () => {
            const response = await fetch(`${this.apiBase}/content/mission-types`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.mission_types) throw new Error('No mission_types field');
        });
    }

    /**
     * Tutorial API Tests
     */
    async testTutorialAPI() {
        console.log('\n📖 Testing Tutorial API...\n');

        // Test 1: Get character tutorial
        await this.test('GET /tutorial/character/{id}', async () => {
            const response = await fetch(`${this.apiBase}/tutorial/character/jett`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.tutorial && !data.content) throw new Error('No tutorial content');
        });

        // Test 2: Get mission type tutorial
        await this.test('GET /tutorial/mission-type/{type}', async () => {
            const response = await fetch(`${this.apiBase}/tutorial/mission-type/delivery`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.tutorial && !data.content) throw new Error('No tutorial content');
        });

        // Test 3: Explain concept
        await this.test('POST /tutorial/explain', async () => {
            const response = await fetch(`${this.apiBase}/tutorial/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: 'fuel_management',
                    language: 'en'
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });

        // Test 4: Get hint
        await this.test('POST /tutorial/hint', async () => {
            const response = await fetch(`${this.apiBase}/tutorial/hint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: 'mission_board',
                    language: 'en'
                })
            });
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });
    }

    /**
     * Assets API Tests
     */
    async testAssetsAPI() {
        console.log('\n🎨 Testing Assets API...\n');

        // Test 1: Get status
        await this.test('GET /assets/status', async () => {
            const response = await fetch(`${this.apiBase}/assets/status`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (data.ready === undefined) throw new Error('No ready field');
        });

        // Test 2: Get available characters
        await this.test('GET /assets/characters', async () => {
            const response = await fetch(`${this.apiBase}/assets/characters`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.characters) throw new Error('No characters field');
        });

        // Test 3: Get quality levels
        await this.test('GET /assets/quality-levels', async () => {
            const response = await fetch(`${this.apiBase}/assets/quality-levels`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.quality_levels) throw new Error('No quality_levels field');
        });

        // Test 4: Get generation progress
        await this.test('GET /assets/progress', async () => {
            const response = await fetch(`${this.apiBase}/assets/progress`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });
    }

    /**
     * Voice & Sound API Tests
     */
    async testVoiceSoundAPI() {
        console.log('\n🔊 Testing Voice & Sound API...\n');

        // Test 1: Get sound status
        await this.test('GET /sound/status', async () => {
            const response = await fetch(`${this.apiBase}/sound/status`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
        });

        // Test 2: Get sound categories
        await this.test('GET /sound/categories', async () => {
            const response = await fetch(`${this.apiBase}/sound/categories`);
            if (!response.ok) throw new Error(`Status: ${response.status}`);
            const data = await response.json();
            if (!data.categories) throw new Error('No categories field');
        });
    }

    /**
     * Data Persistence Tests
     */
    async testDataPersistence() {
        console.log('\n💾 Testing Data Persistence...\n');

        // Test IndexedDB availability
        await this.test('IndexedDB Available', async () => {
            if (!window.indexedDB) {
                throw new Error('IndexedDB not supported');
            }
        });

        // Test localStorage fallback
        await this.test('localStorage Available', async () => {
            if (!window.localStorage) {
                throw new Error('localStorage not supported');
            }
            // Test write/read
            localStorage.setItem('test_key', 'test_value');
            const value = localStorage.getItem('test_key');
            if (value !== 'test_value') {
                throw new Error('localStorage read/write failed');
            }
            localStorage.removeItem('test_key');
        });

        // Test game state save
        await this.test('Game State Save/Load', async () => {
            if (!window.gameState) {
                throw new Error('gameState not available');
            }
            await window.gameState.save();
            console.log('  Game state saved successfully');
        });
    }

    /**
     * WebSocket Connection Tests
     */
    async testWebSocketConnection() {
        console.log('\n🔌 Testing WebSocket Connection...\n');

        await this.test('WebSocket Client Available', async () => {
            if (!window.websocketClient) {
                throw new Error('websocketClient not available');
            }
        });

        await this.test('WebSocket Connection State', async () => {
            if (!window.websocketClient) {
                throw new Error('websocketClient not available');
            }
            const state = window.websocketClient.getState();
            console.log(`  WebSocket state: ${state}`);
            // Connection state is informational, not a failure if disconnected
        });
    }

    /**
     * Print test results
     */
    printResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(60) + '\n');

        this.results.forEach(result => {
            console.log(`${result.status} ${result.name}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });

        console.log('\n' + '='.repeat(60));
        console.log(`Total: ${this.passed + this.failed} | Passed: ${this.passed} | Failed: ${this.failed}`);
        console.log(`Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
        console.log('='.repeat(60) + '\n');

        if (this.failed === 0) {
            console.log('🎉 All tests passed!');
        } else {
            console.log(`⚠️ ${this.failed} test(s) failed. Please review the errors above.`);
        }
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.APIIntegrationTests = APIIntegrationTests;
}

export default APIIntegrationTests;

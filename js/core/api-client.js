import { CONFIG } from '../config.js';

class ApiClient {
    constructor() {
        this.baseUrl = CONFIG.API_BASE || "http://localhost:8000/api/v1";
        this.isBackendAvailable = false;
        this.defaultTimeout = 15000;
        
        // Create an axios instance
        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            timeout: this.defaultTimeout,
            headers: {
                'Content-Type': 'application/json',
            }
        });

        // Add a response interceptor for unified error handling
        this.axiosInstance.interceptors.response.use(
            response => response,
            error => {
                if (error.response) {
                    // Server responded with a status other than 2xx
                    console.error("API Error Response:", error.response.data);
                    // Toast.show(`API Error: ${error.response.data.detail || error.message}`, 'error');
                } else if (error.request) {
                    // Request was made but no response received
                    console.error("API No Response:", error.request);
                    this.isBackendAvailable = false; // Mark backend as unavailable
                    // Toast.show("Backend is not responding. Running in offline mode.", 'warning');
                } else {
                    // Something else happened
                    console.error("API Request Error:", error.message);
                    // Toast.show(`Request Error: ${error.message}`, 'error');
                }
                return Promise.reject(error); // Re-throw to propagate
            }
        );
    }

    async checkHealth() {
        try {
            const res = await this.axiosInstance.get('/health');
            this.isBackendAvailable = res.status === 200;
            return res.status === 200;
        } catch (e) {
            console.warn("Backend not available, running in offline mode.");
            this.isBackendAvailable = false;
            return false;
        }
    }

    setBaseUrl(url) {
        if (!url) return;
        this.baseUrl = url;
        this.axiosInstance.defaults.baseURL = url;
    }

    setAuthToken(token) {
        if (!token) return;
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    /**
    * Generate a mission using LLM
     */
    async generateMission(level = 1) {
        if (!this.isBackendAvailable) {
            return this.mockMission(level);
        }

        try {
            const res = await this.axiosInstance.post(`/missions/generate`, { level: level });
            return res.data; // Axios wraps response in .data
        } catch (e) {
            console.error("Mission gen failed via Axios:", e);
            this.isBackendAvailable = false; // Mark backend as unavailable if API call failed
            return this.mockMission(level);
        }
    }

    /**
     * Fallback for offline mode
     */
    mockMission(level) {
        // Return structured data compatible with our game
        return {
            title: "Offline Mission",
            description: "Backend is unreachable. This is a local placeholder mission.",
            type: "Delivery",
            location: "Localhost",
            levelReq: level,
            duration: 60,
            fuelCost: 20,
            rewardMoney: 100,
            rewardExp: 50
        };
    }

    /**
    * Generate a campaign with structured missions.
    */
    async generateCampaign(options = {}) {
        if (!this.isBackendAvailable) {
            return null;
        }

        const payload = {
            theme: options.theme || "global",
            length: options.length || 3,
            preferred_types: options.preferredTypes,
            location_hints: options.locationHints,
        };

        try {
            const res = await this.axiosInstance.post(`/campaign/generate`, payload);
            return res.data;
        } catch (e) {
            console.error("Campaign gen failed via Axios:", e);
            this.isBackendAvailable = false;
            return null;
        }
    }

    /**
     * Generate voice line for dialogue playback.
     */
    async generateVoice(text, characterId, emotion = "neutral") {
        if (!this.isBackendAvailable) {
            return null;
        }

        try {
            const res = await this.axiosInstance.post(`/voice/generate`, {
                text,
                character_id: characterId,
                emotion,
            });
            return res.data;
        } catch (e) {
            console.warn("Voice gen failed, fallback to silent.", e);
            return null;
        }
    }
}

export const apiClient = new ApiClient();

export const CONFIG = {
    GAME_TITLE: "Super Wings Simulator",
    VERSION: "0.2.0 (Beta)",
    API_BASE: "http://localhost:8001/api/v1",  // Backend runs on port 8001
    
    // Game Balance (Tweaked for Testing)
    INITIAL_MONEY: 2000,     // Increased for testing
    INITIAL_FUEL: 200,       // Increased buffer
    MAX_FUEL: 200,
    FUEL_RECHARGE_RATE: 5,   // Faster recharge (5 per minute)
    FUEL_COST_MULTIPLIER: 0.8, // Reduced mission cost
    
    // System
    SAVE_KEY: "super_wings_save_v1",
    ANIMATION_SPEED: 1.0,
    DEBUG_MODE: true, // Enable debug overlay
    
    // Asset Paths
    PATHS: {
        CHARACTERS: "assets/images/characters",
        BACKGROUNDS: "assets/images/backgrounds",
        UI: "assets/ui"
    },
    
    // Character Definitions
    CHARACTERS: {
        jett: { name: "Jett", color: "#E31D2B", type: "Delivery" },
        jerome: { name: "Jerome", color: "#0077BE", type: "Stunt" },
        donnie: { name: "Donnie", color: "#FFD700", type: "Construction" },
        chase: { name: "Chase", color: "#000080", type: "Spy" },
        flip: { name: "Flip", color: "#FF4500", type: "Sports" },
        todd: { name: "Todd", color: "#8B4513", type: "Digging" },
        paul: { name: "Paul", color: "#1E90FF", type: "Police" },
        bello: { name: "Bello", color: "#FFFFFF", type: "Nature" }
    },

    // Transformation Scene Colors (background + speed lines)
    TRANSFORMATION_COLORS: {
        jett: {
            background: '#1A237E',  // Deep Blue
            lines: '#FFD700',       // Gold
            glow: '#E31D2B'         // Red (main color)
        },
        jerome: {
            background: '#BF360C',  // Deep Orange-Red
            lines: '#FFFFFF',       // White
            glow: '#0077BE'         // Blue (main color)
        },
        donnie: {
            background: '#4A148C',  // Deep Purple
            lines: '#00BCD4',       // Cyan
            glow: '#FFD700'         // Yellow (main color)
        },
        chase: {
            background: '#E65100',  // Orange
            lines: '#E0E0E0',       // Silver-White
            glow: '#000080'         // Navy (main color)
        },
        flip: {
            background: '#00695C',  // Teal
            lines: '#FFEB3B',       // Yellow
            glow: '#FF4500'         // Orange-Red (main color)
        },
        todd: {
            background: '#1B5E20',  // Deep Green
            lines: '#FF9800',       // Orange
            glow: '#8B4513'         // Brown (main color)
        },
        paul: {
            background: '#B71C1C',  // Deep Red
            lines: '#FFFFFF',       // White
            glow: '#1E90FF'         // Blue (main color)
        },
        bello: {
            background: '#212121',  // Black
            lines: '#FFC107',       // Amber
            glow: '#FFFFFF'         // White (main color)
        }
    }
};

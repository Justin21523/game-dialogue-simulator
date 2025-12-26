export const GAME_CONFIG = {
    INITIAL_MONEY: 2000,
    INITIAL_FUEL: 200,
    MAX_FUEL: 200,
    FUEL_COST_MULTIPLIER: 0.8,
    REFUEL_COST_PER_UNIT: 0.5,
    CHARACTERS: {
        jett: { name: 'Jett', color: '#E31D2B', type: 'Delivery' },
        jerome: { name: 'Jerome', color: '#0077BE', type: 'Stunt' },
        donnie: { name: 'Donnie', color: '#FFD700', type: 'Construction' },
        chase: { name: 'Chase', color: '#000080', type: 'Spy' },
        flip: { name: 'Flip', color: '#FF4500', type: 'Sports' },
        todd: { name: 'Todd', color: '#8B4513', type: 'Digging' },
        paul: { name: 'Paul', color: '#1E90FF', type: 'Police' },
        bello: { name: 'Bello', color: '#FFFFFF', type: 'Nature' }
    },
    TRANSFORMATION_COLORS: {
        jett: {
            background: '#1A237E',
            lines: '#FFD700',
            glow: '#E31D2B'
        },
        jerome: {
            background: '#BF360C',
            lines: '#FFFFFF',
            glow: '#0077BE'
        },
        donnie: {
            background: '#4A148C',
            lines: '#00BCD4',
            glow: '#FFD700'
        },
        chase: {
            background: '#E65100',
            lines: '#E0E0E0',
            glow: '#000080'
        },
        flip: {
            background: '#00695C',
            lines: '#FFEB3B',
            glow: '#FF4500'
        },
        todd: {
            background: '#1B5E20',
            lines: '#FF9800',
            glow: '#8B4513'
        },
        paul: {
            background: '#B71C1C',
            lines: '#FFFFFF',
            glow: '#1E90FF'
        },
        bello: {
            background: '#212121',
            lines: '#FFC107',
            glow: '#FFFFFF'
        }
    }
} as const;

export type CharacterId = keyof typeof GAME_CONFIG.CHARACTERS;

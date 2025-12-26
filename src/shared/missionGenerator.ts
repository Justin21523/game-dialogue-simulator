import type { Mission } from './types/Game';

const LOCATIONS = [
    'Paris',
    'New York',
    'Beijing',
    'London',
    'Tokyo',
    'Sydney',
    'Cairo',
    'Rio de Janeiro',
    'Moscow',
    'Rome'
];

const MISSION_TYPES = [
    { type: 'Delivery', verb: 'Deliver package to' },
    { type: 'Rescue', verb: 'Rescue stranded hiker in' },
    { type: 'Construction', verb: 'Build new bridge in' },
    { type: 'Sports', verb: 'Compete in tournament at' },
    { type: 'Police', verb: 'Direct traffic in' },
    { type: 'Nature', verb: 'Help animals in' }
];

function createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function generateLocalMissions(count = 15, level = 1): Mission[] {
    const missions: Mission[] = [];
    for (let i = 0; i < count; i += 1) {
        missions.push(createLocalMission(level));
    }
    return missions;
}

function createLocalMission(level: number): Mission {
    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const template = MISSION_TYPES[Math.floor(Math.random() * MISSION_TYPES.length)];

    const baseReward = 100 * level;

    return {
        id: createId('m'),
        title: `${template.type} in ${location}`,
        description: `${template.verb} ${location}. Standard procedure.`,
        type: template.type,
        location,
        fuelCost: 10 + level * 2,
        rewardMoney: Math.floor(baseReward * (0.8 + Math.random() * 0.4)),
        rewardExp: Math.floor(50 * level)
    };
}

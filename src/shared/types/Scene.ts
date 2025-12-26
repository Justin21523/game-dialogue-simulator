export type HudState = {
    score: number;
    distance: number;
    speed: number;
    missionType: string;
    status: 'ready' | 'running' | 'success' | 'failed';
    timeLeft?: number;
};


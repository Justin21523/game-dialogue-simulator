export type FlightResult = {
    missionId: string;
    missionType: string;
    charId: string;
    score: number;
    success: boolean;
    flightStats?: {
        coinsCollected: number;
        obstaclesHit: number;
        flightTime: number;
        boostsUsed: number;
        distance: number;
    };
};

export const flightEventTarget = new EventTarget();

export function emitFlightComplete(result: FlightResult): void {
    flightEventTarget.dispatchEvent(new CustomEvent<FlightResult>('flight:complete', { detail: result }));
}

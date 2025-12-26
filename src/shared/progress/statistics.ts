import type { StatisticsState } from '../types/Progress';

export type StatisticsSummary = {
    missions: { completed: number; failed: number; successRate: number };
    exploration: { locations: number; npcsHelped: number };
    economy: { earned: number; spent: number; peak: number };
    flight: { totalTime: string; coins: number; obstacles: number };
    performance: { currentStreak: number; bestStreak: number; perfectMissions: number };
    characters: { used: number; levelUps: number; highestLevel: number };
    time: { totalPlayTime: string; totalMinutes: number; sessions: number; firstPlay: string | null; lastPlay: string | null };
};

export function createDefaultStatistics(): StatisticsState {
    return {
        missionsCompleted: 0,
        missionsFailed: 0,
        missionsByType: {},
        missionsByCharacter: {},

        locationsVisited: [],
        uniqueNPCsHelped: [],

        totalMoneyEarned: 0,
        totalMoneySpent: 0,
        highestMoney: 0,

        totalFlightTime: 0,
        coinsCollected: 0,
        obstaclesHit: 0,
        totalDistance: 0,
        boostsUsed: 0,

        currentStreak: 0,
        bestStreak: 0,
        perfectMissions: 0,
        fastCompletions: 0,

        charactersUsed: [],
        characterLevelUps: 0,
        highestCharacterLevel: 1,

        totalPlayTime: 0,
        firstPlayDate: null,
        lastPlayDate: null,
        totalSessions: 0,

        achievementPoints: 0,
        achievementsUnlocked: 0,

        sessionStats: {
            currentSessionStart: null,
            currentSessionDuration: 0,
            longestSession: 0,
            averageSessionDuration: 0,
            totalSessionCount: 0,
            missionsThisSession: 0
        },

        performanceMetrics: {
            missionTimes: [],
            averageMissionTime: 0,
            fastestMissionTime: null,
            slowestMissionTime: null,
            successRate: 0,
            averageScore: 0
        },

        economyStats: {
            moneyFlow: [],
            netWorth: 0,
            peakNetWorth: 0,
            totalEarnings: 0,
            totalSpendings: 0,
            averageRewardPerMission: 0
        },

        explorationStats: {
            totalFlightDistance: 0,
            longestFlight: 0,
            averageFlightDistance: 0,
            collectiblesFound: {
                coins: 0,
                powerups: 0,
                treasures: 0
            },
            countriesVisited: [],
            continentsVisited: []
        }
    };
}

export function formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function getStatisticsSummary(stats: StatisticsState): StatisticsSummary {
    const completed = stats.missionsCompleted;
    const failed = stats.missionsFailed;
    const total = completed + failed;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalMinutes = Math.floor(Math.max(0, stats.totalPlayTime) / 60);

    return {
        missions: { completed, failed, successRate },
        exploration: { locations: stats.locationsVisited.length, npcsHelped: stats.uniqueNPCsHelped.length },
        economy: { earned: stats.totalMoneyEarned, spent: stats.totalMoneySpent, peak: stats.highestMoney },
        flight: { totalTime: formatTime(stats.totalFlightTime), coins: stats.coinsCollected, obstacles: stats.obstaclesHit },
        performance: { currentStreak: stats.currentStreak, bestStreak: stats.bestStreak, perfectMissions: stats.perfectMissions },
        characters: { used: stats.charactersUsed.length, levelUps: stats.characterLevelUps, highestLevel: stats.highestCharacterLevel },
        time: {
            totalPlayTime: formatTime(stats.totalPlayTime),
            totalMinutes,
            sessions: stats.totalSessions,
            firstPlay: stats.firstPlayDate,
            lastPlay: stats.lastPlayDate
        }
    };
}

function addToCountMap(map: Record<string, number>, key: string, delta: number): Record<string, number> {
    const next = { ...map };
    next[key] = (next[key] ?? 0) + delta;
    return next;
}

function addUnique(values: string[], entry: string): string[] {
    if (!entry) return values;
    if (values.includes(entry)) return values;
    return [...values, entry];
}

export function recordMissionCompleted(
    stats: StatisticsState,
    payload: {
        missionType: string;
        characterId: string;
        location?: string;
        npcName?: string | null;
        rewardsMoney?: number;
        flightStats?: Partial<{
            coinsCollected: number;
            obstaclesHit: number;
            flightTime: number;
            boostsUsed: number;
            distance: number;
        }>;
    }
): StatisticsState {
    const next: StatisticsState = {
        ...stats,
        missionsCompleted: stats.missionsCompleted + 1,
        missionsByType: addToCountMap(stats.missionsByType, payload.missionType, 1),
        missionsByCharacter: addToCountMap(stats.missionsByCharacter, payload.characterId, 1),
        locationsVisited: payload.location ? addUnique(stats.locationsVisited, payload.location) : stats.locationsVisited,
        uniqueNPCsHelped: payload.npcName ? addUnique(stats.uniqueNPCsHelped, payload.npcName) : stats.uniqueNPCsHelped,
        currentStreak: stats.currentStreak + 1,
        bestStreak: Math.max(stats.bestStreak, stats.currentStreak + 1),
        totalMoneyEarned: stats.totalMoneyEarned + Math.max(0, payload.rewardsMoney ?? 0),
        charactersUsed: stats.charactersUsed.includes(payload.characterId) ? stats.charactersUsed : [...stats.charactersUsed, payload.characterId],
        sessionStats: { ...stats.sessionStats, missionsThisSession: stats.sessionStats.missionsThisSession + 1 }
    };

    const f = payload.flightStats;
    if (f) {
        const coinsCollected = Math.max(0, f.coinsCollected ?? 0);
        const obstaclesHit = Math.max(0, f.obstaclesHit ?? 0);
        const flightTime = Math.max(0, f.flightTime ?? 0);
        const boostsUsed = Math.max(0, f.boostsUsed ?? 0);
        const distance = Math.max(0, f.distance ?? 0);

        next.coinsCollected += coinsCollected;
        next.obstaclesHit += obstaclesHit;
        next.totalFlightTime += flightTime;
        next.boostsUsed += boostsUsed;
        next.totalDistance += distance;

        if (obstaclesHit === 0) {
            next.perfectMissions += 1;
        }
    }

    next.performanceMetrics = updatePerformanceMetrics(next.performanceMetrics, {
        missionTime: payload.flightStats?.flightTime,
        score: undefined,
        missionsCompleted: next.missionsCompleted,
        missionsFailed: next.missionsFailed
    });

    next.economyStats = trackMoneyTransaction(next.economyStats, Math.max(0, payload.rewardsMoney ?? 0), 'mission_reward');

    return next;
}

export function recordMissionFailed(stats: StatisticsState, payload?: { missionType?: string; characterId?: string; location?: string }): StatisticsState {
    const next: StatisticsState = {
        ...stats,
        missionsFailed: stats.missionsFailed + 1,
        currentStreak: 0
    };

    if (payload?.missionType) {
        next.missionsByType = addToCountMap(next.missionsByType, payload.missionType, 1);
    }
    if (payload?.characterId) {
        next.missionsByCharacter = addToCountMap(next.missionsByCharacter, payload.characterId, 1);
        if (!next.charactersUsed.includes(payload.characterId)) {
            next.charactersUsed = [...next.charactersUsed, payload.characterId];
        }
    }
    if (payload?.location) {
        next.locationsVisited = addUnique(next.locationsVisited, payload.location);
    }

    next.performanceMetrics = updatePerformanceMetrics(next.performanceMetrics, {
        missionTime: undefined,
        score: undefined,
        missionsCompleted: next.missionsCompleted,
        missionsFailed: next.missionsFailed
    });

    return next;
}

export function recordMoneySpent(stats: StatisticsState, amount: number, reason: string): StatisticsState {
    const spent = Math.max(0, amount);
    const next: StatisticsState = {
        ...stats,
        totalMoneySpent: stats.totalMoneySpent + spent
    };

    next.economyStats = trackMoneyTransaction(next.economyStats, -spent, reason);
    return next;
}

export function recordMoneyBalance(stats: StatisticsState, money: number): StatisticsState {
    const highestMoney = Math.max(stats.highestMoney, Math.max(0, money));
    const next = { ...stats, highestMoney };
    next.economyStats = {
        ...next.economyStats,
        netWorth: Math.max(0, money),
        peakNetWorth: Math.max(next.economyStats.peakNetWorth, Math.max(0, money))
    };
    return next;
}

export function recordLevelUp(stats: StatisticsState, newLevel: number): StatisticsState {
    const next = { ...stats };
    next.characterLevelUps += 1;
    next.highestCharacterLevel = Math.max(next.highestCharacterLevel, Math.max(1, Math.floor(newLevel)));
    return next;
}

export function startSession(stats: StatisticsState, nowIso: string, nowMs: number): StatisticsState {
    const next = { ...stats };
    if (!next.firstPlayDate) {
        next.firstPlayDate = nowIso;
    }
    next.lastPlayDate = nowIso;
    next.totalSessions += 1;
    next.sessionStats = {
        ...next.sessionStats,
        currentSessionStart: nowMs,
        missionsThisSession: 0,
        totalSessionCount: next.sessionStats.totalSessionCount + 1
    };
    return next;
}

export function endSession(stats: StatisticsState, nowMs: number): StatisticsState {
    const start = stats.sessionStats.currentSessionStart;
    if (!start) return stats;
    const duration = Math.max(0, nowMs - start);

    const next = { ...stats };
    next.sessionStats = {
        ...stats.sessionStats,
        currentSessionStart: null,
        currentSessionDuration: duration,
        longestSession: Math.max(stats.sessionStats.longestSession, duration)
    };

    const count = next.sessionStats.totalSessionCount;
    const totalDurationMs = Math.max(0, next.totalPlayTime) * 1000;
    next.sessionStats.averageSessionDuration = count > 0 ? totalDurationMs / count : 0;

    return next;
}

export function tickPlayTime(stats: StatisticsState, deltaSeconds: number, nowIso: string): StatisticsState {
    const delta = Math.max(0, Math.floor(deltaSeconds));
    if (delta <= 0) return stats;
    const next = { ...stats };
    next.totalPlayTime += delta;
    next.lastPlayDate = nowIso;
    return next;
}

export function incrementSessionMissions(stats: StatisticsState): StatisticsState {
    return {
        ...stats,
        sessionStats: { ...stats.sessionStats, missionsThisSession: stats.sessionStats.missionsThisSession + 1 }
    };
}

function updatePerformanceMetrics(
    metrics: StatisticsState['performanceMetrics'],
    input: { missionTime?: number; score?: number; missionsCompleted: number; missionsFailed: number }
): StatisticsState['performanceMetrics'] {
    const next = { ...metrics };

    if (typeof input.missionTime === 'number' && Number.isFinite(input.missionTime) && input.missionTime >= 0) {
        next.missionTimes = [...metrics.missionTimes, input.missionTime];
        const times = next.missionTimes;
        const sum = times.reduce((acc, t) => acc + t, 0);
        next.averageMissionTime = times.length > 0 ? sum / times.length : 0;

        next.fastestMissionTime = next.fastestMissionTime === null ? input.missionTime : Math.min(next.fastestMissionTime, input.missionTime);
        next.slowestMissionTime = next.slowestMissionTime === null ? input.missionTime : Math.max(next.slowestMissionTime, input.missionTime);
    }

    const total = input.missionsCompleted + input.missionsFailed;
    next.successRate = total > 0 ? input.missionsCompleted / total : 0;

    if (typeof input.score === 'number' && Number.isFinite(input.score)) {
        next.averageScore = next.averageScore <= 0 ? input.score : (next.averageScore + input.score) / 2;
    }

    return next;
}

function trackMoneyTransaction(
    economy: StatisticsState['economyStats'],
    amount: number,
    reason: string
): StatisticsState['economyStats'] {
    if (!Number.isFinite(amount) || amount === 0) return economy;

    const entry = { timestamp: Date.now(), amount, reason };
    const flow = [...economy.moneyFlow, entry];
    const clampedFlow = flow.length > 100 ? flow.slice(flow.length - 100) : flow;

    const next: StatisticsState['economyStats'] = {
        ...economy,
        moneyFlow: clampedFlow,
        netWorth: economy.netWorth + amount
    };

    if (amount > 0) {
        next.totalEarnings += amount;
    } else {
        next.totalSpendings += Math.abs(amount);
    }

    next.peakNetWorth = Math.max(next.peakNetWorth, next.netWorth);

    return next;
}

import React from 'react';

import { getStatisticsSummary } from '../../shared/progress/statistics';
import type { StatisticsState } from '../../shared/types/Progress';

export type StatisticsScreenProps = {
    statistics: StatisticsState;
    onBack: () => void;
    onGoAchievements: () => void;
    onGoSaveLoad: () => void;
};

export function StatisticsScreen(props: StatisticsScreenProps) {
    const { statistics, onBack, onGoAchievements, onGoSaveLoad } = props;
    const summary = React.useMemo(() => getStatisticsSummary(statistics), [statistics]);

    return (
        <div className="screen statistics-screen anim-fade-in">
            <header className="screen-header">
                <button className="btn btn-icon" type="button" onClick={onBack} title="Back">
                    ◀
                </button>
                <h2>Progress</h2>
                <div className="statistics-nav">
                    <button className="btn btn-outline btn-sm" type="button" onClick={onGoAchievements}>
                        Achievements
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={onGoSaveLoad}>
                        Save/Load
                    </button>
                </div>
            </header>

            <div className="statistics-grid">
                <div className="stats-card panel">
                    <h3>Missions</h3>
                    <div className="stats-row">
                        <span>Completed</span>
                        <strong>{summary.missions.completed}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Failed</span>
                        <strong>{summary.missions.failed}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Success Rate</span>
                        <strong>{summary.missions.successRate}%</strong>
                    </div>
                </div>

                <div className="stats-card panel">
                    <h3>Flight</h3>
                    <div className="stats-row">
                        <span>Total Time</span>
                        <strong>{summary.flight.totalTime}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Coins</span>
                        <strong>{summary.flight.coins}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Obstacles</span>
                        <strong>{summary.flight.obstacles}</strong>
                    </div>
                </div>

                <div className="stats-card panel">
                    <h3>Economy</h3>
                    <div className="stats-row">
                        <span>Earned</span>
                        <strong>💰 {summary.economy.earned.toLocaleString()}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Spent</span>
                        <strong>💸 {summary.economy.spent.toLocaleString()}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Peak Balance</span>
                        <strong>🏦 {summary.economy.peak.toLocaleString()}</strong>
                    </div>
                </div>

                <div className="stats-card panel">
                    <h3>Performance</h3>
                    <div className="stats-row">
                        <span>Current Streak</span>
                        <strong>{summary.performance.currentStreak}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Best Streak</span>
                        <strong>{summary.performance.bestStreak}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Perfect Missions</span>
                        <strong>{summary.performance.perfectMissions}</strong>
                    </div>
                </div>

                <div className="stats-card panel">
                    <h3>Characters</h3>
                    <div className="stats-row">
                        <span>Used</span>
                        <strong>{summary.characters.used}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Level Ups</span>
                        <strong>{summary.characters.levelUps}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Highest Level</span>
                        <strong>Lv.{summary.characters.highestLevel}</strong>
                    </div>
                </div>

                <div className="stats-card panel">
                    <h3>Time</h3>
                    <div className="stats-row">
                        <span>Total Play</span>
                        <strong>{summary.time.totalPlayTime}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Sessions</span>
                        <strong>{summary.time.sessions}</strong>
                    </div>
                    <div className="stats-row">
                        <span>Last Played</span>
                        <strong>{summary.time.lastPlay ? new Date(summary.time.lastPlay).toLocaleString() : '—'}</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}


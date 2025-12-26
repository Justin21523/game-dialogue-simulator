import React from 'react';

import { getAchievementSummary, getAllAchievements } from '../../shared/progress/achievements';
import type { AchievementState, StatisticsState } from '../../shared/types/Progress';

type FilterMode = 'all' | 'unlocked' | 'locked';

export type AchievementsScreenProps = {
    achievements: AchievementState;
    statistics: StatisticsState;
    onBack: () => void;
    onGoStatistics: () => void;
    onGoSaveLoad: () => void;
};

export function AchievementsScreen(props: AchievementsScreenProps) {
    const { achievements, statistics, onBack, onGoStatistics, onGoSaveLoad } = props;

    const [filter, setFilter] = React.useState<FilterMode>('all');
    const summary = React.useMemo(() => getAchievementSummary(achievements), [achievements]);
    const items = React.useMemo(() => {
        const all = getAllAchievements(achievements, statistics);
        const filtered =
            filter === 'all' ? all : filter === 'unlocked' ? all.filter((a) => a.unlocked) : all.filter((a) => !a.unlocked);

        return filtered.sort((a, b) => {
            if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
            if (a.progressPercent !== b.progressPercent) return b.progressPercent - a.progressPercent;
            return (a.name ?? a.id).localeCompare(b.name ?? b.id);
        });
    }, [achievements, filter, statistics]);

    return (
        <div className="screen achievements-screen anim-fade-in">
            <header className="screen-header">
                <button className="btn btn-icon" type="button" onClick={onBack} title="Back">
                    ◀
                </button>
                <h2>Achievements</h2>
                <div className="statistics-nav">
                    <button className="btn btn-outline btn-sm" type="button" onClick={onGoStatistics}>
                        Stats
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={onGoSaveLoad}>
                        Save/Load
                    </button>
                </div>
            </header>

            <div className="achievements-summary panel">
                <div className="achievements-summary__main">
                    <div className="achievements-summary__headline">
                        <strong>{summary.unlocked}</strong> / {summary.total} unlocked ({summary.percentage}%)
                    </div>
                    <div className="achievements-summary__points">⭐ {summary.points} pts</div>
                </div>
                <div className="achievements-filters">
                    <button
                        className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        type="button"
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button
                        className={`btn btn-sm ${filter === 'unlocked' ? 'btn-primary' : 'btn-secondary'}`}
                        type="button"
                        onClick={() => setFilter('unlocked')}
                    >
                        Unlocked
                    </button>
                    <button
                        className={`btn btn-sm ${filter === 'locked' ? 'btn-primary' : 'btn-secondary'}`}
                        type="button"
                        onClick={() => setFilter('locked')}
                    >
                        Locked
                    </button>
                </div>
            </div>

            <div className="achievements-list">
                {items.map((a) => (
                    <div key={a.id} className={`achievement-card panel ${a.unlocked ? 'is-unlocked' : ''}`}>
                        <div className="achievement-header">
                            <div className="achievement-title">
                                <strong>{a.name ?? a.id}</strong>
                                <span className="achievement-meta">
                                    <span className="tag badge" style={{ borderColor: a.rarityInfo.color, color: a.rarityInfo.color }}>
                                        {a.rarityInfo.name}
                                    </span>
                                    <span className="tag badge">{a.categoryInfo.name}</span>
                                </span>
                            </div>
                            <div className="achievement-status">{a.unlocked ? '✅' : '🔒'}</div>
                        </div>

                        {a.description ? <div className="achievement-description">{a.description}</div> : null}

                        <div className="achievement-progress">
                            <div className="achievement-progress__bar">
                                <div className="achievement-progress__fill" style={{ width: `${a.progressPercent}%` }} />
                            </div>
                            <div className="achievement-progress__label">
                                {a.progress} / {a.target} · {a.progressPercent}%
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


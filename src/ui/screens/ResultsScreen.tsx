import React from 'react';

import { generateNarration } from '../../shared/api/narrationApi';
import type { MissionResult } from '../../shared/types/Game';

export type ResultsScreenProps = {
    result: MissionResult;
    onBackToHangar: () => void;
    onBackToMissionBoard: () => void;
};

function getExpTarget(level: number): number {
    return Math.max(100, level * 100);
}

export function ResultsScreen(props: ResultsScreenProps) {
    const { result, onBackToHangar, onBackToMissionBoard } = props;
    const { mission, character, success, rewards } = result;

    const [narration, setNarration] = React.useState<string | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        setNarration(null);

        generateNarration({
            characterId: character.id,
            phase: success ? 'success' : 'return',
            location: mission.location,
            problem: mission.description,
            result: success ? 'success' : 'failed'
        })
            .then((res) => {
                if (cancelled) return;
                setNarration(res.narration || null);
            })
            .catch(() => {
                // Ignore narration failures (offline backend).
            });

        return () => {
            cancelled = true;
        };
    }, [character.id, mission.description, mission.location, success]);

    const expTarget = getExpTarget(character.level);
    const expPct = Math.max(0, Math.min(1, expTarget > 0 ? character.exp / expTarget : 0)) * 100;

    return (
        <div className="screen results-screen anim-fade-in">
            <div className="result-card anim-slide-up">
                <h2 className="result-title">{success ? 'MISSION COMPLETE!' : 'MISSION FAILED'}</h2>

                <div className="mission-summary">
                    <h3>{mission.title}</h3>
                    <p>{mission.location}</p>
                </div>

                {narration ? <div className="results-narration">{narration}</div> : null}

                <div className="rewards-container">
                    <div className="reward-item anim-pulse">
                        <span className="icon">💰</span>
                        <span className="value">+{rewards.money}</span>
                        <span className="label">Money</span>
                        {rewards.bonus > 0 ? <span className="bonus-text">(+{rewards.bonus} Bonus)</span> : null}
                    </div>
                    <div className="reward-item anim-pulse" style={{ animationDelay: '0.2s' }}>
                        <span className="icon">⭐</span>
                        <span className="value">+{rewards.exp}</span>
                        <span className="label">Exp</span>
                    </div>
                </div>

                <div className="char-progress">
                    <div className="char-name">{character.name}</div>
                    <div className="level-info">
                        Level {character.level} · {character.exp}/{expTarget} EXP
                    </div>
                    <div className="exp-bar">
                        <div className="exp-fill" style={{ width: `${expPct}%` }} />
                    </div>
                </div>

                <div className="results-actions">
                    <button className="btn btn-secondary btn-lg" type="button" onClick={onBackToHangar}>
                        Back to Hangar
                    </button>
                    <button className="btn btn-primary btn-lg" type="button" onClick={onBackToMissionBoard}>
                        Mission Board
                    </button>
                </div>
            </div>
        </div>
    );
}

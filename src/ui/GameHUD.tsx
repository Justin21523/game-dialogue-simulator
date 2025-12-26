import React from 'react';

import type { HudState } from '../shared/types/Scene';

export function GameHUD(props: { hudState: HudState; narration?: string | null }) {
    const { hudState, narration } = props;
    const progressPct = Math.round(Math.min(1, hudState.distance / 5000) * 100);
    const timeLeft = hudState.timeLeft;
    const timeDanger = typeof timeLeft === 'number' && timeLeft < 10;

    return (
        <>
            <div className="phaser-progress" aria-label="Mission progress">
                <div className="phaser-progress__track">
                    <div className="phaser-progress__fill" style={{ width: `${progressPct}%` }} />
                </div>
            </div>

            <div className="phaser-hud">
                <div className="phaser-hud__row">
                    <span className="phaser-hud__label">Score</span>
                    <span className="phaser-hud__value">{hudState.score}</span>
                </div>
                <div className="phaser-hud__row">
                    <span className="phaser-hud__label">Distance</span>
                    <span className="phaser-hud__value">{Math.floor(hudState.distance)}m</span>
                </div>
                <div className="phaser-hud__row">
                    <span className="phaser-hud__label">Speed</span>
                    <span className="phaser-hud__value">{Math.floor(hudState.speed)}</span>
                </div>
                {typeof timeLeft === 'number' ? (
                    <div className="phaser-hud__row">
                        <span className="phaser-hud__label">Time</span>
                        <span className={`phaser-hud__value ${timeDanger ? 'phaser-hud__value--danger' : ''}`}>
                            {timeLeft.toFixed(1)}s
                        </span>
                    </div>
                ) : null}
                <div className="phaser-hud__row">
                    <span className="phaser-hud__label">Status</span>
                    <span className="phaser-hud__value">{hudState.status}</span>
                </div>
            </div>

            {narration ? <div className="phaser-narration">{narration}</div> : null}
        </>
    );
}

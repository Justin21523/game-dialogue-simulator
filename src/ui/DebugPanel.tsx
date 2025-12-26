import React from 'react';

import { emitGameCommand } from '../shared/gameCommands';
import type { HudState } from '../shared/types/Scene';

export function DebugPanel(props: { hudState: HudState; onBackToHangar?: () => void }) {
    const { hudState, onBackToHangar } = props;

    return (
        <div className="debug-panel ui-interactive">
            <div className="debug-panel__title">Debug</div>
            <div className="debug-panel__meta">
                <span className="debug-panel__tag">{hudState.missionType}</span>
                <span className="debug-panel__tag">{hudState.status}</span>
            </div>
            <button
                className="debug-panel__btn"
                type="button"
                onClick={() => emitGameCommand({ type: 'flight:restart' })}
            >
                Restart Flight
            </button>
            {onBackToHangar ? (
                <button className="debug-panel__btn debug-panel__btn--secondary" type="button" onClick={onBackToHangar}>
                    Back to Hangar
                </button>
            ) : null}
        </div>
    );
}

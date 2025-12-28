import React from 'react';

type ErrorBoundaryProps = {
    children: React.ReactNode;
};

type ErrorBoundaryState = {
    error: Error | null;
};

const KNOWN_STORAGE_KEYS = [
    'sws:save:v1',
    'missionManagerState',
    'sws:world:v3',
    'sws:world:v2',
    'sws:world:v1',
    'sws:companions:v2',
    'sws:companions:v1'
] as const;

function clearKnownLocalState(): void {
    try {
        for (const key of KNOWN_STORAGE_KEYS) {
            globalThis.localStorage?.removeItem(key);
        }
    } catch {
        // Ignore storage failures.
    }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error('[ui] Unhandled error', error, info);
    }

    private readonly handleReload = (): void => {
        globalThis.location?.reload();
    };

    private readonly handleReset = (): void => {
        clearKnownLocalState();
        globalThis.location?.reload();
    };

    render() {
        if (!this.state.error) return this.props.children;

        const message = this.state.error.message || 'Unknown error';
        const stack = this.state.error.stack || String(this.state.error);

        return (
            <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-label="Application error">
                <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">Something went wrong</h3>
                        <button className="modal-close-btn" type="button" onClick={this.handleReload} aria-label="Reload">
                            ×
                        </button>
                    </div>
                    <div className="modal-body">
                        <p>
                            The UI encountered an unrecoverable error. You can try reloading, or reset local progress if a corrupted save caused the
                            crash.
                        </p>
                        <p className="muted">{message}</p>
                        <pre className="error-boundary__stack">{stack}</pre>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-secondary" type="button" onClick={this.handleReset}>
                            Clear Local Save
                        </button>
                        <button className="btn btn-primary" type="button" onClick={this.handleReload}>
                            Reload
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

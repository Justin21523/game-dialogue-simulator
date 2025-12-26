import React from 'react';

export type MainMenuScreenProps = {
    onStart: () => void;
    onExplore?: () => void;
};

export function MainMenuScreen(props: MainMenuScreenProps) {
    const { onStart, onExplore } = props;

    return (
        <div className="screen main-menu-screen full-screen anim-fade-in">
            <div className="main-menu-screen__content">
                <h1 className="main-menu-screen__title">Super Wings Simulator</h1>
                <button className="start-btn" type="button" onClick={onStart}>
                    Start
                </button>
                {onExplore ? (
                    <button className="start-btn" type="button" onClick={onExplore}>
                        Exploration Sandbox
                    </button>
                ) : null}
            </div>
        </div>
    );
}

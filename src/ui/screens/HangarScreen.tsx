import React from 'react';

import { GAME_CONFIG } from '../../shared/gameConfig';
import {
    getCharacterGridPortraitSrc,
    getCharacterProfileSrc,
    loadCharacterSequenceFrames,
    type CharacterProfileVariant
} from '../../shared/characterAssets';
import type { CharacterState, Resources } from '../../shared/types/Game';
import { useToast } from '../components/ToastProvider';

const PROFILE_VARIANTS: CharacterProfileVariant[] = ['heroic', 'ready', 'flying', 'smile'];
const HANGAR_ANIMATION_FPS = 4;

function getEnergyColor(val: number): string {
    if (val > 70) return 'var(--color-success)';
    if (val > 30) return 'var(--color-warning)';
    return 'var(--color-danger)';
}

export type HangarScreenProps = {
    resources: Resources;
    characters: CharacterState[];
    selectedCharacterId: string;
    onSelectCharacter: (characterId: string) => void;
    onRefuelAll: () => void;
    onGoMissionBoard: () => void;
    onGoStatistics: () => void;
    onGoAchievements: () => void;
    onGoSaveLoad: () => void;
    onBackToMainMenu: () => void;
};

export function HangarScreen(props: HangarScreenProps) {
    const {
        resources,
        characters,
        selectedCharacterId,
        onSelectCharacter,
        onRefuelAll,
        onGoMissionBoard,
        onGoStatistics,
        onGoAchievements,
        onGoSaveLoad,
        onBackToMainMenu
    } = props;

    const toast = useToast();

    const selectedCharacter = characters.find((c) => c.id === selectedCharacterId) ?? characters[0];

    const [carouselIndex, setCarouselIndex] = React.useState(0);
    const [animationMode, setAnimationMode] = React.useState(false);
    const [animationFrames, setAnimationFrames] = React.useState<string[]>([]);
    const [animationIndex, setAnimationIndex] = React.useState(0);
    const [isLoadingAnimation, setIsLoadingAnimation] = React.useState(false);

    React.useEffect(() => {
        setCarouselIndex(0);
        setAnimationMode(false);
        setAnimationFrames([]);
        setAnimationIndex(0);
        setIsLoadingAnimation(false);
    }, [selectedCharacterId]);

    const variant = PROFILE_VARIANTS[((carouselIndex % PROFILE_VARIANTS.length) + PROFILE_VARIANTS.length) % PROFILE_VARIANTS.length];
    const detailFallbackSrc = getCharacterGridPortraitSrc(selectedCharacter?.id ?? 'jett');
    const detailVariantSrc = selectedCharacter ? getCharacterProfileSrc(selectedCharacter.id, variant) : detailFallbackSrc;

    const detailSrc =
        animationMode && animationFrames.length > 0 ? animationFrames[animationIndex % animationFrames.length] : detailVariantSrc;

    React.useEffect(() => {
        if (!animationMode) return;
        if (!selectedCharacter) return;

        let cancelled = false;
        setIsLoadingAnimation(true);
        loadCharacterSequenceFrames(selectedCharacter.id)
            .then((frames) => {
                if (cancelled) return;
                setAnimationFrames(frames);
                setAnimationIndex(0);
                if (frames.length === 0) {
                    setAnimationMode(false);
                    toast.show('No animation frames found for this character.', 'warning');
                }
            })
            .catch(() => {
                if (cancelled) return;
                setAnimationMode(false);
                toast.show('Failed to load animation frames.', 'error');
            })
            .finally(() => {
                if (cancelled) return;
                setIsLoadingAnimation(false);
            });

        return () => {
            cancelled = true;
        };
    }, [animationMode, selectedCharacter, toast]);

    React.useEffect(() => {
        if (!animationMode) return;
        if (animationFrames.length === 0) return;

        const intervalMs = Math.round(1000 / HANGAR_ANIMATION_FPS);
        const timer = window.setInterval(() => {
            setAnimationIndex((idx) => (idx + 1) % animationFrames.length);
        }, intervalMs);

        return () => {
            window.clearInterval(timer);
        };
    }, [animationFrames.length, animationMode]);

    return (
        <div className="screen hangar-screen anim-fade-in">
            <header className="screen-header">
                <h2>Super Wings Hangar</h2>
                <div className="resources-display">
                    <span className="res-item money-tag">
                        💰 <span>{Math.floor(resources.money)}</span>
                    </span>
                    <span className="res-item fuel-tag">
                        ⛽ <span>{Math.floor(resources.fuel)}</span> / {GAME_CONFIG.MAX_FUEL}
                    </span>
                    <button id="btn-refuel-action" className="btn-icon" title="Refuel All" type="button" onClick={onRefuelAll}>
                        ➕
                    </button>
                </div>
            </header>

            <div className="hangar-body">
                <div className="character-grid">
                    {characters.map((char) => {
                        const statusClass = char.status.toLowerCase();
                        const selectedClass = selectedCharacterId === char.id ? 'selected' : '';
                        const imgSrc = getCharacterGridPortraitSrc(char.id);

                        return (
                            <div
                                key={char.id}
                                className={`char-card ${statusClass} ${selectedClass}`}
                                data-id={char.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectCharacter(char.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') onSelectCharacter(char.id);
                                }}
                            >
                                <div
                                    className="char-img-container"
                                    style={{
                                        background: `radial-gradient(circle, ${char.color}40 0%, transparent 70%)`
                                    }}
                                >
                                    <img
                                        src={imgSrc}
                                        alt={char.name}
                                        loading="lazy"
                                        onError={(e) => {
                                            e.currentTarget.src = getCharacterGridPortraitSrc('jett');
                                        }}
                                    />
                                </div>
                                <div className="char-info">
                                    <div className="char-header">
                                        <h3>{char.name}</h3>
                                        <span className="char-type-badge">{char.type}</span>
                                    </div>
                                    <div className="char-stats">
                                        <div className="stat-row">
                                            <span>Lvl {char.level}</span>
                                            <span>⚡ {char.energy}%</span>
                                        </div>
                                        <div className="progress-bar">
                                            <div className="fill" style={{ width: `${char.energy}%`, backgroundColor: getEnergyColor(char.energy) }} />
                                        </div>
                                    </div>
                                    <div className={`char-status tag-${statusClass}`}>{char.status}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="character-detail">
                    {selectedCharacter ? (
                        <div className="detail-card">
                            <div className="detail-header">
                                <h3>{selectedCharacter.name}</h3>
                                <span className="badge">{selectedCharacter.type}</span>
                            </div>

                            <div className="detail-body">
                                <div className="detail-carousel">
                                    <button
                                        id="char-img-prev"
                                        className="carousel-btn"
                                        type="button"
                                        onClick={() => setCarouselIndex((idx) => idx - 1)}
                                        disabled={animationMode}
                                    >
                                        ⟵
                                    </button>
                                    <div className="carousel-img">
                                        <img
                                            id="detail-portrait-img"
                                            src={detailSrc}
                                            alt={selectedCharacter.name}
                                            onError={(e) => {
                                                e.currentTarget.src = detailFallbackSrc;
                                            }}
                                        />
                                    </div>
                                    <button
                                        id="char-img-next"
                                        className="carousel-btn"
                                        type="button"
                                        onClick={() => setCarouselIndex((idx) => idx + 1)}
                                        disabled={animationMode}
                                    >
                                        ⟶
                                    </button>
                                </div>

                                <div className="animation-controls">
                                    <button
                                        id="btn-toggle-animation"
                                        className="btn btn-secondary"
                                        type="button"
                                        onClick={() => setAnimationMode((v) => !v)}
                                    >
                                        {isLoadingAnimation ? '⏳ Loading...' : animationMode ? '⏸️ Static' : '▶️ Play Animation'}
                                    </button>
                                </div>

                                <div className="detail-stats">
                                    <div className="stat-line">
                                        <span>Level</span>
                                        <strong>{selectedCharacter.level}</strong>
                                    </div>
                                    <div className="stat-line">
                                        <span>Energy</span>
                                        <strong>{selectedCharacter.energy}%</strong>
                                    </div>
                                    <div className="stat-line">
                                        <span>Speed</span>
                                        <strong>{selectedCharacter.speed}</strong>
                                    </div>
                                    <div className="stat-line">
                                        <span>Reliability</span>
                                        <strong>{selectedCharacter.reliability}%</strong>
                                    </div>
                                    <div className="stat-line">
                                        <span>Status</span>
                                        <strong>{selectedCharacter.status}</strong>
                                    </div>
                                </div>

                                <div className="detail-notes">
                                    <p>Specialty: {selectedCharacter.type} missions are a great match.</p>
                                    <p>Tip: Keep energy above 20% before dispatch; leveling up improves speed and reliability.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="detail-empty">Select a character to view details.</div>
                    )}
                </div>
            </div>

            <div className="action-bar">
                <div className="action-bar__group">
                    <button id="btn-back" className="btn btn-secondary" type="button" onClick={onBackToMainMenu}>
                        ◀ MAIN MENU
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={onGoStatistics}>
                        📊 STATS
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={onGoAchievements}>
                        🏆 ACHIEVEMENTS
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={onGoSaveLoad}>
                        💾 SAVE/LOAD
                    </button>
                </div>
                <button id="btn-dispatch" className="btn btn-primary pulse-btn" type="button" onClick={onGoMissionBoard}>
                    MISSION BOARD ➔
                </button>
            </div>
        </div>
    );
}

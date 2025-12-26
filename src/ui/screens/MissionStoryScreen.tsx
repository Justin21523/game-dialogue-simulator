import React from 'react';

import type { HttpError } from '../../shared/api/http';
import { generateTransformationCall } from '../../shared/api/dialogueApi';
import { generateNarration } from '../../shared/api/narrationApi';
import { generateMissionEvent, resolveMissionEvent, type EventResolveResponse, type GameEventResponse } from '../../shared/api/missionBoardApi';
import { getCharacterProfileSrc } from '../../shared/characterAssets';
import type { MissionResult } from '../../shared/types/Game';
import { useToast } from '../components/ToastProvider';

type StepId = 'transformation' | 'solving' | 'return';

export type MissionStoryScreenProps = {
    result: MissionResult;
    onContinue: () => void;
};

type StepState = {
    transformationCall: string | null;
    transformationNarration: string | null;
    solvingNarration: string | null;
    event: GameEventResponse | null;
    eventResolution: EventResolveResponse | null;
    returnNarration: string | null;
};

function formatErrorMessage(err: unknown): string {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
        const maybeHttp = err as Partial<HttpError>;
        if (typeof maybeHttp.message === 'string') return maybeHttp.message;

        if ('name' in err && (err as { name?: unknown }).name === 'AbortError') {
            return 'Request timed out. Please try again.';
        }
    }
    return 'Request failed. Please try again.';
}

function getStepLabel(step: StepId): string {
    switch (step) {
        case 'transformation':
            return 'TRANSFORMATION';
        case 'solving':
            return 'SOLVING';
        case 'return':
            return 'RETURN';
    }
}

function normalizeDestinationFolder(raw: string): string {
    const key = raw
        .trim()
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, '_')
        .replace(/__+/g, '_');

    const mapping: Record<string, string> = {
        'new_york': 'new_york',
        'rio_de_janeiro': 'rio',
        'rio': 'rio',
        'mexico_city': 'mexico_city',
        'hong_kong': 'hong_kong',
        'saint_petersburg': 'saint_petersburg'
    };

    return mapping[key] ?? key;
}

function getDestinationBackground(location: string): string {
    const folder = normalizeDestinationFolder(location);
    return `assets/images/backgrounds/destinations/${folder}/${folder}_landmark_v1.png`;
}

export function MissionStoryScreen(props: MissionStoryScreenProps) {
    const { result, onContinue } = props;
    const toast = useToast();

    const { mission, character } = result;

    const [step, setStep] = React.useState<StepId>('transformation');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [backgroundSrc, setBackgroundSrc] = React.useState<string>('assets/images/backgrounds/base/world_airport_v1.png');
    const [stepState, setStepState] = React.useState<StepState>({
        transformationCall: null,
        transformationNarration: null,
        solvingNarration: null,
        event: null,
        eventResolution: null,
        returnNarration: null
    });
    const [eventResolving, setEventResolving] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const fallback = 'assets/images/backgrounds/base/world_airport_v1.png';
        const preferred =
            step === 'return' ? 'assets/images/backgrounds/base/world_airport_v1.png' : getDestinationBackground(mission.location);

        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setBackgroundSrc(preferred);
        };
        img.onerror = () => {
            if (cancelled) return;
            setBackgroundSrc(fallback);
        };
        img.src = preferred;

        return () => {
            cancelled = true;
        };
    }, [mission.location, step]);

    React.useEffect(() => {
        if (!result.success) {
            onContinue();
        }
    }, [onContinue, result.success]);

    React.useEffect(() => {
        if (step !== 'transformation') return;
        if (stepState.transformationCall && stepState.transformationNarration) return;
        if (loading) return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        const situation = `Mission: ${mission.title} · ${mission.location}. Problem: ${mission.description}`;

        Promise.all([
            generateTransformationCall({ characterId: character.id, situation }).catch(() => ''),
            generateNarration({
                characterId: character.id,
                phase: 'transformation',
                location: mission.location,
                problem: mission.description,
                result: 'transforming'
            })
                .then((res) => res.narration)
                .catch(() => '')
        ])
            .then(([call, narration]) => {
                if (cancelled) return;
                setStepState((prev) => ({
                    ...prev,
                    transformationCall: call || `${character.name}! Transform!`,
                    transformationNarration: narration || `${character.name} prepares to transform and tackle the mission.`
                }));
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(formatErrorMessage(err));
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        character.id,
        character.name,
        loading,
        mission.description,
        mission.location,
        mission.title,
        step,
        stepState.transformationCall,
        stepState.transformationNarration
    ]);

    React.useEffect(() => {
        if (step !== 'solving') return;
        if (stepState.event && stepState.solvingNarration) return;
        if (loading) return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            stepState.event
                ? Promise.resolve(stepState.event)
                : generateMissionEvent({
                      characterId: character.id,
                      location: mission.location,
                      missionPhase: 'solving',
                      originalProblem: mission.description,
                      difficulty: 'medium'
                  }),
            stepState.solvingNarration
                ? Promise.resolve(stepState.solvingNarration)
                : generateNarration({
                      characterId: character.id,
                      phase: 'solving',
                      location: mission.location,
                      problem: mission.description,
                      result: 'working'
                  })
                      .then((res) => res.narration)
                      .catch(() => '')
        ])
            .then(([event, narration]) => {
                if (cancelled) return;
                setStepState((prev) => ({
                    ...prev,
                    event: prev.event ?? event,
                    solvingNarration: prev.solvingNarration ?? (narration || null)
                }));
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(formatErrorMessage(err));
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [character.id, loading, mission.description, mission.location, step, stepState.event, stepState.solvingNarration]);

    React.useEffect(() => {
        if (step !== 'return') return;
        if (stepState.returnNarration) return;
        if (loading) return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        generateNarration({
            characterId: character.id,
            phase: 'return',
            location: mission.location,
            problem: mission.description,
            result: 'returning'
        })
            .then((res) => {
                if (cancelled) return;
                setStepState((prev) => ({ ...prev, returnNarration: res.narration || null }));
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(formatErrorMessage(err));
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [character.id, loading, mission.description, mission.location, step, stepState.returnNarration]);

    const portraitSrc = getCharacterProfileSrc(character.id, 'heroic');
    const isLastStep = step === 'return';
    const nextDisabled = loading || eventResolving;

    const goNext = React.useCallback(() => {
        if (step === 'transformation') setStep('solving');
        else if (step === 'solving') setStep('return');
        else onContinue();
    }, [onContinue, step]);

    const handleResolveChoice = React.useCallback(
        async (choiceIndex: number) => {
            if (!stepState.event) return;
            if (eventResolving) return;
            setEventResolving(true);
            setError(null);
            try {
                const resolved = await resolveMissionEvent({ eventId: stepState.event.event_id, choiceIndex });
                setStepState((prev) => ({ ...prev, eventResolution: resolved }));
                toast.show(resolved.success ? 'Challenge cleared!' : 'Challenge failed!', resolved.success ? 'success' : 'warning', 5000);
            } catch (err) {
                setError(formatErrorMessage(err));
            } finally {
                setEventResolving(false);
            }
        },
        [eventResolving, stepState.event, toast]
    );

    const content = (() => {
        if (loading && step !== 'solving') {
            return 'Loading story...';
        }

        if (error && step !== 'solving') {
            return error;
        }

        if (step === 'transformation') {
            const call = stepState.transformationCall ?? `${character.name}! Transform!`;
            const narration = stepState.transformationNarration ?? '';
            return narration ? `${call}\n\n${narration}` : call;
        }

        if (step === 'solving') {
            if (loading && !stepState.event) return 'Generating a challenge...';
            if (error) return error;
            const event = stepState.event;
            if (!event) return 'No challenge available.';

            const resolved = stepState.eventResolution;
            if (resolved) {
                return stepState.solvingNarration ? `${resolved.outcome}\n\n${stepState.solvingNarration}` : resolved.outcome;
            }

            const base = `${event.name}\n\n${event.description}\n\n${event.challenge}`;
            return stepState.solvingNarration ? `${base}\n\n${stepState.solvingNarration}` : base;
        }

        return stepState.returnNarration ?? `Returning to base from ${mission.location}...`;
    })();

    return (
        <div className="screen dialogue-screen mission-story-screen anim-fade-in" style={{ backgroundImage: `url(${backgroundSrc})` }}>
            <div className="narration-panel">
                <div className="narration-label">
                    {getStepLabel(step)} · {mission.location}
                </div>
                <div>
                    <strong>{mission.title}</strong> · {character.name}
                </div>
            </div>

            <div className="portrait-container left">
                <img
                    className="portrait"
                    src={portraitSrc}
                    alt={character.name}
                    onError={(e) => {
                        e.currentTarget.src = getCharacterProfileSrc('jett', 'heroic');
                    }}
                />
                <div className="name-tag">{character.name}</div>
            </div>

            <div className="dialogue-box">
                <div className="text-area">{content}</div>

                {step === 'solving' && stepState.event && !stepState.eventResolution && !error ? (
                    <div className="dialogue-choice-grid">
                        {stepState.event.choices.map((choice, idx) => (
                            <button
                                key={`${stepState.event?.event_id}:${choice.option}`}
                                className="btn btn-outline btn-sm"
                                type="button"
                                disabled={eventResolving}
                                onClick={() => void handleResolveChoice(idx)}
                            >
                                {eventResolving ? 'Resolving...' : choice.option}
                            </button>
                        ))}
                        <button className="btn btn-secondary btn-sm" type="button" disabled={eventResolving} onClick={goNext}>
                            Skip Challenge
                        </button>
                    </div>
                ) : null}

                <div className="dialogue-actions">
                    <button className="btn btn-secondary" type="button" onClick={onContinue}>
                        Skip Story
                    </button>
                    {isLastStep ? (
                        <button className="btn btn-primary" type="button" onClick={onContinue}>
                            View Results
                        </button>
                    ) : (
                        <button className="btn btn-primary" type="button" disabled={nextDisabled} onClick={goNext}>
                            Next
                        </button>
                    )}
                </div>

                {!isLastStep ? <div className="dialogue-indicator">▶</div> : null}
            </div>
        </div>
    );
}


import React from 'react';

import type { HttpError } from '../../shared/api/http';
import { generateGreeting } from '../../shared/api/dialogueApi';
import { generateNarration } from '../../shared/api/narrationApi';
import { generateMissionEvent, resolveMissionEvent, type GameEventResponse, type EventResolveResponse } from '../../shared/api/missionBoardApi';
import { getCharacterProfileSrc } from '../../shared/characterAssets';
import type { CharacterState, Mission } from '../../shared/types/Game';
import { useToast } from '../components/ToastProvider';

type StepId = 'greeting' | 'narration' | 'event' | 'ready';

export type MissionBriefingScreenProps = {
    mission: Mission;
    character: CharacterState;
    onStartFlight: () => void;
    onCancel: () => void;
};

type StepState = {
    greeting: string | null;
    narration: string | null;
    event: GameEventResponse | null;
    eventResolution: EventResolveResponse | null;
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
        case 'greeting':
            return 'DISPATCH';
        case 'narration':
            return 'DEPARTURE';
        case 'event':
            return 'EVENT';
        case 'ready':
            return 'READY';
    }
}

export function MissionBriefingScreen(props: MissionBriefingScreenProps) {
    const { mission, character, onStartFlight, onCancel } = props;
    const toast = useToast();

    const [step, setStep] = React.useState<StepId>('greeting');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [stepState, setStepState] = React.useState<StepState>({
        greeting: null,
        narration: null,
        event: null,
        eventResolution: null
    });
    const [eventLoading, setEventLoading] = React.useState(false);
    const [eventResolving, setEventResolving] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            generateGreeting({ characterId: character.id, location: mission.location, problem: mission.description }).catch(() => ''),
            generateNarration({
                characterId: character.id,
                phase: 'departure',
                location: mission.location,
                problem: mission.description,
                result: 'en_route'
            })
                .then((res) => res.narration)
                .catch(() => '')
        ])
            .then(([greeting, narration]) => {
                if (cancelled) return;
                setStepState((prev) => ({
                    ...prev,
                    greeting: greeting || `Ready to go! Mission: ${mission.title}`,
                    narration: narration || `Departure confirmed. Heading to ${mission.location}.`
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
    }, [character.id, mission.description, mission.location, mission.title]);

    React.useEffect(() => {
        if (step !== 'event') return;
        if (stepState.event) return;
        if (eventLoading) return;

        let cancelled = false;
        setEventLoading(true);
        setError(null);

        generateMissionEvent({
            characterId: character.id,
            location: mission.location,
            missionPhase: 'departure',
            originalProblem: mission.description,
            difficulty: 'medium'
        })
            .then((event) => {
                if (cancelled) return;
                setStepState((prev) => ({ ...prev, event }));
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(formatErrorMessage(err));
            })
            .finally(() => {
                if (cancelled) return;
                setEventLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [character.id, eventLoading, mission.description, mission.location, step, stepState.event]);

    const portraitSrc = getCharacterProfileSrc(character.id, 'ready');
    const background = 'assets/images/backgrounds/base/runway_v1.png';

    const isLastStep = step === 'ready';
    const nextDisabled = loading;

    const goNext = React.useCallback(() => {
        if (step === 'greeting') setStep('narration');
        else if (step === 'narration') setStep('event');
        else if (step === 'event') setStep('ready');
    }, [step]);

    const handleResolveChoice = React.useCallback(
        async (choiceIndex: number) => {
            if (!stepState.event) return;
            if (eventResolving) return;
            setEventResolving(true);
            setError(null);
            try {
                const resolved = await resolveMissionEvent({ eventId: stepState.event.event_id, choiceIndex });
                setStepState((prev) => ({ ...prev, eventResolution: resolved }));
                toast.show(resolved.success ? 'Event resolved!' : 'Event failed!', resolved.success ? 'success' : 'warning', 5000);
            } catch (err) {
                setError(formatErrorMessage(err));
            } finally {
                setEventResolving(false);
            }
        },
        [eventResolving, stepState.event, toast]
    );

    const content = (() => {
        if (loading) {
            return 'Loading briefing...';
        }

        if (error && step !== 'event') {
            return error;
        }

        if (step === 'greeting') {
            return stepState.greeting ?? `Ready to go! Mission: ${mission.title}`;
        }

        if (step === 'narration') {
            return stepState.narration ?? `Departure confirmed. Heading to ${mission.location}.`;
        }

        if (step === 'event') {
            if (eventLoading) return 'Generating a mission event...';
            if (error) return error;

            const event = stepState.event;
            if (!event) return 'No event available.';

            const resolved = stepState.eventResolution;
            if (resolved) {
                return `${resolved.outcome}`;
            }

            return `${event.name}\n\n${event.description}\n\n${event.challenge}`;
        }

        return 'All set. Launch when ready!';
    })();

    return (
        <div className="screen dialogue-screen mission-briefing-screen anim-fade-in" style={{ backgroundImage: `url(${background})` }}>
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
                        e.currentTarget.src = getCharacterProfileSrc('jett', 'ready');
                    }}
                />
                <div className="name-tag">{character.name}</div>
            </div>

            <div className="dialogue-box">
                <div className="text-area">{content}</div>

                {step === 'event' && stepState.event && !stepState.eventResolution && !error ? (
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
                            Skip Event
                        </button>
                    </div>
                ) : null}

                <div className="dialogue-actions">
                    <button className="btn btn-secondary" type="button" onClick={onCancel}>
                        Back
                    </button>
                    {isLastStep ? (
                        <button className="btn btn-primary" type="button" onClick={onStartFlight}>
                            Start Flight
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

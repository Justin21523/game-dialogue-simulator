import React from 'react';

import type { SaveSnapshot } from '../../shared/types/Save';
import { useToast } from '../components/ToastProvider';

type SlotPreview = {
    money: number;
    missionsCompleted: number;
    achievementsUnlocked: number;
    highestLevel: number;
    playTimeSeconds: number;
};

type SlotInfo = {
    index: number;
    isEmpty: boolean;
    timestamp: number | null;
    preview: SlotPreview | null;
};

export type SaveLoadScreenProps = {
    currentSnapshot: SaveSnapshot;
    onBack: () => void;
    onLoadSnapshot: (rawJson: string) => void;
    onResetProgress: () => void;
};

const SLOT_COUNT = 5;
const SLOT_PREFIX = 'sws:save:slot:';

function getSlotKey(index: number): string {
    return `${SLOT_PREFIX}${index}`;
}

function safeRead(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeWrite(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function safeRemove(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function extractPreview(raw: string): { timestamp: number | null; preview: SlotPreview } | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;

    const resources = record.resources as Record<string, unknown> | undefined;
    const money = typeof resources?.money === 'number' && Number.isFinite(resources.money) ? Math.max(0, resources.money) : 0;

    const characters = Array.isArray(record.characters) ? record.characters : [];
    const highestLevel = characters.reduce((max, entry) => {
        if (!entry || typeof entry !== 'object') return max;
        const level = (entry as Record<string, unknown>).level;
        if (typeof level !== 'number' || !Number.isFinite(level)) return max;
        return Math.max(max, Math.floor(level));
    }, 1);

    const statistics = record.statistics as Record<string, unknown> | undefined;
    const missionsCompleted =
        typeof statistics?.missionsCompleted === 'number' && Number.isFinite(statistics.missionsCompleted)
            ? Math.max(0, Math.floor(statistics.missionsCompleted))
            : 0;
    const playTimeSeconds =
        typeof statistics?.totalPlayTime === 'number' && Number.isFinite(statistics.totalPlayTime)
            ? Math.max(0, Math.floor(statistics.totalPlayTime))
            : 0;

    const achievements = record.achievements as Record<string, unknown> | undefined;
    const unlockedArr = Array.isArray(achievements?.unlocked) ? achievements?.unlocked : [];
    const achievementsUnlocked = unlockedArr.filter((id) => typeof id === 'string').length;

    const timestamp = typeof record.timestamp === 'number' && Number.isFinite(record.timestamp) ? record.timestamp : null;

    return {
        timestamp,
        preview: { money, missionsCompleted, achievementsUnlocked, highestLevel, playTimeSeconds }
    };
}

function downloadJson(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function formatPlayTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
}

export function SaveLoadScreen(props: SaveLoadScreenProps) {
    const { currentSnapshot, onBack, onLoadSnapshot, onResetProgress } = props;
    const toast = useToast();

    const [slots, setSlots] = React.useState<SlotInfo[]>([]);

    const refreshSlots = React.useCallback(() => {
        const next: SlotInfo[] = [];
        for (let i = 0; i < SLOT_COUNT; i += 1) {
            const raw = safeRead(getSlotKey(i));
            if (!raw) {
                next.push({ index: i, isEmpty: true, timestamp: null, preview: null });
                continue;
            }
            const extracted = extractPreview(raw);
            next.push({
                index: i,
                isEmpty: false,
                timestamp: extracted?.timestamp ?? null,
                preview: extracted?.preview ?? null
            });
        }
        setSlots(next);
    }, []);

    React.useEffect(() => {
        refreshSlots();
    }, [refreshSlots]);

    const handleSave = React.useCallback(
        (index: number) => {
            const payload = JSON.stringify({ timestamp: Date.now(), ...currentSnapshot });
            if (!safeWrite(getSlotKey(index), payload)) {
                toast.show('Save failed (Storage unavailable).', 'error');
                return;
            }
            refreshSlots();
            toast.show(`Saved to slot ${index + 1}.`, 'success');
        },
        [currentSnapshot, refreshSlots, toast]
    );

    const handleLoad = React.useCallback(
        (index: number) => {
            const raw = safeRead(getSlotKey(index));
            if (!raw) {
                toast.show('Slot is empty.', 'warning');
                return;
            }
            onLoadSnapshot(raw);
        },
        [onLoadSnapshot, toast]
    );

    const handleDelete = React.useCallback(
        (index: number) => {
            safeRemove(getSlotKey(index));
            refreshSlots();
            toast.show(`Deleted slot ${index + 1}.`, 'info');
        },
        [refreshSlots, toast]
    );

    const handleExportCurrent = React.useCallback(() => {
        downloadJson(`sws-save-${Date.now()}.json`, JSON.stringify(currentSnapshot, null, 2));
        toast.show('Exported current save.', 'success');
    }, [currentSnapshot, toast]);

    const handleExportSlot = React.useCallback(
        (index: number) => {
            const raw = safeRead(getSlotKey(index));
            if (!raw) {
                toast.show('Slot is empty.', 'warning');
                return;
            }
            downloadJson(`sws-slot-${index + 1}-${Date.now()}.json`, raw);
            toast.show(`Exported slot ${index + 1}.`, 'success');
        },
        [toast]
    );

    const handleImport = React.useCallback(
        (file: File) => {
            const reader = new FileReader();
            reader.onerror = () => {
                toast.show('Failed to read file.', 'error');
            };
            reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : null;
                if (!text) {
                    toast.show('Invalid file.', 'error');
                    return;
                }
                onLoadSnapshot(text);
            };
            reader.readAsText(file);
        },
        [onLoadSnapshot, toast]
    );

    return (
        <div className="screen save-load-screen anim-fade-in">
            <header className="screen-header">
                <button className="btn btn-icon" type="button" onClick={onBack} title="Back">
                    ◀
                </button>
                <h2>Save / Load</h2>
                <div className="statistics-nav">
                    <button className="btn btn-outline btn-sm" type="button" onClick={handleExportCurrent}>
                        Export Current
                    </button>
                    <label className="btn btn-outline btn-sm btn-file">
                        Import JSON
                        <input
                            type="file"
                            accept=".json,application/json"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const file = e.currentTarget.files?.[0];
                                if (file) handleImport(file);
                                e.currentTarget.value = '';
                            }}
                        />
                    </label>
                </div>
            </header>

            <div className="save-slots-grid">
                {slots.map((slot) => (
                    <div key={slot.index} className={`save-slot-card panel ${slot.isEmpty ? 'is-empty' : ''}`}>
                        <div className="save-slot-card__header">
                            <strong>Slot {slot.index + 1}</strong>
                            {slot.timestamp ? <span className="save-slot-card__time">{new Date(slot.timestamp).toLocaleString()}</span> : null}
                        </div>

                        {slot.preview ? (
                            <div className="save-slot-card__preview">
                                <div className="save-preview-item">💰 {slot.preview.money.toLocaleString()}</div>
                                <div className="save-preview-item">✈ {slot.preview.missionsCompleted} missions</div>
                                <div className="save-preview-item">🏆 {slot.preview.achievementsUnlocked} achievements</div>
                                <div className="save-preview-item">⏱ {formatPlayTime(slot.preview.playTimeSeconds)}</div>
                                <div className="save-preview-item">Highest Lv. {slot.preview.highestLevel}</div>
                            </div>
                        ) : (
                            <div className="save-slot-card__empty">Empty</div>
                        )}

                        <div className="save-slot-card__actions">
                            <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleSave(slot.index)}>
                                Save
                            </button>
                            <button className="btn btn-primary btn-sm" type="button" disabled={slot.isEmpty} onClick={() => handleLoad(slot.index)}>
                                Load
                            </button>
                            <button
                                className="btn btn-outline btn-sm"
                                type="button"
                                disabled={slot.isEmpty}
                                onClick={() => handleExportSlot(slot.index)}
                                title="Export"
                            >
                                📤
                            </button>
                            <button
                                className="btn btn-outline btn-sm"
                                type="button"
                                disabled={slot.isEmpty}
                                onClick={() => handleDelete(slot.index)}
                                title="Delete"
                            >
                                🗑
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="save-load-footer">
                <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => {
                        if (!window.confirm('Reset current progress? This clears the autosave.')) return;
                        onResetProgress();
                    }}
                >
                    Reset Progress
                </button>
            </div>
        </div>
    );
}

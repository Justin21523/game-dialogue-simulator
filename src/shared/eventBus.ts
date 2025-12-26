export type EventHandler<T> = (payload: T) => void;

export class EventBus {
    private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

    on<T>(event: string, handler: EventHandler<T>): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }

        set.add(handler as (payload: unknown) => void);
    }

    off<T>(event: string, handler: EventHandler<T>): void {
        const set = this.listeners.get(event);
        if (!set) return;
        set.delete(handler as (payload: unknown) => void);
        if (set.size === 0) {
            this.listeners.delete(event);
        }
    }

    emit<T>(event: string, payload: T): void {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const handler of set) {
            try {
                handler(payload);
            } catch (err) {
                console.warn(`[EventBus] handler failed for ${event}`, err);
            }
        }
    }

    clearAll(): void {
        this.listeners.clear();
    }
}

export const eventBus = new EventBus();


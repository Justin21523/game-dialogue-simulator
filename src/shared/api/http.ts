export type HttpError = {
    status: number;
    message: string;
    body?: unknown;
};

const DEFAULT_TIMEOUT_MS = 15000;
const BACKEND_UNAVAILABLE_COOLDOWN_MS = 5000;

export type BackendAvailability = 'unknown' | 'available' | 'unavailable';
let backendAvailability: BackendAvailability = 'unknown';
let backendUnavailableUntilMs = 0;
let backendProbePromise: Promise<boolean> | null = null;

export function getBackendAvailability(): BackendAvailability {
    return backendAvailability;
}

export function isOfflineBackendError(err: unknown): boolean {
    if (!err) return false;

    if (typeof err === 'object') {
        const maybe = err as Partial<HttpError> & { name?: unknown; message?: unknown };
        if (maybe.status === 0) return true;

        const name = typeof maybe.name === 'string' ? maybe.name : '';
        if (name === 'AbortError') return true;

        const message = typeof maybe.message === 'string' ? maybe.message : '';
        if (!message) return false;

        const lowered = message.toLowerCase();
        if (lowered.includes('failed to fetch')) return true;
        if (lowered.includes('networkerror')) return true;
        if (lowered.includes('err_connection_refused')) return true;
    }

    return false;
}

function getApiBase(): string {
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:8001/api/v1';
    return base.replace(/\/+$/, '');
}

function joinUrl(base: string, path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${normalizedPath}`;
}

async function parseJsonSafely(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function ensureBackendAvailable(timeoutMs: number): Promise<boolean> {
    const nowMs = Date.now();
    if (backendAvailability === 'available') return true;
    if (backendAvailability === 'unavailable' && backendUnavailableUntilMs > nowMs) return false;
    if (backendProbePromise) return backendProbePromise;

    backendProbePromise = (async () => {
        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

        try {
            const res = await fetch(joinUrl(getApiBase(), '/health'), {
                method: 'GET',
                signal: controller.signal
            });
            if (res.ok) {
                backendAvailability = 'available';
                backendUnavailableUntilMs = 0;
                return true;
            }
        } catch {
            // Ignore probe errors; requestJson will surface a user-friendly message.
        } finally {
            globalThis.clearTimeout(timeoutId);
        }

        backendAvailability = 'unavailable';
        backendUnavailableUntilMs = Date.now() + BACKEND_UNAVAILABLE_COOLDOWN_MS;
        return false;
    })();

    try {
        return await backendProbePromise;
    } finally {
        backendProbePromise = null;
    }
}

export async function getJson<T>(path: string, opts?: { timeoutMs?: number }): Promise<T> {
    return requestJson<T>(path, { method: 'GET' }, opts);
}

export async function postJson<T>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T> {
    return requestJson<T>(
        path,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        },
        opts
    );
}

export async function deleteJson<T>(path: string, opts?: { timeoutMs?: number }): Promise<T> {
    return requestJson<T>(path, { method: 'DELETE' }, opts);
}

async function requestJson<T>(path: string, init: RequestInit, opts?: { timeoutMs?: number }): Promise<T> {
    const nowMs = Date.now();
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (backendAvailability === 'unavailable' && backendUnavailableUntilMs > nowMs) {
        const error: HttpError = {
            status: 0,
            message: 'Backend unavailable. Start the FastAPI server or set VITE_API_BASE.',
            body: null
        };
        throw error;
    }

    if (backendAvailability !== 'available') {
        const ok = await ensureBackendAvailable(Math.min(timeoutMs, 2000));
        if (!ok) {
            const error: HttpError = {
                status: 0,
                message: 'Backend unavailable. Start the FastAPI server or set VITE_API_BASE.',
                body: null
            };
            throw error;
        }
    }

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
        let res: Response;
        try {
            res = await fetch(joinUrl(getApiBase(), path), {
                ...init,
                signal: controller.signal
            });
        } catch (err) {
            const isAbort = typeof err === 'object' && err && 'name' in err && (err as { name?: unknown }).name === 'AbortError';
            backendAvailability = 'unavailable';
            backendUnavailableUntilMs = Date.now() + BACKEND_UNAVAILABLE_COOLDOWN_MS;
            const message = isAbort ? 'Request timed out. Backend may be unavailable.' : 'Backend unavailable. Start the FastAPI server or set VITE_API_BASE.';
            const error: HttpError = { status: 0, message, body: err };
            throw error;
        }

        if (!res.ok) {
            const body = await parseJsonSafely(res);
            const message =
                typeof body === 'object' && body && 'detail' in (body as Record<string, unknown>)
                    ? String((body as Record<string, unknown>).detail)
                    : `Request failed (${res.status})`;

            const error: HttpError = { status: res.status, message, body };
            throw error;
        }

        backendAvailability = 'available';
        backendUnavailableUntilMs = 0;
        return (await res.json()) as T;
    } finally {
        globalThis.clearTimeout(timeoutId);
    }
}

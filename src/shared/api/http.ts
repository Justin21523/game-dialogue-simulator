export type HttpError = {
    status: number;
    message: string;
    body?: unknown;
};

const DEFAULT_TIMEOUT_MS = 15000;

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
    const controller = new AbortController();
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(joinUrl(getApiBase(), path), {
            ...init,
            signal: controller.signal
        });

        if (!res.ok) {
            const body = await parseJsonSafely(res);
            const message =
                typeof body === 'object' && body && 'detail' in (body as Record<string, unknown>)
                    ? String((body as Record<string, unknown>).detail)
                    : `Request failed (${res.status})`;

            const error: HttpError = { status: res.status, message, body };
            throw error;
        }

        return (await res.json()) as T;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

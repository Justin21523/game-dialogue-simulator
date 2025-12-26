import React from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastItem = {
    id: string;
    message: string;
    type: ToastType;
    durationMs: number;
};

type ToastContextValue = {
    show: (message: string, type?: ToastType, durationMs?: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

function createId(): string {
    return `t_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function ToastProvider(props: { children: React.ReactNode }) {
    const { children } = props;
    const [toasts, setToasts] = React.useState<ToastItem[]>([]);

    const show = React.useCallback((message: string, type: ToastType = 'info', durationMs = 4500) => {
        const id = createId();
        const item: ToastItem = { id, message, type, durationMs };
        setToasts((prev) => [...prev, item]);

        window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, durationMs);
    }, []);

    const value = React.useMemo(() => ({ show }), [show]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div id="toast-container">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.type} anim-slide-down`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = React.useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return ctx;
}

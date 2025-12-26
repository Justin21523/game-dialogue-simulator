import React from 'react';

export type ModalProps = {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
};

export function Modal(props: ModalProps) {
    const { open, title, onClose, children, footer } = props;
    if (!open) return null;

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button className="modal-close-btn" type="button" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer ? <div className="modal-footer">{footer}</div> : null}
            </div>
        </div>
    );
}


import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Arkasi bulaniklasan modal pencere; Esc ya da disari tiklama kapatir
export function Modal({ title, icon, children, footer, onClose, danger }: {
  title: string; icon?: ReactNode; children: ReactNode; footer: ReactNode; onClose: () => void; danger?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      // Modal acikken Delete/Ctrl+A gibi tuslar canvas'a ulasmasin; yazi alani ve dugme tuslari (Enter/Tab/Space) serbest
      const inField = (e.target as HTMLElement | null)?.closest?.('input, textarea');
      if (!inField && !['Enter', 'Tab', ' '].includes(e.key)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    // Yakalama asamasinda: canvas kisayollari (Esc ile secim kaldirma vb.) calismasin
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          {icon && <span className={`modal-icon ${danger ? 'danger' : ''}`}>{icon}</span>}
          <h2>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

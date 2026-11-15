import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import './ConfirmDialogContext.css';

const ConfirmDialogContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveDialogRef = useRef(null);

  const confirm = useCallback(options => new Promise(resolve => {
    if (resolveDialogRef.current) resolveDialogRef.current(false);
    resolveDialogRef.current = resolve;
    setDialog(options);
  }), []);

  const finishDialog = useCallback(confirmed => {
    const resolve = resolveDialogRef.current;
    resolveDialogRef.current = null;
    setDialog(null);
    resolve?.(confirmed);
  }, []);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <Modal
        isOpen={Boolean(dialog)}
        onClose={() => finishDialog(false)}
        title={dialog?.title || 'Confirmar ação'}
        size="sm"
        className="confirm-dialog"
      >
        <p className="confirm-dialog-message">{dialog?.message}</p>
        <div className="confirm-dialog-actions">
          <Button type="button" variant="secondary" autoFocus onClick={() => finishDialog(false)}>
            {dialog?.cancelLabel || 'Cancelar'}
          </Button>
          <Button
            type="button"
            variant={dialog?.variant || 'primary'}
            onClick={() => finishDialog(true)}
          >
            {dialog?.confirmLabel || 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmDialogContext);
  if (!confirm) {
    throw new Error('useConfirmDialog precisa ser usado dentro de ConfirmDialogProvider.');
  }
  return confirm;
}

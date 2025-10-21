import React from 'react';
import { Modal } from 'antd';

interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  allowMaskClose?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  allowMaskClose = false,
}) => {
  return (
          <Modal
        open={isOpen}
        title={title}
        onOk={onConfirm}
        onCancel={onCancel}
        okText={confirmText}
        cancelText={cancelText}
        centered
        maskClosable={allowMaskClose}
        aria-describedby="modal-description"
      >
        <div id="modal-description">{message}</div>
      </Modal>
  );
};

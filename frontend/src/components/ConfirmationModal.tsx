import { useEffect } from 'react';
import { Modal } from 'antd';

interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// MDC: Use only Ant Design components - replace all raw HTML, CSS classes, and custom styling with Ant Design equivalents.

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (isOpen) {
      const modal = Modal.confirm({
        title,
        content: message,
        okText: confirmText,
        cancelText: cancelText,
        onOk: () => {
          onConfirm();
          modal.destroy();
        },
        onCancel: () => {
          onCancel();
          modal.destroy();
        },
        centered: true,
        destroyOnClose: true,
      });

      return () => {
        modal.destroy();
      };
    }
  }, [isOpen]);

  return null;
};

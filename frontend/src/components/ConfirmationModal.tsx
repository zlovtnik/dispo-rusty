import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Yes',
  cancelText = 'No',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackgroundClick}
    >
      <div className="bg-white rounded-lg max-w-sm w-full p-6">
        {title && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
        )}
        <div className="mb-6">
          <p className="text-gray-700">{message}</p>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn bg-red-600 hover:bg-red-700 text-white btn"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

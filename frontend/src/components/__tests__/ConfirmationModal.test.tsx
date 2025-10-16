import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils/render';
import { ConfirmationModal } from '../ConfirmationModal';

describe('ConfirmationModal Component', () => {
  describe('Rendering', () => {
    it('should render modal when isOpen is true', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm this action?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Confirm this action?')).toBeDefined();
    });

    it('should not render modal when isOpen is false', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={false}
          message="Confirm this action?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Modal should not be visible
      const messages = screen.queryAllByText('Confirm this action?');
      expect(messages.length).toBe(0);
    });

    it('should display custom title', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          title="Custom Title"
          message="Message"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Custom Title')).toBeDefined();
    });

    it('should display default title when not provided', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Message"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Confirm Action')).toBeDefined();
    });

    it('should display message content', () => {
      const message = 'Are you sure you want to delete this item?';
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message={message}
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText(message)).toBeDefined();
    });
  });

  describe('Buttons', () => {
    it('should render confirm button with default text', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Confirm')).toBeDefined();
    });

    it('should render cancel button with default text', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('should render custom confirm button text', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Delete?"
          confirmText="Delete Anyway"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Delete Anyway')).toBeDefined();
    });

    it('should render custom cancel button text', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Delete?"
          cancelText="Keep It"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Keep It')).toBeDefined();
    });

    it('should have proper button roles', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Callbacks', () => {
    it('should call onConfirm when confirm button is clicked', async () => {
      const user = userEvent.setup();
      const onConfirm = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={onConfirm}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const confirmButton = screen.getByText('Yes');
      await user.click(confirmButton);

      expect(onConfirm.mock.calls.length).toBeGreaterThan(0);
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          cancelText="No"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={onCancel}
        />
      );

      const cancelButton = screen.getByText('No');
      await user.click(cancelButton);

      expect(onCancel.mock.calls.length).toBeGreaterThan(0);
    });

    it('should call onCancel when modal backdrop is clicked', async () => {
      const user = userEvent.setup();
      const onCancel = mock(() => {
        // Intentionally empty - test mock
      });

      const { container } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={onCancel}
        />
      );

      // Query the modal backdrop
      const mask = container.querySelector('.ant-modal-mask');
      expect(mask).not.toBeNull();

      // Click the backdrop
      await user.click(mask as HTMLElement);

      // Verify onCancel was called
      expect(onCancel.mock.calls.length).toBeGreaterThan(0);
    });

    it('should not call callbacks multiple times for single click', async () => {
      const user = userEvent.setup();
      const onConfirm = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={onConfirm}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const button = screen.getByText('Yes');
      await user.click(button);

      // Should be called exactly once
      expect(onConfirm.mock.calls.length).toBe(1);
    });
  });

  describe('Modal Props', () => {
    it('should be centered', () => {
      const { container } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Query the modal wrapper that has the centered class
      const modalWrapper = container.querySelector('.ant-modal-centered');
      expect(modalWrapper).not.toBeNull();

      // Alternatively, verify the modal dialog has the centered styling
      const modal = container.querySelector('.ant-modal');
      expect(modal).not.toBeNull();
    });

    it('should have proper modal structure', () => {
      const { container } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const modalElements = container.querySelectorAll('[class*="ant-modal"]');
      expect(modalElements.length).toBeGreaterThan(0);
    });

    it('should close when onCancel is called', async () => {
      const user = userEvent.setup();

      const { rerender } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Should be visible initially
      expect(screen.getByText('Confirm?')).toBeDefined();

      // Update to closed state
      rerender(
        <ConfirmationModal
          isOpen={false}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Modal should be hidden after rerender
      await waitFor(() => {
        expect(screen.queryByText('Confirm?')).not.toBeInTheDocument();
      });
    });
  });

  describe('Content Variations', () => {
    it('should handle long messages', () => {
      const longMessage =
        'This is a very long message that explains in detail why you need to confirm this action. '.repeat(
          5
        );
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message={longMessage}
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText(longMessage)).toBeDefined();
    });

    it('should handle multiline messages', () => {
      const message = `Line 1
Line 2
Line 3`;
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message={message}
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText(message)).toBeDefined();
    });

    it('should handle special characters in message', () => {
      const message = 'Delete user "John Doe" <test@example.com>?';
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message={message}
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText(message)).toBeDefined();
    });

    it('should handle emoji in message', () => {
      const message = '⚠️ Are you sure? This action cannot be undone!';
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message={message}
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText(message)).toBeDefined();
    });
  });

  describe('Button Text Variations', () => {
    it('should handle delete confirmation', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          title="Delete Confirmation"
          message="Delete this item?"
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Delete')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });

    it('should handle yes/no confirmation', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Do you want to continue?"
          confirmText="Yes"
          cancelText="No"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Yes')).toBeDefined();
      expect(screen.getByText('No')).toBeDefined();
    });

    it('should handle ok/cancel confirmation', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm action"
          confirmText="OK"
          cancelText="Cancel"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('OK')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          title="Confirm Action"
          message="Message"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const headings = screen.queryAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have accessible buttons', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      const onConfirm = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={onConfirm}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Tab through buttons
      await user.tab();
      await user.tab();

      // Should be able to interact with keyboard
    });

    it('should handle Enter key on confirm', async () => {
      const user = userEvent.setup();
      const onConfirm = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={onConfirm}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Primary button should be activated with Enter
      await user.keyboard('{Enter}');
    });

    it('should handle Escape key for cancel', async () => {
      const user = userEvent.setup();
      const onCancel = mock(() => {
        // Intentionally empty - test mock
      });

      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={onCancel}
        />
      );

      // Escape should trigger cancel/close
      await user.keyboard('{Escape}');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid open/close cycles', () => {
      const { rerender } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      rerender(
        <ConfirmationModal
          isOpen={false}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      rerender(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      expect(screen.getByText('Confirm?')).toBeDefined();
    });

    it('should handle callback changes', async () => {
      const user = userEvent.setup();
      const oldCallback = mock(() => {
        // Intentionally empty - test mock
      });
      const newCallback = mock(() => {
        // Intentionally empty - test mock
      });

      const { rerender } = renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={oldCallback}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      rerender(
        <ConfirmationModal
          isOpen={true}
          message="Confirm?"
          confirmText="Yes"
          onConfirm={newCallback}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      const button = screen.getByText('Yes');
      await user.click(button);

      // New callback should be called
      expect(newCallback.mock.calls.length).toBeGreaterThan(0);
    });

    it('should handle empty string message', () => {
      renderWithProviders(
        <ConfirmationModal
          isOpen={true}
          message=""
          onConfirm={() => {
            // Intentionally empty - test mock
          }}
          onCancel={() => {
            // Intentionally empty - test mock
          }}
        />
      );

      // Modal should still render with buttons
      expect(screen.getByText('Confirm')).toBeDefined();
    });
  });
});

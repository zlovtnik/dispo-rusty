// Common utility functions

export type AlertType = 'success' | 'error';

export class UIManager {
  static showAlert(message: string, type: AlertType = 'success'): () => void {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return () => {}; // No-op cleanup if container doesn't exist

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);

    // Auto-hide alert after 5 seconds
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      alertContainer.innerHTML = '';
    }, 5000);

    // Return cleanup function to cancel the timeout
    return () => {
      clearTimeout(timeoutId);
    };
  }

  static showSection(section: 'login' | 'signup' | 'addressBook'): void {
    // Get sections
    const loginSection = document.getElementById('loginSection');
    const signupSection = document.getElementById('signupSection');
    const addressBookSection = document.getElementById('addressBookSection');
    const userInfo = document.getElementById('userInfo');

    // Get navigation buttons
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const addressBookBtn = document.getElementById('addressBookBtn');

    if (!loginSection || !signupSection || !addressBookSection || 
        !loginBtn || !signupBtn || !addressBookBtn) {
      return;
    }

    // Hide all sections
    loginSection.classList.add('hidden');
    signupSection.classList.add('hidden');
    addressBookSection.classList.add('hidden');

    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    // Show selected section and activate button
    switch (section) {
      case 'login':
        loginSection.classList.remove('hidden');
        loginBtn.classList.add('active');
        break;
      case 'signup':
        signupSection.classList.remove('hidden');
        signupBtn.classList.add('active');
        break;
      case 'addressBook':
        addressBookSection.classList.remove('hidden');
        addressBookBtn.classList.add('active');
        if (userInfo) {
          userInfo.classList.remove('hidden');
        }
        break;
    }
  }

  static updateAuthUI(isAuthenticated: boolean, username?: string): void {
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const addressBookBtn = document.getElementById('addressBookBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const currentUsername = document.getElementById('currentUsername');

    if (!loginBtn || !signupBtn || !addressBookBtn || !logoutBtn) {
      return;
    }

    if (isAuthenticated) {
      // User is logged in
      loginBtn.classList.add('hidden');
      signupBtn.classList.add('hidden');
      addressBookBtn.classList.remove('hidden');
      logoutBtn.classList.remove('hidden');

      if (currentUsername && username) {
        currentUsername.textContent = username;
      }

      UIManager.showSection('addressBook');
    } else {
      // User is not logged in
      loginBtn.classList.remove('hidden');
      signupBtn.classList.remove('hidden');
      addressBookBtn.classList.add('hidden');
      logoutBtn.classList.add('hidden');

      UIManager.showSection('login');
    }
  }

  static clearContactsList(): void {
    const contactsList = document.getElementById('contactsList');
    if (contactsList) {
      contactsList.innerHTML = '';
    }
  }
}

export function getFormData(formElement: HTMLFormElement): Record<string, any> {
  const formData = new FormData(formElement);
  const result: Record<string, any> = {};
  
  for (const [key, value] of formData.entries()) {
    result[key] = value;
  }
  
  return result;
}

export function resetForm(formElement: HTMLFormElement): void {
  formElement.reset();
}

export async function confirmDelete(): Promise<boolean> {
  // Check if HTMLDialogElement is supported
  if (typeof HTMLDialogElement === 'function') {
    return new Promise<boolean>((resolve) => {
      // Create modal dialog
      const dialog = document.createElement('dialog');
      dialog.className = 'delete-confirm-dialog';
      dialog.innerHTML = `
        <div class="dialog-content">
          <h3>Delete Contact</h3>
          <p>Are you sure you want to delete this contact?</p>
          <div class="dialog-actions">
            <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
            <button class="btn btn-danger" id="confirm-btn">Delete</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      const confirmBtn = dialog.querySelector('#confirm-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;

      // Handle confirm
      const handleConfirm = () => {
        dialog.close();
        document.body.removeChild(dialog);
        resolve(true);
      };

      // Handle cancel
      const handleCancel = () => {
        dialog.close();
        document.body.removeChild(dialog);
        resolve(false);
      };

      // Handle escape key
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
          dialog.removeEventListener('keydown', handleEscape);
        }
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      dialog.addEventListener('keydown', handleEscape);

      // Focus management
      const previousFocus = document.activeElement as HTMLElement;
      confirmBtn.focus();
      dialog.addEventListener('close', () => {
        if (previousFocus && 'focus' in previousFocus) {
          previousFocus.focus();
        }
      });

      try {
        dialog.showModal();
      } catch (error) {
        console.error('Failed to show modal dialog:', error);
        // Clean up: remove dialog and event listeners
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.removeEventListener('keydown', handleEscape);
        dialog.removeEventListener('close', () => {
          if (previousFocus && 'focus' in previousFocus) {
            previousFocus.focus();
          }
        });
        document.body.removeChild(dialog);
        // Restore focus
        if (previousFocus && 'focus' in previousFocus) {
          previousFocus.focus();
        }
        resolve(false);
        return;
      }
    });
  } else {
    // Fallback to native confirm for unsupported environments
    return confirm('Are you sure you want to delete this contact?');
  }
}

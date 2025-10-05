// API utility functions for backend communication

const API_BASE_URL = window.PUBLIC_API_BASE_URL || window.location.origin + '/api';

/**
 * Decode a JWT's payload and validate its `exp` claim if present.
 *
 * @param {string} token - A JWT string composed of three base64url-encoded segments separated by dots.
 * @returns {Object|null} The parsed payload object if decoding succeeds and the token is not expired; `null` if the token is malformed or the `exp` claim indicates the token has expired.
 */
function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    const parsedPayload = JSON.parse(decoded);

    // Check expiry claim (exp is seconds since epoch)
    const nowSeconds = Date.now() / 1000;
    if (parsedPayload.exp !== undefined && parsedPayload.exp <= nowSeconds) {
      console.error('JWT token has expired');
      return null;
    }

    return parsedPayload;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}
/**
 * Perform an HTTP request against the configured API base URL, attaching a valid auth token when available and enforcing a request timeout.
 *
 * @param {string} endpoint - Path appended to the API base URL (should begin with `/`).
 * @param {object} [options] - Fetch options merged with defaults. Recognized fields:
 *   - {number} [timeout=30000] - Milliseconds before the request is aborted.
 *   - Any other fetch-init properties (method, headers, body, etc.) may be provided and will be merged.
 * @returns {*} The parsed response body: a JavaScript value for JSON responses or a string for non-JSON responses.
 * @throws {Error} If the request times out, the response is a non-OK HTTP status (error message is sanitized), or the fetch fails.
 */

async function makeRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const { timeout = 30000, ...otherOptions } = options;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(otherOptions.headers || {}),
    },
    ...otherOptions
  };

  // Add auth token if available and valid
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    try {
      // Decode and validate token
      const decodedPayload = decodeJwtPayload(authToken);
      if (decodedPayload && decodedPayload.exp) {
        // Valid token, attach header
        config.headers['Authorization'] = `Bearer ${authToken}`;
      } else {
        // Invalid/expired token, remove from localStorage
        console.warn('Invalid or expired token found in localStorage, removing');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        // Could trigger reauth flow here if needed
      }
    } catch (error) {
      // Malformed token, remove from localStorage
      console.error('Malformed token in localStorage:', error);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('current_user');
      // Could trigger reauth flow here if needed
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;

  try {
    const response = await fetch(url, config);

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = await response.text();
      }
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      // Log full response for debugging
      console.error('Backend error response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: data
      });

      // Sanitize error message for user display
      const sanitizeMessage = (msg) => {
        if (!msg || typeof msg !== 'string') return 'An error occurred';
        // Trim to avoid overly long messages
        const trimmed = msg.slice(0, 100);
        // Strip sensitive patterns
        const cleaned = trimmed.replace(/stack\s*trace|trace\b|sql\b|path\b/gi, '[REDACTED]');
        // If it's still dangerous, return generic
        if (trimmed.includes('password') || trimmed.includes('token')) {
          return 'An error occurred';
        }
        return cleaned;
      };

      let sanitizedMessage = `HTTP ${response.status}: ${response.statusText}`;
      if (data && typeof data === 'object') {
        const rawMessage = data.error_message || data.message || data.error;
        if (rawMessage) {
          sanitizedMessage = sanitizeMessage(rawMessage);
        }
      } else if (data) {
        sanitizedMessage = sanitizeMessage(String(data));
      }

      throw new Error(sanitizedMessage);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    console.error('Request failed:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testBackendConnectivity() {
  try {
    await makeRequest('/ping', { timeout: 5000 });
    return true;
  } catch (error) {
    console.error('Backend connectivity test failed:', error);
    return false;
  }
}

/**
 * Authenticate with the backend using the provided credentials and return the auth token and user info.
 * @param {Object} loginData - Login credentials (e.g., `{ username, password }`).
 * @returns {{ token: string, user: { username: string, email: undefined }}} An object containing the JWT `token` and a `user` object with `username`; `email` is `undefined` because the backend does not return it.
 * @throws {Error} If the response or response.data is missing, if the token is missing or not a non-empty string, if the token payload cannot be decoded or is expired, or if the decoded token does not contain user information.
 */
async function apiLogin(loginData) {
  const response = await makeRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });

  if (!response) {
    throw new Error('Missing response');
  }

  if (!response.data) {
    throw new Error('Missing data in response');
  }

  if (!response.data.token || typeof response.data.token !== 'string' || response.data.token.trim() === '') {
    throw new Error('Missing or invalid token');
  }

  const decodedPayload = decodeJwtPayload(response.data.token);
  if (!decodedPayload) {
    throw new Error('Invalid token');
  }

  if (!decodedPayload.user) {
    throw new Error('Unexpected response shape - missing user info');
  }

  const username = decodedPayload.user;
  return {
    token: response.data.token,
    user: {
      username,
      email: undefined // Backend doesn't provide email in response
    }
  };
}

/**
 * Create a new user account using the provided signup data.
 * @param {Object} signupData - User signup fields (e.g., `username`, `password`, and optional `email`).
 */
async function signup(signupData) {
  await makeRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(signupData)
  });
}

/**
 * Log out the current user by calling the backend logout endpoint.
 */
async function logout() {
  await makeRequest('/auth/logout', {
    method: 'POST'
  });
}

/**
 * Create a new contact in the backend address book.
 * @param {Object} contactData - Contact fields to send to the server (for example: name, age, gender, address, phone, email).
 */
async function addContact(contactData) {
  await makeRequest('/address-book', {
    method: 'POST',
    body: JSON.stringify(contactData)
  });
}

async function getContacts() {
  const response = await makeRequest('/address-book');

  if (response.data && Array.isArray(response.data)) {
    return response.data;
  } else {
    return [];
  }
}

async function deleteContact(contactId) {
  await makeRequest(`/address-book/${contactId}`, {
    method: 'DELETE'
  });
}

// Authentication utility functions

class AuthManager {
  static AUTH_TOKEN_KEY = 'auth_token';
  static CURRENT_USER_KEY = 'current_user';

  static getAuthToken() {
    try {
      return localStorage.getItem(AuthManager.AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      return null;
    }
  }

  static getCurrentUser() {
    try {
      return localStorage.getItem(AuthManager.CURRENT_USER_KEY);
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      return null;
    }
  }

  static setAuth(token, username) {
    try {
      localStorage.setItem(AuthManager.AUTH_TOKEN_KEY, token);
      localStorage.setItem(AuthManager.CURRENT_USER_KEY, username);
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }

  static clearAuth() {
    try {
      localStorage.removeItem(AuthManager.AUTH_TOKEN_KEY);
      localStorage.removeItem(AuthManager.CURRENT_USER_KEY);
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  static isAuthenticated() {
    return AuthManager.getAuthToken() !== null && AuthManager.getCurrentUser() !== null;
  }
}

// Common utility functions

class UIManager {
  static activeAlertTimeout = null;

  static showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return () => {}; // No-op cleanup if container doesn't exist

    // Clear any existing timeout
    if (UIManager.activeAlertTimeout !== null) {
      clearTimeout(UIManager.activeAlertTimeout);
      UIManager.activeAlertTimeout = null;
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);

    // Auto-hide alert after 5 seconds
    UIManager.activeAlertTimeout = setTimeout(() => {
      alertContainer.innerHTML = '';
      UIManager.activeAlertTimeout = null; // Clear reference after timeout
    }, 5000);

    // Return cleanup function to cancel the timeout
    return () => {
      if (UIManager.activeAlertTimeout !== null) {
        clearTimeout(UIManager.activeAlertTimeout);
        UIManager.activeAlertTimeout = null;
      }
    };
  }

  static showSection(section) {
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

  static updateAuthUI(isAuthenticated, username) {
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

  static clearContactsList() {
    const contactsList = document.getElementById('contactsList');
    if (contactsList) {
      contactsList.innerHTML = '';
    }
  }
}

function getFormData(formElement) {
  const formData = new FormData(formElement);
  const result = {};

  for (const [key, value] of formData.entries()) {
    result[key] = value;
  }

  return result;
}

/**
 * Reset the given form's fields to their initial values.
 * @param {HTMLFormElement} formElement - The form element to reset.
 */
function resetForm(formElement) {
  formElement.reset();
}

/**
 * Check whether a password meets the configured strength requirements.
 *
 * The rules are: at least 8 characters long, contains an uppercase letter,
 * contains a lowercase letter, contains a digit, and contains a special character.
 * @param {string} password - The password to validate.
 * @returns {boolean} `true` if the password satisfies all strength rules, `false` otherwise.
 */
function isStrongPassword(password) {
  // Configurable rules: min 8 chars, uppercase, lowercase, digit, special char
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return false;
  return true;
}

/**
 * Show a modal confirmation dialog asking the user to confirm deleting a contact.
 * @returns {Promise<boolean>} `true` if the user confirms deletion, `false` otherwise.
 */
async function confirmDelete() {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'confirmDeleteTitle');
    dialog.setAttribute('aria-describedby', 'confirmDeleteMessage');
    dialog.className = 'confirm-delete-dialog';
    dialog.innerHTML = `
      <div class="dialog-header">
        <h2 id="confirmDeleteTitle">Confirm Delete</h2>
      </div>
      <div class="dialog-body">
        <p id="confirmDeleteMessage">Are you sure you want to delete this contact?</p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary cancel-btn" autofocus>Cancel</button>
        <button type="button" class="btn btn-danger confirm-btn">Delete</button>
      </div>
    `;

    document.body.appendChild(dialog);

    function handleCancel() {
      dialog.close();
      document.body.removeChild(dialog);
      resolve(false);
    }

    function handleConfirm() {
      dialog.close();
      document.body.removeChild(dialog);
      resolve(true);
    }

    // Button event listeners
    const cancelBtn = dialog.querySelector('.cancel-btn');
    const confirmBtn = dialog.querySelector('.confirm-btn');
    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    // ESC key handling
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    });

    // Click outside dialog handling (overlay)
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        handleCancel();
      }
    });

    // Prevent closing via default methods
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      handleCancel();
    });

    dialog.showModal();
    // Focus management: autofocus on cancel button
  });
}

/**
 * Attempt to verify backend reachability, retrying up to three times with increasing delays.
 *
 * Retries testBackendConnectivity() up to three times (500ms, 1000ms, 2000ms) and returns on the first success.
 * If all attempts fail, the function throws an error.
 *
 * @throws {Error} If all retry attempts fail.
 */
async function testBackendConnectivityWithRetries() {
  const maxRetries = 3;
  const delays = [500, 1000, 2000]; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const isConnected = await testBackendConnectivity();
      if (isConnected) return; // Success
    } catch (error) {
      // Ignore and retry
    }
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
  throw new Error('All retry attempts failed');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
  setupEventListeners();
  updateUI();

  // Test backend connectivity with retries (runs asynchronously)
  testBackendConnectivityWithRetries().catch(() => {
    UIManager.showAlert('Warning: Cannot connect to backend server on port 8000. Make sure the Rust backend is running.', 'error');
  });
});

/**
 * Attach all UI event handlers for navigation, forms, contact loading, and contact deletion.
 *
 * Wires navigation buttons to section switches, binds login/signup/add-contact forms to their submit handlers,
 * connects the load contacts button to the loader, and sets up delegated click handling on the contacts list
 * to invoke contact deletion when a delete control is activated.
 */
function setupEventListeners() {
  // Navigation buttons
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const addressBookBtn = document.getElementById('addressBookBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  loginBtn?.addEventListener('click', () => UIManager.showSection('login'));
  signupBtn?.addEventListener('click', () => UIManager.showSection('signup'));
  addressBookBtn?.addEventListener('click', () => UIManager.showSection('addressBook'));
  logoutBtn?.addEventListener('click', handleLogout);

  // Forms
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const addContactForm = document.getElementById('addContactForm');

  loginForm?.addEventListener('submit', handleLogin);
  signupForm?.addEventListener('submit', handleSignup);
  addContactForm?.addEventListener('submit', handleAddContact);

  // Load contacts button
  const loadContactsBtn = document.getElementById('loadContactsBtn');
  loadContactsBtn?.addEventListener('click', loadContacts);

  // Event delegation for delete buttons
  const contactsList = document.getElementById('contactsList');
  contactsList?.addEventListener('click', function(e) {
    if (e.target && e.target.closest('.delete-contact-btn')) {
      const button = e.target.closest('.delete-contact-btn');
      const contactIdStr = button?.dataset.contactId;
      const contactId = parseInt(contactIdStr || '', 10);
      if (!isNaN(contactId)) {
        handleDeleteContact(contactId);
      }
    }
  });
}

function updateUI() {
  const isAuthenticated = AuthManager.isAuthenticated();
  const username = AuthManager.getCurrentUser();
  UIManager.updateAuthUI(isAuthenticated, username || undefined);
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const formData = getFormData(form);
    const loginData = {
      username_or_email: formData.username_or_email,
      password: formData.password
    };

    const authResponse = await apiLogin(loginData);
    AuthManager.setAuth(authResponse.token, authResponse.user.username);

    UIManager.showAlert('Login successful!', 'success');
    updateUI();
    resetForm(form);
  } catch (error) {
    UIManager.showAlert('Login failed: ' + error.message, 'error');
  }
}

/**
 * Handle the signup form submission by validating input, sending signup data, and updating the UI.
 *
 * Validates that the password and confirmation match and that the password meets strength requirements,
 * calls the signup API with username, email, and password, shows success or error alerts, navigates to
 * the login section on success, and resets the form.
 *
 * @param {Event} event - The submit event from the signup form; the function reads form values from event.target.
 */
async function handleSignup(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const formData = getFormData(form);

    // Validate password confirmation
    if (formData.password !== formData.confirm_password) {
      UIManager.showAlert('Passwords do not match. Please try again.', 'error');
      return;
    }

    // Validate password strength
    if (!isStrongPassword(formData.password)) {
      UIManager.showAlert('Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one digit, and one special character.', 'error');
      return;
    }

    const signupData = {
      username: formData.username,
      email: formData.email,
      password: formData.password
    };

    await signup(signupData);
    UIManager.showAlert('Signup successful! Please login.', 'success');
    UIManager.showSection('login');
    resetForm(form);
  } catch (error) {
    UIManager.showAlert('Signup failed: ' + error.message, 'error');
  }
}

/**
 * Log the user out from the backend and clear local authentication state and UI.
 *
 * Attempts to perform a server-side logout, clears stored auth credentials, updates the UI to the unauthenticated state, and clears the contacts list. If the logout request fails, displays an error alert.
 */
async function handleLogout() {
  try {
    await logout();
    AuthManager.clearAuth();
    updateUI();
    UIManager.clearContactsList();
  } catch (error) {
    UIManager.showAlert('Logout request failed: ' + (error.message || String(error)), 'error');
  }
}

/**
 * Handle the add-contact form submission by validating input, sending the contact to the backend, and updating the UI.
 *
 * @param {Event} event - Submit event from the add-contact form; the form element is expected as `event.target`.
 */
async function handleAddContact(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const formData = getFormData(form);
    const age = parseInt(formData.age);
    if (Number.isNaN(age) || age <= 0 || !Number.isInteger(+formData.age)) {
      UIManager.showAlert('Please enter a valid age (must be a positive integer greater than zero).', 'error');
      return;
    }

    const contactData = {
      name: formData.name,
      gender: formData.gender,
      age: age,
      address: formData.address,
      phone: formData.phone,
      email: formData.email
    };

    await addContact(contactData);
    UIManager.showAlert('Contact added successfully!', 'success');
    resetForm(form);
    loadContacts();
  } catch (error) {
    UIManager.showAlert('Failed to add contact: ' + error.message, 'error');
  }
}

async function loadContacts() {
  try {
    const contacts = await getContacts();
    displayContacts(contacts);
  } catch (error) {
    UIManager.showAlert('Failed to load contacts: ' + error.message, 'error');
    const contactsList = document.getElementById('contactsList');
    if (contactsList) {
      contactsList.innerHTML = '<p>Failed to load contacts.</p>';
    }
  }
}

/**
 * Render a list of contact entries into the DOM element with id "contactsList".
 *
 * Clears any existing content, shows a placeholder message when the list is empty,
 * and for each contact renders name, age, gender, address, phone, email, and a delete button.
 *
 * @param {Array<Object>} contacts - Array of contact objects to render.
 *   Each contact should include: `id`, `name`, `age`, `gender`, `address`, `phone`, and `email`.
 */
function displayContacts(contacts) {
  const contactsList = document.getElementById('contactsList');
  if (!contactsList) return;

  contactsList.innerHTML = '';

  if (contacts.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No contacts found. Add your first contact above!';
    contactsList.appendChild(p);
    return;
  }

  contacts.forEach(contact => {
    const addressItem = document.createElement('div');
    addressItem.className = 'address-item';

    const nameHeader = document.createElement('h4');
    nameHeader.textContent = contact.name;
    addressItem.appendChild(nameHeader);

    const detailsPara = document.createElement('p');
    const ageStrong = document.createElement('strong');
    ageStrong.textContent = 'Age: ';
    detailsPara.appendChild(ageStrong);
    detailsPara.appendChild(document.createTextNode(contact.age.toString()));
    detailsPara.appendChild(document.createTextNode(' | '));
    const genderStrong = document.createElement('strong');
    genderStrong.textContent = 'Gender: ';
    detailsPara.appendChild(genderStrong);
    detailsPara.appendChild(document.createTextNode(contact.gender));
    addressItem.appendChild(detailsPara);

    const addressPara = document.createElement('p');
    const addressStrong = document.createElement('strong');
    addressStrong.textContent = 'Address: ';
    addressPara.appendChild(addressStrong);
    addressPara.appendChild(document.createTextNode(contact.address));
    addressItem.appendChild(addressPara);

    const phonePara = document.createElement('p');
    const phoneStrong = document.createElement('strong');
    phoneStrong.textContent = 'Phone: ';
    phonePara.appendChild(phoneStrong);
    phonePara.appendChild(document.createTextNode(contact.phone));
    addressItem.appendChild(phonePara);

    const emailPara = document.createElement('p');
    const emailStrong = document.createElement('strong');
    emailStrong.textContent = 'Email: ';
    emailPara.appendChild(emailStrong);
    emailPara.appendChild(document.createTextNode(contact.email));
    addressItem.appendChild(emailPara);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger delete-contact-btn';
    deleteBtn.setAttribute('data-contact-id', contact.id.toString());
    deleteBtn.textContent = 'Delete';
    actionsDiv.appendChild(deleteBtn);

    addressItem.appendChild(actionsDiv);
    contactsList.appendChild(addressItem);
  });
}

async function handleDeleteContact(contactId) {
  if (!(await confirmDelete())) {
    return;
  }

  try {
    await deleteContact(contactId);
    UIManager.showAlert('Contact deleted successfully!', 'success');
    loadContacts();
  } catch (error) {
    UIManager.showAlert('Failed to delete contact: ' + error.message, 'error');
  }
}
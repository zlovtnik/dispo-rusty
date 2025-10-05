// API utility functions for backend communication

const API_BASE_URL = 'http://localhost:8000/api'; // Use hard-coded for client

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

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

  // Add auth token if available
  const authToken = localStorage.getItem('auth_token');
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
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
      let errorMessage;
      if (data && typeof data === 'object') {
        errorMessage = data.error_message || data.message || data.error || `HTTP ${response.status}: ${response.statusText}`;
      } else {
        errorMessage = String(data || `HTTP ${response.status}: ${response.statusText}`);
      }
      throw new Error(errorMessage);
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

async function apiLogin(loginData) {
  const response = await makeRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(loginData)
  });

  if (response.data && response.data.token) {
    const decodedPayload = decodeJwtPayload(response.data.token);
    const username = decodedPayload?.user || 'unknown';
    return {
      token: response.data.token,
      user: {
        username,
        email: undefined // Backend doesn't provide email in response
      }
    };
  } else {
    throw new Error('Invalid response format');
  }
}

async function signup(signupData) {
  await makeRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(signupData)
  });
}

async function logout() {
  await makeRequest('/auth/logout', {
    method: 'POST'
  });
  AuthManager.clearAuth();
}

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
  static showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return () => {}; // No-op cleanup if container doesn't exist

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);

    // Auto-hide alert after 5 seconds
    const timeoutId = setTimeout(() => {
      alertContainer.innerHTML = '';
    }, 5000);

    // Return cleanup function to cancel the timeout
    return () => {
      clearTimeout(timeoutId);
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

function resetForm(formElement) {
  formElement.reset();
}

async function confirmDelete() {
  // Fallback to native confirm for simplicity
  return confirm('Are you sure you want to delete this contact?');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
  setupEventListeners();
  updateUI();

  // Test backend connectivity
  const isConnected = await testBackendConnectivity();
  if (!isConnected) {
    UIManager.showAlert('Warning: Cannot connect to backend server on port 8000. Make sure the Rust backend is running.', 'error');
  }
});

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

async function handleLogout() {
  try {
    await logout();
  } catch (error) {
    UIManager.showAlert('Logout request failed: ' + (error.message || String(error)), 'error');
  } finally {
    AuthManager.clearAuth();
    updateUI();
    UIManager.clearContactsList();
  }
}

async function handleAddContact(event) {
  event.preventDefault();
  const form = event.target;

  try {
    const formData = getFormData(form);
    const age = parseInt(formData.age);
    if (Number.isNaN(age) || age < 0) {
      UIManager.showAlert('Please enter a valid age (must be a positive number).', 'error');
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
    detailsPara.innerHTML = '<strong>Age:</strong> <span class="age"></span> | <strong>Gender:</strong> <span class="gender"></span>';
    const ageSpan = detailsPara.querySelector('.age');
    if (ageSpan) ageSpan.textContent = contact.age.toString();
    const genderSpan = detailsPara.querySelector('.gender');
    if (genderSpan) genderSpan.textContent = contact.gender;
    addressItem.appendChild(detailsPara);

    const addressPara = document.createElement('p');
    addressPara.innerHTML = '<strong>Address:</strong> ';
    const addressText = document.createTextNode(contact.address);
    addressPara.appendChild(addressText);
    addressItem.appendChild(addressPara);

    const phonePara = document.createElement('p');
    phonePara.innerHTML = '<strong>Phone:</strong> ';
    const phoneText = document.createTextNode(contact.phone);
    phonePara.appendChild(phoneText);
    addressItem.appendChild(phonePara);

    const emailPara = document.createElement('p');
    emailPara.innerHTML = '<strong>Email:</strong> ';
    const emailText = document.createTextNode(contact.email);
    emailPara.appendChild(emailText);
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

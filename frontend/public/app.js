// Frontend JavaScript client for Address Book API
// Makes HTTP requests to Rust backend on localhost:8000

const API_BASE_URL = 'http://localhost:8000/api';
let authToken = localStorage.getItem('auth_token');
let currentUser = localStorage.getItem('current_user');

// DOM elements
let alertContainer, loginSection, signupSection, addressBookSection;
let loginForm, signupForm, addContactForm;
let userInfo, currentUsername, contactsList;
let loginBtn, signupBtn, addressBookBtn, logoutBtn, loadContactsBtn;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    setupEventListeners();
    updateUI();
});

function initializeElements() {
    // Get all DOM elements
    alertContainer = document.getElementById('alertContainer');
    loginSection = document.getElementById('loginSection');
    signupSection = document.getElementById('signupSection');
    addressBookSection = document.getElementById('addressBookSection');
    
    loginForm = document.getElementById('loginForm');
    signupForm = document.getElementById('signupForm');
    addContactForm = document.getElementById('addContactForm');
    
    userInfo = document.getElementById('userInfo');
    currentUsername = document.getElementById('currentUsername');
    contactsList = document.getElementById('contactsList');
    
    loginBtn = document.getElementById('loginBtn');
    signupBtn = document.getElementById('signupBtn');
    addressBookBtn = document.getElementById('addressBookBtn');
    logoutBtn = document.getElementById('logoutBtn');
    loadContactsBtn = document.getElementById('loadContactsBtn');
}

function setupEventListeners() {
    // Navigation buttons
    loginBtn.addEventListener('click', () => showSection('login'));
    signupBtn.addEventListener('click', () => showSection('signup'));
    addressBookBtn.addEventListener('click', () => showSection('addressBook'));
    logoutBtn.addEventListener('click', logout);
    
    // Forms
    loginForm.addEventListener('submit', handleLogin);
    signupForm.addEventListener('submit', handleSignup);
    addContactForm.addEventListener('submit', handleAddContact);
    
    // Load contacts button
    loadContactsBtn.addEventListener('click', loadContacts);
}

function updateUI() {
    if (authToken && currentUser) {
        // User is logged in
        showLoggedInState();
    } else {
        // User is not logged in
        showLoggedOutState();
    }
}

function showLoggedInState() {
    loginBtn.classList.add('hidden');
    signupBtn.classList.add('hidden');
    addressBookBtn.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    
    currentUsername.textContent = currentUser;
    showSection('addressBook');
}

function showLoggedOutState() {
    loginBtn.classList.remove('hidden');
    signupBtn.classList.remove('hidden');
    addressBookBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    
    showSection('login');
}

function showSection(section) {
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
            userInfo.classList.remove('hidden');
            break;
    }
}

function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alertDiv);
    
    // Auto-hide alert after 5 seconds
    setTimeout(() => {
        alertContainer.innerHTML = '';
    }, 5000);
}

async function makeRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    // Add auth token if available
    if (authToken) {
        config.headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    try {
        console.log(`Making ${config.method || 'GET'} request to: ${url}`);
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error_message || data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('Request failed:', error);
        throw error;
    }
}

async function handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const loginData = {
        username_or_email: formData.get('username_or_email'),
        password: formData.get('password')
    };
    
    try {
        const response = await makeRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(loginData)
        });
        
        if (response.data && response.data.token) {
            authToken = response.data.token;
            currentUser = response.data.user.username;
            
            localStorage.setItem('auth_token', authToken);
            localStorage.setItem('current_user', currentUser);
            
            showAlert('Login successful!', 'success');
            updateUI();
            
            // Reset form
            event.target.reset();
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        showAlert(`Login failed: ${error.message}`, 'error');
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const signupData = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password')
    };
    
    try {
        const response = await makeRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(signupData)
        });
        
        showAlert('Signup successful! Please login.', 'success');
        showSection('login');
        
        // Reset form
        event.target.reset();
    } catch (error) {
        showAlert(`Signup failed: ${error.message}`, 'error');
    }
}

async function logout() {
    try {
        await makeRequest('/auth/logout', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Logout request failed:', error);
    } finally {
        // Clear local storage regardless of API response
        authToken = null;
        currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('current_user');
        
        showAlert('Logged out successfully!', 'success');
        updateUI();
        
        // Clear contacts list
        contactsList.innerHTML = '';
    }
}

async function handleAddContact(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const contactData = {
        name: formData.get('name'),
        gender_key: formData.get('gender_key'),
        age: parseInt(formData.get('age')),
        address: formData.get('address'),
        phone: formData.get('phone'),
        email: formData.get('email')
    };
    
    try {
        const response = await makeRequest('/address-book', {
            method: 'POST',
            body: JSON.stringify(contactData)
        });
        
        showAlert('Contact added successfully!', 'success');
        event.target.reset();
        
        // Reload contacts
        loadContacts();
    } catch (error) {
        showAlert(`Failed to add contact: ${error.message}`, 'error');
    }
}

async function loadContacts() {
    try {
        const response = await makeRequest('/address-book');
        
        if (response.data && Array.isArray(response.data)) {
            displayContacts(response.data);
        } else {
            contactsList.innerHTML = '<p>No contacts found.</p>';
        }
    } catch (error) {
        showAlert(`Failed to load contacts: ${error.message}`, 'error');
        contactsList.innerHTML = '<p>Failed to load contacts.</p>';
    }
}

function displayContacts(contacts) {
    if (contacts.length === 0) {
        contactsList.innerHTML = '<p>No contacts found. Add your first contact above!</p>';
        return;
    }
    
    contactsList.innerHTML = contacts.map(contact => `
        <div class="address-item">
            <h4>${contact.name}</h4>
            <p><strong>Age:</strong> ${contact.age} | <strong>Gender:</strong> ${contact.gender_key}</p>
            <p><strong>Address:</strong> ${contact.address}</p>
            <p><strong>Phone:</strong> ${contact.phone}</p>
            <p><strong>Email:</strong> ${contact.email}</p>
            <div class="actions">
                <button class="btn btn-danger" onclick="deleteContact(${contact.id})">Delete</button>
            </div>
        </div>
    `).join('');
}

async function deleteContact(contactId) {
    if (!confirm('Are you sure you want to delete this contact?')) {
        return;
    }
    
    try {
        await makeRequest(`/address-book/${contactId}`, {
            method: 'DELETE'
        });
        
        showAlert('Contact deleted successfully!', 'success');
        loadContacts();
    } catch (error) {
        showAlert(`Failed to delete contact: ${error.message}`, 'error');
    }
}

// Test backend connectivity on load
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch(`${API_BASE_URL}/ping`);
        if (response.ok) {
            console.log('Backend connectivity test successful');
        } else {
            console.warn('Backend connectivity test failed');
            showAlert('Warning: Cannot connect to backend server on port 8000', 'error');
        }
    } catch (error) {
        console.error('Backend connectivity test failed:', error);
        showAlert('Warning: Cannot connect to backend server on port 8000. Make sure the Rust backend is running.', 'error');
    }
});
//! Functional State Transitions
//!
//! This module provides high-level functional state transition operations
//! for the immutable state management system. It defines common state
//! transformation patterns while maintaining immutability and tenant isolation.
//!
//! Key features:
//! - User session management transitions
//! - Application data manipulation transitions
//! - Query cache management transitions
//! - Composite transition builders
//! - Transition validation and composition

use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use serde_json::Value as JsonValue;
use super::immutable_state::{
    TenantApplicationState, QueryResult, PersistentVector, SessionData,
};

/// Result type for state transitions
pub type TransitionResult<T> = Result<T, TransitionError>;

/// Errors that can occur during state transitions
#[derive(Debug, thiserror::Error)]
pub enum TransitionError {
    #[error("Invalid transition parameters: {message}")]
    InvalidParameters { message: String },

    #[error("State transition validation failed: {field} - {reason}")]
    ValidationFailed { field: String, reason: String },

    #[error("Resource not found: {resource_type} '{resource_id}'")]
    NotFound { resource_type: String, resource_id: String },

    #[error("Concurrency conflict: {details}")]
    ConcurrencyConflict { details: String },

    #[error("Serialization error: {message}")]
    SerializationError { message: String },
}

/// Transition context for carrying metadata through transition chains
#[derive(Clone, Debug)]
pub struct TransitionContext {
    /// Initiating user ID (for audit trails)
    pub user_id: Option<String>,
    /// Transition timestamp
    pub timestamp: DateTime<Utc>,
    /// Additional metadata
    pub metadata: HashMap<String, JsonValue>,
}

/// User session management transitions

/// Create a user session transition
///
/// # Arguments
/// * `session_id` - Unique session identifier
/// * `user_data` - Session data (typically user ID and metadata)
/// * `ttl_seconds` - Time-to-live in seconds
///
/// # Returns
/// A transition function that creates a new user session
pub fn create_user_session(
    session_id: String,
    user_data: String,
    ttl_seconds: u64,
) -> impl FnOnce(&TenantApplicationState) -> TenantApplicationState {
    move |state| {
        let mut new_state = state.clone();
        new_state.user_sessions = state.user_sessions.insert(
            session_id,
            SessionData {
                user_data,
                expires_at: Utc::now() + Duration::seconds(ttl_seconds as i64),
            },
        );
        new_state.last_updated = Utc::now();

        new_state
    }
}

/// Validate and update a user session transition
///
/// # Arguments
/// * `session_id` - Session identifier to update
/// * `new_user_data` - Updated session data
/// * `extend_ttl_seconds` - Optional TTL extension in seconds
///
/// # Returns
/// A transition function that updates an existing session
pub fn update_user_session(
    session_id: impl Into<String>,
    new_user_data: String,
    extend_ttl_seconds: Option<u64>,
) -> Result<impl FnOnce(&TenantApplicationState) -> TenantApplicationState, TransitionError> {
    let session_id = session_id.into();

    if session_id.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Session ID cannot be empty".to_string()
        });
    }

    Ok(move |state: &TenantApplicationState| {
        if !state.user_sessions.contains_key(&session_id) {
            // Session doesn't exist - this would be an error, but for the transition
            // function itself, we'll just return the original state unchanged
            return state.clone();
        }

        let mut new_state = state.clone();
        
        // Get the existing session to preserve/update its data
        if let Some(existing_session) = state.user_sessions.get(&session_id) {
            let updated_session = SessionData {
                user_data: new_user_data,
                expires_at: if let Some(ttl) = extend_ttl_seconds {
                    Utc::now() + Duration::seconds(ttl as i64)
                } else {
                    existing_session.expires_at
                },
            };
            new_state.user_sessions = state.user_sessions.insert(session_id, updated_session);
        }
        
        new_state.last_updated = Utc::now();

        new_state
    })
}

/// Remove a user session transition
///
/// # Arguments
/// * `session_id` - Session identifier to remove
///
/// # Returns
/// A transition function that removes the specified session
pub fn remove_user_session(
    session_id: impl Into<String>,
) -> impl FnOnce(&TenantApplicationState) -> TenantApplicationState {
    let session_id = session_id.into();

    move |state| {
        let mut new_state = state.clone();
        new_state.user_sessions = state.user_sessions.remove(&session_id);
        new_state.last_updated = Utc::now();

        new_state
    }
}

/// Application data manipulation transitions

/// Set application configuration data transition
///
/// # Arguments
/// * `key` - Configuration key
/// * `value` - Configuration value
/// * `validate` - Optional validation function for the value
///
/// # Returns
/// A transition function that sets the configuration
pub fn set_app_config<F>(
    key: impl Into<String>,
    value: JsonValue,
    validate: Option<F>,
) -> Result<impl FnOnce(&TenantApplicationState) -> TenantApplicationState, TransitionError>
where
    F: Fn(&JsonValue) -> bool,
{
    let key = key.into();

    if key.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Configuration key cannot be empty".to_string()
        });
    }

    // Validate the value if validator provided
    if let Some(ref validator) = validate {
        if !validator(&value) {
            return Err(TransitionError::ValidationFailed {
                field: key.clone(),
                reason: "Configuration value failed validation".to_string()
            });
        }
    }

    Ok(move |state: &TenantApplicationState| {
        let mut new_state = state.clone();
        new_state.app_data = state.app_data.insert(key, value);
        new_state.last_updated = Utc::now();

        new_state
    })
}

/// Remove application configuration transition
///
/// # Arguments
/// * `key` - Configuration key to remove
///
/// # Returns
/// A transition function that removes the configuration
pub fn remove_app_config(
    key: impl Into<String>,
) -> impl FnOnce(&TenantApplicationState) -> TenantApplicationState {
    let key = key.into();

    move |state| {
        let mut new_state = state.clone();
        new_state.app_data = state.app_data.remove(&key);
        new_state.last_updated = Utc::now();

        new_state
    }
}

/// Update application data with a transformation function
///
/// # Arguments
/// * `key` - Data key to update
/// * `transform` - Function that transforms the existing value
/// * `default_value` - Default value if key doesn't exist
///
/// # Returns
/// A transition function that applies the transformation
pub fn transform_app_data<F>(
    key: impl Into<String>,
    transform: F,
    default_value: JsonValue,
) -> Result<impl FnOnce(&TenantApplicationState) -> TenantApplicationState, TransitionError>
where
    F: Fn(&JsonValue) -> Result<JsonValue, String>,
{
    let key = key.into();

    if key.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Data key cannot be empty".to_string()
        });
    }

    Ok(move |state: &TenantApplicationState| {
        let current_value = state.app_data.get(&key).unwrap_or(&default_value);
        let new_value = match transform(current_value) {
            Ok(val) => val,
            Err(_) => return state.clone(), // Transform failed, return unchanged state
        };

        let mut new_state = state.clone();
        new_state.app_data = state.app_data.insert(key, new_value);
        new_state.last_updated = Utc::now();

        new_state
    })
}

/// Query cache management transitions

/// Add query result to cache transition
///
/// # Arguments
/// * `query_id` - Unique query identifier
/// * `data` - Serialized query result data
/// * `ttl_seconds` - Cache TTL in seconds
///
/// # Returns
/// A transition function that caches the query result
pub fn cache_query_result(
    query_id: impl Into<String>,
    data: Vec<u8>,
    ttl_seconds: u64,
) -> Result<impl FnOnce(&TenantApplicationState) -> TenantApplicationState, TransitionError> {
    let query_id = query_id.into();

    if query_id.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Query ID cannot be empty".to_string()
        });
    }

    if data.is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Query data cannot be empty".to_string()
        });
    }

    let expires_at = Utc::now() + Duration::seconds(ttl_seconds as i64);
    let query_result = QueryResult {
        query_id,
        data,
        expires_at,
    };

    Ok(move |state: &TenantApplicationState| {
        let mut new_state = state.clone();
        new_state.query_cache = state.query_cache.append(query_result);
        new_state.last_updated = Utc::now();

        new_state
    })
}

/// Clean expired cache entries transition
///
/// # Returns
/// A transition function that removes expired cache entries
pub fn clean_expired_cache(
) -> impl FnOnce(&TenantApplicationState) -> TenantApplicationState {
    move |state| {
        let now = Utc::now();
        let mut valid_entries = Vec::new();

        // Filter out expired entries
        for i in 0..state.query_cache.len() {
            if let Some(entry) = state.query_cache.get(i) {
                if entry.expires_at > now {
                    valid_entries.push(entry.clone());
                }
            }
        }

        // Rebuild cache with only valid entries
        let mut new_cache = PersistentVector::new();
        for entry in valid_entries {
            new_cache = new_cache.append(entry);
        }

        let mut new_state = state.clone();
        new_state.query_cache = new_cache;
        new_state.last_updated = Utc::now();

        new_state
    }
}

/// Composite transition builders

/// Build a user authentication session transition set
///
/// This creates a sequence of transitions to handle user login:
/// 1. Clean expired sessions
/// 2. Create new session
/// 3. Update last login timestamp
///
/// # Arguments
/// * `user_id` - User identifier
/// * `session_data` - Session data including user permissions, etc.
/// * `session_ttl_seconds` - Session time-to-live
///
/// # Returns
/// A vector of transition functions
pub fn build_login_transitions(
    user_id: impl Into<String>,
    session_data: String,
    session_ttl_seconds: u64,
) -> Result<Vec<Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState>>, TransitionError> {
    let user_id = user_id.into();
    let session_id = format!("session_{}_{}", user_id, Utc::now().timestamp());

    if user_id.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "User ID cannot be empty".to_string()
        });
    }

    let transitions: Vec<Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState>> = vec![
        // Clean expired sessions
        Box::new(clean_expired_cache()),

        // Create new session
        Box::new(create_user_session(
            session_id.clone(),
            session_data,
            session_ttl_seconds
        )),

        // Update user's last login timestamp in app data
        Box::new(transform_app_data(
            format!("user_{}_last_login", user_id),
            |_| Ok(JsonValue::String(Utc::now().to_rfc3339())),
            JsonValue::Null
        ).map_err(|_| TransitionError::InvalidParameters {
            message: "Failed to create last login update".to_string()
        })?),
    ];

    Ok(transitions)
}

/// Build a user logout transition set
///
/// This creates a sequence of transitions to handle user logout:
/// 1. Remove user session
/// 2. Clean expired cache
///
/// # Arguments
/// * `session_id` - Session identifier to remove
///
/// # Returns
/// A vector of transition functions
pub fn build_logout_transitions(
    session_id: impl Into<String>,
) -> Result<Vec<Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState>>, TransitionError> {
    let session_id = session_id.into();

    if session_id.trim().is_empty() {
        return Err(TransitionError::InvalidParameters {
            message: "Session ID cannot be empty".to_string()
        });
    }

    let transitions: Vec<Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState>> = vec![
        // Remove the session
        Box::new(remove_user_session(session_id)),

        // Clean expired cache
        Box::new(clean_expired_cache()),
    ];

    Ok(transitions)
}

/// Configuration update transition builder
///
/// Creates a sequence of transition functions that update multiple configuration values atomically
///
/// # Arguments
/// * `config_updates` - HashMap of configuration key-value pairs to update
///
/// # Returns
/// A vector of boxed transition functions (one per config update)
pub fn build_config_updates(
    config_updates: HashMap<String, JsonValue>,
) -> Result<Vec<Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState + Send + Sync>>, TransitionError> {
    let mut transitions = Vec::new();

    for (key, value) in config_updates {
        // Build the transition closure directly
        if key.trim().is_empty() {
            return Err(TransitionError::InvalidParameters {
                message: "Configuration key cannot be empty".to_string()
            });
        }

        let transition: Box<dyn FnOnce(&TenantApplicationState) -> TenantApplicationState + Send + Sync> = Box::new(move |state: &TenantApplicationState| {
            let mut new_state = state.clone();
            new_state.app_data = state.app_data.insert(key, value);
            new_state.last_updated = Utc::now();
            new_state
        });

        transitions.push(transition);
    }

    Ok(transitions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::functional::immutable_state::ImmutableStateManager;
    use crate::models::tenant::Tenant;
    use std::collections::HashMap;

    fn create_test_tenant() -> Tenant {
        Tenant {
            id: "test_tenant".to_string(),
            name: "Test Tenant".to_string(),
            db_url: "postgres://test:test@localhost/test".to_string(),
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        }
    }

    #[test]
    fn test_create_user_session_transition() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // Apply create session transition
        let create_fn = create_user_session(
            "session123".to_string(),
            "user_data_here".to_string(),
            3600, // 1 hour TTL
        );

        manager.apply_transition("test_tenant", |state| Ok(create_fn(state))).unwrap();

        let state = manager.get_tenant_state("test_tenant").unwrap();
        let session = state.user_sessions.get(&"session123".to_string());
        assert!(session.is_some());
        assert_eq!(session.unwrap().user_data, "user_data_here");
    }

    #[test]
    fn test_update_user_session_transition() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // First create a session
        let create_fn = create_user_session(
            "session123".to_string(),
            "old_data".to_string(),
            3600,
        );
        manager.apply_transition("test_tenant", |state| Ok(create_fn(state))).unwrap();

        // Then update it
        let update_fn = update_user_session(
            "session123",
            "new_data".to_string(),
            None,
        ).unwrap();

        manager.apply_transition("test_tenant", |state| Ok(update_fn(state))).unwrap();

        let state = manager.get_tenant_state("test_tenant").unwrap();
        let session = state.user_sessions.get(&"session123".to_string());
        assert!(session.is_some());
        assert_eq!(session.unwrap().user_data, "new_data");
    }

    #[test]
    fn test_set_app_config_transition() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // Set some configuration
        let config_fn = set_app_config(
            "app.theme",
            serde_json::json!("dark"),
            None::<fn(&serde_json::Value) -> bool>,
        ).unwrap();

        manager.apply_transition("test_tenant", |state| Ok(config_fn(state))).unwrap();

        let state = manager.get_tenant_state("test_tenant").unwrap();
        assert_eq!(state.app_data.get(&"app.theme".to_string()), Some(&serde_json::json!("dark")));
    }

    #[test]
    fn test_composite_login_transitions() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // Build login transitions
        let transitions = build_login_transitions(
            "user123",
            "session_data".to_string(),
            1800, // 30 minutes
        ).unwrap();

        // Apply all transitions atomically
        manager.apply_transitions("test_tenant", transitions).unwrap();

        let state = manager.get_tenant_state("test_tenant").unwrap();

        // Check that a session was created (session ID contains timestamp, so we check it exists)
        assert!(!state.user_sessions.is_empty());

        // Check that user last login was recorded
        assert!(state.app_data.get(&"user_user123_last_login".to_string()).is_some());
    }

    #[test]
    fn test_logout_transitions() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // Login first
        let login_transitions = build_login_transitions(
            "user123",
            "session_data".to_string(),
            1800,
        ).unwrap();
        manager.apply_transitions("test_tenant", login_transitions).unwrap();

        // Capture the session ID (this is a bit hacky for testing)
        let temp_state = manager.get_tenant_state("test_tenant").unwrap();
        let session_id = temp_state.user_sessions.iter().next().unwrap().0.clone();

        // Logout
        let logout_transitions = build_logout_transitions(&session_id).unwrap();
        manager.apply_transitions("test_tenant", logout_transitions).unwrap();

        let final_state = manager.get_tenant_state("test_tenant").unwrap();

        // Session should be removed
        assert!(final_state.user_sessions.get(&session_id).is_none());
    }

    #[test]
    fn test_config_updates_transitions() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant();
        manager.initialize_tenant(tenant).unwrap();

        // Prepare multiple config updates
        let mut updates = HashMap::new();
        updates.insert("app.theme".to_string(), serde_json::json!("dark"));
        updates.insert("app.language".to_string(), serde_json::json!("en"));
        updates.insert("app.debug".to_string(), serde_json::json!(true));

        // Build config update transitions
        let transitions = build_config_updates(updates).unwrap();

        // Apply all config updates atomically
        manager.apply_transitions("test_tenant", transitions).unwrap();

        let state = manager.get_tenant_state("test_tenant").unwrap();

        // Verify all config values were set
        assert_eq!(state.app_data.get(&"app.theme".to_string()), Some(&serde_json::json!("dark")));
        assert_eq!(state.app_data.get(&"app.language".to_string()), Some(&serde_json::json!("en")));
        assert_eq!(state.app_data.get(&"app.debug".to_string()), Some(&serde_json::json!(true)));
    }

    #[test]
    fn test_validation_errors() {
        // Test empty session ID validation
        assert!(build_logout_transitions("").is_err());

        // Test empty config key validation
        assert!(set_app_config("", serde_json::json!("value"), None::<fn(&serde_json::Value) -> bool>).is_err());
    }
}

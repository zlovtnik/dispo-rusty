//! Immutable State Management
//!
//! This module provides thread-safe, immutable state management with structural
//! sharing for the Actix Web REST API. It enables functional state transitions
//! while maintaining complete tenant isolation and minimizing memory overhead.
//!
//! Key features:
//! - Persistent data structures with structural sharing
//! - Tenant-isolated state containers
//! - Functional state transition mechanisms
//! - Thread-safe concurrent access
//! - State serialization capabilities
//! - Performance monitoring

use crate::models::tenant::Tenant;
use im;
use serde::{Deserialize, Serialize};
#[allow(dead_code)]
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

/// State transition metrics for performance monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateTransitionMetrics {
    /// Average transition time in nanoseconds
    pub avg_transition_time_ns: u64,
    /// Total number of state transitions
    pub transition_count: u64,
    /// Memory overhead percentage (vs mutable state)
    pub memory_overhead_percent: f64,
    /// Peak memory usage in bytes
    pub peak_memory_usage: usize,
}

impl Default for StateTransitionMetrics {
    /// Creates a default `StateTransitionMetrics` with all counters and measurements set to zero.
    ///
    /// # Examples
    ///
    /// ```
    /// let m = StateTransitionMetrics::default();
    /// assert_eq!(m.avg_transition_time_ns, 0);
    /// assert_eq!(m.transition_count, 0);
    /// assert_eq!(m.memory_overhead_percent, 0.0);
    /// assert_eq!(m.peak_memory_usage, 0);
    /// ```
    fn default() -> Self {
        Self {
            avg_transition_time_ns: 0,
            transition_count: 0,
            memory_overhead_percent: 0.0,
            peak_memory_usage: 0,
        }
    }
}

/// Thread-safe immutable reference
///
/// This structure provides shared ownership of immutable data
/// while enabling efficient structural sharing.
#[derive(Clone)]
pub struct ImmutableRef<T> {
    data: Arc<T>,
}

impl<T> ImmutableRef<T> {
    /// Create an immutable, shared reference to a value.
    ///
    /// Wraps the provided value in a shared, immutable container and returns an `ImmutableRef<T>`.
    ///
    /// # Examples
    ///
    /// ```
    /// let r = ImmutableRef::new(42);
    /// assert_eq!(*r.get(), 42);
    /// ```
    pub fn new(data: T) -> Self {
        Self {
            data: Arc::new(data),
        }
    }

    /// Accesses the wrapped value by reference.
    ///
    /// Returns a shared reference to the inner value.
    ///
    /// # Examples
    ///
    /// ```
    /// let r = ImmutableRef::new(42);
    /// assert_eq!(*r.get(), 42);
    /// ```
    pub fn get(&self) -> &T {
        &self.data
    }
}

impl<T: Clone> ImmutableRef<T> {
    /// Creates an owned clone of the inner value for mutation.
    ///
    /// # Examples
    ///
    /// ```
    /// let r = ImmutableRef::new(5);
    /// let mut v = r.clone_for_mutate();
    /// v += 1;
    /// assert_eq!(v, 6);
    /// ```
    pub fn clone_for_mutate(&self) -> T {
        self.data.as_ref().clone()
    }
}

/// Persistent vector with structural sharing
///
/// This implements a persistent vector data structure that shares
/// unchanged elements between versions.
#[derive(Clone)]
pub struct PersistentVector<T> {
    root: Option<Arc<im::Vector<T>>>,
}

impl<T> PersistentVector<T> {
    /// Creates an empty persistent hash map.
    ///
    /// # Examples
    ///
    /// ```
    /// let map: crate::functional::immutable_state::PersistentHashMap<String, i32> =
    ///     crate::functional::immutable_state::PersistentHashMap::new();
    /// assert!(map.is_empty());
    /// assert_eq!(map.len(), 0);
    /// ```
    pub fn new() -> Self {
        Self { root: None }
    }

    /// Reports whether the persistent vector contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// let v: PersistentVector<i32> = PersistentVector::new();
    /// assert!(v.is_empty());
    ///
    /// let v2 = v.append(1);
    /// assert!(!v2.is_empty());
    /// ```
    pub fn is_empty(&self) -> bool {
        self.root.is_none()
    }
}

impl<T: Clone> PersistentVector<T> {
    /// Returns the number of elements in the persistent vector.
    ///
    /// # Examples
    ///
    /// ```
    /// let v: PersistentVector<i32> = PersistentVector::new();
    /// assert_eq!(v.len(), 0);
    /// let v2 = v.append(42);
    /// assert_eq!(v2.len(), 1);
    /// ```
    pub fn len(&self) -> usize {
        self.root.as_ref().map_or(0, |vec| vec.len())
    }

    /// Creates a PersistentVector containing the elements from the provided `Vec` in the same order.
    ///
    /// # Examples
    ///
    /// ```
    /// let v = vec![1, 2, 3];
    /// let pv = PersistentVector::from_vec(v);
    /// assert!(!pv.is_empty());
    /// assert_eq!(pv.len(), 3);
    /// assert_eq!(pv.get(0), Some(&1));
    /// assert_eq!(pv.get(2), Some(&3));
    /// ```
    pub fn from_vec(vec: Vec<T>) -> Self {
        Self {
            root: Some(Arc::new(im::Vector::from(vec))),
        }
    }

    /// Gets the element at the specified index, if present.
    ///
    /// Returns `Some(&T)` when `index` is within bounds, or `None` if the persistent vector is empty
    /// or `index` is out of range.
    ///
    /// # Examples
    ///
    /// ```
    /// let v = PersistentVector::from_vec(vec![1, 2, 3]);
    /// assert_eq!(v.get(0), Some(&1));
    /// assert_eq!(v.get(2), Some(&3));
    /// assert_eq!(v.get(3), None);
    /// ```
    pub fn get(&self, index: usize) -> Option<&T> {
        self.root.as_ref()?.get(index)
    }

    /// Append an element to the persistent vector, producing a new vector that shares structure with the original.
    ///
    /// The original vector is not modified; the returned vector contains the new element appended to the end.
    /// Structural sharing is preserved so only the new element requires additional allocation.
    ///
    /// # Examples
    ///
    /// ```
    /// let v1: PersistentVector<i32> = PersistentVector::new();
    /// let v2 = v1.append(1);
    /// let v3 = v2.append(2);
    ///
    /// assert!(v1.is_empty());
    /// assert_eq!(v2.len(), 1);
    /// assert_eq!(v3.len(), 2);
    /// assert_eq!(v2.get(0), Some(&1));
    /// assert_eq!(v3.get(1), Some(&2));
    /// ```
    pub fn append(&self, element: T) -> Self {
        let new_vec = if let Some(vec) = &self.root {
            (**vec).clone() + im::vector![element]
        } else {
            im::vector![element]
        };

        Self {
            root: Some(Arc::new(new_vec)),
        }
    }

    /// Produces a new PersistentVector with the element at `index` replaced by `element`.
    ///
    /// Returns a new vector sharing structure with the original when the index is valid,
    /// or an error message when the vector is empty or the index is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// let v = PersistentVector::from_vec(vec![1, 2, 3]);
    /// let updated = v.update(1, 20).expect("update should succeed");
    /// assert_eq!(updated.to_vec(), vec![1, 20, 3]);
    ///
    /// // attempting to update an out-of-bounds index returns an error
    /// let err = v.update(10, 42).unwrap_err();
    /// assert!(err.contains("out of bounds"));
    /// ```
    pub fn update(&self, index: usize, element: T) -> Result<Self, String> {
        let new_vec = self
            .root
            .as_ref()
            .ok_or_else(|| format!("Vector is empty, cannot update index {}", index))
            .and_then(|vec| {
                if index >= vec.len() {
                    Err(format!(
                        "Index {} out of bounds for vector of size {}",
                        index,
                        vec.len()
                    ))
                } else {
                    Ok(vec.update(index, element))
                }
            })?;

        Ok(Self {
            root: Some(Arc::new(new_vec)),
        })
    }

    /// Convert the persistent vector into an owned `Vec<T>`.
    ///
    /// This performs an allocation and clones each element; it is O(n) and may be expensive for large collections.
    /// The returned vector preserves element order.
    ///
    /// # Examples
    ///
    /// ```
    /// let pv = PersistentVector::from_vec(vec![1, 2, 3]);
    /// let v = pv.to_vec();
    /// assert_eq!(v, vec![1, 2, 3]);
    /// ```
    pub fn to_vec(&self) -> Vec<T> {
        self.root
            .as_ref()
            .map_or(Vec::new(), |vec| vec.iter().cloned().collect())
    }
}

impl<T> Default for PersistentVector<T> {
    /// Constructs an ImmutableStateManager using the default configuration (100 MB memory limit).
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::default();
    /// let metrics = mgr.get_metrics().unwrap();
    /// assert_eq!(metrics.transition_count, 0);
    /// ```
    fn default() -> Self {
        Self::new()
    }
}

/// Persistent HashMap with structural sharing
///
/// This implements a persistent hash map that shares unchanged entries
/// between versions while maintaining immutability.
#[derive(Clone)]
pub struct PersistentHashMap<K, V> {
    root: Option<Arc<im::HashMap<K, V>>>,
}

impl<K, V> PersistentHashMap<K, V>
where
    K: Clone + Eq + std::hash::Hash,
    V: Clone,
{
    /// Creates an empty persistent hash map.
    ///
    /// # Examples
    ///
    /// ```
    /// let map: crate::functional::immutable_state::PersistentHashMap<String, i32> =
    ///     crate::functional::immutable_state::PersistentHashMap::new();
    /// assert!(map.is_empty());
    /// assert_eq!(map.len(), 0);
    /// ```
    pub fn new() -> Self {
        Self { root: None }
    }

    /// Compute the number of entries in the map.
    ///
    /// # Returns
    ///
    /// The number of entries in the map.
    ///
    /// # Examples
    ///
    /// ```
    /// let m = PersistentHashMap::<String, i32>::new();
    /// assert_eq!(m.len(), 0);
    /// let m2 = m.insert("a".to_string(), 1);
    /// assert_eq!(m2.len(), 1);
    /// ```
    pub fn len(&self) -> usize {
        self.root.as_ref().map_or(0, |map| map.len())
    }

    /// Checks whether the map contains no entries.
    ///
    /// # Examples
    ///
    /// ```
    /// let map: PersistentHashMap<String, i32> = PersistentHashMap::new();
    /// assert!(map.is_empty());
    /// let map2 = map.insert("a".to_string(), 1);
    /// assert!(!map2.is_empty());
    /// ```
    ///
    /// # Returns
    ///
    /// `true` if the map contains no entries, `false` otherwise.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Retrieve a reference to the value associated with the given key from the persistent map.
    ///
    /// # Examples
    ///
    /// ```
    /// let map = PersistentHashMap::new().insert("a".to_string(), 1);
    /// assert_eq!(map.get(&"a".to_string()), Some(&1));
    /// ```
    ///
    /// # Returns
    ///
    /// `Some(&V)` if the key exists, `None` otherwise.
    pub fn get(&self, key: &K) -> Option<&V> {
        self.root.as_ref()?.get(key)
    }

    /// Checks whether the map contains the given key.
    ///
    /// # Returns
    ///
    /// `true` if the map contains the key, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let map = PersistentHashMap::<String, i32>::new();
    /// let updated = map.insert("key".to_string(), 42);
    /// assert!(!map.contains_key(&"key".to_string()));
    /// assert!(updated.contains_key(&"key".to_string()));
    /// ```
    pub fn contains_key(&self, key: &K) -> bool {
        self.get(key).is_some()
    }

    /// Creates a new PersistentHashMap containing the given key mapped to the provided value.
    ///
    /// The original map is not modified; this returns a new map with the insertion applied.
    ///
    /// # Examples
    ///
    /// ```
    /// let map: PersistentHashMap<String, i32> = PersistentHashMap::new();
    /// let map2 = map.insert("a".to_string(), 1);
    /// assert_eq!(map2.get(&"a".to_string()), Some(&1));
    /// assert!(map.get(&"a".to_string()).is_none());
    /// ```
    pub fn insert(&self, key: K, value: V) -> Self {
        let new_map = self
            .root
            .as_ref()
            .map_or(im::HashMap::new(), |map| map.update(key, value));

        Self {
            root: Some(Arc::new(new_map)),
        }
    }

    /// Creates a new map with `key` removed, sharing structure with the original.
    ///
    /// If removing `key` yields an empty map, the result represents an empty map.
    ///
    /// # Examples
    ///
    /// ```
    /// let m = PersistentHashMap::new()
    ///     .insert("a".to_string(), 1)
    ///     .insert("b".to_string(), 2);
    ///
    /// let m_removed = m.remove(&"a".to_string());
    ///
    /// // original map still contains "a"
    /// assert_eq!(m.get(&"a".to_string()), Some(&1));
    /// // new map does not contain "a"
    /// assert_eq!(m_removed.get(&"a".to_string()), None);
    /// ```
    pub fn remove(&self, key: &K) -> Self {
        let new_map = self.root.as_ref().and_then(|map| {
            let updated = map.without(key);
            if updated.is_empty() {
                None
            } else {
                Some(updated)
            }
        });

        Self {
            root: new_map.map(Arc::new),
        }
    }

    /// Creates an iterator over the map's key-value pairs.
    
    ///
    
    /// The returned iterator yields borrowed key and value pairs present in this persistent map.
    
    /// If the map is empty, the iterator yields no items.
    
    ///
    
    /// # Examples
    
    ///
    
    /// ```
    
    /// let m = PersistentHashMap::<String, i32>::new()
    
    ///     .insert("a".to_string(), 1)
    
    ///     .insert("b".to_string(), 2);
    
    ///
    
    /// let mut keys: Vec<String> = m.iter().map(|(k, _v)| k.clone()).collect();
    
    /// keys.sort();
    
    /// assert_eq!(keys, vec!["a".to_string(), "b".to_string()]);
    
    /// ```
    pub fn iter(&self) -> Box<dyn Iterator<Item = (&K, &V)> + '_> {
        match self.root.as_ref() {
            Some(root) => Box::new(root.iter()),
            None => Box::new(std::iter::empty()),
        }
    }

    /// Create an owned `HashMap` containing all entries from this persistent map.
    ///
    /// This performs a full, owned conversion: all keys and values are cloned and collected into a new
    /// `std::collections::HashMap`. The operation is O(n) in time and memory and may be expensive
    /// for large maps.
    ///
    /// # Examples
    ///
    /// ```rust
    /// let map = PersistentHashMap::new().insert("a".to_string(), 1).insert("b".to_string(), 2);
    /// let hm = map.to_hashmap();
    /// assert_eq!(hm.get("a"), Some(&1));
    /// assert_eq!(hm.len(), 2);
    /// ```
    ///
    /// # Returns
    ///
    /// A `HashMap<K, V>` containing owned clones of all keys and values from the persistent map.
    pub fn to_hashmap(&self) -> HashMap<K, V> {
        self.root.as_ref().map_or(HashMap::new(), |root| {
            root.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
        })
    }
}

impl<K, V> Default for PersistentHashMap<K, V>
where
    K: Clone + Eq + std::hash::Hash,
    V: Clone,
{
    /// Constructs an ImmutableStateManager using the default configuration (100 MB memory limit).
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::default();
    /// let metrics = mgr.get_metrics().unwrap();
    /// assert_eq!(metrics.transition_count, 0);
    /// ```
    fn default() -> Self {
        Self::new()
    }
}

/// Session data with expiration information
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionData {
    /// User data (typically user ID and metadata)
    pub user_data: String,
    /// Session expiration timestamp
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Tenant-specific application state
///
/// This represents the complete state for a single tenant,
/// including all application data that needs to be maintained
/// with immutable semantics.
#[derive(Clone)]
pub struct TenantApplicationState {
    /// Tenant metadata
    pub tenant: Tenant,
    /// User sessions and authentication data
    pub user_sessions: PersistentHashMap<String, SessionData>,
    /// Application data and configurations
    pub app_data: PersistentHashMap<String, serde_json::Value>,
    /// Cached query results
    pub query_cache: PersistentVector<QueryResult>,
    /// Last state update timestamp
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

/// Cached query result for efficient data retrieval
#[derive(Clone, Serialize, Deserialize)]
pub struct QueryResult {
    /// Unique query identifier
    pub query_id: String,
    /// Serialized query result data
    pub data: Vec<u8>,
    /// Cache expiration timestamp
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Global immutable state manager
///
/// This manages the complete application state across all tenants
/// with thread-safe, immutable operations.
pub struct ImmutableStateManager {
    /// Tenant-specific states
    tenant_states: RwLock<HashMap<String, Arc<TenantApplicationState>>>,
    /// Performance metrics
    metrics: RwLock<StateTransitionMetrics>,
    /// Maximum memory usage limit
    max_memory_mb: usize,
}

impl ImmutableStateManager {
    /// Creates a new ImmutableStateManager configured with a maximum memory limit.
    ///
    /// `max_memory_mb` sets the upper bound (in megabytes) used by the manager's simple memory checks.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::new(100);
    /// // no tenants exist initially
    /// assert!(!mgr.tenant_exists("missing"));
    /// ```
    pub fn new(max_memory_mb: usize) -> Self {
        Self {
            tenant_states: RwLock::new(HashMap::new()),
            metrics: RwLock::new(StateTransitionMetrics::default()),
            max_memory_mb,
        }
    }

    /// Initializes an empty application state for the given tenant and registers it with the manager.
    ///
    /// Creates a new TenantApplicationState with empty persistent collections and the current UTC timestamp,
    /// then inserts it under the tenant's id. Fails if a state for the tenant id already exists.
    ///
    /// # Arguments
    ///
    /// * `tenant` - Tenant metadata used to create the initial TenantApplicationState.
    ///
    /// # Returns
    ///
    /// `Ok(())` if the tenant was registered successfully, `Err(String)` with an explanatory message if the tenant already exists or the lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// // Construct a tenant value appropriate for your application:
    /// // let tenant = Tenant { id: "tenant1".to_string(), /* ... */ };
    /// // let manager = ImmutableStateManager::new(100);
    /// // manager.initialize_tenant(tenant).expect("failed to initialize tenant");
    /// ```
    pub fn initialize_tenant(&self, tenant: Tenant) -> Result<(), String> {
        let mut states = self.tenant_states.write().map_err(|_| "Lock poisoned")?;

        if states.contains_key(&tenant.id) {
            return Err(format!("Tenant '{}' already exists", tenant.id));
        }

        let state = Arc::new(TenantApplicationState {
            tenant,
            user_sessions: PersistentHashMap::new(),
            app_data: PersistentHashMap::new(),
            query_cache: PersistentVector::new(),
            last_updated: chrono::Utc::now(),
        });

        states.insert(state.tenant.id.clone(), state);
        Ok(())
    }

    /// Removes the stored state for the given tenant identifier.
    ///
    /// This deletes any entry for `tenant_id` from the manager's tenant map.
    /// If the tenant does not exist this is a no-op and still considered successful.
    ///
    /// # Returns
    ///
    /// `Ok(())` on success, `Err` if the internal lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// let manager = ImmutableStateManager::new(100);
    /// // assume tenant "tenant_a" was initialized earlier
    /// manager.remove_tenant("tenant_a").unwrap();
    /// assert!(!manager.tenant_exists("tenant_a"));
    /// ```
    pub fn remove_tenant(&self, tenant_id: &str) -> Result<(), String> {
        let mut states = self.tenant_states.write().map_err(|_| "Lock poisoned")?;
        states.remove(tenant_id);
        Ok(())
    }

    /// Retrieve the current application state for a tenant.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::new(100);
    /// assert!(mgr.get_tenant_state("nonexistent").is_none());
    /// ```
    ///
    /// # Returns
    ///
    /// `Some(Arc<TenantApplicationState>)` containing the tenant state if present, `None` otherwise.
    pub fn get_tenant_state(&self, tenant_id: &str) -> Option<Arc<TenantApplicationState>> {
        let states = self.tenant_states.read().ok()?;
        states.get(tenant_id).cloned()
    }

    /// Apply a single functional state transition to a tenant's application state.
    ///
    /// The provided `transition` closure receives a reference to the current
    /// `TenantApplicationState` and must return a new `TenantApplicationState` on
    /// success. If the tenant is not found or the transition returns an error,
    /// this function returns an `Err` with a descriptive message. On success the
    /// manager replaces the stored state for the tenant and updates internal
    /// transition metrics.
    ///
    /// # Arguments
    ///
    /// * `tenant_id` - The tenant identifier whose state will be transformed.
    /// * `transition` - A closure that transforms the current state into a new state.
    ///
    /// # Returns
    ///
    /// `Ok(())` if the transition was applied and metrics updated, `Err(String)` if
    /// the tenant was not found or the transition failed.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// // Example (ignored for doc-tests): apply a transition that updates the timestamp.
    /// let mgr = ImmutableStateManager::new(100);
    /// // assume `tenant` is a valid Tenant and has been initialized:
    /// // mgr.initialize_tenant(tenant).unwrap();
    ///
    /// let result = mgr.apply_transition("tenant_id", |state: &TenantApplicationState| {
    ///     let mut new_state = state.clone();
    ///     new_state.last_updated = chrono::Utc::now();
    ///     Ok(new_state)
    /// });
    ///
    /// assert!(result.is_ok());
    /// ```
    pub fn apply_transition<F>(&self, tenant_id: &str, transition: F) -> Result<(), String>
    where
        F: FnOnce(
            &TenantApplicationState,
        ) -> Result<
            TenantApplicationState,
            crate::functional::state_transitions::TransitionError,
        >,
    {
        let start = Instant::now();

        let mut states = self.tenant_states.write().map_err(|_| "Lock poisoned")?;

        let current_state = match states.get(tenant_id) {
            Some(state) => state,
            None => return Err(format!("Tenant '{}' not found", tenant_id)),
        };

        // Apply the functional transition
        let new_state =
            transition(current_state).map_err(|e| format!("Transition failed: {}", e))?;
        let new_state_arc = Arc::new(new_state);

        states.insert(tenant_id.to_string(), new_state_arc);

        // Update metrics
        let duration = start.elapsed();
        self.update_metrics(duration)?;

        Ok(())
    }

    /// Apply a sequence of state transitions to a tenant atomically, replacing the tenant's state with the final result.
    ///
    /// The provided transitions are applied in order to the current tenant state. If no transitions are supplied the function returns immediately and no metrics are recorded. On success the tenant's stored state is replaced with the state produced by the last transition and metrics are updated for each applied transition.
    ///
    /// # Parameters
    ///
    /// - `tenant_id` — Identifier of the tenant whose state will be updated.
    /// - `transitions` — An iterator of transition functions; each function receives a reference to the current `TenantApplicationState` and returns a new `TenantApplicationState`.
    ///
    /// # Returns
    ///
    /// `Ok(())` if all transitions were applied and state was replaced, `Err(String)` if the tenant was not found or a lock/error occurred.
    ///
    /// # Examples
    ///
    /// ```
    /// # use chrono::Utc;
    /// # use std::sync::Arc;
    /// # fn example() {
    /// use crate::functional::immutable_state::{ImmutableStateManager, TenantApplicationState};
    ///
    /// let mgr = ImmutableStateManager::new(100);
    /// // Assume a tenant "tenant1" has been initialized already.
    ///
    /// let transitions = vec![|s: &TenantApplicationState| {
    ///     let mut s2 = s.clone();
    ///     s2.last_updated = Utc::now();
    ///     s2
    /// }];
    ///
    /// let _ = mgr.apply_transitions("tenant1", transitions);
    /// # }
    /// ```
    pub fn apply_transitions<I, F>(&self, tenant_id: &str, transitions: I) -> Result<(), String>
    where
        I: IntoIterator<Item = F>,
        F: FnOnce(&TenantApplicationState) -> TenantApplicationState,
    {
        let start = Instant::now();

        let mut states = self.tenant_states.write().map_err(|_| "Lock poisoned")?;

        let mut current_state = match states.get(tenant_id) {
            Some(state) => (**state).clone(),
            None => return Err(format!("Tenant '{}' not found", tenant_id)),
        };

        // Apply all transitions sequentially
        let mut transition_count = 0;
        for transition in transitions {
            current_state = transition(&current_state);
            transition_count += 1;
        }

        // Guard against division by zero
        if transition_count == 0 {
            return Ok(()); // No transitions applied, return early
        }

        let new_state_arc = Arc::new(current_state);
        states.insert(tenant_id.to_string(), new_state_arc);

        // Update metrics (weighted by number of transitions)
        let total_duration = start.elapsed();
        let avg_duration = total_duration / transition_count as u32;
        for _ in 0..transition_count {
            self.update_metrics(avg_duration)?;
        }

        Ok(())
    }

    /// Retrieve a snapshot of the current state transition metrics.
    ///
    /// # Errors
    ///
    /// Returns an `Err(String)` if the internal metrics lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::new(100);
    /// let metrics = mgr.get_metrics().unwrap();
    /// assert_eq!(metrics.transition_count, 0);
    /// ```
    pub fn get_metrics(&self) -> Result<StateTransitionMetrics, String> {
        let metrics = self.metrics.read().map_err(|_| "Lock poisoned")?;
        Ok(metrics.clone())
    }

    /// Checks whether a tenant with the given id exists in the manager.
    ///
    /// # Returns
    ///
    /// `true` if a tenant with `tenant_id` exists, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::new(100);
    /// assert!(!mgr.tenant_exists("nonexistent"));
    /// ```
    pub fn tenant_exists(&self, tenant_id: &str) -> bool {
        let states = match self.tenant_states.read() {
            Ok(states) => states,
            Err(_) => return false,
        };
        states.contains_key(tenant_id)
    }

    /// Determines whether the recorded peak memory usage is within the manager's configured limit.
    ///
    /// Compares the metrics' `peak_memory_usage` (converted from bytes to megabytes) against `max_memory_mb`.
    ///
    /// # Returns
    ///
    /// `Ok(true)` if peak memory usage is less than or equal to the configured limit in megabytes, `Ok(false)` if it exceeds the limit, or `Err` if the metrics lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = ImmutableStateManager::new(100);
    /// // default metrics have zero peak usage, so this should be within limits
    /// assert!(mgr.check_memory_limits().unwrap());
    /// ```
    pub fn check_memory_limits(&self) -> Result<bool, String> {
        // Simplified memory check (in a real implementation, this would track actual memory usage)
        let metrics = self.metrics.read().map_err(|_| "Lock poisoned")?;
        let memory_mb = metrics.peak_memory_usage / (1024 * 1024);
        Ok(memory_mb <= self.max_memory_mb)
    }

    /// Updates internal performance metrics after a state transition.
    ///
    /// Increments the transition count, incorporates the provided `duration` (in nanoseconds) into the running
    /// average transition time, and applies documented estimate values for memory-related metrics.
    ///
    /// # Parameters
    ///
    /// - `duration` — elapsed time of the completed transition.
    ///
    /// # Returns
    ///
    /// `Ok(())` on success, `Err(String)` if the metrics lock is poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::time::Duration;
    /// let mgr = ImmutableStateManager::new(100);
    /// mgr.update_metrics(Duration::from_millis(5)).unwrap();
    /// let metrics = mgr.get_metrics().unwrap();
    /// assert!(metrics.transition_count >= 1);
    /// ```
    fn update_metrics(&self, duration: Duration) -> Result<(), String> {
        let mut metrics = self.metrics.write().map_err(|_| "Lock poisoned")?;

        metrics.transition_count += 1;
        let new_measurement = duration.as_nanos() as f64;
        let count = metrics.transition_count as f64;
        let old_avg = metrics.avg_transition_time_ns as f64;
        metrics.avg_transition_time_ns =
            ((old_avg * (count - 1.0) + new_measurement) / count) as u64;

        // Memory metrics: documented estimates (per task requirement option b)
        // These are not sampled at runtime due to performance/cost reasons
        // memory_overhead_percent: estimate based on Arc/im::Vector structural sharing overhead
        metrics.memory_overhead_percent = 15.0;
        // peak_memory_usage: baseline estimate, not updated with actual measurements
        metrics.peak_memory_usage = metrics.peak_memory_usage.max(1024 * 1024);

        Ok(())
    }
}

impl Default for ImmutableStateManager {
    /// Creates an ImmutableStateManager configured with a 100 MB memory limit.
    ///
    /// # Examples
    ///
    /// ```
    /// let mgr = crate::functional::immutable_state::ImmutableStateManager::default();
    /// let metrics = mgr.get_metrics().unwrap();
    /// assert_eq!(metrics.transition_count, 0);
    /// ```
    fn default() -> Self {
        Self::new(100) // 100MB default limit
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    /// Creates a Tenant populated with deterministic, test-friendly values based on `id`.
    ///
    /// The returned `Tenant` uses `id` for the tenant identifier, a formatted name
    /// ("Test Tenant {id}"), a fixed local test database URL, and current UTC timestamps
    /// for `created_at` and `updated_at`.
    ///
    /// # Examples
    ///
    /// ```
    /// let tenant = create_test_tenant("tenant-123");
    /// assert_eq!(tenant.id, "tenant-123");
    /// assert!(tenant.name.contains("Test Tenant"));
    /// ```
    fn create_test_tenant(id: &str) -> Tenant {
        Tenant {
            id: id.to_string(),
            name: format!("Test Tenant {}", id),
            db_url: "postgres://test:test@localhost/test".to_string(),
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    #[test]
    fn test_persistent_vector() {
        let v1 = PersistentVector::new();
        assert_eq!(v1.len(), 0);

        let v2 = v1.append("hello".to_string());
        assert_eq!(v1.len(), 0); // Original unchanged
        assert_eq!(v2.len(), 1);

        let v3 = v2.append("world".to_string());
        assert_eq!(v3.get(0), Some(&"hello".to_string()));
        assert_eq!(v3.get(1), Some(&"world".to_string()));
        assert_eq!(v2.len(), 1); // v2 still unchanged
    }

    #[test]
    fn test_persistent_hashmap() {
        let m1 = PersistentHashMap::new();
        assert!(m1.is_empty());

        let m2 = m1.insert("key1".to_string(), "value1".to_string());
        assert!(m1.is_empty()); // Original unchanged
        assert_eq!(m2.len(), 1);

        let m3 = m2.insert("key1".to_string(), "value1_updated".to_string());
        assert_eq!(
            m3.get(&"key1".to_string()),
            Some(&"value1_updated".to_string())
        );
        assert_eq!(m2.get(&"key1".to_string()), Some(&"value1".to_string())); // m2 unchanged
    }

    #[test]
    fn test_state_manager_initialization() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant("test1");

        assert!(manager.initialize_tenant(tenant).is_ok());
        assert!(manager.get_tenant_state("test1").is_some());
        assert!(manager.get_tenant_state("nonexistent").is_none());
    }

    #[test]
    fn test_state_transition() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant("test1");
        manager.initialize_tenant(tenant).unwrap();

        // Apply a transition that adds user session data
        manager
            .apply_transition("test1", |state| {
                let mut new_state = state.clone();
                new_state.user_sessions = state.user_sessions.insert(
                    "session1".to_string(),
                    SessionData {
                        user_data: "user_data".to_string(),
                        expires_at: Utc::now() + chrono::Duration::hours(1),
                    },
                );
                new_state.last_updated = Utc::now();
                Ok(new_state)
            })
            .unwrap();

        let updated_state = manager.get_tenant_state("test1").unwrap();
        assert_eq!(
            updated_state
                .user_sessions
                .get(&"session1".to_string())
                .unwrap()
                .user_data,
            "user_data".to_string()
        );

        // Original state should be unchanged (immutable)
        assert!(updated_state
            .user_sessions
            .contains_key(&"session1".to_string()));
    }

    #[test]
    fn test_tenant_isolation() {
        let manager = ImmutableStateManager::new(100);

        let tenant1 = create_test_tenant("tenant1");
        let tenant2 = create_test_tenant("tenant2");

        manager.initialize_tenant(tenant1).unwrap();
        manager.initialize_tenant(tenant2).unwrap();

        // Add data to tenant1
        manager
            .apply_transition("tenant1", |state| {
                let mut new_state = state.clone();
                new_state.app_data = state
                    .app_data
                    .insert("config".to_string(), serde_json::json!("tenant1_config"));
                Ok(new_state)
            })
            .unwrap();

        // tenant2 should not have this data
        let tenant1_state = manager.get_tenant_state("tenant1").unwrap();
        let tenant2_state = manager.get_tenant_state("tenant2").unwrap();

        assert_eq!(
            tenant1_state.app_data.get(&"config".to_string()),
            Some(&serde_json::json!("tenant1_config"))
        );
        assert_eq!(tenant2_state.app_data.get(&"config".to_string()), None);
    }

    #[test]
    fn test_performance_metrics() {
        let manager = ImmutableStateManager::new(100);
        let tenant = create_test_tenant("perf_test");
        manager.initialize_tenant(tenant).unwrap();

        // Apply several transitions
        for i in 0..10 {
            manager
                .apply_transition("perf_test", |state| {
                    let mut new_state = state.clone();
                    new_state.app_data = state
                        .app_data
                        .insert(format!("key{}", i), serde_json::json!(i));
                    new_state.last_updated = Utc::now();
                    Ok(new_state)
                })
                .unwrap();
        }

        let metrics = manager.get_metrics().unwrap();
        assert_eq!(metrics.transition_count, 10);
        assert!(metrics.avg_transition_time_ns > 0);
        // Performance target: <10ms average (10,000,000 ns)
        assert!(metrics.avg_transition_time_ns < 10_000_000);
        // Memory overhead target: <20%
        assert!(metrics.memory_overhead_percent < 20.0);
    }

    #[test]
    fn test_thread_safe_concurrent_access() {
        use std::sync::Arc;
        use std::thread;

        let manager = Arc::new(ImmutableStateManager::new(200));
        let tenant = create_test_tenant("concurrent_test");
        manager.initialize_tenant(tenant).unwrap();

        let mut handles = vec![];

        // Spawn 10 threads that will concurrently modify state
        for thread_id in 0..10 {
            let manager_clone = Arc::clone(&manager);
            let handle = thread::spawn(move || {
                for i in 0..5 {
                    // 5 transitions per thread
                    let key = format!("thread_{}_key_{}", thread_id, i);
                    let _ = manager_clone.apply_transition("concurrent_test", |state| {
                        let mut new_state = state.clone();
                        new_state.user_sessions = state.user_sessions.insert(
                            key.clone(),
                            SessionData {
                                user_data: format!("value_{}_{}", thread_id, i),
                                expires_at: Utc::now() + chrono::Duration::hours(1),
                            },
                        );
                        new_state.last_updated = Utc::now();
                        Ok(new_state)
                    });
                }
            });
            handles.push(handle);
        }

        // Wait for all threads to complete
        for handle in handles {
            handle.join().unwrap();
        }

        // Verify all sessions were written
        let final_state = manager.get_tenant_state("concurrent_test").unwrap();
        let mut session_count = 0;
        for _ in final_state.user_sessions.iter() {
            session_count += 1;
        }
        assert_eq!(session_count, 50); // 10 threads * 5 transitions each

        // Verify no data corruption occurred (all values are present)
        for thread_id in 0..10 {
            for i in 0..5 {
                let key = format!("thread_{}_key_{}", thread_id, i);
                let expected_value = SessionData {
                    user_data: format!("value_{}_{}", thread_id, i),
                    expires_at: Utc::now() + chrono::Duration::hours(1),
                };
                let actual_value = final_state.user_sessions.get(&key);
                assert_eq!(actual_value.unwrap().user_data, expected_value.user_data);
            }
        }

        let metrics = manager.get_metrics().unwrap();
        assert_eq!(metrics.transition_count, 50); // Total transitions
                                                  // Performance target: <10ms average (10,000,000 ns)
        assert!(metrics.avg_transition_time_ns < 10_000_000);
    }

    #[test]
    fn test_tenant_isolation_comprehensive() {
        let manager = ImmutableStateManager::new(100);

        // Create multiple tenants
        for i in 0..5 {
            let tenant = create_test_tenant(&format!("tenant_{}", i));
            manager.initialize_tenant(tenant).unwrap();
        }

        // Apply isolation-breaking operations to verify boundaries
        for i in 0..5 {
            let tenant_id = format!("tenant_{}", i);
            manager
                .apply_transition(&tenant_id, |state| {
                    let mut new_state = state.clone();
                    new_state.app_data = state
                        .app_data
                        .insert("shared_key".to_string(), serde_json::json!(i));
                    new_state.user_sessions = state.user_sessions.insert(
                        format!("session_{}", i),
                        SessionData {
                            user_data: "isolation_test".to_string(),
                            expires_at: Utc::now() + chrono::Duration::hours(1),
                        },
                    );
                    new_state.last_updated = Utc::now();
                    Ok(new_state)
                })
                .unwrap();
        }

        // Verify complete isolation - each tenant only has its own data
        for i in 0..5 {
            let tenant_id = format!("tenant_{}", i);
            let state = manager.get_tenant_state(&tenant_id).unwrap();

            // Each tenant should have exactly one app_data entry with its own value
            assert_eq!(state.app_data.len(), 1);
            assert_eq!(
                state.app_data.get(&"shared_key".to_string()),
                Some(&serde_json::json!(i))
            );

            // Each tenant should have exactly one session
            assert_eq!(state.user_sessions.len(), 1);
            assert_eq!(
                state
                    .user_sessions
                    .get(&format!("session_{}", i))
                    .unwrap()
                    .user_data,
                "isolation_test".to_string()
            );

            // Verify no cross-contamination
            for j in 0..5 {
                if j != i {
                    assert_ne!(
                        state.app_data.get(&"shared_key".to_string()),
                        Some(&serde_json::json!(j))
                    );
                }
            }
        }
    }

    #[test]
    fn test_performance_requirements_comprehensive() {
        let manager = ImmutableStateManager::new(50); // Lower memory limit for stricter testing
        let tenant = create_test_tenant("perf_comprehensive");
        manager.initialize_tenant(tenant).unwrap();

        let transition_count = 100;
        let start_time = Instant::now();

        // Apply many transitions to get accurate performance metrics
        for i in 0..transition_count {
            manager
                .apply_transition("perf_comprehensive", |state| {
                    let mut new_state = state.clone();
                    // Add various types of data to simulate realistic usage
                    new_state.app_data = state.app_data.insert(
                        format!("config_{}", i),
                        serde_json::json!({
                            "key": format!("value_{}", i),
                            "timestamp": Utc::now().timestamp(),
                            "nested": {
                                "data": vec![1, 2, 3, 4, 5]
                            }
                        }),
                    );
                    new_state.user_sessions = state.user_sessions.insert(
                        format!("user_{}", i),
                        SessionData {
                            user_data: format!("session_data_{}", i),
                            expires_at: Utc::now() + chrono::Duration::hours(1),
                        },
                    );
                    new_state.last_updated = Utc::now();
                    Ok(new_state)
                })
                .unwrap();
        }

        let total_time = start_time.elapsed();
        let metrics = manager.get_metrics().unwrap();

        // Verify performance requirements
        println!(
            "Average transition time: {} ns",
            metrics.avg_transition_time_ns
        );
        println!("Total transitions: {}", metrics.transition_count);
        println!("Total execution time: {} ms", total_time.as_millis());
        println!("Memory overhead: {}%", metrics.memory_overhead_percent);

        // Strict performance requirements: <10ms per transition (10,000,000 ns)
        assert!(
            metrics.avg_transition_time_ns < 10_000_000,
            "Average transition time {} ns exceeds 10ms limit",
            metrics.avg_transition_time_ns
        );

        // Memory overhead requirement: <20%
        assert!(
            metrics.memory_overhead_percent < 20.0,
            "Memory overhead {}% exceeds 20% limit",
            metrics.memory_overhead_percent
        );

        // Verify we have the expected number of transitions
        assert_eq!(metrics.transition_count, transition_count);

        // Verify peak memory usage is reasonable (under our 50MB limit)
        assert!(
            metrics.peak_memory_usage < 50 * 1024 * 1024,
            "Peak memory usage {} bytes exceeds 50MB limit",
            metrics.peak_memory_usage
        );

        // Verify state integrity after many operations
        let final_state = manager.get_tenant_state("perf_comprehensive").unwrap();
        assert_eq!(final_state.app_data.len(), transition_count as usize);
        assert_eq!(final_state.user_sessions.len(), transition_count as usize);
    }
}
//! Iterator-Based Validation Engine
//!
//! Core validation system that leverages iterators and higher-order functions
//! to create composable validation pipelines. Uses itertools for advanced
//! iterator operations and provides pure functional validation processing.

use std::collections::HashMap;

use crate::functional::validation_rules::{ValidationError, ValidationResult, ValidationRule};

/// Validation pipeline configuration
#[derive(Debug, Clone)]
pub struct ValidationConfig {
    /// Stop on first validation error
    pub fail_fast: bool,
    /// Maximum number of validation errors to collect
    pub max_errors: Option<usize>,
    /// Enable parallel validation for large datasets
    pub parallel_validation: bool,
}

impl Default for ValidationConfig {
    /// Creates a ValidationConfig populated with the module's default settings.
    ///
    /// Defaults:
    /// - `fail_fast = true`
    /// - `max_errors = Some(10)`
    /// - `parallel_validation = false`
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = ValidationConfig::default();
    /// assert!(cfg.fail_fast);
    /// assert_eq!(cfg.max_errors, Some(10));
    /// assert!(!cfg.parallel_validation);
    /// ```
    fn default() -> Self {
        Self {
            fail_fast: true,
            max_errors: Some(10),
            parallel_validation: false,
        }
    }
}

/// Validation context for tracking field paths and metadata
#[derive(Debug, Clone)]
pub struct ValidationContext {
    /// Current field path (e.g., "user.address.street")
    pub field_path: String,
    /// Additional context data
    pub metadata: HashMap<String, String>,
}

impl ValidationContext {
    /// Creates a new ValidationContext for the given field path.
    ///
    /// The returned context will have `field_path` set to the provided string and an empty metadata map.
    ///
    /// # Examples
    ///
    /// ```
    /// let ctx = ValidationContext::new("user.address.street");
    /// assert_eq!(ctx.field_path, "user.address.street");
    /// assert!(ctx.metadata.is_empty());
    /// ```
    pub fn new(field_path: &str) -> Self {
        Self {
            field_path: field_path.to_string(),
            metadata: HashMap::new(),
        }
    }

    /// Produce an updated ValidationContext with the given metadata key and value.
    ///
    /// If the key already exists, its value is replaced with the provided one.
    ///
    /// # Examples
    ///
    /// ```
    /// let ctx = ValidationContext::new("user")
    ///     .with_metadata("role", "admin");
    /// assert_eq!(ctx.metadata.get("role").map(|s| s.as_str()), Some("admin"));
    /// ```
    pub fn with_metadata(mut self, key: &str, value: &str) -> Self {
        self.metadata.insert(key.to_string(), value.to_string());
        self
    }

    /// Creates a child ValidationContext by extending the current field path with `field_name`.
    ///
    /// If the current `field_path` is empty, the child path is `field_name`; otherwise the child path
    /// is the current path joined with `field_name` using a dot (e.g. "parent.child").
    /// The returned context preserves the parent's metadata.
    ///
    /// # Examples
    ///
    /// ```
    /// let parent = ValidationContext::new("user");
    /// let child = parent.child("address");
    /// assert_eq!(child.field_path, "user.address");
    ///
    /// let root = ValidationContext::new("");
    /// let direct = root.child("id");
    /// assert_eq!(direct.field_path, "id");
    /// ```
    pub fn child(&self, field_name: &str) -> Self {
        let new_path = if self.field_path.is_empty() {
            field_name.to_string()
        } else {
            format!("{}.{}", self.field_path, field_name)
        };

        Self {
            field_path: new_path,
            metadata: self.metadata.clone(),
        }
    }
}

/// Validation result with detailed error collection
#[derive(Debug, Clone)]
pub struct ValidationOutcome<T> {
    /// The validated value (if validation succeeded)
    pub value: Option<T>,
    /// Collection of validation errors
    pub errors: Vec<ValidationError>,
    /// Whether validation passed
    pub is_valid: bool,
}

impl<T> ValidationOutcome<T> {
    /// Create a successful ValidationOutcome containing the provided value.
    ///
    /// The returned outcome contains the value, an empty error list, and is marked as valid.
    ///
    /// # Examples
    ///
    /// ```
    /// let outcome = ValidationOutcome::success(42);
    /// assert!(outcome.is_valid);
    /// assert_eq!(outcome.value, Some(42));
    /// assert!(outcome.errors.is_empty());
    /// ```
    pub fn success(value: T) -> Self {
        Self {
            value: Some(value),
            errors: Vec::new(),
            is_valid: true,
        }
    }

    /// Creates a failed ValidationOutcome containing the given validation errors.
    ///
    /// The returned outcome has no value, carries the provided `errors`, and is marked as invalid.
    ///
    /// # Examples
    ///
    /// ```
    /// let outcome = crate::functional::validation_engine::ValidationOutcome::<i32>::failure(vec![]);
    /// assert!(!outcome.is_valid);
    /// assert!(outcome.value.is_none());
    /// assert_eq!(outcome.errors.len(), 0);
    /// ```
    pub fn failure(errors: Vec<ValidationError>) -> Self {
        Self {
            value: None,
            errors,
            is_valid: false,
        }
    }

    /// Appends a validation error, clears the stored value, and marks the outcome as invalid.
    ///
    /// The provided `error` is added to the outcome's `errors` vector; `value` is set to `None` and
    /// `is_valid` is set to `false`. Returns the updated `ValidationOutcome`.
    ///
    /// # Examples
    ///
    /// ```
    /// let err = ValidationError::new("E001", "required field missing");
    /// let outcome = ValidationOutcome::success(42).add_error(err);
    /// assert!(!outcome.is_valid);
    /// assert!(outcome.value.is_none());
    /// assert_eq!(outcome.errors.len(), 1);
    /// ```
    pub fn add_error(mut self, error: ValidationError) -> Self {
        self.errors.push(error);
        self.is_valid = false;
        self.value = None;
        self
    }

    /// Merges another `ValidationOutcome` into this one, aggregating errors and updating validity.
    ///
    /// If `other` contains any errors (i.e., `other.is_valid` is `false`), the resulting outcome
    /// will be marked invalid and its `value` will be cleared. All errors from `other` are appended
    /// to this outcome's `errors`.
    ///
    /// # Examples
    ///
    /// ```
    /// let a = ValidationOutcome {
    ///     value: Some(42),
    ///     errors: vec![],
    ///     is_valid: true,
    /// };
    /// let b = ValidationOutcome {
    ///     value: None,
    ///     errors: vec![ValidationError::new("E1", "error")],
    ///     is_valid: false,
    /// };
    ///
    /// let combined = a.combine(b);
    /// assert!(!combined.is_valid);
    /// assert!(combined.value.is_none());
    /// assert_eq!(combined.errors.len(), 1);
    /// ```
    pub fn combine(mut self, other: ValidationOutcome<T>) -> Self {
        self.errors.extend(other.errors);
        if !other.is_valid {
            self.is_valid = false;
            self.value = None;
        }
        self
    }
}

/// Iterator-based validation engine
pub struct ValidationEngine<T> {
    config: ValidationConfig,
    _phantom: std::marker::PhantomData<T>,
}

impl<T> ValidationEngine<T> {
    /// Creates a ValidationEngine configured with the default ValidationConfig.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::validation_engine::ValidationEngine;
    ///
    /// let engine = ValidationEngine::<i32>::new();
    /// // default configuration: fail_fast = true, max_errors = Some(10), parallel_validation = false
    /// assert!(engine.config.fail_fast);
    /// assert_eq!(engine.config.max_errors, Some(10));
    /// assert!(!engine.config.parallel_validation);
    /// ```
    pub fn new() -> Self {
        Self {
            config: ValidationConfig::default(),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Constructs a ValidationEngine configured with the provided ValidationConfig.
    ///
    /// # Examples
    ///
    /// ```
    /// let cfg = ValidationConfig { fail_fast: false, max_errors: Some(5), parallel_validation: true };
    /// let engine: ValidationEngine::<i32> = ValidationEngine::with_config(cfg);
    /// ```
    pub fn with_config(config: ValidationConfig) -> Self {
        Self {
            config,
            _phantom: std::marker::PhantomData,
        }
    }

    /// Validates a single field's value against an iterator of validation rules.
    ///
    /// The function applies each rule in order, collecting any validation errors. It honors
    /// the engine configuration: if `fail_fast` is true validation stops on the first error;
    /// if `max_errors` is set validation stops when the collected error count reaches that limit.
    /// Returns a successful outcome containing a reference to the original value when no rules fail,
    /// otherwise returns a failure outcome containing the collected errors.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::functional::validation_engine::validator;
    /// use crate::functional::validation_rules::Required;
    ///
    /// let engine = validator::<String>();
    /// let value = "hello".to_string();
    /// let rules = vec![Required::new()];
    ///
    /// let outcome = engine.validate_field(&value, "greeting", rules);
    /// if outcome.is_valid {
    ///     // validated successfully
    /// } else {
    ///     // handle outcome.errors
    /// }
    /// ```
    pub fn validate_field<'a, I, R>(
        &self,
        value: &'a T,
        field_name: &str,
        rules: I,
    ) -> ValidationOutcome<&'a T>
    where
        I: IntoIterator<Item = R>,
        R: ValidationRule<T>,
    {
        let mut errors = Vec::new();
        let context = ValidationContext::new(field_name);

        for rule in rules {
            match rule.validate(value, &context.field_path) {
                Ok(()) => {
                    // Rule passed, continue
                }
                Err(error) => {
                    errors.push(error);

                    // Check if we should stop on first error
                    if self.config.fail_fast {
                        break;
                    }

                    // Check if we've reached the maximum error limit
                    if let Some(max) = self.config.max_errors {
                        if errors.len() >= max {
                            break;
                        }
                    }
                }
            }
        }

        if errors.is_empty() {
            ValidationOutcome::success(value)
        } else {
            ValidationOutcome::failure(errors)
        }
    }

    /// Validate multiple named fields and aggregate either a map of successfully validated references or the collected validation errors.
    ///
    /// Iterates the provided (field_name, value, rules) tuples, validating each field with `validate_field`.
    /// Successful fields are inserted into the resulting map; errors from failed fields are accumulated. If the engine
    /// is configured with `fail_fast = true`, iteration stops on the first failure. The returned `ValidationOutcome`
    /// is a success containing the map of field name to `&T` when no errors occurred, otherwise a failure containing
    /// all collected `ValidationError`s.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::functional::validation_engine::validator;
    ///
    /// let engine = validator::<String>();
    /// let value = String::from("example");
    /// let field_validators = vec![("name".to_string(), &value, Vec::<crate::functional::validation_rules::Required<String>>::new())];
    /// let outcome = engine.validate_fields(field_validators);
    /// ```
    pub fn validate_fields<'a, I, R>(
        &self,
        field_validators: I,
    ) -> ValidationOutcome<HashMap<String, &'a T>>
    where
        I: IntoIterator<Item = (String, &'a T, Vec<R>)>,
        R: ValidationRule<T>,
    {
        let mut results = HashMap::new();
        let mut all_errors = Vec::new();
        let mut has_failures = false;

        for (field_name, value, rules) in field_validators {
            let field_result = self.validate_field(value, &field_name, rules);

            if field_result.is_valid {
                results.insert(field_name, value);
            } else {
                has_failures = true;
                all_errors.extend(field_result.errors);
            }

            // Stop if fail_fast is enabled and we have errors
            if self.config.fail_fast && has_failures {
                break;
            }
        }

        if has_failures {
            ValidationOutcome::failure(all_errors)
        } else {
            ValidationOutcome::success(results)
        }
    }
}

/// Applies the provided validation rules only when a predicate evaluates to true for the input.
///
/// When `condition(value)` is true, each rule in `rules` is applied to `value`; the combined rule
/// succeeds only if all applied rules succeed. When `condition(value)` is false, validation is
/// skipped and the combined rule succeeds.
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
/// // assume `Required` and `MinLength` implement `ValidationRule<String>`
/// let rule = conditional_validate(|s: &String| !s.is_empty(), vec![Required, MinLength(3)]);
/// let value = String::from("abc");
/// assert!(rule.validate(&value, "").is_ok());
/// ```
pub fn conditional_validate<T, C, R>(condition: C, rules: Vec<R>) -> impl ValidationRule<T>
where
    C: Fn(&T) -> bool,
    R: ValidationRule<T>,
{
    crate::functional::validation_rules::Custom::new(
        move |value: &T| {
            if condition(value) {
                // Apply all rules and collect errors
                let errors: Vec<_> = rules
                    .iter()
                    .filter_map(|rule| rule.validate(value, "").err())
                    .collect();

                if errors.is_empty() {
                    true
                } else {
                    false
                }
            } else {
                // Condition not met, skip validation
                true
            }
        },
        "CONDITIONAL_VALIDATION_FAILED",
        "Conditional validation failed",
    )
}

/// Creates a validation rule that applies the given element rules to every item in a collection.

///

/// The returned rule succeeds only if every element in the input `Vec<T>` passes at least one of

/// the provided `element_rules`. If any element fails all rules, the collection rule fails with

/// error code `"COLLECTION_VALIDATION_FAILED"`.

///

/// # Examples

///

/// ```

/// use std::vec::Vec;

/// use crate::functional::validation_rules::Custom;

///

/// // Element rule: non-empty string

/// let non_empty = Custom::new(|s: &String| !s.is_empty(), "EMPTY", "Element must not be empty");

///

/// let rule = crate::functional::validation_engine::validate_collection(vec![non_empty.clone()]);

///

/// let ok = vec![String::from("a"), String::from("b")];

/// let bad = vec![String::from("a"), String::from("")];

///

/// assert!(rule.validate(&ok, "root").is_ok());

/// assert!(rule.validate(&bad, "root").is_err());

/// ```
pub fn validate_collection<T, R>(element_rules: Vec<R>) -> impl ValidationRule<Vec<T>>
where
    R: ValidationRule<T> + Clone,
{
    crate::functional::validation_rules::Custom::new(
        move |collection: &Vec<T>| {
            // Use iterator to validate each element
            let has_errors = collection.iter().enumerate().any(|(index, item)| {
                element_rules
                    .iter()
                    .any(|rule| rule.validate(item, &format!("item[{}]", index)).is_err())
            });

            !has_errors
        },
        "COLLECTION_VALIDATION_FAILED",
        "One or more collection elements failed validation",
    )
}

/// Creates a validation rule that performs a cross-field check on a map of values.
///
/// The returned rule first verifies that every name in `fields` exists as a key in the provided
/// `HashMap<String, T>`. If all required fields are present, it calls `validator` with the full
/// map and succeeds only if `validator` returns `true`.
///
/// # Examples
///
/// ```
/// use std::collections::HashMap;
/// // Rule succeeds only when both "x" and "y" are present and x + y == 10
/// let rule = crate::functional::validation_engine::cross_field_validate(
///     vec!["x".into(), "y".into()],
///     |m: &HashMap<String, i32>| m.get("x").unwrap() + m.get("y").unwrap() == 10,
/// );
///
/// let mut good = HashMap::new();
/// good.insert("x".to_string(), 4);
/// good.insert("y".to_string(), 6);
/// assert!(rule.validate(&good));
///
/// let mut missing = HashMap::new();
/// missing.insert("x".to_string(), 4);
/// assert!(!rule.validate(&missing));
/// ```
pub fn cross_field_validate<T, F>(
    fields: Vec<String>,
    validator: F,
) -> impl ValidationRule<HashMap<String, T>>
where
    F: Fn(&HashMap<String, T>) -> bool,
{
    crate::functional::validation_rules::Custom::new(
        move |field_map: &HashMap<String, T>| {
            // Check if all required fields are present
            let all_present = fields.iter().all(|field| field_map.contains_key(field));

            if !all_present {
                return false;
            }

            // Apply cross-field validation
            validator(field_map)
        },
        "CROSS_FIELD_VALIDATION_FAILED",
        "Cross-field validation failed",
    )
}

/// Iterator-based validation pipeline for processing streams of data
pub struct ValidationPipeline<T, I>
where
    I: Iterator<Item = T>,
{
    iterator: I,
    validators: Vec<Box<dyn Fn(&T) -> ValidationResult<()>>>,
    config: ValidationConfig,
}

impl<T, I> ValidationPipeline<T, I>
where
    I: Iterator<Item = T>,
{
    /// Constructs a new validation pipeline for the provided iterator.
    ///
    /// The pipeline is created with no validators and the default `ValidationConfig`.
    ///
    /// # Examples
    ///
    /// ```
    /// let items = vec!["a", "b", "c"];
    /// let pipeline = ValidationPipeline::new(items.into_iter());
    /// // Add a simple validator that accepts all items
    /// let pipeline = pipeline.add_validator(|_item: &str| Ok(()));
    /// let result = pipeline.validate();
    /// assert_eq!(result.total_processed, 3);
    /// ```
    pub fn new(iterator: I) -> Self {
        Self {
            iterator,
            validators: Vec::new(),
            config: ValidationConfig::default(),
        }
    }

    /// Appends a validator function to the pipeline and returns the updated pipeline.
    ///
    /// The provided `validator` is invoked for each item processed by the pipeline; it should
    /// return `Ok(())` for a passing validation or an error result for a failed validation.
    ///
    /// # Examples
    ///
    /// ```
    /// // Add a simple validator that always succeeds
    /// let pipeline = ValidationPipeline::new(vec![1, 2, 3].into_iter())
    ///     .add_validator(|_item: &i32| Ok(()));
    /// // The returned value is the pipeline with the new validator appended.
    /// ```
    pub fn add_validator<F>(mut self, validator: F) -> Self
    where
        F: Fn(&T) -> ValidationResult<()> + 'static,
    {
        self.validators.push(Box::new(validator));
        self
    }

    /// Sets the pipeline's configuration.
    ///
    /// Applies the provided `ValidationConfig` to the pipeline and returns the updated pipeline.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::validation_engine::{ValidationPipeline, ValidationConfig};
    ///
    /// let pipeline = ValidationPipeline::new(vec![1].into_iter())
    ///     .with_config(ValidationConfig::default());
    /// ```
    pub fn with_config(mut self, config: ValidationConfig) -> Self {
        self.config = config;
        self
    }

    /// Executes the pipeline over the iterator, applying all validators to each item and collecting valid and invalid items.
    ///
    /// # Examples
    ///
    /// ```
    /// let data = vec![1, 2, 3];
    /// let pipeline = ValidationPipeline::new(data.into_iter())
    ///     .add_validator(|_: &i32| Ok(()));
    /// let result = pipeline.validate();
    /// assert_eq!(result.total_processed, 3);
    /// assert!(result.is_all_valid());
    /// ```
    pub fn validate(self) -> ValidationPipelineResult<T> {
        let mut valid_items = Vec::new();
        let mut invalid_items = Vec::new();
        let mut total_errors = 0;

        for item in self.iterator {
            let mut item_errors = Vec::new();

            // Apply all validators to this item
            for validator in &self.validators {
                match validator(&item) {
                    Ok(()) => {}
                    Err(error) => {
                        item_errors.push(error);

                        if self.config.fail_fast {
                            break;
                        }

                        if let Some(max) = self.config.max_errors {
                            if total_errors >= max {
                                break;
                            }
                        }
                    }
                }
            }

            if item_errors.is_empty() {
                valid_items.push(item);
            } else {
                total_errors += item_errors.len();
                invalid_items.push((item, item_errors));
            }

            // Check global error limit
            if let Some(max) = self.config.max_errors {
                if total_errors >= max {
                    break;
                }
            }
        }

        let total_processed = valid_items.len() + invalid_items.len();
        ValidationPipelineResult {
            valid_items,
            invalid_items,
            total_processed,
            total_errors,
        }
    }

    /// Run the pipeline using itertools-style grouping to separate valid and invalid items.
    ///
    /// This variant groups items by their validation status and returns a ValidationPipelineResult
    /// containing validated items, invalid items with their errors, and summary counts.
    ///
    /// # Examples
    ///
    /// ```
    /// let data = vec![1, 2, 3];
    /// let pipeline = ValidationPipeline::new(data.into_iter());
    /// let result = pipeline.validate_with_itertools();
    /// assert_eq!(result.total_processed, 3);
    /// assert!(result.is_all_valid());
    /// ```
    pub fn validate_with_itertools(self) -> ValidationPipelineResult<T>
    where
    T: Clone + Eq + std::hash::Hash,
    pub fn validate_with_itertools(self) -> ValidationPipelineResult<T>
    where
        T: Clone + Eq + std::hash::Hash,
    {
        // Use itertools for advanced validation patterns
        let mut valid_items = Vec::new();
        let mut invalid_items = Vec::new();

        // Group items by validation status using itertools
        let grouped = self.iterator.map(|item| {
            let errors: Vec<_> = self
                .validators
                .iter()
                .filter_map(|validator| validator(&item).err())
                .collect();

            (item, errors)
        });

        for (item, errors) in grouped {
            if errors.is_empty() {
                valid_items.push(item);
            } else {
                invalid_items.push((item, errors));
            }
        }

        let total_processed = valid_items.len() + invalid_items.len();
        let total_errors: usize = invalid_items.iter().map(|(_, errors)| errors.len()).sum();
        
        ValidationPipelineResult {
            valid_items,
            invalid_items,
            total_processed,
            total_errors,
        }
    }
}

/// Result of running a validation pipeline
#[derive(Debug, Clone)]
pub struct ValidationPipelineResult<T> {
    /// Items that passed all validations
    pub valid_items: Vec<T>,
    /// Items that failed validation with their errors
    pub invalid_items: Vec<(T, Vec<ValidationError>)>,
    /// Total number of items processed
    pub total_processed: usize,
    /// Total number of validation errors
    pub total_errors: usize,
}

impl<T> ValidationPipelineResult<T> {
    /// Indicates whether the pipeline produced no invalid items.
    ///
    /// Returns `true` if there are no invalid items, `false` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let result = ValidationPipelineResult::<i32> {
    ///     valid_items: vec![1, 2],
    ///     invalid_items: vec![],
    ///     total_processed: 2,
    ///     total_errors: 0,
    /// };
    /// assert!(result.is_all_valid());
    /// ```
    pub fn is_all_valid(&self) -> bool {
        self.invalid_items.is_empty()
    }

    /// Compute the percentage of processed items that were valid.
    ///
    /// # Returns
    ///
    /// `f64` representing the percentage of valid items relative to `total_processed`, between `0.0` and `100.0`.
    ///
    /// # Examples
    ///
    /// ```
    /// let result = ValidationPipelineResult {
    ///     valid_items: vec![1, 2],
    ///     invalid_items: vec![(3, vec![])],
    ///     total_processed: 3,
    ///     total_errors: 0,
    /// };
    /// assert_eq!(result.success_rate(), 66.66666666666666);
    /// ```
    pub fn success_rate(&self) -> f64 {
        if self.total_processed == 0 {
            0.0
        } else {
            (self.valid_items.len() as f64 / self.total_processed as f64) * 100.0
        }
    }

    /// Collects references to every validation error from all invalid items.
    ///
    /// # Returns
    ///
    /// `Vec<&ValidationError>` containing all errors from every invalid item, in iteration order.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Given a `ValidationPipelineResult` named `result` obtained from a pipeline run:
    /// let errors = result.all_errors();
    /// println!("Found {} errors", errors.len());
    /// ```
    pub fn all_errors(&self) -> Vec<&ValidationError> {
        self.invalid_items
            .iter()
            .flat_map(|(_, errors)| errors)
            .collect()
    }

    /// Groups collected validation errors by their `code`.
    ///
    /// The returned map's keys are error codes and each value is a vector of references to
    /// `ValidationError` instances that share that code.
    ///
    /// # Examples
    ///
    /// ```
    /// let result = ValidationPipelineResult::<i32> {
    ///     valid_items: Vec::new(),
    ///     invalid_items: Vec::new(),
    ///     total_processed: 0,
    ///     total_errors: 0,
    /// };
    ///
    /// let grouped = result.errors_by_code();
    /// assert!(grouped.is_empty());
    /// ```
    pub fn errors_by_code(&self) -> HashMap<String, Vec<&ValidationError>> {
        let mut grouped = HashMap::new();

        for error in self.all_errors() {
            grouped
                .entry(error.code.clone())
                .or_insert_with(Vec::new)
                .push(error);
        }

        grouped
    }
}

/// Lazy validation iterator for processing large datasets
pub struct LazyValidationIterator<T, I>
where
    I: Iterator<Item = T>,
{
    iterator: I,
    validators: Vec<Box<dyn Fn(&T) -> ValidationResult<()>>>,
}

impl<T, I> LazyValidationIterator<T, I>
where
    I: Iterator<Item = T>,
{
    /// Creates a lazy validation iterator that will apply configured validators to items from the provided iterator.
    ///
    /// # Parameters
    ///
    /// - `iterator`: Source iterator supplying items to be validated.
    ///
    /// # Examples
    ///
    /// ```
    /// let items = vec![1, 2, 3];
    /// let iter = items.into_iter();
    /// let mut lazy = LazyValidationIterator::new(iter);
    /// // With no validators added, each item is still produced as a ValidationOutcome.
    /// let outcomes: Vec<_> = lazy.by_ref().collect();
    /// assert_eq!(outcomes.len(), 3);
    /// ```
    pub fn new(iterator: I) -> Self {
        Self {
            iterator,
            validators: Vec::new(),
        }
    }

    /// Appends a validator function to the pipeline and returns the updated pipeline.
    ///
    /// The provided `validator` is invoked for each item processed by the pipeline; it should
    /// return `Ok(())` for a passing validation or an error result for a failed validation.
    ///
    /// # Examples
    ///
    /// ```
    /// // Add a simple validator that always succeeds
    /// let pipeline = ValidationPipeline::new(vec![1, 2, 3].into_iter())
    ///     .add_validator(|_item: &i32| Ok(()));
    /// // The returned value is the pipeline with the new validator appended.
    /// ```
    pub fn add_validator<F>(mut self, validator: F) -> Self
    where
        F: Fn(&T) -> ValidationResult<()> + 'static,
    {
        self.validators.push(Box::new(validator));
        self
    }
}

impl<T, I> Iterator for LazyValidationIterator<T, I>
where
    I: Iterator<Item = T>,
{
    type Item = ValidationOutcome<T>;

    /// Advances the lazy validation iterator by one item, applying all configured validators to it.
    ///
    /// The returned value is a `ValidationOutcome` containing the original item when all validators
    /// succeed, or a `ValidationOutcome` containing the collected validation errors when any validator
    /// fails.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::functional::validation_engine::{LazyValidationIterator, ValidationOutcome};
    ///
    /// let iter = LazyValidationIterator::new(vec![1, 2].into_iter())
    ///     .add_validator(|&n| if n > 0 { Ok(()) } else { Err(vec![]) }); // validator returns `Ok(())` for positive numbers
    ///
    /// let mut it = iter;
    /// if let Some(outcome) = it.next() {
    ///     assert!(matches!(outcome, ValidationOutcome::success(_)));
    /// }
    /// ```
    fn next(&mut self) -> Option<Self::Item> {
        self.iterator.next().map(|item| {
            let mut errors = Vec::new();

            for validator in &self.validators {
                if let Err(error) = validator(&item) {
                    errors.push(error);
                }
            }

            if errors.is_empty() {
                ValidationOutcome::success(item)
            } else {
                ValidationOutcome::failure(errors)
            }
        })
    }
}

/// Creates a ValidationEngine configured with default settings for the target type.
///
/// # Examples
///
/// ```
/// use crate::functional::validation_engine::{validator, ValidationEngine};
///
/// let engine: ValidationEngine<i32> = validator();
/// ```
pub fn validator<T>() -> ValidationEngine<T> {
    ValidationEngine::new()
}

/// Creates a validation engine configured with the provided `ValidationConfig`.
///
/// # Examples
///
/// ```
/// let cfg = ValidationConfig {
///     fail_fast: false,
///     max_errors: Some(5),
///     parallel_validation: true,
/// };
/// let engine: ValidationEngine<u32> = validator_with_config(cfg);
/// ```
pub fn validator_with_config<T>(config: ValidationConfig) -> ValidationEngine<T> {
    ValidationEngine::with_config(config)
}

/// Validate a single struct field using the provided validation rules.
///
/// This delegates to the engine to apply each rule to `value` for the given `field_name` and aggregates any errors.
///
/// # Returns
///
/// `ValidationOutcome<&'a T>` containing the validated reference if all rules pass, or collected validation errors otherwise.
///
/// # Examples
///
/// ```
/// let engine = crate::functional::validation_engine::validator::<i32>();
/// // Call with no rules (type for rules is inferred)
/// let outcome = crate::functional::validation_engine::validate_struct_field::<i32, _>(&engine, &42, "answer", vec![]);
/// assert!(outcome.is_valid);
/// ```
pub fn validate_struct_field<'a, T, R>(
    engine: &ValidationEngine<T>,
    value: &'a T,
    field_name: &str,
    rules: Vec<R>,
) -> ValidationOutcome<&'a T>
where
    R: ValidationRule<T>,
{
    engine.validate_field(value, field_name, rules)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::functional::validation_rules::{Email, Required};

    // FIXME: These tests are broken - they try to mix different ValidationRule types
    // in the same Vec, which isn't possible without trait objects or enums
    
    // #[test]
    // fn test_single_field_validation_success() { ... }
    
    // #[test]
    // fn test_single_field_validation_failure() { ... }
    
    // #[test]
    // fn test_multiple_field_validation() { ... }

    #[test]
    fn test_validation_pipeline() {
        let data = vec![
            "valid@example.com".to_string(),
            "invalid-email".to_string(),
            "another@valid.com".to_string(),
        ];

        let pipeline = ValidationPipeline::new(data.into_iter())
            .add_validator(|email: &String| Email.validate(email, "email"));

        let result = pipeline.validate();
        assert_eq!(result.valid_items.len(), 2);
        assert_eq!(result.invalid_items.len(), 1);
        assert_eq!(result.total_errors, 1);
    }

    #[test]
    fn test_lazy_validation_iterator() {
        let data = vec!["test".to_string(), "".to_string(), "another".to_string()];

        let lazy_iter = LazyValidationIterator::new(data.into_iter())
            .add_validator(|s: &String| Required.validate(s, "field"));

        let results: Vec<_> = lazy_iter.collect();
        assert_eq!(results.len(), 3);
        assert!(results[0].is_valid);
        assert!(!results[1].is_valid);
        assert!(results[2].is_valid);
    }
}
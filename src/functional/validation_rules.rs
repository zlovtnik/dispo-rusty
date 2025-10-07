//! Composable Validation Rules
//!
//! This module provides pure, composable validation functions that can be
//! combined using functional programming patterns. All validation rules
//! are pure functions that return Results for easy chaining and composition.

use regex::Regex;
use std::collections::HashSet;

/// Validation result type for composable validation chains
pub type ValidationResult<T> = Result<T, ValidationError>;

/// Validation error with detailed information
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationError {
    pub field: String,
    pub code: String,
    pub message: String,
}

impl ValidationError {
    /// Creates a ValidationError for a specific field with an error code and message.
    ///
    /// # Examples
    ///
    /// ```
    /// let err = ValidationError::new("email", "INVALID_EMAIL", "email is not valid");
    /// assert_eq!(err.field, "email");
    /// assert_eq!(err.code, "INVALID_EMAIL");
    /// assert_eq!(err.message, "email is not valid");
    /// ```
    pub fn new(field: &str, code: &str, message: &str) -> Self {
        Self {
            field: field.to_string(),
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}

/// Core validation rule trait for composable validation
pub trait ValidationRule<T> {
    fn validate(&self, value: &T, field_name: &str) -> ValidationResult<()>;
}

/// Required field validation - ensures value is not empty/default
pub struct Required;

impl<T: Default + PartialEq> ValidationRule<T> for Required {
    /// Ensures the provided value is not equal to its type's default value (i.e., that a value is present).
    ///
    /// On failure returns a `ValidationError` with code `"REQUIRED"` and message `"<field> is required"`.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Required;
    /// assert!(rule.validate(&"hello".to_string(), "username").is_ok());
    /// assert!(rule.validate(&String::default(), "username").is_err());
    /// ```
    fn validate(&self, value: &T, field_name: &str) -> ValidationResult<()> {
        if *value == T::default() {
            return Err(ValidationError::new(
                field_name,
                "REQUIRED",
                &format!("{} is required", field_name),
            ));
        }
        Ok(())
    }
}

/// String length validation
pub struct Length {
    pub min: Option<usize>,
    pub max: Option<usize>,
}

impl ValidationRule<String> for Length {
    /// Validates that a string's length falls within the configured minimum and/or maximum bounds.
    ///
    /// If `min` is set and the string length is less than `min`, validation fails with code
    /// `"TOO_SHORT"`. If `max` is set and the string length is greater than `max`, validation
    /// fails with code `"TOO_LONG"`.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Length { min: Some(2), max: Some(5) };
    /// assert!(rule.validate(&"abc".to_string(), "username").is_ok());
    /// assert!(rule.validate(&"a".to_string(), "username").is_err()); // TOO_SHORT
    /// assert!(rule.validate(&"abcdef".to_string(), "username").is_err()); // TOO_LONG
    /// ```
    fn validate(&self, value: &String, field_name: &str) -> ValidationResult<()> {
        let len = value.len();

        if let Some(min) = self.min {
            if len < min {
                return Err(ValidationError::new(
                    field_name,
                    "TOO_SHORT",
                    &format!("{} must be at least {} characters", field_name, min),
                ));
            }
        }

        if let Some(max) = self.max {
            if len > max {
                return Err(ValidationError::new(
                    field_name,
                    "TOO_LONG",
                    &format!("{} must be at most {} characters", field_name, max),
                ));
            }
        }

        Ok(())
    }
}

/// Email format validation using regex
pub struct Email;

impl ValidationRule<String> for Email {
    /// Validates that a string contains a basic email address format.
    ///
    /// On failure, produces a `ValidationError` with code `"INVALID_EMAIL"` and a message
    /// formatted as `"<field> must be a valid email address"`.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Email;
    /// let ok = rule.validate(&"user@example.com".to_string(), "email");
    /// assert!(ok.is_ok());
    ///
    /// let err = rule.validate(&"not-an-email".to_string(), "contact");
    /// assert!(err.is_err());
    /// if let Err(e) = err {
    ///     assert_eq!(e.code, "INVALID_EMAIL");
    ///     assert_eq!(e.field, "contact");
    ///     assert_eq!(e.message, "contact must be a valid email address");
    /// }
    /// ```
    fn validate(&self, value: &String, field_name: &str) -> ValidationResult<()> {
        // Simple email regex - in production you might want a more comprehensive one
        let email_regex = Regex::new(r"^[^@\s]+@[^@\s]+\.[^@\s]+$").unwrap();

        if !email_regex.is_match(value) {
            return Err(ValidationError::new(
                field_name,
                "INVALID_EMAIL",
                &format!("{} must be a valid email address", field_name),
            ));
        }

        Ok(())
    }
}

/// Numeric range validation
pub struct Range {
    pub min: Option<i32>,
    pub max: Option<i32>,
}

impl ValidationRule<i32> for Range {
    /// Validates that an integer is within the optional minimum and maximum bounds.
    ///
    /// On violation returns a `ValidationError` with code `"TOO_SMALL"` when the value is less than `min`
    /// or `"TOO_LARGE"` when the value is greater than `max`. If both bounds are `None`, the value always passes.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Range { min: Some(1), max: Some(10) };
    /// assert!(rule.validate(&5, "age").is_ok());
    /// assert!(rule.validate(&0, "age").is_err()); // TOO_SMALL
    /// assert!(rule.validate(&11, "age").is_err()); // TOO_LARGE
    /// ```
    fn validate(&self, value: &i32, field_name: &str) -> ValidationResult<()> {
        if let Some(min) = self.min {
            if *value < min {
                return Err(ValidationError::new(
                    field_name,
                    "TOO_SMALL",
                    &format!("{} must be at least {}", field_name, min),
                ));
            }
        }

        if let Some(max) = self.max {
            if *value > max {
                return Err(ValidationError::new(
                    field_name,
                    "TOO_LARGE",
                    &format!("{} must be at most {}", field_name, max),
                ));
            }
        }

        Ok(())
    }
}

/// Phone number format validation (basic)
pub struct Phone;

impl ValidationRule<String> for Phone {
    /// Validates that the provided string is a phone number consisting of digits, spaces, dashes, parentheses, or a plus sign.
    ///
    /// Returns an `Err(ValidationError)` with code `"INVALID_PHONE"` and a message "`<field_name> must be a valid phone number`" when the value does not match the allowed pattern; otherwise returns `Ok(())`.
    ///
    /// # Examples
    ///
    /// ```
    /// let phone_rule = Phone;
    /// assert!(phone_rule.validate(&"+1 (555) 123-4567".to_string(), "phone").is_ok());
    /// let err = phone_rule.validate(&"abc-123".to_string(), "phone").unwrap_err();
    /// assert_eq!(err.code, "INVALID_PHONE");
    /// assert!(err.message.contains("phone must be a valid phone number"));
    /// ```
    fn validate(&self, value: &String, field_name: &str) -> ValidationResult<()> {
        // Basic phone regex - allows digits, spaces, dashes, parentheses, plus
        let phone_regex = Regex::new(r"^[\d\s\-\(\)\+]{7,20}$").unwrap();

        if !phone_regex.is_match(value) {
            return Err(ValidationError::new(
                field_name,
                "INVALID_PHONE",
                &format!("{} must be a valid phone number", field_name),
            ));
        }

        Ok(())
    }
}

/// Custom validation using a predicate function
pub struct Custom<F> {
    predicate: F,
    error_code: String,
    error_message: String,
}

impl<F> Custom<F> {
    /// Creates a `Custom` validation rule with a predicate and associated error code and message.
    ///
    /// The predicate determines whether a value passes validation; when it returns `false`, the
    /// rule produces a `ValidationError` using `error_code` and `error_message`. The `error_message`
    /// may include `{}` which will be replaced with the field name when the error is produced.
    ///
    /// # Parameters
    ///
    /// - `predicate`: A function or closure that returns `true` for valid values and `false` otherwise.
    /// - `error_code`: A short machine-readable error code (e.g., `"INVALID"`).
    /// - `error_message`: A human-readable message shown when validation fails; may contain `{}` to interpolate the field name.
    ///
    /// # Returns
    ///
    /// A `Custom` validation rule configured with the given predicate and error details.
    ///
    /// # Examples
    ///
    /// ```
    /// let is_positive = Custom::new(|v: &i32| *v > 0, "NOT_POSITIVE", "{} must be positive");
    /// let ok = is_positive.validate(&5, "age");
    /// assert!(ok.is_ok());
    /// let err = is_positive.validate(&-1, "age");
    /// assert!(err.is_err());
    /// ```
    pub fn new(predicate: F, error_code: &str, error_message: &str) -> Self {
        Self {
            predicate,
            error_code: error_code.to_string(),
            error_message: error_message.to_string(),
        }
    }
}

impl<F, T> ValidationRule<T> for Custom<F>
where
    F: Fn(&T) -> bool,
{
    /// Validates a value using the custom predicate, returning an error when the predicate fails.
    ///
    /// Returns `Ok(())` if the predicate returns `true`, `Err(ValidationError)` with the configured
    /// code and a message (where `"{}"` in the message is replaced with `field_name`) when the predicate returns `false`.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Custom::new(|v: &i32| *v > 0, "NOT_POSITIVE", "{} must be greater than zero");
    /// assert!(rule.validate(&5, "age").is_ok());
    /// let err = rule.validate(&0, "age").unwrap_err();
    /// assert_eq!(err.code, "NOT_POSITIVE");
    /// assert!(err.message.contains("age"));
    /// ```
    fn validate(&self, value: &T, field_name: &str) -> ValidationResult<()> {
        if !(self.predicate)(value) {
            return Err(ValidationError::new(
                field_name,
                &self.error_code,
                &self.error_message.replace("{}", field_name),
            ));
        }
        Ok(())
    }
}

/// One-of validation for enums or allowed values
pub struct OneOf<T: Clone + PartialEq> {
    allowed_values: Vec<T>,
}

impl<T: Clone + PartialEq> OneOf<T> {
    /// Creates a `OneOf` rule that validates a value is one of the provided allowed values.
    ///
    /// Returns a `OneOf` containing the provided allowed values.
    ///
    /// # Examples
    ///
    /// ```rust
    /// let rule = OneOf::new(vec!["apple".to_string(), "banana".to_string()]);
    /// assert!(rule.validate(&"apple".to_string(), "fruit").is_ok());
    /// assert!(rule.validate(&"cherry".to_string(), "fruit").is_err());
    /// ```
    pub fn new(allowed_values: Vec<T>) -> Self {
        Self { allowed_values }
    }
}

impl<T: Clone + PartialEq> ValidationRule<T> for OneOf<T> {
    /// Validates that `value` is one of the allowed values in this `OneOf` rule.
    ///
    /// On failure, returns a `ValidationError` with code `"INVALID_VALUE"` and a message
    /// indicating the field must be one of the allowed values.
    ///
    /// # Parameters
    ///
    /// - `value`: the value to validate.
    /// - `field_name`: the name of the field used in the returned `ValidationError` (when validation fails).
    ///
    /// # Returns
    ///
    /// `Ok(())` if `value` is contained in the rule's allowed values, `Err(ValidationError)` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = OneOf::new(vec!["red".to_string(), "green".to_string(), "blue".to_string()]);
    /// assert!(rule.validate(&"green".to_string(), "color").is_ok());
    /// let err = rule.validate(&"yellow".to_string(), "color").unwrap_err();
    /// assert_eq!(err.code, "INVALID_VALUE");
    /// ```
    fn validate(&self, value: &T, field_name: &str) -> ValidationResult<()> {
        if !self.allowed_values.contains(value) {
            return Err(ValidationError::new(
                field_name,
                "INVALID_VALUE",
                &format!("{} must be one of the allowed values", field_name),
            ));
        }
        Ok(())
    }
}

/// Unique validation within a collection
pub struct Unique;

impl<T: Clone + Eq + std::hash::Hash> ValidationRule<Vec<T>> for Unique {
    /// Ensures all elements in a vector are unique.
    ///
    /// # Returns
    ///
    /// `Ok(())` if every element in `value` is unique, `Err(ValidationError)` with code
    /// `"DUPLICATE_VALUES"` when a duplicate is found.
    ///
    /// # Examples
    ///
    /// ```
    /// use std::collections::HashSet;
    /// // Assuming `Unique` and `ValidationRule` are in scope
    /// let rule = Unique;
    /// let values = vec![1, 2, 3];
    /// assert!(rule.validate(&values, "numbers").is_ok());
    ///
    /// let dup = vec![1, 2, 1];
    /// let err = rule.validate(&dup, "numbers").unwrap_err();
    /// assert_eq!(err.code, "DUPLICATE_VALUES");
    /// assert!(err.message.contains("numbers contains duplicate values"));
    /// ```
    fn validate(&self, value: &Vec<T>, field_name: &str) -> ValidationResult<()> {
        let mut seen = HashSet::new();
        for item in value {
            if !seen.insert(item.clone()) {
                return Err(ValidationError::new(
                    field_name,
                    "DUPLICATE_VALUES",
                    &format!("{} contains duplicate values", field_name),
                ));
            }
        }
        Ok(())
    }
}

/// URL format validation
pub struct Url;

impl ValidationRule<String> for Url {
    /// Validates that the provided string is a syntactically valid URL for the given field.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = Url;
    /// assert!(rule.validate(&"https://example.com".to_string(), "website").is_ok());
    /// assert!(rule.validate(&"not-a-url".to_string(), "website").is_err());
    /// ```
    fn validate(&self, value: &String, field_name: &str) -> ValidationResult<()> {
        if url::Url::parse(value).is_err() {
            return Err(ValidationError::new(
                field_name,
                "INVALID_URL",
                &format!("{} must be a valid URL", field_name),
            ));
        }
        Ok(())
    }
}

/// Boolean validation (must be true)
pub struct MustBeTrue;

impl ValidationRule<bool> for MustBeTrue {
    /// Ensures the given boolean value is true.
    ///
    /// # Returns
    ///
    /// `Ok(())` if `value` is `true`, `Err(ValidationError)` with code `"MUST_BE_TRUE"` and message
    /// `"<field_name> must be true"` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let rule = MustBeTrue;
    /// assert!(rule.validate(&true, "consent").is_ok());
    /// let err = rule.validate(&false, "consent").unwrap_err();
    /// assert_eq!(err.code, "MUST_BE_TRUE");
    /// assert!(err.message.contains("consent must be true"));
    /// ```
    fn validate(&self, value: &bool, field_name: &str) -> ValidationResult<()> {
        if !*value {
            return Err(ValidationError::new(
                field_name,
                "MUST_BE_TRUE",
                &format!("{} must be true", field_name),
            ));
        }
        Ok(())
    }
}

/// Applies all provided validation rules; validation succeeds only if every rule passes.
///
/// # Examples
///
/// ```
/// let rule = all(vec![
///     Length { min: Some(3), max: Some(10) },
///     Email,
/// ]);
/// assert!(rule.validate(&"a@b.com".to_string(), "email").is_ok());
/// assert!(rule.validate(&"x".to_string(), "email").is_err());
/// ```
pub fn all<T, R: ValidationRule<T>>(rules: Vec<R>) -> impl ValidationRule<T> {
    Custom::new(
        move |value: &T| {
            rules.iter().all(|rule| {
                // We need to provide a dummy field name since we're composing
                rule.validate(value, "").is_ok()
            })
        },
        "VALIDATION_FAILED",
        "One or more validation rules failed",
    )
}

/// Creates a validation rule that succeeds if any of the provided rules succeeds.
///
/// The returned rule validates a value by applying each rule in `rules` and passing
/// when at least one of them validates the value.
///
/// # Examples
///
/// ```
/// let rule = any(vec![
///     Custom::new(|s: &String| s == "foo", "MATCH_FOO", "{} must be foo"),
///     Custom::new(|s: &String| s == "bar", "MATCH_BAR", "{} must be bar"),
/// ]);
///
/// assert!(rule.validate(&"foo".to_string(), "field").is_ok());
/// assert!(rule.validate(&"baz".to_string(), "field").is_err());
/// ```
pub fn any<T, R: ValidationRule<T>>(rules: Vec<R>) -> impl ValidationRule<T> {
    Custom::new(
        move |value: &T| rules.iter().any(|rule| rule.validate(value, "").is_ok()),
        "VALIDATION_FAILED",
        "None of the validation rules passed",
    )
}

/// Inverts a validation rule.
///
/// Produces a new rule that succeeds when the provided rule fails for a given value,
/// and fails when the provided rule succeeds. The returned rule uses a generic
/// `VALIDATION_FAILED` error code and a message indicating the original rule passed.
///
/// # Examples
///
/// ```
/// let rule = not(Required);
/// let empty = String::new();
/// assert!(rule.validate(&empty, "field").is_ok()); // Required would fail, so not succeeds
///
/// let non_empty = "value".to_string();
/// assert!(rule.validate(&non_empty, "field").is_err()); // Required would succeed, so not fails
/// ```
pub fn not<T, R: ValidationRule<T>>(rule: R) -> impl ValidationRule<T> {
    Custom::new(
        move |value: &T| rule.validate(value, "").is_err(),
        "VALIDATION_FAILED",
        "Validation rule should have failed but passed",
    )
}

/// Applies a validation rule only when a provided condition holds for the value.
///
/// When the condition returns `true` the supplied rule is executed; when the condition
/// returns `false` the validation is skipped and treated as success.
///
/// # Examples
///
/// ```
/// let rule = when(
///     |s: &String| s.starts_with('A'),
///     Length { min: Some(2), max: None },
/// );
///
/// assert!(rule.validate(&"Apple".to_string(), "name").is_ok()); // condition true, length OK
/// assert!(rule.validate(&"A".to_string(), "name").is_err());     // condition true, length too short
/// assert!(rule.validate(&"Banana".to_string(), "name").is_ok()); // condition false, validation skipped
/// ```
pub fn when<T, C, R>(condition: C, rule: R) -> impl ValidationRule<T>
where
    C: Fn(&T) -> bool,
    R: ValidationRule<T>,
{
    Custom::new(
        move |value: &T| {
            if condition(value) {
                rule.validate(value, "").is_ok()
            } else {
                true // Skip validation if condition not met
            }
        },
        "CONDITIONAL_VALIDATION_FAILED",
        "Conditional validation failed",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_required_string() {
        let rule = Required;
        assert!(rule.validate(&"test".to_string(), "name").is_ok());
        assert!(rule.validate(&"".to_string(), "name").is_err());
    }

    #[test]
    fn test_email_validation() {
        let rule = Email;
        assert!(rule
            .validate(&"test@example.com".to_string(), "email")
            .is_ok());
        assert!(rule
            .validate(&"invalid-email".to_string(), "email")
            .is_err());
    }

    #[test]
    fn test_length_validation() {
        let rule = Length {
            min: Some(2),
            max: Some(10),
        };
        assert!(rule.validate(&"test".to_string(), "name").is_ok());
        assert!(rule.validate(&"t".to_string(), "name").is_err());
        assert!(rule
            .validate(&"this_is_too_long".to_string(), "name")
            .is_err());
    }

    #[test]
    fn test_range_validation() {
        let rule = Range {
            min: Some(18),
            max: Some(65),
        };
        assert!(rule.validate(&25, "age").is_ok());
        assert!(rule.validate(&17, "age").is_err());
        assert!(rule.validate(&70, "age").is_err());
    }

    #[test]
    fn test_composition_all() {
        let rules: Vec<Length> = vec![
            Length {
                min: Some(2),
                max: None,
            },
            Length {
                min: None,
                max: Some(10),
            },
        ];
        let composed = all(rules);
        assert!(composed.validate(&"test".to_string(), "name").is_ok());
        assert!(composed.validate(&"t".to_string(), "name").is_err());
    }
}
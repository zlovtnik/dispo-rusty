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
    pub fn new(allowed_values: Vec<T>) -> Self {
        Self { allowed_values }
    }
}

impl<T: Clone + PartialEq> ValidationRule<T> for OneOf<T> {
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

/// Higher-order validation functions for composition

/// Combine multiple validation rules with AND logic
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

/// Combine multiple validation rules with OR logic
pub fn any<T, R: ValidationRule<T>>(rules: Vec<R>) -> impl ValidationRule<T> {
    Custom::new(
        move |value: &T| rules.iter().any(|rule| rule.validate(value, "").is_ok()),
        "VALIDATION_FAILED",
        "None of the validation rules passed",
    )
}

/// Negate a validation rule
pub fn not<T, R: ValidationRule<T>>(rule: R) -> impl ValidationRule<T> {
    Custom::new(
        move |value: &T| rule.validate(value, "").is_err(),
        "VALIDATION_FAILED",
        "Validation rule should have failed but passed",
    )
}

/// Conditional validation - only apply rule if condition is met
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

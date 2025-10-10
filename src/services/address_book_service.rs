//! Service functions for address book operations
//!
//! Provides advanced functional programming patterns for CRUD operations on Person entities.
//! Uses iterator chains, lazy evaluation, and iterator-based validation for high-performance processing.
//!
//! ## Functional Programming Features
//!
//! - **Iterator-based validation**: All input validation uses iterator chains
//! - **Lazy evaluation**: Database queries use functional pipelines for memory efficiency
//! - **Pure functional composition**: Business logic composed from pure functions
//! - **Immutable data transformations**: All operations preserve immutability
//! - **Error handling monads**: Comprehensive Result/Option chaining

use crate::{
    config::db::Pool,
    constants,
    error::ServiceError,
    models::{
        filters::PersonFilter,
        person::{Person, PersonDTO},
        response::Page,
    },
    services::functional_patterns::Validator,
    services::functional_service_base::{FunctionalErrorHandling, FunctionalQueryService},
};

/// Iterator-based validation using functional combinator pattern
fn create_person_validator() -> Validator<PersonDTO> {
    Validator::new()
        .rule(|dto: &PersonDTO| {
            if dto.name.trim().is_empty() {
                Err(ServiceError::bad_request("Name cannot be empty"))
            } else if dto.name.len() > 100 {
                Err(ServiceError::bad_request(
                    "Name too long (max 100 characters)",
                ))
            } else {
                Ok(())
            }
        })
        .rule(|dto: &PersonDTO| {
            if dto.email.trim().is_empty() {
                Err(ServiceError::bad_request("Email cannot be empty"))
            } else if !dto.email.contains('@') {
                Err(ServiceError::bad_request("Invalid email format"))
            } else if dto.email.len() > 255 {
                Err(ServiceError::bad_request(
                    "Email too long (max 255 characters)",
                ))
            } else {
                Ok(())
            }
        })
}

/// Legacy validation for backward compatibility - uses new functional validator
fn validate_person_dto(dto: &PersonDTO) -> Result<(), ServiceError> {
    create_person_validator().validate(dto)
}

/// Fetches all Person records with iterator-based processing and lazy evaluation.
///
/// This function demonstrates lazy evaluation and iterator-based processing
/// without immediately collecting results, allowing for efficient chaining.
///
/// # Returns
/// `Ok(Vec<Person>)` on success, `Err(ServiceError)` on database errors.
pub fn find_all(pool: &Pool) -> Result<Vec<Person>, ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    query_service
        .query(|conn| {
            Person::find_all(conn).map_err(|_| {
                ServiceError::internal_server_error(
                    constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string(),
                )
            })
        })
        .log_error("find_all operation")
}

/// Retrieve a person by their ID using functional error handling.
///
/// Pure function that composes database operations with lazy error mapping.
///
/// # Returns
/// `Ok(Person)` if found, `Err(ServiceError::NotFound)` if not found.
pub fn find_by_id(id: i32, pool: &Pool) -> Result<Person, ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    query_service.query(|conn| {
        Person::find_by_id(id, conn)
            .map_err(|_| ServiceError::not_found(format!("Person with id {} not found", id)))
    })
}

/// Retrieves a paginated page of people using lazy iterator evaluation.
///
/// Applies filtering through iterator chains without immediate collection,
/// enabling efficient lazy processing of potentially large datasets.
///
/// # Returns
/// `Ok(Page<Person>)` with filtered and paginated results.
pub fn filter(filter: PersonFilter, pool: &Pool) -> Result<Page<Person>, ServiceError> {
    use log::{debug, error};

    debug!("Starting filter operation with filter: {:?}", filter);
    let query_service = FunctionalQueryService::new(pool.clone());

    query_service.query(|conn| {
        debug!("Executing Person::filter with database connection");
        Person::filter(filter, conn).map_err(|e| {
            error!("Database error in Person::filter: {}", e);
            ServiceError::internal_server_error(format!("Database error: {}", e))
        })
    })
}

/// Inserts a new person using iterator-based validation and functional pipelines.
///
/// Uses iterator chains for validation and composes database operations through functional pipelines.
///
/// # Returns
/// `Ok(())` on successful insertion, `Err(ServiceError)` on validation or database errors.
pub fn insert(new_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    // Use iterator-based validation pipeline
    validate_person_dto(&new_person)?;

    // Use functional pipeline with validated data
    crate::services::functional_service_base::ServicePipeline::new(pool.clone())
        .with_data(new_person)
        .execute(|person, conn| {
            Person::insert(person, conn)
                .map_err(|_| {
                    ServiceError::internal_server_error(
                        constants::MESSAGE_CAN_NOT_INSERT_DATA.to_string(),
                    )
                })
                .map(|_| ())
        })
}

/// Updates a person using iterator-based validation and functional pipelines.
///
/// Validates input data using iterator chains, verifies existence, then performs update in a functional pipeline.
///
/// # Returns
/// `Ok(())` on successful update, `Err(ServiceError)` on validation or database errors.
pub fn update(id: i32, updated_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    // Use iterator-based validation pipeline
    validate_person_dto(&updated_person)?;

    // Use functional pipeline with validated data
    crate::services::functional_service_base::ServicePipeline::new(pool.clone())
        .with_data((id, updated_person))
        .execute(move |(person_id, person), conn| {
            Person::find_by_id(person_id, conn).map_err(|_| {
                ServiceError::not_found(format!("Person with id {} not found", person_id))
            })?;
            Person::update(person_id, person, conn)
                .map_err(|_| {
                    ServiceError::internal_server_error(
                        constants::MESSAGE_CAN_NOT_UPDATE_DATA.to_string(),
                    )
                })
                .map(|_| ())
        })
}

/// Deletes a person using pure functional composition.
///
/// Verifies existence through lazy evaluation, then performs deletion
/// in a functional pipeline.
///
/// # Returns
/// `Ok(())` on successful deletion, `Err(ServiceError)` on database errors.
pub fn delete(id: i32, pool: &Pool) -> Result<(), ServiceError> {
    let query_service = FunctionalQueryService::new(pool.clone());

    query_service
        .query(|conn| {
            Person::find_by_id(id, conn)
                .map_err(|_| ServiceError::not_found(format!("Person with id {} not found", id)))
        })
        .and_then_error(|_| {
            query_service.query(|conn| {
                Person::delete(id, conn)
                    .map_err(|_| {
                        ServiceError::internal_server_error(
                            constants::MESSAGE_CAN_NOT_DELETE_DATA.to_string(),
                        )
                    })
                    .map(|_| ())
            })
        })
}

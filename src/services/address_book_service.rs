use crate::{
    config::db::Pool,
    constants,
    error::ServiceError,
    models::{
        filters::PersonFilter,
        person::{Person, PersonDTO},
        response::Page,
    },
};

pub fn find_all(pool: &Pool) -> Result<Vec<Person>, ServiceError> {
    match Person::find_all(&mut pool.get().unwrap()) {
        Ok(person) => Ok(person),
        Err(_) => Err(ServiceError::InternalServerError {
            error_message: constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string(),
        }),
    }
}

pub fn find_by_id(id: i32, pool: &Pool) -> Result<Person, ServiceError> {
    match Person::find_by_id(id, &mut pool.get().unwrap()) {
        Ok(person) => Ok(person),
        Err(_) => Err(ServiceError::NotFound {
            error_message: format!("Person with id {} not found", id),
        }),
    }
}

pub fn filter(filter: PersonFilter, pool: &Pool) -> Result<Page<Person>, ServiceError> {
    match Person::filter(filter, &mut pool.get().unwrap()) {
        Ok(people) => Ok(people),
        Err(_) => Err(ServiceError::InternalServerError {
            error_message: constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string(),
        }),
    }
}

/// Inserts a new person record into the database.
///
/// Returns `Ok(())` when the record is created, or `Err(ServiceError::InternalServerError)`
/// if the insertion fails.
///
/// # Examples
///
/// ```no_run
/// use crate::models::PersonDTO;
/// use crate::services::address_book_service::insert;
/// use crate::db::Pool;
///
/// let pool: Pool = /* obtain pool */ unimplemented!();
/// let new_person = PersonDTO { /* fields */ unimplemented!() };
/// let result = insert(new_person, &pool);
/// assert!(result.is_ok() || result.is_err());
/// ```
pub fn insert(new_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    match Person::insert(new_person, &mut pool.get().unwrap()) {
        Ok(_) => Ok(()),
        Err(_) => Err(ServiceError::InternalServerError {
            error_message: constants::MESSAGE_CAN_NOT_INSERT_DATA.to_string(),
        }),
    }
}

/// Updates an existing Person identified by `id` with the provided `updated_person` data.
///
/// Returns `Err(ServiceError::NotFound)` if no person exists with the given `id`.
/// Returns `Err(ServiceError::InternalServerError)` if the update operation fails.
///
/// # Examples
///
/// ```no_run
/// // Assuming `pool` and `dto` are previously created:
/// // let pool: Pool = ...;
/// // let dto: PersonDTO = ...;
/// let res = update(1, dto, &pool);
/// match res {
///     Ok(()) => println!("Update succeeded"),
///     Err(e) => println!("Update failed: {:?}", e),
/// }
/// ```
pub fn update(id: i32, updated_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    match Person::find_by_id(id, &mut pool.get().unwrap()) {
        Ok(_) => match Person::update(id, updated_person, &mut pool.get().unwrap()) {
            Ok(_) => Ok(()),
            Err(_) => Err(ServiceError::InternalServerError {
                error_message: constants::MESSAGE_CAN_NOT_UPDATE_DATA.to_string(),
            }),
        },
        Err(_) => Err(ServiceError::NotFound {
            error_message: format!("Person with id {} not found", id),
        }),
    }
}

/// Deletes the person with the specified `id` from the database.
///
/// Returns `Ok(())` if the person was found and deleted. Returns `ServiceError::NotFound`
/// if no person exists with the given `id`. Returns `ServiceError::InternalServerError`
/// if the deletion failed for other reasons.
///
/// # Examples
///
/// ```no_run
/// # use crate::services::address_book_service::delete;
/// # use crate::db::Pool;
/// let pool: Pool = /* obtain pool */ unimplemented!();
/// match delete(1, &pool) {
///     Ok(()) => println!("Deleted"),
///     Err(e) => println!("Error: {:?}", e),
/// }
/// ```
pub fn delete(id: i32, pool: &Pool) -> Result<(), ServiceError> {
    match Person::find_by_id(id, &mut pool.get().unwrap()) {
        Ok(_) => match Person::delete(id, &mut pool.get().unwrap()) {
            Ok(_) => Ok(()),
            Err(_) => Err(ServiceError::InternalServerError {
                error_message: constants::MESSAGE_CAN_NOT_DELETE_DATA.to_string(),
            }),
        },
        Err(_) => Err(ServiceError::NotFound {
            error_message: format!("Person with id {} not found", id),
        }),
    }
}
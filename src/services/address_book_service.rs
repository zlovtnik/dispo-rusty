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
/// # Parameters
///
/// * `new_person` - Data transfer object containing the fields for the person to create.
///
/// # Returns
///
/// `Ok(())` on success, `ServiceError::InternalServerError` with a message when insertion fails.
///
/// # Examples
///
/// ```
/// // Construct a PersonDTO and a connection pool appropriate for your application.
/// let dto = PersonDTO::default();
/// let pool = Pool::new();
/// assert!(insert(dto, &pool).is_ok());
/// ```
pub fn insert(new_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    match Person::insert(new_person, &mut pool.get().unwrap()) {
        Ok(_) => Ok(()),
        Err(_) => Err(ServiceError::InternalServerError {
            error_message: constants::MESSAGE_CAN_NOT_INSERT_DATA.to_string(),
        }),
    }
}

/// Updates the person with the given `id` using the provided `updated_person` data.
///
/// Returns `Ok(())` when the update succeeds. Returns `ServiceError::NotFound` if no person
/// exists with the given `id`, or `ServiceError::InternalServerError` if the update operation fails.
///
/// # Examples
///
/// ```ignore
/// use crate::services::address_book_service::update;
/// use crate::models::PersonDTO;
/// use crate::db::Pool;
///
/// let pool: Pool = /* obtain pool */;
/// let dto = PersonDTO { /* populate fields */ };
/// let result = update(1, dto, &pool);
/// assert!(result.is_ok());
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
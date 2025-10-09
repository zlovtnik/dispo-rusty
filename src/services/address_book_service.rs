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

/// Fetches all Person records from the database.
///
/// # Examples
///
/// ```no_run
/// let pool: Pool = /* obtain Pool from your application context */ unimplemented!();
/// let people = find_all(&pool).unwrap();
/// assert!(people.len() >= 0);
/// ```
///
/// # Returns
///
/// `Ok(Vec<Person>)` containing all persons on success; `Err(ServiceError::InternalServerError)` with a descriptive message if acquiring a database connection fails or if the data cannot be fetched.
pub fn find_all(pool: &Pool) -> Result<Vec<Person>, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::find_all(&mut conn)
                .map_err(|_| ServiceError::internal_server_error(constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string()))
        })
}

/// Retrieve a person by their ID from the database.
///
/// Attempts to obtain a database connection from the provided pool and fetch the `Person` with the given `id`.
///
/// # Returns
///
/// `Person` when a record with the given `id` exists; `ServiceError::NotFound` if no such record is found; `ServiceError::InternalServerError` if a database connection cannot be obtained or another internal error occurs.
///
/// # Examples
///
/// ```
/// let result = find_by_id(1, &pool);
/// match result {
///     Ok(person) => println!("Found: {}", person.name),
///     Err(err) => eprintln!("Error: {:?}", err),
/// }
/// ```
pub fn find_by_id(id: i32, pool: &Pool) -> Result<Person, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::not_found(format!("Person with id {} not found", id)))
        })
}

/// Retrieves a paginated page of people that match the given filter.
///
/// # Parameters
///
/// - `filter`: Criteria used to filter Person records.
/// - `pool`: Database connection pool used to obtain a connection for the query.
///
/// # Returns
///
/// `Ok(Page<Person>)` with the matching records when the query succeeds; `Err(ServiceError)` if acquiring a database connection fails or the query cannot be executed.
///
/// # Examples
///
/// ```no_run
/// use crate::models::PersonFilter;
/// use crate::services::address_book_service::filter;
///
/// let pool = /* obtain Pool from config */ unimplemented!();
/// let pfilter = PersonFilter { /* set fields */ };
/// let page = filter(pfilter, &pool).unwrap();
/// println!("found {} records", page.items.len());
/// ```
pub fn filter(filter: PersonFilter, pool: &Pool) -> Result<Page<Person>, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::filter(filter, &mut conn)
                .map_err(|_| ServiceError::internal_server_error(constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string()))
        })
}

/// Inserts a new person record into the database.
///
/// Attempts to store `new_person` using a connection taken from `pool`. On success returns unit.
///
/// # Errors
///
/// Returns `ServiceError::InternalServerError` if acquiring a database connection fails or if the insertion cannot be performed.
///
/// # Examples
///
/// ```
/// // Construct a PersonDTO according to your application's fields.
/// let dto = PersonDTO { /* ... */ };
/// let pool: Pool = /* obtain pool */;
/// let result = insert(dto, &pool);
/// assert!(result.is_ok());
/// ```
pub fn insert(new_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::insert(new_person, &mut conn)
                .map(|_| ())
                .map_err(|_| ServiceError::internal_server_error(constants::MESSAGE_CAN_NOT_INSERT_DATA.to_string()))
        })
}

/// Updates an existing person record identified by `id` with the values from `updated_person`.
///
/// # Returns
///
/// `Ok(())` if the update succeeded, `Err(ServiceError)` otherwise.
///
/// # Examples
///
/// ```rust,no_run
/// use crate::config::db::Pool;
/// use crate::models::PersonDTO;
/// use crate::services::address_book_service::update;
///
/// let pool: Pool = /* obtain pool */;
/// let dto = PersonDTO { /* fill fields */ };
/// let res = update(42, dto, &pool);
/// assert!(res.is_ok());
/// ```
pub fn update(id: i32, updated_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::not_found(format!("Person with id {} not found", id)))
                .and_then(|_| {
                    Person::update(id, updated_person, &mut conn)
                        .map(|_| ())
                        .map_err(|_| ServiceError::internal_server_error(constants::MESSAGE_CAN_NOT_UPDATE_DATA.to_string()))
                })
        })
}

/// Deletes the person with the given `id` from the database.
///
/// # Parameters
///
/// - `id`: Identifier of the person to delete.
///
/// # Returns
///
/// `Ok(())` if the person was found and deleted; `Err(ServiceError)` otherwise.
/// The error will be `ServiceError::NotFound` if no person exists with the given `id`,
/// or `ServiceError::InternalServerError` if acquiring a database connection or performing
/// the deletion fails.
///
/// # Examples
///
/// ```ignore
/// let pool = /* obtain Pool */ ;
/// delete(42, &pool).expect("failed to delete person");
/// ```
pub fn delete(id: i32, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::internal_server_error(format!("Failed to get database connection: {}", e)))
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::not_found(format!("Person with id {} not found", id)))
                .and_then(|_| {
                    Person::delete(id, &mut conn)
                        .map(|_| ())
                        .map_err(|_| ServiceError::internal_server_error(constants::MESSAGE_CAN_NOT_DELETE_DATA.to_string()))
                })
        })
}
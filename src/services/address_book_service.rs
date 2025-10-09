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
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::find_all(&mut conn)
                .map_err(|_| ServiceError::InternalServerError {
                    error_message: constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string(),
                })
        })
}

pub fn find_by_id(id: i32, pool: &Pool) -> Result<Person, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::NotFound {
                    error_message: format!("Person with id {} not found", id),
                })
        })
}

pub fn filter(filter: PersonFilter, pool: &Pool) -> Result<Page<Person>, ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::filter(filter, &mut conn)
                .map_err(|_| ServiceError::InternalServerError {
                    error_message: constants::MESSAGE_CAN_NOT_FETCH_DATA.to_string(),
                })
        })
}

pub fn insert(new_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::insert(new_person, &mut conn)
                .map(|_| ())
                .map_err(|_| ServiceError::InternalServerError {
                    error_message: constants::MESSAGE_CAN_NOT_INSERT_DATA.to_string(),
                })
        })
}

pub fn update(id: i32, updated_person: PersonDTO, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::NotFound {
                    error_message: format!("Person with id {} not found", id),
                })
                .and_then(|_| {
                    Person::update(id, updated_person, &mut conn)
                        .map(|_| ())
                        .map_err(|_| ServiceError::InternalServerError {
                            error_message: constants::MESSAGE_CAN_NOT_UPDATE_DATA.to_string(),
                        })
                })
        })
}

pub fn delete(id: i32, pool: &Pool) -> Result<(), ServiceError> {
    pool.get()
        .map_err(|e| ServiceError::InternalServerError {
            error_message: format!("Failed to get database connection: {}", e),
        })
        .and_then(|mut conn| {
            Person::find_by_id(id, &mut conn)
                .map_err(|_| ServiceError::NotFound {
                    error_message: format!("Person with id {} not found", id),
                })
                .and_then(|_| {
                    Person::delete(id, &mut conn)
                        .map(|_| ())
                        .map_err(|_| ServiceError::InternalServerError {
                            error_message: constants::MESSAGE_CAN_NOT_DELETE_DATA.to_string(),
                        })
                })
        })
}

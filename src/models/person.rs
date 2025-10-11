use diesel::{prelude::*, AsChangeset, Insertable, Queryable, BoxableExpression};
use serde::{Deserialize, Serialize};
use regex::Regex;

use crate::{
    config::db::Connection, constants::MESSAGE_OK, models::pagination::SortingAndPaging,
    schema::people, error::ServiceError,
};

use super::{filters::PersonFilter, pagination::HasId, response::Page, functional_utils};

// Re-export functional utilities for person operations
pub use functional_utils::*;

// Lazy static for email validation
use std::sync::OnceLock;
static EMAIL_REGEX: OnceLock<Regex> = OnceLock::new();

#[derive(Clone, Queryable, Serialize, Deserialize)]
pub struct Person {
    pub id: i32,
    pub name: String,
    pub gender: bool,
    pub age: i32,
    pub address: String,
    pub phone: String,
    pub email: String,
}

#[derive(Insertable, AsChangeset, Serialize, Deserialize)]
#[diesel(table_name = people)]
pub struct PersonDTO {
    pub name: String,
    pub gender: bool,
    pub age: i32,
    pub address: String,
    pub phone: String,
    pub email: String,
}

impl PersonDTO {
    /// Validates the PersonDTO using functional validation patterns
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();

        // Get email regex
        let email_regex = EMAIL_REGEX.get_or_init(|| {
            Regex::new(r"^[^@\s]+@[^@\s]+\.[^@\s]+$").unwrap()
        });

        // Define validation functions with consistent signatures
        let validate_required = |value: &str, field: &str| -> Option<String> {
            if value.trim().is_empty() {
                Some(format!("{} is required", field))
            } else {
                None
            }
        };

        let validate_length = |value: &str, field: &str, min: Option<usize>, max: Option<usize>| -> Option<String> {
            let len = value.len();
            if let Some(min_len) = min {
                if len < min_len {
                    return Some(format!("{} must be at least {} characters", field, min_len));
                }
            }
            if let Some(max_len) = max {
                if len > max_len {
                    return Some(format!("{} must be at most {} characters", field, max_len));
                }
            }
            None
        };

        let validate_email = |value: &str, field: &str| -> Option<String> {
            if !email_regex.is_match(value) {
                Some(format!("{} must be a valid email address", field))
            } else {
                None
            }
        };

        let validate_age = |age: i32, field: &str| -> Option<String> {
            if age < 0 || age > 150 {
                Some(format!("{} must be between 0 and 150", field))
            } else {
                None
            }
        };

        // Apply validations using functional composition
        if let Some(error) = validate_required(&self.name, "name") {
            errors.push(error);
        } else if let Some(error) = validate_length(&self.name, "name", None, Some(100)) {
            errors.push(error);
        }

        if let Some(error) = validate_required(&self.email, "email") {
            errors.push(error);
        } else {
            if let Some(error) = validate_email(&self.email, "email") {
                errors.push(error);
            } else if let Some(error) = validate_length(&self.email, "email", None, Some(255)) {
                errors.push(error);
            }
        }

        if let Some(error) = validate_required(&self.phone, "phone") {
            errors.push(error);
        } else if let Some(error) = validate_length(&self.phone, "phone", Some(10), Some(20)) {
            errors.push(error);
        }

        if let Some(error) = validate_required(&self.address, "address") {
            errors.push(error);
        } else if let Some(error) = validate_length(&self.address, "address", None, Some(500)) {
            errors.push(error);
        }

        // Validate age
        if let Some(error) = validate_age(self.age, "age") {
            errors.push(error);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

impl HasId for Person {
    fn id(&self) -> i32 {
        self.id
    }
}

impl Person {
    pub fn find_all(conn: &mut Connection) -> QueryResult<Vec<Person>> {
        people::table.order(people::id.asc()).load::<Person>(conn)
    }

    pub fn find_by_id(i: i32, conn: &mut Connection) -> QueryResult<Person> {
        people::table.find(i).get_result::<Person>(conn)
    }

    /// Get a paginated Page of people matching the provided filter criteria.
    ///
    /// Applies the following optional filters from `PersonFilter`:
    /// - `age`: exact match.
    /// - `email`, `name`, `phone`: partial match using SQL `LIKE` with surrounding `%` wildcards (case-sensitive).
    /// - `gender`: accepts `"male"` or `"female"` (case-insensitive) and maps to the stored boolean.
    ///
    /// Pagination uses `filter.cursor` as the page cursor (defaults to `0`) and `filter.page_size` as items per page (defaults to `crate::constants::DEFAULT_PER_PAGE`).
    ///
    /// # Examples
    ///
    /// ```
    /// // Construct a filter to find people with "example" in their email and use a DB connection.
    /// let filter = PersonFilter {
    ///     email: Some("example".into()),
    ///     age: None,
    ///     gender: None,
    ///     name: None,
    ///     phone: None,
    ///     cursor: None,
    ///     page_size: None,
    /// };
    ///
    /// let mut conn: Connection = /* obtain connection */;
    ///
    /// let page = Person::filter(filter, &mut conn).expect("query failed");
    /// assert!(page.items.len() <= crate::constants::DEFAULT_PER_PAGE);
    /// ```
    pub fn filter(filter: PersonFilter, conn: &mut Connection) -> QueryResult<Page<Person>> {
        // Use functional query building with iterator-based predicate composition
        let mut query = people::table.into_boxed();

        // Build query using functional composition with fold
        let predicates: Vec<Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>> = vec![
            filter.age.map(|age| people::age.eq(age)).map(|expr| Box::new(expr) as Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>),
            filter.email.as_ref().map(|email| people::email.like(format!("%{}%", email))).map(|expr| Box::new(expr) as Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>),
            filter.name.as_ref().map(|name| people::name.like(format!("%{}%", name))).map(|expr| Box::new(expr) as Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>),
            filter.phone.as_ref().map(|phone| people::phone.like(format!("%{}%", phone))).map(|expr| Box::new(expr) as Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>),
            filter.gender.as_ref().and_then(|gender| {
                match gender.to_lowercase().as_str() {
                    "male" => Some(people::gender.eq(true)),
                    "female" => Some(people::gender.eq(false)),
                    _ => None,
                }
            }).map(|expr| Box::new(expr) as Box<dyn BoxableExpression<people::table, diesel::pg::Pg, SqlType = diesel::sql_types::Bool>>),
        ].into_iter()
        .flatten()
        .collect();

        query = predicates.into_iter().fold(query, |q, predicate| q.filter(predicate));

        let cursor = filter.cursor.unwrap_or(0);
        let page_size = filter
            .page_size
            .unwrap_or(crate::constants::DEFAULT_PER_PAGE);

        // Handle sorting through pagination - don't add ORDER BY to the base query
        // The pagination system will handle ordering by the cursor column
        let records = query
            .paginate(cursor)
            .per_page(page_size)
            .load_items::<Person>(conn)?;
        Ok(Page::new(
            MESSAGE_OK,
            records.data,
            cursor,
            page_size,
            records.total_elements,
            records.next_cursor,
        ))
    }

    /// Insert a new person record into the `people` table.
    ///
    /// Inserts the provided `PersonDTO` and returns the number of rows inserted.
    ///
    /// # Examples
    ///
    /// ```
    /// use crate::models::{PersonDTO, insert};
    /// // `conn` is a mutable database connection available in your test/setup.
    /// let new_person = PersonDTO {
    ///     name: "Alice".into(),
    ///     gender: true,
    ///     age: 30,
    ///     address: "123 Main St".into(),
    ///     phone: "555-1234".into(),
    ///     email: "alice@example.com".into(),
    /// };
    /// let rows_inserted = insert(new_person, &mut conn).unwrap();
    /// assert_eq!(rows_inserted, 1);
    /// ```
    pub fn insert(new_person: PersonDTO, conn: &mut Connection) -> Result<usize, ServiceError> {
        // Validate using functional validation patterns
        new_person.validate().map_err(|errors| {
            ServiceError::bad_request(errors.join("; "))
        })?;

        // Insert using functional composition
        diesel::insert_into(people::table)
            .values(&new_person)
            .execute(conn)
            .map_err(|e| ServiceError::internal_server_error(format!("Failed to insert person: {}", e)))
    }

    /// Updates the person record with the specified id using values from `updated_person`.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::{PersonDTO, update, Connection};
    /// let mut conn: Connection = /* obtain connection */;
    /// let dto = PersonDTO {
    ///     name: "Alice".into(),
    ///     gender: true,
    ///     age: 30,
    ///     address: "123 Main St".into(),
    ///     phone: "555-0100".into(),
    ///     email: "alice@example.com".into(),
    /// };
    /// let rows = update(1, dto, &mut conn).expect("update failed");
    /// assert_eq!(rows, 1);
    /// ```
    ///
    /// # Returns
    ///
    /// Number of rows updated on success.
    pub fn update(i: i32, updated_person: PersonDTO, conn: &mut Connection) -> QueryResult<usize> {
        diesel::update(people::table.find(i))
            .set(&updated_person)
            .execute(conn)
    }

    /// Deletes the person with the given id from the people table.
    ///
    /// # Returns
    ///
    /// `usize` number of rows deleted.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use crate::config::db::Connection;
    /// use crate::models::person::Person;
    ///
    /// // `conn` must be a mutable database connection.
    /// let mut conn: Connection = /* obtain connection */;
    /// let deleted = Person::delete(1, &mut conn).unwrap();
    /// assert_eq!(deleted, 1);
    /// ```
    pub fn delete(i: i32, conn: &mut Connection) -> QueryResult<usize> {
        diesel::delete(people::table.find(i)).execute(conn)
    }
}

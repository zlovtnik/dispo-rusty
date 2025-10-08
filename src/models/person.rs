use diesel::{prelude::*, AsChangeset, Insertable, Queryable};
use serde::{Deserialize, Serialize};

use crate::{
    config::db::Connection,
    constants::MESSAGE_OK,
    models::pagination::SortingAndPaging,
    schema::people::{self, dsl::*},
};

use super::{filters::PersonFilter, pagination::HasId, response::Page};

#[derive(Queryable, Serialize, Deserialize)]
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

impl HasId for Person {
    fn id(&self) -> i32 {
        self.id
    }
}

impl Person {
    pub fn find_all(conn: &mut Connection) -> QueryResult<Vec<Person>> {
        people.order(id.asc()).load::<Person>(conn)
    }

    pub fn find_by_id(i: i32, conn: &mut Connection) -> QueryResult<Person> {
        people.find(i).get_result::<Person>(conn)
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
        let mut query = people::table.into_boxed();

        if let Some(i) = filter.age {
            query = query.filter(age.eq(i));
        }
        if let Some(i) = filter.email {
            query = query.filter(email.like(format!("%{}%", i)));
        }
        if let Some(i) = filter.gender {
            match i.to_lowercase().as_str() {
                "male" => {
                    query = query.filter(gender.eq(true));
                }
                "female" => {
                    query = query.filter(gender.eq(false));
                }
                _ => {}
            }
        }
        if let Some(i) = filter.name {
            query = query.filter(name.like(format!("%{}%", i)));
        }
        if let Some(i) = filter.phone {
            query = query.filter(phone.like(format!("%{}%", i)));
        }
        let cursor = filter.cursor.unwrap_or(0);
        let page_size = filter
            .page_size
            .unwrap_or(crate::constants::DEFAULT_PER_PAGE);
        let records = query
            .paginate(people::id, cursor)
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
    pub fn insert(new_person: PersonDTO, conn: &mut Connection) -> QueryResult<usize> {
        diesel::insert_into(people)
            .values(&new_person)
            .execute(conn)
    }

    pub fn update(i: i32, updated_person: PersonDTO, conn: &mut Connection) -> QueryResult<usize> {
        diesel::update(people.find(i))
            .set(&updated_person)
            .execute(conn)
    }

    /// Deletes the person with the given id from the people table.
    ///
    /// # Parameters
    ///
    /// - `i`: id of the person to delete.
    ///
    /// # Returns
    ///
    /// The number of rows deleted.
    ///
    /// # Examples
    ///
    /// ```
    /// # use crate::db::Connection;
    /// # // `conn` must be a mutable database connection.
    /// let mut conn: Connection = /* obtain connection */ unimplemented!();
    /// let deleted = delete(1, &mut conn).unwrap();
    /// assert_eq!(deleted, 1);
    /// ```
    pub fn delete(i: i32, conn: &mut Connection) -> QueryResult<usize> {
        diesel::delete(people.find(i)).execute(conn)
    }
}
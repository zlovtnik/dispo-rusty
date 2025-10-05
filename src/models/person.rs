use diesel::{prelude::*, AsChangeset, Insertable, Queryable};
use serde::{Deserialize, Serialize};

use crate::{
    config::db::Connection,
    models::pagination::SortingAndPaging,
    schema::people::{self, dsl::*},
};

use super::{filters::PersonFilter, response::Page, pagination::HasId};

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

    /// Returns a paginated page of people matching the provided filter criteria.
    ///
    /// Applies any of the following filters when present on `PersonFilter`:
    /// - `age`: exact match.
    /// - `email`, `name`, `phone`: case-sensitive partial match using SQL `LIKE` with surrounding `%` wildcards.
    /// - `gender`: accepts the strings `"male"` or `"female"` (case-insensitive) and maps them to the stored boolean value.
    ///
    /// Pagination uses `filter.cursor` as the page cursor (defaults to `0`) and `filter.page_size` as items per page (defaults to `crate::constants::DEFAULT_PER_PAGE`).
    ///
    /// # Examples
    ///
    /// ```
    /// // Construct a filter to find people with "example" in their email and use a DB connection.
    /// let filter = PersonFilter { email: Some("example".into()), age: None, gender: None, name: None, phone: None, cursor: None, page_size: None };
    /// let mut conn: Connection = /* obtain connection */;
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
        // Note: total_elements is omitted for performance. To include count:
        // .load_and_count_items(conn) returns (Vec<Person>, i64) which can be used to construct Page
        // but for large datasets, consider approximate counts or separate count queries
        query
            .paginate(
                people::id,
                filter.cursor.unwrap_or(0),
            )
            .per_page(
                filter
                    .page_size
                    .unwrap_or(crate::constants::DEFAULT_PER_PAGE),
            )
            .load_items::<Person>(conn)
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

    pub fn delete(i: i32, conn: &mut Connection) -> QueryResult<usize> {
        diesel::delete(people.find(i)).execute(conn)
    }
}
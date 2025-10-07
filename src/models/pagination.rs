// Source: https://github.com/diesel-rs/diesel/blob/master/examples/postgres/advanced-blog-cli/src/pagination.rs

#![allow(unused_imports)]

use diesel::pg::Pg;
use diesel::prelude::*;
use diesel::query_builder::*;
use diesel::query_dsl::methods::LoadQuery;
use diesel::sql_types::BigInt;
use diesel::QueryId;

use crate::constants::MESSAGE_OK;

use super::response::Page;

// Trait to extract id from model types
pub trait HasId {
    fn id(&self) -> i32;
}

pub trait SortingAndPaging: Sized {
    fn paginate<Col>(self, cursor_column: Col, cursor: i32) -> SortedAndPaginated<Self, Col>
    where
        Col: diesel::Expression + QueryFragment<Pg> + Copy + QueryId,
        Col::SqlType: diesel::sql_types::SingleValue; // Reject composite keys at compile time
}

impl<T> SortingAndPaging for T
where
    T: QueryId,
{
    fn paginate<Col>(self, cursor_column: Col, cursor: i32) -> SortedAndPaginated<Self, Col>
    where
        Col: diesel::Expression + QueryFragment<Pg> + Copy + QueryId,
        Col::SqlType: diesel::sql_types::SingleValue, // Reject composite keys at compile time
    {
        SortedAndPaginated {
            query: self,
            cursor_column,
            cursor,
            per_page: crate::constants::DEFAULT_PER_PAGE,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SortedAndPaginated<T, Col> {
    query: T,
    cursor_column: Col,
    cursor: i32,
    per_page: i64,
}

impl<T, Col> QueryId for SortedAndPaginated<T, Col>
where
    T: QueryId,
    Col: QueryId,
{
    type QueryId = (T::QueryId, Col::QueryId, i64);
    const HAS_STATIC_QUERY_ID: bool = T::HAS_STATIC_QUERY_ID && Col::HAS_STATIC_QUERY_ID;
}

impl<T, Col> SortedAndPaginated<T, Col>
where
    T: diesel::prelude::QueryDsl,
    Col: diesel::Expression + QueryFragment<Pg> + Copy,
    i32: diesel::serialize::ToSql<Col::SqlType, Pg>,
{
    /// Set the number of items to return per page for this paginated query.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // Adjust the page size to 50 items
    /// let paginated = some_query.paginate(cursor_column, 0).per_page(50);
    /// ```
    pub fn per_page(self, per_page: i64) -> Self {
        SortedAndPaginated { per_page, ..self }
    }

    /// Loads a page of records from the underlying query using the configured cursor and page size.
    ///
    /// The method executes the inner query, returns the loaded records wrapped in a `Page<U>`,
    /// sets `current_cursor` to the `cursor` stored on `self`, and sets `next_cursor` to the `id`
    /// of the last record if any were returned. No total count is computed.
    ///
    /// # Returns
    ///
    /// A `QueryResult<Page<U>>` containing the fetched records, pagination metadata, and an optional
    /// `next_cursor` which is the `id` of the last returned record.
    ///
    /// # Examples
    ///
    /// ```
    /// # use diesel::prelude::*;
    /// # use crate::{SortedAndPaginated, HasId};
    /// # let mut conn: diesel::pg::PgConnection = unimplemented!();
    /// # let col = unimplemented!();
    /// // `query` is any Diesel query that loads items of a type implementing `HasId`.
    /// let paginated = SortedAndPaginated { query: /* query */ unimplemented!(), cursor_column: col, cursor: 0, per_page: 10 };
    /// let page = paginated.load_items::<YourModel>(&mut conn).expect("load page");
    /// println!("Loaded {} records, next cursor: {:?}", page.records.len(), page.next_cursor);
    /// ```
    pub fn load_items<'a, U>(self, conn: &mut PgConnection) -> QueryResult<Page<U>>
    where
        Self: LoadQuery<'a, PgConnection, U>,
        U: HasId, // Required to extract id from model instances
    {
        let cursor = self.cursor;
        let per_page = self.per_page;
        let records = self.load::<U>(conn)?;
        let current_cursor = cursor; // Already i32

        // Calculate next_cursor from last record's id instead of cursor + per_page
        let next_cursor = records.last().map(|record| record.id());

        Ok(Page::new(
            MESSAGE_OK,
            records,
            current_cursor,
            per_page,
            None, // No count by default for performance
            next_cursor,
        ))
    }
}

impl<T: Query, Col> Query for SortedAndPaginated<T, Col> {
    type SqlType = T::SqlType;
}
impl<T, Col> RunQueryDsl<PgConnection> for SortedAndPaginated<T, Col> {}

impl<T, Col> QueryFragment<Pg> for SortedAndPaginated<T, Col>
where
    T: QueryFragment<Pg>,
    Col: QueryFragment<Pg> + Copy + diesel::Expression,
    Col::SqlType: diesel::sql_types::SingleValue,
    i32: diesel::serialize::ToSql<Col::SqlType, Pg>,
    Pg: diesel::sql_types::HasSqlType<Col::SqlType>,
{
    fn walk_ast<'b>(&'b self, mut out: AstPass<'_, 'b, Pg>) -> QueryResult<()> {
        out.push_sql("SELECT * FROM (");
        self.query.walk_ast(out.reborrow())?;
        out.push_sql(") t WHERE ");
        self.cursor_column.walk_ast(out.reborrow())?;
        out.push_sql(" > ");
        out.push_bind_param::<Col::SqlType, _>(&self.cursor)?;
        out.push_sql(" ORDER BY ");
        self.cursor_column.walk_ast(out.reborrow())?;
        out.push_sql(" LIMIT ");
        out.push_bind_param::<BigInt, _>(&self.per_page)?;
        Ok(())
    }
}
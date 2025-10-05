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

pub trait SortingAndPaging: Sized {
    fn paginate(self, cursor: i32) -> SortedAndPaginated<Self>;
}

impl<T> SortingAndPaging for T {
    /// Wraps the current query in a SortedAndPaginated configured with the provided cursor.
    ///
    /// The `cursor` represents the last-seen record ID and will be used as the lower bound for subsequent pagination.
    ///
    /// # Parameters
    ///
    /// - `cursor`: last-seen record ID to start pagination after.
    ///
    /// # Returns
    ///
    /// A `SortedAndPaginated<Self>` configured with `cursor` and the default `per_page` limit.
    ///
    /// # Examples
    ///
    /// ```
    /// // Wrap a query with a cursor starting at 0
    /// let paged = my_query.paginate(0);
    /// ```
    fn paginate(self, cursor: i32) -> SortedAndPaginated<Self> {
        SortedAndPaginated {
            query: self,
            cursor: i64::from(cursor),
            per_page: crate::constants::DEFAULT_PER_PAGE,
        }
    }
}

#[derive(Debug, Clone, QueryId)]
pub struct SortedAndPaginated<T> {
    query: T,
    cursor: i64,
    per_page: i64,
}

impl<T> SortedAndPaginated<T> {
    /// Return a new `SortedAndPaginated` with the `per_page` value replaced.
    ///
    /// # Examples
    ///
    /// ```
    /// let sp = SortedAndPaginated { query: (), cursor: 0i64, per_page: 10i64 };
    /// let sp2 = sp.per_page(20);
    /// assert_eq!(sp2.per_page, 20);
    /// ```
    pub fn per_page(self, per_page: i64) -> Self {
        SortedAndPaginated {
            per_page,
            ..self
        }
    }

    /// Load records for the current cursor from the wrapped query and return a paging `Page`.
    ///
    /// This consumes the paginated query wrapper, executes the inner query to retrieve records of
    /// type `U`, and constructs a `Page<U>` containing the fetched records, the current cursor,
    /// the configured `per_page` value, a zero placeholder for total, and the computed `next_cursor`.
    ///
    /// # Examples
    ///
    /// ```
    /// // assuming `my_query` implements the necessary Diesel Query traits and `conn` is a PgConnection
    /// let page = my_query
    ///     .paginate(0)      // start cursor
    ///     .per_page(10)     // items per page
    ///     .load_items(&mut conn)
    ///     .unwrap();
    ///
    /// assert_eq!(page.current_cursor, 0);
    /// assert_eq!(page.per_page, 10);
    /// ```
    ///
    /// # Returns
    ///
    /// `Page<U>` containing the retrieved records, the current cursor as an `i32`, the `per_page` value,
    /// a total placeholder of `0`, and `next_cursor` set to `Some(current_cursor + per_page as i32)`.
    pub fn load_items<'a, U>(self, conn: &mut PgConnection) -> QueryResult<Page<U>>
    where
        Self: LoadQuery<'a, PgConnection, U>,
    {
        let cursor = self.cursor;
        let per_page = self.per_page;
        let records = self.load::<U>(conn)?;
        let current_cursor = cursor as i32;
        let next_cursor = Some(current_cursor + per_page as i32);
        Ok(Page::new(
            MESSAGE_OK,
            records,
            current_cursor,
            per_page,
            0,
            next_cursor,
        ))
    }
}

impl<T: Query> Query for SortedAndPaginated<T> {
    type SqlType = T::SqlType;
}

impl<T> RunQueryDsl<PgConnection> for SortedAndPaginated<T> {}

impl<T> QueryFragment<Pg> for SortedAndPaginated<T>
where
    T: QueryFragment<Pg>,
{
    /// Appends a PostgreSQL pagination SQL fragment for the wrapped query to the AST output.
    
    ///
    
    /// The fragment wraps the inner query as a subquery aliased `t`, filters rows with `t.id > <cursor>`,
    
    /// orders by `t.id`, and applies a `LIMIT <per_page>`.
    
    ///
    
    /// # Examples
    
    ///
    
    /// ```
    
    /// use diesel::debug_query;
    
    /// use diesel::pg::Pg;
    
    /// use diesel::sql_query;
    
    /// // `sql_query` is used here to produce a generic query that can be wrapped.
    
    /// let base = sql_query("SELECT id, * FROM items");
    
    /// let paginated = base.paginate(0);
    
    /// let sql = debug_query::<Pg, _>(&paginated).to_string();
    
    /// assert!(sql.contains("SELECT * FROM ("));
    
    /// assert!(sql.contains("WHERE t.id >"));
    
    /// assert!(sql.contains("ORDER BY t.id LIMIT"));
    
    /// ```
    fn walk_ast<'b>(&'b self, mut out: AstPass<'_, 'b, Pg>) -> QueryResult<()> {
        out.push_sql("SELECT * FROM (");
        self.query.walk_ast(out.reborrow())?;
        out.push_sql(") t WHERE t.id > ");
        out.push_bind_param::<BigInt, _>(&self.cursor)?;
        out.push_sql(" ORDER BY t.id LIMIT ");
        out.push_bind_param::<BigInt, _>(&self.per_page)?;
        Ok(())
    }
}
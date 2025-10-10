// Simplified pagination for actix-web-rest-api-with-jwt

use diesel::pg::Pg;
use diesel::prelude::*;
use diesel::query_builder::*;
use diesel::query_dsl::methods::LoadQuery;
use diesel::sql_types::BigInt;

use crate::constants::MESSAGE_OK;

use super::response::Page;

// Trait to extract id from model types
pub trait HasId {
    fn id(&self) -> i32;
}

pub trait SortingAndPaging: Sized {
    fn paginate(self, cursor: i32) -> SortedAndPaginated<Self>
    where
        Self: QueryId;
}

impl<T> SortingAndPaging for T
where
    T: QueryId,
{
    fn paginate(self, cursor: i32) -> SortedAndPaginated<Self> {
        SortedAndPaginated {
            query: self,
            cursor,
            per_page: crate::constants::DEFAULT_PER_PAGE,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SortedAndPaginated<T> {
    query: T,
    cursor: i32,
    per_page: i64,
}

impl<T> QueryId for SortedAndPaginated<T>
where
    T: QueryId,
{
    type QueryId = (T::QueryId, i32, i64);
    const HAS_STATIC_QUERY_ID: bool = T::HAS_STATIC_QUERY_ID;
}

impl<T> SortedAndPaginated<T>
where
    T: Query,
{
    pub fn per_page(mut self, per_page: i64) -> Self {
        self.per_page = per_page;
        self
    }

    pub fn cursor(mut self, cursor: i32) -> Self {
        self.cursor = cursor;
        self
    }

    pub fn load_items<'a, U>(self, conn: &mut PgConnection) -> QueryResult<Page<U>>
    where
        Self: LoadQuery<'a, PgConnection, U>,
        U: HasId,
    {
        let cursor = self.cursor;
        let per_page = self.per_page;
        let records = self.load::<U>(conn)?;
        let current_cursor = cursor;

        let next_cursor = records.last().map(|record| record.id());

        Ok(Page::new(
            MESSAGE_OK,
            records,
            current_cursor,
            per_page,
            None,
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
    fn walk_ast<'b>(&'b self, mut out: AstPass<'_, 'b, Pg>) -> QueryResult<()> {
        out.push_sql("SELECT * FROM (");
        self.query.walk_ast(out.reborrow())?;
        out.push_sql(") t WHERE t.id > ");
        out.push_bind_param::<diesel::sql_types::Integer, _>(&self.cursor)?;
        out.push_sql(" ORDER BY t.id LIMIT ");
        out.push_bind_param::<BigInt, _>(&self.per_page)?;
        Ok(())
    }
}
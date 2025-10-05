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
    pub fn per_page(self, per_page: i64) -> Self {
        SortedAndPaginated {
            per_page,
            ..self
        }
    }

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

use chrono::{NaiveDateTime, Utc};
use diesel::{prelude::*, Associations, Identifiable, Insertable, Queryable};

use crate::{
    config::db::Connection,
    models::user::{operations as user_ops, User},
    schema::login_history::{self, dsl::*},
};

#[derive(Identifiable, Associations, Queryable)]
#[diesel(belongs_to(User))]
#[diesel(table_name = login_history)]
pub struct LoginHistory {
    pub id: i32,
    pub user_id: i32,
    pub login_timestamp: NaiveDateTime,
}
#[derive(Insertable)]
#[diesel(table_name = login_history)]
pub struct LoginHistoryInsertableDTO {
    pub user_id: i32,
    pub login_timestamp: NaiveDateTime,
}

impl LoginHistory {
    /// Builds an insertable login-history record for the given username if that user exists.
    ///
    /// Looks up the user by username and, on success, returns a `LoginHistoryInsertableDTO` populated
    /// with the user's `id` and the current UTC timestamp. Returns `None` if no matching user is found.
    ///
    /// # Arguments
    ///
    /// * `un` - Username to look up.
    /// * `conn` - Mutable database connection used for the lookup.
    ///
    /// # Returns
    ///
    /// `Some(LoginHistoryInsertableDTO)` with `user_id` and `login_timestamp` when the user exists, `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// // assume `conn` is a valid &mut Connection and a user "alice" exists
    /// let dto = create("alice", &mut conn);
    /// assert!(dto.is_some());
    /// if let Some(record) = dto {
    ///     assert_eq!(record.user_id > 0, true);
    /// }
    /// ```
    pub fn create(un: &str, conn: &mut Connection) -> Option<LoginHistoryInsertableDTO> {
        user_ops::find_user_by_username(un, conn).ok().map(|user| {
            let now = Utc::now();
            LoginHistoryInsertableDTO {
                user_id: user.id,
                login_timestamp: now.naive_utc(),
            }
        })
    }

    pub fn save_login_history(
        insert_record: LoginHistoryInsertableDTO,
        conn: &mut Connection,
    ) -> QueryResult<usize> {
        diesel::insert_into(login_history)
            .values(&insert_record)
            .execute(conn)
    }
}

use diesel::{prelude::*, Identifiable, Insertable, Queryable, AsChangeset, result};
use serde::{Deserialize, Serialize};

use crate::{
    schema::tenants::{self, dsl::*},
};
use chrono::NaiveDateTime;
use std::io::{Error as IoError, ErrorKind};

#[derive(Identifiable, Queryable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub db_url: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct TenantDTO {
    pub id: String,
    pub name: String,
    pub db_url: String,
}

#[derive(AsChangeset, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct UpdateTenant {
    pub name: Option<String>,
    pub db_url: Option<String>,
}

impl Tenant {
    pub fn validate_db_url(url: &str) -> QueryResult<()> {
        // Validate URL format
        url::Url::parse(url).map_err(|_| result::Error::DatabaseError(
            result::DatabaseErrorKind::Unknown,
            Box::new("Invalid database URL format".to_string()),
        ))?;

        Ok(())
    }

    pub fn create(dto: TenantDTO, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        Self::validate_db_url(&dto.db_url)?;
        diesel::insert_into(tenants).values(&dto).get_result(conn)
    }

    pub fn update(id_: &str, dto: UpdateTenant, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        if let Some(ref url) = dto.db_url {
            Self::validate_db_url(url)?;
        }
        diesel::update(tenants.find(id_)).set(&dto).get_result(conn)
    }

    pub fn delete(id_: &str, conn: &mut crate::config::db::Connection) -> QueryResult<usize> {
        diesel::delete(tenants.find(id_)).execute(conn)
    }

    pub fn find_by_id(t_id: &str, conn: &mut crate::config::db::Connection) -> QueryResult<Tenant> {
        tenants.filter(id.eq(t_id)).get_result::<Tenant>(conn)
    }

    pub fn list_all(conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        tenants.load::<Tenant>(conn)
    }
}

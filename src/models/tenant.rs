use diesel::{prelude::*, Identifiable, Insertable, Queryable, AsChangeset, result};
use serde::{Deserialize, Serialize};

use crate::{
    schema::tenants::{self, dsl::*},
    models::filters::TenantFilter,
};
use chrono::NaiveDateTime;

#[derive(Clone, Identifiable, Queryable, Serialize, Deserialize)]
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

    pub fn batch_create(dtos: Vec<TenantDTO>, conn: &mut crate::config::db::Connection) -> QueryResult<usize> {
        for dto in &dtos {
            Self::validate_db_url(&dto.db_url)?;
        }
        diesel::insert_into(tenants).values(&dtos).execute(conn)
    }

    pub fn filter(filter: TenantFilter, conn: &mut crate::config::db::Connection) -> QueryResult<Vec<Tenant>> {
        let mut query = tenants::table.into_boxed();

        for field_filter in &filter.filters {
            match field_filter.field.as_str() {
                "id" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(id.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(id.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for id
                    }
                }
                "name" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(name.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(name.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for name
                    }
                }
                "db_url" => {
                    match field_filter.operator.as_str() {
                        "contains" => {
                            query = query.filter(db_url.like(format!("%{}%", field_filter.value)));
                        }
                        "equals" => {
                            query = query.filter(db_url.eq(&field_filter.value));
                        }
                        _ => {} // Ignore unsupported operators for db_url
                    }
                }
                "created_at" => {
                    // Parse the value as datetime if possible
                    if let Ok(dt) = NaiveDateTime::parse_from_str(&field_filter.value, "%Y-%m-%dT%H:%M:%S%.fZ") {
                        match field_filter.operator.as_str() {
                            "gt" => {
                                query = query.filter(created_at.gt(dt));
                            }
                            "gte" => {
                                query = query.filter(created_at.ge(dt));
                            }
                            "lt" => {
                                query = query.filter(created_at.lt(dt));
                            }
                            "lte" => {
                                query = query.filter(created_at.le(dt));
                            }
                            "equals" => {
                                query = query.filter(created_at.eq(dt));
                            }
                            _ => {} // Ignore unsupported operators for dates
                        }
                    }
                }
                "updated_at" => {
                    // Parse the value as datetime if possible
                    if let Ok(dt) = NaiveDateTime::parse_from_str(&field_filter.value, "%Y-%m-%dT%H:%M:%S%.fZ") {
                        match field_filter.operator.as_str() {
                            "gt" => {
                                query = query.filter(updated_at.gt(dt));
                            }
                            "gte" => {
                                query = query.filter(updated_at.ge(dt));
                            }
                            "lt" => {
                                query = query.filter(updated_at.lt(dt));
                            }
                            "lte" => {
                                query = query.filter(updated_at.le(dt));
                            }
                            "equals" => {
                                query = query.filter(updated_at.eq(dt));
                            }
                            _ => {} // Ignore unsupported operators for dates
                        }
                    }
                }
                _ => {} // Ignore unknown fields
            }
        }

        let mut results = query.load::<Tenant>(conn)?;

        // Apply pagination if specified
        if let Some(page_size) = filter.page_size {
            let cursor = filter.cursor.unwrap_or(0) as usize;
            let start = cursor * page_size as usize;
            let end = start + page_size as usize;
            if start < results.len() {
                results = results[start..std::cmp::min(end, results.len())].to_vec();
            } else {
                results = vec![];
            }
        }

        Ok(results)
    }
}

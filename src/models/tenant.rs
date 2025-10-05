use diesel::{prelude::*, Identifiable, Insertable, Queryable};
use serde::{Deserialize, Serialize};

use crate::{
    config::db::Connection,
    schema::tenants::{self, dsl::*},
};

#[derive(Identifiable, Queryable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct Tenant {
    pub id: String,
    pub name: String,
    pub db_url: String,
}

#[derive(Insertable, Serialize, Deserialize)]
#[diesel(table_name = tenants)]
pub struct TenantDTO {
    pub id: String,
    pub name: String,
    pub db_url: String,
}

impl Tenant {
    pub fn find_by_id(t_id: &str, conn: &mut Connection) -> QueryResult<Tenant> {
        tenants.filter(id.eq(t_id)).get_result::<Tenant>(conn)
    }

    pub fn list_all(conn: &mut Connection) -> QueryResult<Vec<Tenant>> {
        tenants.load::<Tenant>(conn)
    }
}

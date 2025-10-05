use serde::Deserialize;

#[derive(Deserialize)]
pub struct PersonFilter {
    pub name: Option<String>,
    pub gender: Option<String>,
    pub age: Option<i32>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub cursor: Option<i32>,
    pub page_size: Option<i64>,
}

#[derive(Deserialize)]
pub struct TenantFilter {
    pub filters: Vec<FieldFilter>,
    pub cursor: Option<i32>,
    pub page_size: Option<i64>,
}

#[derive(Deserialize)]
pub struct FieldFilter {
    pub field: String, // "name", "id", "db_url", "created_at", "updated_at"
    pub operator: String, // "contains", "equals", "gt", "lt", "gte", "lte"
    pub value: String,
}

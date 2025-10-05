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

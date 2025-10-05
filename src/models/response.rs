use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseBody<T> {
    pub message: String,
    pub data: T,
}

impl<T> ResponseBody<T> {
    pub fn new(message: &str, data: T) -> ResponseBody<T> {
        ResponseBody {
            message: message.to_string(),
            data,
        }
    }
}

#[derive(Serialize)]
pub struct Page<T> {
    pub message: String,
    pub data: Vec<T>,
    pub current_cursor: i32,
    pub page_size: i64,
    pub total_elements: i64,
    pub next_cursor: Option<i32>,
}
impl<T> Page<T> {
    pub fn new(
        message: &str,
        data: Vec<T>,
        current_cursor: i32,
        page_size: i64,
        total_elements: i64,
        next_cursor: Option<i32>,
    ) -> Page<T> {
        Page {
            message: message.to_string(),
            data,
            current_cursor,
            page_size,
            total_elements,
            next_cursor,
        }
    }
}

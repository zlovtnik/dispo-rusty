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
    /// Creates a new `Page<T>` populated with the provided message, data, cursor, and pagination metadata.
    ///
    /// Returns a `Page<T>` with `message`, `data`, `current_cursor`, `page_size`, `total_elements`, and `next_cursor` set to the supplied values.
    ///
    /// # Examples
    ///
    /// ```
    /// let page = Page::new("ok", vec![1, 2, 3], 0, 10, 3, Some(1));
    /// assert_eq!(page.message, "ok");
    /// assert_eq!(page.data, vec![1, 2, 3]);
    /// assert_eq!(page.current_cursor, 0);
    /// assert_eq!(page.page_size, 10);
    /// assert_eq!(page.total_elements, 3);
    /// assert_eq!(page.next_cursor, Some(1));
    /// ```
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
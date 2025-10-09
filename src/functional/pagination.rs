//! Iterator-based pagination utilities.
//!
//! FP-012: iterator-driven pagination with bounded memory usage. The helpers here
//! enable large dataset processing without materialising every element by
//! carefully consuming only the items required for the requested page.

use std::iter::{FusedIterator, Iterator};

/// Pagination input parameters represented as a cursor (zero-based page index)
/// and the desired page size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pagination {
    cursor: usize,
    page_size: usize,
}

impl Pagination {
    /// Constructs a `Pagination` with the given zero-based cursor and page size.
    ///
    /// If `page_size` is `0`, it will be treated as `1`.
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(2, 0);
    /// assert_eq!(p.cursor(), 2);
    /// assert_eq!(p.page_size(), 1);
    /// ```
    pub fn new(cursor: usize, page_size: usize) -> Self {
        Self {
            cursor,
            page_size: page_size.max(1),
        }
    }

    /// Creates a `Pagination` from optional integer inputs, normalizing missing or out-of-range values.
    
    ///
    
    /// If `cursor` is `None` it defaults to `0`; negative cursor values are clamped to `0`.
    
    /// If `page_size` is `None` the `default_page_size` is used; provided or default page sizes less
    
    /// than `1` are coerced to `1`.
    
    ///
    
    /// # Examples
    
    ///
    
    /// ```
    
    /// let p = Pagination::from_optional(Some(2), Some(5), 10);
    
    /// assert_eq!(p.cursor(), 2);
    
    /// assert_eq!(p.page_size(), 5);
    
    ///
    
    /// let p_default = Pagination::from_optional(None, None, 8);
    
    /// assert_eq!(p_default.cursor(), 0);
    
    /// assert_eq!(p_default.page_size(), 8);
    
    ///
    
    /// let p_clamped = Pagination::from_optional(Some(-3), Some(0), 4);
    
    /// assert_eq!(p_clamped.cursor(), 0);
    
    /// assert_eq!(p_clamped.page_size(), 1);
    
    /// ```
    pub fn from_optional(
        cursor: Option<i64>,
        page_size: Option<i64>,
        default_page_size: usize,
    ) -> Self {
        let cursor = cursor.unwrap_or(0).max(0) as usize;
        let page_size = page_size
            .map(|size| size.max(1) as usize)
            .unwrap_or(default_page_size.max(1));

        Pagination::new(cursor, page_size)
    }

    /// The current zero-based page index.
    ///
    /// Returns the current page index (zero-based).
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(2, 10);
    /// assert_eq!(p.cursor(), 2);
    /// ```
    pub fn cursor(&self) -> usize {
        self.cursor
    }

    /// Configured number of items per page.
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(0, 10);
    /// assert_eq!(p.page_size(), 10);
    /// ```
    pub fn page_size(&self) -> usize {
        self.page_size
    }

    /// Compute the zero-based index of the first element for this pagination page.
    ///
    /// The value is calculated as `cursor * page_size` using saturating multiplication,
    /// so it will not overflow and will cap at `usize::MAX` if the product would exceed it.
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(2, 10);
    /// assert_eq!(p.offset(), 20);
    /// ```
    pub fn offset(&self) -> usize {
        self.cursor.saturating_mul(self.page_size)
    }

    /// Computes the cursor for the next page if there is additional data.
    ///
    /// # Returns
    ///
    /// `Some(next_cursor)` if `has_more` is true, `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(2, 10);
    /// assert_eq!(p.next_cursor(true), Some(3));
    /// assert_eq!(p.next_cursor(false), None);
    /// ```
    pub fn next_cursor(&self, has_more: bool) -> Option<usize> {
        if has_more {
            Some(self.cursor + 1)
        } else {
            None
        }
    }

    /// Computes how many pages are required to contain `total_count` items using this pagination's page size.
    ///
    /// # Returns
    ///
    /// The number of pages needed to contain `total_count` items; `0` if `total_count` is `0`.
    ///
    /// # Examples
    ///
    /// ```
    /// let p = Pagination::new(0, 10);
    /// assert_eq!(p.total_pages(95), 10);
    /// assert_eq!(p.total_pages(0), 0);
    /// assert_eq!(p.total_pages(10), 1);
    /// ```
    pub fn total_pages(&self, total_count: usize) -> usize {
        if total_count == 0 {
            0
        } else {
            (total_count + self.page_size - 1) / self.page_size
        }
    }
}

/// Pagination metadata emitted alongside a page of results.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PaginationSummary {
    pub current_cursor: usize,
    pub page_size: usize,
    pub total_elements: Option<usize>,
    pub next_cursor: Option<usize>,
    pub has_more: bool,
}

impl PaginationSummary {
    /// Constructs a PaginationSummary from a Pagination, a `has_more` flag, and an optional total element count.
    
    ///
    
    /// The resulting summary contains the pagination's current cursor and page size, the provided
    
    /// `total` as `total_elements`, the provided `has_more` flag, and a `next_cursor` computed from
    
    /// the pagination and `has_more`.
    
    ///
    
    /// # Parameters
    
    ///
    
    /// - `pagination`: source pagination state (cursor and page size).
    
    /// - `has_more`: whether there are additional elements after the current page.
    
    /// - `total`: optional total number of elements across all pages.
    
    ///
    
    /// # Examples
    
    ///
    
    /// ```
    
    /// let pagination = Pagination::new(2, 5);
    
    /// let summary = PaginationSummary::new(pagination, true, Some(123));
    
    /// assert_eq!(summary.current_cursor, 2);
    
    /// assert_eq!(summary.page_size, 5);
    
    /// assert_eq!(summary.total_elements, Some(123));
    
    /// assert_eq!(summary.has_more, true);
    
    /// assert_eq!(summary.next_cursor, Some(3));
    
    /// ```
    fn new(pagination: Pagination, has_more: bool, total: Option<usize>) -> Self {
        Self {
            current_cursor: pagination.cursor(),
            page_size: pagination.page_size(),
            total_elements: total,
            next_cursor: pagination.next_cursor(has_more),
            has_more,
        }
    }
}

/// Represents a single page of items along with pagination metadata.
#[derive(Debug, Clone)]
pub struct PaginatedPage<T> {
    pub items: Vec<T>,
    pub summary: PaginationSummary,
}

impl<T> PaginatedPage<T> {
    /// Constructs a PaginatedPage from already-collected items and associated pagination metadata.
    ///
    /// # Examples
    ///
    /// ```
    /// let pagination = Pagination::new(0, 3);
    /// let page = PaginatedPage::from_items(vec![1, 2], pagination, false, Some(5));
    /// assert_eq!(page.items, vec![1, 2]);
    /// assert_eq!(page.summary.current_cursor, 0);
    /// assert_eq!(page.summary.page_size, 3);
    /// assert_eq!(page.summary.total_elements, Some(5));
    /// assert_eq!(page.summary.has_more, false);
    /// ```
    pub fn from_items(
        items: Vec<T>,
        pagination: Pagination,
        has_more: bool,
        total: Option<usize>,
    ) -> Self {
        Self {
            items,
            summary: PaginationSummary::new(pagination, has_more, total),
        }
    }

    /// Maps each item in the page using `f`, preserving the page's pagination metadata.
    ///
    /// # Examples
    ///
    /// ```
    /// let pagination = Pagination::new(0, 2);
    /// let page = PaginatedPage::from_items(vec![1, 2], pagination, true, Some(5));
    /// let mapped = page.map_items(|n| n.to_string());
    /// assert_eq!(mapped.items, vec!["1".to_string(), "2".to_string()]);
    /// assert_eq!(mapped.summary.current_cursor, 0);
    /// assert_eq!(mapped.summary.page_size, 2);
    /// assert!(mapped.summary.has_more);
    /// ```
    pub fn map_items<U, F>(self, mut f: F) -> PaginatedPage<U>
    where
        F: FnMut(T) -> U,
    {
        let PaginatedPage { items, summary } = self;
        PaginatedPage {
            items: items.into_iter().map(&mut f).collect(),
            summary,
        }
    }
}

/// Iterator adaptor that yields fixed-size chunks representing consecutive pages.
pub struct PagedIterator<I>
where
    I: Iterator,
{
    inner: I,
    page_size: usize,
}

impl<I> PagedIterator<I>
where
    I: Iterator,
{
    /// Creates a paged iterator that yields fixed-size chunks from `inner`.
    ///
    /// The provided `page_size` is treated as a minimum of 1; values less than 1 are clamped to 1.
    ///
    /// # Parameters
    ///
    /// - `inner`: The underlying iterator to paginate.
    /// - `page_size`: Desired number of items per page; values less than 1 are treated as 1.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut paged = PagedIterator::new(vec![1, 2, 3, 4].into_iter(), 2);
    /// assert_eq!(paged.next(), Some(vec![1, 2]));
    /// assert_eq!(paged.next(), Some(vec![3, 4]));
    /// assert_eq!(paged.next(), None);
    /// ```
    fn new(inner: I, page_size: usize) -> Self {
        Self {
            inner,
            page_size: page_size.max(1),
        }
    }
}

impl<I> Iterator for PagedIterator<I>
where
    I: Iterator,
{
    type Item = Vec<I::Item>;

    /// Advances the iterator and yields the next page as a `Vec` containing up to `page_size` items.
    ///
    /// # Examples
    ///
    /// ```
    /// let mut pages = (1..6).into_iter().chunked(2);
    /// assert_eq!(pages.next(), Some(vec![1, 2]));
    /// assert_eq!(pages.next(), Some(vec![3, 4]));
    /// assert_eq!(pages.next(), Some(vec![5]));
    /// assert_eq!(pages.next(), None);
    /// ```
    fn next(&mut self) -> Option<Self::Item> {
        let mut chunk = Vec::with_capacity(self.page_size);

        for _ in 0..self.page_size {
            match self.inner.next() {
                Some(item) => chunk.push(item),
                None => break,
            }
        }

        if chunk.is_empty() {
            None
        } else {
            Some(chunk)
        }
    }
}

impl<I> FusedIterator for PagedIterator<I>
where
    I: FusedIterator,
{
}

/// Iterator extension helpers enabling chunked and cursor-based pagination.
pub trait PaginateExt: Iterator + Sized {
    /// Splits the iterator into `page_size` chunks. The final chunk may contain fewer items.
    fn chunked(self, page_size: usize) -> PagedIterator<Self>;

    /// Consumes only the elements required to materialise the requested page, returning the
    /// collected items plus metadata.
    fn paginate(self, pagination: Pagination) -> PaginatedPage<Self::Item>;
}

impl<I> PaginateExt for I
where
    I: Iterator,
{
    /// Creates an iterator that yields the source items in fixed-size chunks.
    ///
    /// The returned iterator produces `Vec<T>` pages containing up to `page_size` items each;
    /// a `page_size` of zero is treated as `1`.
    ///
    /// # Examples
    ///
    /// ```
    /// let pages: Vec<_> = (1..8).into_iter().chunked(3).collect();
    /// assert_eq!(pages, vec![vec![1,2,3], vec![4,5,6], vec![7]]);
    /// ```
    fn chunked(self, page_size: usize) -> PagedIterator<Self> {
        PagedIterator::new(self, page_size)
    }

    /// Materializes a single page of items from the iterator according to the provided pagination.
    ///
    /// The returned `PaginatedPage` contains the items for the requested cursor and a `PaginationSummary`
    /// that reflects the current cursor, configured page size, whether more items follow, and the next cursor when applicable.
    ///
    /// # Examples
    ///
    /// ```
    /// use your_crate::pagination::{Pagination, PaginateExt};
    ///
    /// let items = (1..=5).into_iter();
    /// let page = items.paginate(Pagination::new(1, 2)); // second page, page_size = 2
    /// assert_eq!(page.items, vec![3, 4]);
    /// assert_eq!(page.summary.current_cursor, 1);
    /// assert_eq!(page.summary.page_size, 2);
    /// assert_eq!(page.summary.has_more, true);
    /// assert_eq!(page.summary.next_cursor, Some(2));
    /// ```
    fn paginate(self, pagination: Pagination) -> PaginatedPage<Self::Item> {
        let pagination = Pagination::new(pagination.cursor(), pagination.page_size());
        let mut iter = self.skip(pagination.offset());
        let mut buffer = Vec::with_capacity(pagination.page_size() + 1);

        for item in iter.by_ref().take(pagination.page_size() + 1) {
            buffer.push(item);
        }

        let has_more = buffer.len() > pagination.page_size();
        if has_more {
            buffer.truncate(pagination.page_size());
        }

        PaginatedPage::from_items(buffer, pagination, has_more, None)
    }
}

/// Utility to paginate any iterable by converting it into an iterator first.
pub fn paginate_into_iter<T, I>(iterable: I, pagination: Pagination) -> PaginatedPage<T>
where
    I: IntoIterator<Item = T>,
{
    iterable.into_iter().paginate(pagination)
}

/// Computes the number of pages needed to hold `total_count` items with `per_page` items per page.
///
/// Returns `0` if `per_page` is `0` or `total_count` is `0`; otherwise returns the smallest number of pages
/// such that `pages * per_page >= total_count`.
///
/// # Examples
///
/// ```
/// assert_eq!(total_pages(0, 10), 0);
/// assert_eq!(total_pages(25, 10), 3);
/// assert_eq!(total_pages(10, 10), 1);
/// ```
pub fn total_pages(total_count: usize, per_page: usize) -> usize {
    if per_page == 0 {
        0
    } else {
        (total_count + per_page - 1) / per_page
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_offset_and_next_cursor() {
        let pagination = Pagination::new(2, 25);
        assert_eq!(pagination.offset(), 50);
        assert_eq!(pagination.page_size(), 25);
        assert_eq!(pagination.cursor(), 2);
        assert_eq!(pagination.next_cursor(true), Some(3));
        assert_eq!(pagination.next_cursor(false), None);
    }

    #[test]
    fn paginate_iterator_consumes_only_required_items() {
        let data = 0..1000;
        let pagination = Pagination::new(3, 15);
        let page = data.paginate(pagination);

        assert_eq!(page.items.len(), 15);
        assert_eq!(page.items.first(), Some(&45));
        assert_eq!(page.items.last(), Some(&59));
        assert_eq!(page.summary.current_cursor, 3);
        assert_eq!(page.summary.next_cursor, Some(4));
        assert!(page.summary.has_more);
    }

    #[test]
    fn paginate_iterator_handles_end_of_stream() {
        let data = 0..10;
        let pagination = Pagination::new(1, 8);
        let page = data.paginate(pagination);

        assert_eq!(page.items, vec![8, 9]);
        assert_eq!(page.summary.has_more, false);
        assert_eq!(page.summary.next_cursor, None);
    }

    #[test]
    fn chunked_iteration_emits_equal_sized_pages() {
        let mut chunks = (0..11).chunked(4);
        assert_eq!(chunks.next(), Some(vec![0, 1, 2, 3]));
        assert_eq!(chunks.next(), Some(vec![4, 5, 6, 7]));
        assert_eq!(chunks.next(), Some(vec![8, 9, 10]));
        assert_eq!(chunks.next(), None);
    }

    #[test]
    fn helper_functions_cover_total_pages_and_map_items() {
        let pagination = Pagination::new(0, 5);
        assert_eq!(pagination.total_pages(23), 5);
    assert_eq!(super::total_pages(23, 5), 5);

        let page = paginate_into_iter(0..5, pagination);
        let mapped = page.map_items(|value| value * 2);

        assert_eq!(mapped.items, vec![0, 2, 4, 6, 8]);
        assert_eq!(mapped.summary.has_more, false);
    }
}
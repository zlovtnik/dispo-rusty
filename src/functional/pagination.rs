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
    /// Creates a new pagination descriptor. A page size of zero defaults to
    /// `1` to prevent invalid divisions.
    pub fn new(cursor: usize, page_size: usize) -> Self {
        Self {
            cursor,
            page_size: page_size.max(1),
        }
    }

    /// Builds a pagination descriptor from optional parameters and a default
    /// page size. Negative values are clamped to zero.
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

    /// Returns the zero-based page cursor.
    pub fn cursor(&self) -> usize {
        self.cursor
    }

    /// Returns the configured page size.
    pub fn page_size(&self) -> usize {
        self.page_size
    }

    /// Returns the offset in elements to start reading for this page.
    pub fn offset(&self) -> usize {
        self.cursor.saturating_mul(self.page_size)
    }

    /// Computes the cursor for the next page if there is additional data.
    pub fn next_cursor(&self, has_more: bool) -> Option<usize> {
        if has_more {
            Some(self.cursor + 1)
        } else {
            None
        }
    }

    /// Calculates the total number of pages for a known total count.
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
    /// Creates a page from pre-fetched items.
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

    /// Maps the contained items using `f`, preserving pagination metadata.
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
    fn chunked(self, page_size: usize) -> PagedIterator<Self> {
        PagedIterator::new(self, page_size)
    }

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

/// Calculates the total number of pages for a given count and page size.
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








































































































































































































































        assert_eq!(mapped.items, vec![0, 2, 4, 6, 8]);
        assert_eq!(mapped.summary.has_more, false);
    }

    // Additional comprehensive tests for Pagination::new
    #[test]
    fn pagination_new_with_zero_page_size_defaults_to_one() {
        let pagination = Pagination::new(5, 0);
        assert_eq\!(pagination.page_size(), 1);
        assert_eq\!(pagination.cursor(), 5);
    }

    #[test]
    fn pagination_new_with_large_values() {
        let pagination = Pagination::new(usize::MAX - 1, 1000);
        assert_eq\!(pagination.cursor(), usize::MAX - 1);
        assert_eq\!(pagination.page_size(), 1000);
    }

    // Tests for Pagination::from_optional
    #[test]
    fn pagination_from_optional_with_all_none_uses_defaults() {
        let pagination = Pagination::from_optional(None, None, 50);
        assert_eq\!(pagination.cursor(), 0);
        assert_eq\!(pagination.page_size(), 50);
    }

    #[test]
    fn pagination_from_optional_clamps_negative_cursor() {
        let pagination = Pagination::from_optional(Some(-10), Some(20), 30);
        assert_eq\!(pagination.cursor(), 0);
        assert_eq\!(pagination.page_size(), 20);
    }

    #[test]
    fn pagination_from_optional_clamps_zero_page_size() {
        let pagination = Pagination::from_optional(Some(2), Some(0), 15);
        assert_eq\!(pagination.cursor(), 2);
        assert_eq\!(pagination.page_size(), 1);
    }

    #[test]
    fn pagination_from_optional_clamps_negative_page_size() {
        let pagination = Pagination::from_optional(Some(1), Some(-5), 10);
        assert_eq\!(pagination.cursor(), 1);
        assert_eq\!(pagination.page_size(), 1);
    }

    #[test]
    fn pagination_from_optional_uses_default_when_page_size_none() {
        let pagination = Pagination::from_optional(Some(3), None, 25);
        assert_eq\!(pagination.cursor(), 3);
        assert_eq\!(pagination.page_size(), 25);
    }

    #[test]
    fn pagination_from_optional_with_large_positive_values() {
        let pagination = Pagination::from_optional(Some(1000000), Some(5000), 10);
        assert_eq\!(pagination.cursor(), 1000000);
        assert_eq\!(pagination.page_size(), 5000);
    }

    // Tests for Pagination::offset with edge cases
    #[test]
    fn pagination_offset_at_first_page() {
        let pagination = Pagination::new(0, 10);
        assert_eq\!(pagination.offset(), 0);
    }

    #[test]
    fn pagination_offset_saturating_multiplication() {
        let pagination = Pagination::new(usize::MAX, 10);
        // Should saturate rather than overflow
        assert_eq\!(pagination.offset(), usize::MAX);
    }

    #[test]
    fn pagination_offset_with_very_large_cursor_and_page_size() {
        let pagination = Pagination::new(usize::MAX / 2, 2);
        // Should handle large values without panic
        let offset = pagination.offset();
        assert\!(offset <= usize::MAX);
    }

    // Tests for Pagination::total_pages
    #[test]
    fn pagination_total_pages_with_zero_count() {
        let pagination = Pagination::new(0, 10);
        assert_eq\!(pagination.total_pages(0), 0);
    }

    #[test]
    fn pagination_total_pages_exact_multiple() {
        let pagination = Pagination::new(0, 10);
        assert_eq\!(pagination.total_pages(100), 10);
    }

    #[test]
    fn pagination_total_pages_with_remainder() {
        let pagination = Pagination::new(0, 10);
        assert_eq\!(pagination.total_pages(95), 10);
        assert_eq\!(pagination.total_pages(101), 11);
    }

    #[test]
    fn pagination_total_pages_single_item() {
        let pagination = Pagination::new(0, 10);
        assert_eq\!(pagination.total_pages(1), 1);
    }

    // Tests for total_pages helper function
    #[test]
    fn total_pages_with_zero_per_page() {
        assert_eq\!(total_pages(100, 0), 0);
    }

    #[test]
    fn total_pages_with_zero_count() {
        assert_eq\!(total_pages(0, 10), 0);
    }

    #[test]
    fn total_pages_boundary_cases() {
        assert_eq\!(total_pages(1, 1), 1);
        assert_eq\!(total_pages(10, 1), 10);
        assert_eq\!(total_pages(1, 10), 1);
    }

    // Tests for PaginatedPage and map_items
    #[test]
    fn paginated_page_map_items_transforms_all_items() {
        let pagination = Pagination::new(0, 3);
        let page = PaginatedPage::from_items(vec\![1, 2, 3], pagination, true, Some(10));
        let mapped = page.map_items(|x| x.to_string());
        
        assert_eq\!(mapped.items, vec\!["1", "2", "3"]);
        assert_eq\!(mapped.summary.current_cursor, 0);
        assert_eq\!(mapped.summary.has_more, true);
        assert_eq\!(mapped.summary.total_elements, Some(10));
    }

    #[test]
    fn paginated_page_map_items_preserves_metadata() {
        let pagination = Pagination::new(5, 20);
        let page = PaginatedPage::from_items(vec\!["a", "b"], pagination, false, Some(102));
        let mapped = page.map_items(|s| s.to_uppercase());
        
        assert_eq\!(mapped.items, vec\!["A", "B"]);
        assert_eq\!(mapped.summary.current_cursor, 5);
        assert_eq\!(mapped.summary.page_size, 20);
        assert_eq\!(mapped.summary.has_more, false);
        assert_eq\!(mapped.summary.next_cursor, None);
    }

    #[test]
    fn paginated_page_with_empty_items() {
        let pagination = Pagination::new(10, 5);
        let page: PaginatedPage<i32> = PaginatedPage::from_items(vec\![], pagination, false, Some(50));
        
        assert\!(page.items.is_empty());
        assert_eq\!(page.summary.current_cursor, 10);
        assert\!(\!page.summary.has_more);
    }

    // Tests for paginate extension trait with edge cases
    #[test]
    fn paginate_first_page_of_small_dataset() {
        let data = vec\![1, 2, 3];
        let pagination = Pagination::new(0, 10);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\![1, 2, 3]);
        assert\!(\!page.summary.has_more);
        assert_eq\!(page.summary.next_cursor, None);
    }

    #[test]
    fn paginate_beyond_available_data() {
        let data = vec\![1, 2, 3];
        let pagination = Pagination::new(5, 10);
        let page = data.into_iter().paginate(pagination);
        
        assert\!(page.items.is_empty());
        assert\!(\!page.summary.has_more);
    }

    #[test]
    fn paginate_exact_page_size_boundary() {
        let data = vec\![1, 2, 3, 4, 5, 6];
        let pagination = Pagination::new(1, 3);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\![4, 5, 6]);
        assert\!(\!page.summary.has_more);
    }

    #[test]
    fn paginate_with_page_size_one() {
        let data = vec\![10, 20, 30, 40];
        let pagination = Pagination::new(2, 1);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\![30]);
        assert\!(page.summary.has_more);
        assert_eq\!(page.summary.next_cursor, Some(3));
    }

    #[test]
    fn paginate_empty_iterator() {
        let data: Vec<i32> = vec\![];
        let pagination = Pagination::new(0, 10);
        let page = data.into_iter().paginate(pagination);
        
        assert\!(page.items.is_empty());
        assert\!(\!page.summary.has_more);
    }

    #[test]
    fn paginate_large_page_size() {
        let data: Vec<_> = (0..100).collect();
        let pagination = Pagination::new(0, 1000);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items.len(), 100);
        assert\!(\!page.summary.has_more);
    }

    // Tests for chunked iterator
    #[test]
    fn chunked_with_empty_iterator() {
        let data: Vec<i32> = vec\![];
        let mut chunks = data.into_iter().chunked(5);
        
        assert_eq\!(chunks.next(), None);
    }

    #[test]
    fn chunked_with_page_size_zero_treated_as_one() {
        let data = vec\![1, 2, 3];
        let mut chunks = data.into_iter().chunked(0);
        
        assert_eq\!(chunks.next(), Some(vec\![1]));
        assert_eq\!(chunks.next(), Some(vec\![2]));
        assert_eq\!(chunks.next(), Some(vec\![3]));
        assert_eq\!(chunks.next(), None);
    }

    #[test]
    fn chunked_single_element() {
        let data = vec\![42];
        let mut chunks = data.into_iter().chunked(10);
        
        assert_eq\!(chunks.next(), Some(vec\![42]));
        assert_eq\!(chunks.next(), None);
    }

    #[test]
    fn chunked_exactly_one_chunk() {
        let data = vec\![1, 2, 3];
        let mut chunks = data.into_iter().chunked(3);
        
        assert_eq\!(chunks.next(), Some(vec\![1, 2, 3]));
        assert_eq\!(chunks.next(), None);
    }

    #[test]
    fn chunked_larger_page_than_data() {
        let data = vec\![1, 2];
        let mut chunks = data.into_iter().chunked(10);
        
        assert_eq\!(chunks.next(), Some(vec\![1, 2]));
        assert_eq\!(chunks.next(), None);
    }

    // Tests for paginate_into_iter helper
    #[test]
    fn paginate_into_iter_with_vec() {
        let data = vec\![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let pagination = Pagination::new(1, 4);
        let page = paginate_into_iter(data, pagination);
        
        assert_eq\!(page.items, vec\![5, 6, 7, 8]);
        assert\!(page.summary.has_more);
        assert_eq\!(page.summary.next_cursor, Some(2));
    }

    #[test]
    fn paginate_into_iter_with_range() {
        let pagination = Pagination::new(0, 5);
        let page = paginate_into_iter(1..=20, pagination);
        
        assert_eq\!(page.items, vec\![1, 2, 3, 4, 5]);
        assert\!(page.summary.has_more);
    }

    // Tests with custom types
    #[test]
    fn paginate_with_strings() {
        let data = vec\!["apple", "banana", "cherry", "date", "elderberry"];
        let pagination = Pagination::new(1, 2);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\!["cherry", "date"]);
        assert\!(page.summary.has_more);
    }

    #[test]
    fn paginate_with_tuples() {
        let data = vec\![(1, "a"), (2, "b"), (3, "c"), (4, "d")];
        let pagination = Pagination::new(0, 3);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\![(1, "a"), (2, "b"), (3, "c")]);
        assert\!(page.summary.has_more);
    }

    #[test]
    fn map_items_with_complex_transformation() {
        #[derive(Debug, Clone, PartialEq)]
        struct User {
            id: i32,
            name: String,
        }
        
        let pagination = Pagination::new(0, 2);
        let users = vec\![
            User { id: 1, name: "Alice".to_string() },
            User { id: 2, name: "Bob".to_string() },
        ];
        let page = PaginatedPage::from_items(users, pagination, false, None);
        let ids = page.map_items(|user| user.id);
        
        assert_eq\!(ids.items, vec\![1, 2]);
        assert\!(\!ids.summary.has_more);
    }

    // Test PaginationSummary construction
    #[test]
    fn pagination_summary_reflects_correct_state() {
        let pagination = Pagination::new(3, 15);
        let summary = PaginationSummary::new(pagination, true, Some(100));
        
        assert_eq\!(summary.current_cursor, 3);
        assert_eq\!(summary.page_size, 15);
        assert_eq\!(summary.total_elements, Some(100));
        assert_eq\!(summary.next_cursor, Some(4));
        assert\!(summary.has_more);
    }

    #[test]
    fn pagination_summary_no_more_pages() {
        let pagination = Pagination::new(10, 5);
        let summary = PaginationSummary::new(pagination, false, Some(55));
        
        assert_eq\!(summary.next_cursor, None);
        assert\!(\!summary.has_more);
    }

    // Boundary and stress tests
    #[test]
    fn paginate_stress_test_with_large_offset() {
        // Test that skip works correctly with large offsets
        let data: Vec<_> = (0..10000).collect();
        let pagination = Pagination::new(999, 5);
        let page = data.into_iter().paginate(pagination);
        
        assert_eq\!(page.items, vec\![4995, 4996, 4997, 4998, 4999]);
        assert\!(\!page.summary.has_more);
    }

    #[test]
    fn chunked_stress_test_many_small_chunks() {
        let data: Vec<_> = (0..100).collect();
        let chunks: Vec<_> = data.into_iter().chunked(1).collect();
        
        assert_eq\!(chunks.len(), 100);
        for (i, chunk) in chunks.iter().enumerate() {
            assert_eq\!(chunk, &vec\![i]);
        }
    }

    #[test]
    fn pagination_next_cursor_with_sequential_pages() {
        let pagination1 = Pagination::new(0, 10);
        assert_eq\!(pagination1.next_cursor(true), Some(1));
        
        let pagination2 = Pagination::new(1, 10);
        assert_eq\!(pagination2.next_cursor(true), Some(2));
        
        let pagination3 = Pagination::new(2, 10);
        assert_eq\!(pagination3.next_cursor(false), None);
    }

    // FusedIterator behavior test
    #[test]
    fn chunked_iterator_continues_returning_none_after_exhaustion() {
        let data = vec\![1, 2];
        let mut chunks = data.into_iter().chunked(10);
        
        assert_eq\!(chunks.next(), Some(vec\![1, 2]));
        assert_eq\!(chunks.next(), None);
        assert_eq\!(chunks.next(), None); // Should continue returning None
    }
}
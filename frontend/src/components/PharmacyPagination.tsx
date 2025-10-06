import React from 'react';
import { Pagination } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
} from '@ant-design/icons';

interface PharmacyPaginationProps {
  total: number;
  current: number;
  pageSize?: number;
  onChange: (page: number, pageSize: number) => void;
}

export const PharmacyPagination: React.FC<PharmacyPaginationProps> = ({ total, current, pageSize = 12, onChange }) => {
  const totalPages = Math.ceil(total / pageSize);
  return (
    <div style={{
      margin: '16px 0',
      padding: '16px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '12px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Jump buttons - compact at top */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
      }}>
        {/* Jump to first */}
        <button
          onClick={() => onChange(1, pageSize)}
          disabled={current <= 1}
          aria-label="Jump to first page"
          style={{
            border: 'none',
            borderRadius: '6px',
            padding: '6px',
            backgroundColor: current <= 1 ? 'var(--neutral-200)' : 'transparent',
            color: current <= 1 ? 'var(--neutral-500)' : 'var(--secondary-600)',
            cursor: current <= 1 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: current <= 1 ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (current > 1) {
              e.currentTarget.style.backgroundColor = 'var(--secondary-50)';
            }
          }}
          onMouseLeave={(e) => {
            if (current > 1) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          <DoubleLeftOutlined />
        </button>

        {/* Jump to last */}
        <button
          onClick={() => onChange(totalPages, pageSize)}
          disabled={current >= totalPages}
          aria-label="Jump to last page"
          style={{
            border: 'none',
            borderRadius: '6px',
            padding: '6px',
            backgroundColor: current >= totalPages ? 'var(--neutral-200)' : 'transparent',
            color: current >= totalPages ? 'var(--neutral-500)' : 'var(--secondary-600)',
            cursor: current >= totalPages ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: current >= totalPages ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (current < totalPages) {
              e.currentTarget.style.backgroundColor = 'var(--secondary-50)';
            }
          }}
          onMouseLeave={(e) => {
            if (current < totalPages) {
              e.currentTarget.style.backgroundColor = 'transparent';
            }
          }}
        >
          <DoubleRightOutlined />
        </button>
      </div>

      {/* Main pagination controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        {/* Previous button */}
        <button
          onClick={() => onChange(current - 1, pageSize)}
          disabled={current <= 1}
          aria-label="Previous page"
          style={{
            border: '2px solid var(--primary-400)',
            borderRadius: '8px',
            padding: '8px',
            background: current <= 1 ? 'var(--neutral-200)' : 'var(--primary-100)',
            color: current <= 1 ? 'var(--neutral-600)' : 'var(--primary-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            cursor: current <= 1 ? 'not-allowed' : 'pointer',
            opacity: current <= 1 ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (current > 1) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.background = 'var(--primary-200)';
            }
          }}
          onMouseLeave={(e) => {
            if (current > 1) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'var(--primary-100)';
            }
          }}
        >
          <LeftOutlined style={{ fontSize: '16px' }} />
        </button>

        {/* Page numbers */}
        <Pagination
          current={current}
          total={total}
          pageSize={pageSize}
          showSizeChanger={false}
          showQuickJumper={false}
          showTotal={false}
          onChange={(page, pageSize) => onChange(page, pageSize)}
          itemRender={(page, type) => {
            if (type === 'page') {
              return (
                <button
                  onClick={() => onChange(page, pageSize)}
                  style={{
                    minWidth: '40px',
                    height: '40px',
                    padding: '8px 12px',
                    margin: '0 2px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: current === page ? 'var(--primary-500)' : 'transparent',
                    color: current === page ? 'white' : 'var(--primary-700)',
                    fontWeight: '600',
                    fontSize: '14px',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (current !== page) {
                      e.currentTarget.style.backgroundColor = 'var(--primary-100)';
                      e.currentTarget.style.color = 'var(--primary-700)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (current !== page) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--primary-700)';
                    }
                  }}
                >
                  {page}
                </button>
              );
            }
            return null; // Hide default prev/next for this level
          }}
        />

        {/* Next button */}
        <button
          onClick={() => onChange(current + 1, pageSize)}
          disabled={current >= totalPages}
          aria-label="Next page"
          style={{
            border: '2px solid var(--primary-400)',
            borderRadius: '8px',
            padding: '8px',
            background: current >= totalPages ? 'var(--neutral-200)' : 'var(--primary-100)',
            color: current >= totalPages ? 'var(--neutral-600)' : 'var(--primary-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            cursor: current >= totalPages ? 'not-allowed' : 'pointer',
            opacity: current >= totalPages ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (current < totalPages) {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.background = 'var(--primary-200)';
            }
          }}
          onMouseLeave={(e) => {
            if (current < totalPages) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'var(--primary-100)';
            }
          }}
        >
          <RightOutlined style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  );
};

// This config is for legacy use if needed, but new PharmacyPagination component should be used instead
export const pharmacyPaginationConfig = {
  pageSize: 12,
  showSizeChanger: false,
  showQuickJumper: false,
  showTotal: false,
};

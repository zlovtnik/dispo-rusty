/**
 * TenantStatistics Component
 * Displays search statistics and performance metrics
 */

import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { DatabaseOutlined, FilterOutlined } from '@ant-design/icons';

// Define inline types for now
interface SearchStats {
  total: number;
  filtered: number;
  searchTime: number;
}

interface PerformanceMetrics {
  performanceScore: number;
  averageSearchTime: number;
  totalSearches: number;
  slowSearches: number;
}

interface TenantStatisticsProps {
  searchStats: SearchStats;
  performanceMetrics: PerformanceMetrics;
}

export const TenantStatistics: React.FC<TenantStatisticsProps> = React.memo(
  ({ searchStats, performanceMetrics }) => {
    return (
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Total Tenants"
              value={searchStats.total}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Filtered Results"
              value={searchStats.filtered}
              prefix={<FilterOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Search Time"
              value={searchStats.searchTime}
              suffix="ms"
              precision={2}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Performance Score"
              value={performanceMetrics.performanceScore}
              suffix="%"
              precision={1}
            />
          </Card>
        </Col>
      </Row>
    );
  }
);

TenantStatistics.displayName = 'TenantStatistics';

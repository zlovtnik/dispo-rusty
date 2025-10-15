import React from 'react';
import { Result } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

interface EnvironmentErrorUIProps {
  error: Error;
}

/**
 * Error UI displayed when critical environment configuration is missing
 * This prevents the app from loading in an invalid state
 */
export const EnvironmentErrorUI: React.FC<EnvironmentErrorUIProps> = ({ error }) => {
  const isDevelopment = import.meta.env.MODE === 'development';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        backgroundColor: '#f0f2f5',
      }}
    >
      <Result
        status="error"
        icon={<SettingOutlined />}
        title="Configuration Error"
        subTitle="The application cannot start due to missing or invalid environment configuration."
        extra={
          <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
            <div
              style={{
                padding: '16px',
                backgroundColor: '#fff1f0',
                border: '1px solid #ffa39e',
                borderRadius: '4px',
                marginBottom: '16px',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '14px',
                  color: '#cf1322',
                }}
              >
                {error.message}
              </pre>
            </div>

            {isDevelopment && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#e6f7ff',
                  border: '1px solid #91d5ff',
                  borderRadius: '4px',
                }}
              >
                <h4 style={{ marginTop: 0 }}>Development Mode - Quick Fix:</h4>
                <ol style={{ marginBottom: 0, paddingLeft: '20px' }}>
                  <li>
                    Check if <code>.env.development</code> file exists in <code>frontend/</code>{' '}
                    directory
                  </li>
                  <li>
                    Copy <code>.env.example</code> to <code>.env.development</code> if needed
                  </li>
                  <li>
                    Ensure <code>VITE_API_URL</code> is set (e.g.,{' '}
                    <code>http://localhost:8000/api</code>)
                  </li>
                  <li>Restart the development server</li>
                </ol>
              </div>
            )}

            {!isDevelopment && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#fffbe6',
                  border: '1px solid #ffe58f',
                  borderRadius: '4px',
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>Production Mode:</strong> Please contact your system administrator.
                  Environment variables must be configured during the build process.
                </p>
              </div>
            )}
          </div>
        }
      />
    </div>
  );
};

export default EnvironmentErrorUI;

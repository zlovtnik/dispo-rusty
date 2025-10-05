import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import { App } from './App';
import './styles/index.css';
import 'antd/dist/reset.css';

const theme = {
  token: {
    colorPrimary: '#2d9d5a', // Sage green
    colorSuccess: '#22c55e', // Mint green
    colorWarning: '#e29e26', // Golden honey
    colorError: '#7d5e39', // Earth brown
    colorInfo: '#dcf2e6', // Sage light
    colorBgContainer: '#fafaf9', // Neutral background
    colorTextBase: '#1c1917', // Neutral dark
    borderRadius: 8,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);

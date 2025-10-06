import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import { App } from './App';
import './styles/index.css';
import 'antd/dist/reset.css';

const theme = {
  token: {
    colorPrimary: '#264653', // Charcoal
    colorSuccess: '#2a9d8f', // Persian Green
    colorWarning: '#e9c46a', // Saffron
    colorError: '#e76f51', // Burnt Sienna
    colorInfo: '#f4a261', // Sandy Brown
    colorBgBase: '#f7f8fa', // Base background
    colorBgContainer: '#fdf8df', // Tertiary-50 alternative
    colorBgElevated: '#f2f9f7', // Secondary-50 alternative
    colorBgLayout: '#fffdf7', // Tertiary-100 alternative
    colorTextBase: '#161e26', // Dark text
    colorText: '#161e26', // Regular text
    colorTextSecondary: '#125942', // Secondary dark text
    colorTextDisabled: '#99aebf', // Neutral-300
    colorBorder: '#c8d4dd', // Neutral-200
    colorBorderSecondary: '#99aebf', // Neutral-300
    colorFill: '#e8ecf1', // Neutral-100
    colorFillSecondary: '#c8d4dd', // Neutral-200
    colorFillTertiary: '#99aebf', // Neutral-300
    colorBlack: '#161e26', // Neutral-900
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadius外: 4,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  components: {
    Menu: {
      darkItemBg: '#1a3037', // primary-700
      darkItemSelectedBg: '#203b45', // primary-600
      darkItemColor: '#e8ecf1', // primary-100
      darkItemSelectedColor: '#f7f8fa', // primary-50
      darkIconColor: '#e8ecf1', // primary-100
      darkSubMenuItemBg: '#101d22', // primary-900
      darkItemHoverColor: '#f7f8fa', // primary-50
      darkItemHoverBg: '#203b45', // primary-600
      itemBg: '#f2f9f7', // Light background
      itemColor: '#1e645f', // Secondary-700
      itemSelectedBg: '#2a9d8f', // secondary-500
      itemSelectedColor: 'white',
      itemHoverBg: '#a7d9bd', // secondary-400
    },
    Table: {
      headerBg: '#e8ecf1',
      headerColor: '#264653',
      rowHoverBg: '#f2f9f7',
      rowSelectedBg: '#e3f3ef',
    },
    Card: {
      colorBgContainer: '#f7f8fa',
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(38, 70, 83, 0.15)',
      colorPrimaryHover: '#203b45', // primary-600
    },
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
      <AntdApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);

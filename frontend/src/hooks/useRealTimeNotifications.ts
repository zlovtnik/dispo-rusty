/**
 * Real-time Notifications Hook
 * Provides WebSocket-based real-time notifications for tenant operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { useTenantNotifications } from './useTenantNotifications';
import type { Tenant } from '@/types/tenant';

interface NotificationMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  tenantId?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
}

export const useRealTimeNotifications = (config: Partial<WebSocketConfig> = {}) => {
  const { notification } = App.useApp();
  const tenantNotifications = useTenantNotifications();

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected' | 'error'
  >('disconnected');
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const defaultConfig: WebSocketConfig = {
    url:
      process.env.NODE_ENV === 'production'
        ? 'wss://api.yourdomain.com/notifications'
        : 'ws://localhost:8080/notifications',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000,
    ...config,
  };

  // WebSocket connection management
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(defaultConfig.url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Start heartbeat
        startHeartbeat();

        // Send authentication if needed
        const token = localStorage.getItem('authToken');
        if (token) {
          ws.send(
            JSON.stringify({
              type: 'auth',
              token,
            })
          );
        }
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          handleNotification(data);
        } catch (error) {
          console.error('Failed to parse notification:', error);
        }
      };

      ws.onclose = event => {
        setIsConnected(false);
        setConnectionStatus('disconnected');

        // Attempt reconnection if not manually closed
        if (
          event.code !== 1000 &&
          reconnectAttemptsRef.current < defaultConfig.maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, defaultConfig.reconnectInterval);
        }
      };

      ws.onerror = error => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [defaultConfig.url, defaultConfig.reconnectInterval, defaultConfig.maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  // Heartbeat to keep connection alive
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    heartbeatTimeoutRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        startHeartbeat();
      }
    }, defaultConfig.heartbeatInterval);
  }, [defaultConfig.heartbeatInterval]);

  // Handle incoming notifications
  const handleNotification = useCallback(
    (data: any) => {
      const notification: NotificationMessage = {
        id: data.id || Date.now().toString(),
        type: data.type || 'info',
        title: data.title || 'Notification',
        message: data.message || '',
        timestamp: new Date(data.timestamp || Date.now()),
        tenantId: data.tenantId,
        action: data.action,
      };

      // Add to notifications list
      setNotifications(prev => [notification, ...prev.slice(0, 49)]); // Keep last 50

      // Show notification based on type
      switch (notification.type) {
        case 'success':
          tenantNotifications.showSuccessNotification(notification.title, notification.message);
          break;
        case 'error':
          tenantNotifications.showErrorNotification(notification.title, notification.message);
          break;
        case 'warning':
          tenantNotifications.showWarningNotification(notification.title, notification.message);
          break;
        case 'info':
          tenantNotifications.showInfoNotification(notification.title, notification.message);
          break;
      }

      // Show browser notification if permission granted
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id,
        });
      }
    },
    [tenantNotifications]
  );

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  // Send message to server
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Subscribe to tenant events
  const subscribeToTenant = useCallback(
    (tenantId: string) => {
      sendMessage({
        type: 'subscribe',
        resource: 'tenant',
        id: tenantId,
      });
    },
    [sendMessage]
  );

  // Unsubscribe from tenant events
  const unsubscribeFromTenant = useCallback(
    (tenantId: string) => {
      sendMessage({
        type: 'unsubscribe',
        resource: 'tenant',
        id: tenantId,
      });
    },
    [sendMessage]
  );

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Remove specific notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Initialize connection on mount
  useEffect(() => {
    connect();
    requestNotificationPermission();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, requestNotificationPermission]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Connection status
    isConnected,
    connectionStatus,

    // Notifications
    notifications,
    clearNotifications,
    removeNotification,

    // Connection management
    connect,
    disconnect,
    sendMessage,

    // Subscription management
    subscribeToTenant,
    unsubscribeFromTenant,

    // Permission management
    requestNotificationPermission,
  };
};

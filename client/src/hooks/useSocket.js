import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export function useSocket() {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError(err.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const emit = useCallback((event, data, timeout = 5000) => {
    return new Promise((resolve) => {
      if (!socketRef.current) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      const timer = setTimeout(() => {
        resolve({ success: false, error: '请求超时，请检查服务器是否运行' });
      }, timeout);

      socketRef.current.emit(event, data, (response) => {
        clearTimeout(timer);
        resolve(response || { success: false, error: '服务器未返回数据' });
      });
    });
  }, []);

  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.off(event, callback);
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    error,
    emit,
    on,
  };
}

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export const usePresence = (userId) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const tabIdRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastActiveStateRef = useRef(true);

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // Generate unique tab ID (persisted in sessionStorage to detect same tab)
    const getTabId = () => {
      let tabId = sessionStorage.getItem('studyfocus_tab_id');
      if (!tabId) {
        tabId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('studyfocus_tab_id', tabId);
      }
      return tabId;
    };

    tabIdRef.current = getTabId();

    // Initialize socket connection
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    newSocket.on('connect', () => {
      console.log('🔌 Connected to presence server');
      setIsConnected(true);
      
      // Authenticate with server
      newSocket.emit('authenticate', { userId, token });
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from presence server');
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
    });

    setSocket(newSocket);

    // Setup heartbeat
    heartbeatIntervalRef.current = setInterval(() => {
      if (newSocket.connected) {
        newSocket.emit('heartbeat');
      }
    }, 30000); // Every 30 seconds

    // Helper to calculate and send current active state
    const updatePresenceState = () => {
      if (!newSocket.connected) return;
      
      const isVisible = !document.hidden;
      const hasFocus = document.hasFocus();
      const isActive = isVisible && hasFocus;
      
      // Only send update if state changed
      if (lastActiveStateRef.current !== isActive) {
        lastActiveStateRef.current = isActive;
        newSocket.emit('presence-update', { isActive });
      }
    };

    // Track tab visibility (primary indicator)
    const handleVisibilityChange = () => {
      updatePresenceState();
    };

    // Track window focus (supplementary indicator)
    const handleFocus = () => {
      // Small delay to ensure visibility state is updated
      setTimeout(updatePresenceState, 50);
    };

    const handleBlur = () => {
      // Small delay to check if visibility changed (user might have switched tabs)
      setTimeout(updatePresenceState, 50);
    };

    // Initial state - check if tab is visible and focused
    const isActive = !document.hidden && document.hasFocus();
    lastActiveStateRef.current = isActive;

    // Set up event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Send initial presence state once authenticated
    const handleAuthenticated = () => {
      if (newSocket.connected) {
        // Recalculate current active state
        const currentActive = !document.hidden && document.hasFocus();
        lastActiveStateRef.current = currentActive;
        newSocket.emit('presence-update', { isActive: currentActive });
      }
    };

    newSocket.on('friends-presence', handleAuthenticated);

    // Listen for settings changes (e.g., showOnlineStatus toggle)
    const handleSettingsChange = () => {
      if (newSocket.connected) {
        // Request server to refresh presence status
        newSocket.emit('refresh-presence');
      }
    };

    window.addEventListener('presence-settings-changed', handleSettingsChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('presence-settings-changed', handleSettingsChange);
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [userId]);

  return { socket, isConnected };
};


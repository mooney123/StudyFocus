import { useState, useEffect, useCallback } from 'react';

export const useUnreadCount = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      if (!token) {
        setUnreadCount(0);
        return;
      }

      const response = await fetch('/api/messages/unread-count', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setUnreadCount(result.unreadCount || 0);
      } else {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count on mount (only if authenticated)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUnreadCount();
    }
  }, [fetchUnreadCount]);

  // Set up interval to periodically check for new messages (only if authenticated)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return {
    unreadCount,
    loading,
    refreshUnreadCount: fetchUnreadCount
  };
};

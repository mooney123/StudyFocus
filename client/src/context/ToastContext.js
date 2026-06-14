import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const lastToastTime = useRef({});

  const showToast = useCallback((toastData) => {
    const { senderId, senderName, message, friendId, avatar, onClick } = toastData;
    const now = Date.now();
    const senderKey = String(senderId || friendId);

    // Check if we should suppress this toast (too soon after last one from same sender)
    if (lastToastTime.current[senderKey]) {
      const timeSinceLastToast = now - lastToastTime.current[senderKey];
      if (timeSinceLastToast < 2000) {
        // Update existing toast instead of creating new one
        setToasts(prevToasts => {
          const existingIndex = prevToasts.findIndex(
            t => String(t.senderId || t.friendId) === senderKey
          );
          if (existingIndex !== -1) {
            const existing = prevToasts[existingIndex];
            const updated = [...prevToasts];
            updated[existingIndex] = {
              ...existing,
              message: message,
              count: (existing.count || 1) + 1,
              timestamp: now
            };
            return updated;
          }
          return prevToasts;
        });
        lastToastTime.current[senderKey] = now;
        return;
      }
    }

    // Create new toast
    const newToast = {
      id: `${senderKey}-${now}`,
      senderId,
      senderName,
      message: message || 'New message',
      friendId,
      avatar: avatar || (senderName ? senderName.charAt(0).toUpperCase() : '?'),
      count: 1,
      timestamp: now,
      onClick
    };

    setToasts(prevToasts => {
      // Remove any existing toasts from the same sender
      const filtered = prevToasts.filter(t => String(t.senderId || t.friendId) !== senderKey);
      
      // Limit to max 2 toasts visible at once
      if (filtered.length >= 2) {
        // Remove oldest toast
        const sorted = [...filtered].sort((a, b) => a.timestamp - b.timestamp);
        return [sorted[1], newToast];
      }

      return [...filtered, newToast];
    });

    lastToastTime.current[senderKey] = now;
  }, []);

  const removeToast = useCallback((toastId) => {
    setToasts(prevToasts => prevToasts.filter(t => t.id !== toastId));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
            onClick={toast.onClick}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};


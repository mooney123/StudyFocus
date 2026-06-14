import React, { useEffect, useState, useRef } from 'react';
import './Toast.css';

const Toast = ({ toast, onClose, onClick }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef(null);
  const hideTimeoutRef = useRef(null);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after 4 seconds (unless hovered)
    const scheduleDismiss = () => {
      if (!isHovered) {
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
          // Wait for exit animation to complete
          hideTimeoutRef.current = setTimeout(() => {
            onClose();
          }, 300);
        }, 4000);
      }
    };

    scheduleDismiss();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isHovered, onClose]);

  // Handle hover pause
  const handleMouseEnter = () => {
    setIsHovered(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Schedule dismiss when mouse leaves
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      hideTimeoutRef.current = setTimeout(() => {
        onClose();
      }, 300);
    }, 4000);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick(toast);
    }
    setIsVisible(false);
    hideTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    setIsVisible(false);
    hideTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <div
      className={`toast ${isVisible ? 'toast-visible' : ''} ${toast.type || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div className="toast-content">
        {toast.avatar && (
          <div className="toast-avatar">
            {toast.avatar}
          </div>
        )}
        <div className="toast-text">
          <div className="toast-sender">{toast.senderName}</div>
          <div className="toast-preview">
            {toast.count > 1 && <span className="toast-count">({toast.count} new) </span>}
            {toast.message}
          </div>
        </div>
        <button
          className="toast-close"
          onClick={handleClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Toast;


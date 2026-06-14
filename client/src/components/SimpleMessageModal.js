import React, { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import './SimpleMessageModal.css';

const SimpleMessageModal = ({ isOpen, onClose, title, message }) => {
  const { isDarkMode } = useTheme();

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle click outside
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Extract and highlight email address
  const renderMessage = (text) => {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = emailRegex.exec(text)) !== null) {
      // Add text before email
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${key++}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }
      
      // Add email as selectable link
      parts.push(
        <a
          key={`email-${key++}`}
          href={`mailto:${match[0]}`}
          className="message-email"
          onClick={(e) => e.stopPropagation()}
        >
          {match[0]}
        </a>
      );
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${key++}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }

    return parts.length > 0 ? parts : text;
  };

  if (!isOpen) return null;

  return (
    <div
      className={`simple-message-overlay ${isDarkMode ? 'dark' : 'light'}`}
      onClick={handleOverlayClick}
    >
      <div
        className="simple-message-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="simple-message-header">
          <h2 className="simple-message-title">{title}</h2>
          <button
            className="simple-message-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="simple-message-content">
          <p className="simple-message-text">
            {renderMessage(message)}
          </p>
        </div>

        {/* Footer */}
        <div className="simple-message-footer">
          <button
            className="simple-message-button"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimpleMessageModal;


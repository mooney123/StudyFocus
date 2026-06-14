import React, { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import './SimpleMessageModal.css';

const WelcomeModal = ({ isOpen, onClose }) => {
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
          <h2 className="simple-message-title">Welcome to StudyFocus 👋</h2>
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
            Welcome to StudyFocus!
            <br /><br />
            If you ever need help understanding features or navigating the app, use the Help chatbot in the bottom-right corner.
          </p>
        </div>

        {/* Footer */}
        <div className="simple-message-footer">
          <button
            className="simple-message-button"
            onClick={onClose}
          >
            Start using StudyFocus
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;


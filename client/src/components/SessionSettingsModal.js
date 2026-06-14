import React, { useState, useEffect } from 'react';
import './SessionSettingsModal.css';

const SessionSettingsModal = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  const gradientThemes = [
    { id: 'original', name: 'Original', gradient: '#191919' },
    { id: 'midnight', name: 'Midnight', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
    { id: 'deep-space', name: 'Deep Space', gradient: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #2d1b69 100%)' },
    { id: 'forest-night', name: 'Forest Night', gradient: 'linear-gradient(135deg, #0d2818 0%, #1a5f1a 50%, #2d5016 100%)' },
    { id: 'ocean-depths', name: 'Ocean Depths', gradient: 'linear-gradient(135deg, #0a1929 0%, #1e3a8a 50%, #3730a3 100%)' },
    { id: 'ember-glow', name: 'Ember Glow', gradient: 'linear-gradient(135deg, #1c1917 0%, #dc2626 50%, #7c2d12 100%)' },
    { id: 'purple-shadow', name: 'Purple Shadow', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #6b21a8 100%)' },
    { id: 'crimson-dark', name: 'Crimson Dark', gradient: 'linear-gradient(135deg, #1f1f1f 0%, #991b1b 50%, #7f1d1d 100%)' },
    { id: 'steel-grey', name: 'Steel Grey', gradient: 'linear-gradient(135deg, #1f2937 0%, #374151 50%, #4b5563 100%)' }
  ];

  // Update local settings when props change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && isOpen) {
        handleCancel();
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
  }, [isOpen]);

  // Handle click outside modal
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleTimerChange = (field, value) => {
    const newSettings = { ...localSettings, [field]: parseInt(value) || 1 };
    setLocalSettings(newSettings);
  };

  const handleThemeChange = (themeId) => {
    const newSettings = { ...localSettings, gradientTheme: themeId };
    setLocalSettings(newSettings);
  };

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="session-settings-modal-overlay" onClick={handleOverlayClick}>
      <div className="session-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="session-settings-header">
          <h2 className="session-settings-title">Session Settings</h2>
          <button className="session-settings-close" onClick={handleCancel} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Timer Durations Section */}
        <div className="session-settings-section">
          <div className="session-settings-section-header">
            <h3 className="session-settings-section-title">Timer durations</h3>
            <p className="session-settings-section-subtitle">Customize your study and break intervals in minutes</p>
          </div>
          
          <div className="timer-inputs">
            <div className="timer-input-group">
              <label htmlFor="study-time">Study time</label>
              <input
                id="study-time"
                type="number"
                min="1"
                max="120"
                value={localSettings.studyTime || 25}
                onChange={(e) => handleTimerChange('studyTime', e.target.value)}
                className="timer-input"
              />
            </div>
            
            <div className="timer-input-group">
              <label htmlFor="short-break">Short break</label>
              <input
                id="short-break"
                type="number"
                min="1"
                max="60"
                value={localSettings.shortBreak || 5}
                onChange={(e) => handleTimerChange('shortBreak', e.target.value)}
                className="timer-input"
              />
            </div>
            
            <div className="timer-input-group">
              <label htmlFor="long-break">Long break</label>
              <input
                id="long-break"
                type="number"
                min="1"
                max="120"
                value={localSettings.longBreak || 15}
                onChange={(e) => handleTimerChange('longBreak', e.target.value)}
                className="timer-input"
              />
            </div>
          </div>
        </div>

        {/* Gradient Theme Section */}
        <div className="session-settings-section">
          <div className="session-settings-section-header">
            <h3 className="session-settings-section-title">Gradient theme</h3>
            <p className="session-settings-section-subtitle">Choose a beautiful gradient background for your workspace</p>
          </div>
          
          <div className="gradient-options">
            {gradientThemes.map((theme) => (
              <div
                key={theme.id}
                className={`gradient-option ${localSettings.gradientTheme === theme.id ? 'selected' : ''}`}
                onClick={() => handleThemeChange(theme.id)}
              >
                <div
                  className="gradient-preview"
                  style={{ background: theme.gradient }}
                ></div>
                <span className="gradient-name">{theme.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="session-settings-actions">
          <button className="session-settings-btn cancel-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button className="session-settings-btn save-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionSettingsModal;


import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import UserGuideViewer from './UserGuideViewer';
import FAQViewer from './FAQViewer';
import TermsOfServiceViewer from './TermsOfServiceViewer';
import PrivacyPolicyViewer from './PrivacyPolicyViewer';
import SimpleMessageModal from './SimpleMessageModal';
import './SettingsModal.css';

const SettingsModal = ({ isOpen, onClose, user, onLogout, initialSection = 'account' }) => {
  const [activeSection, setActiveSection] = useState(initialSection);
  const { isDarkMode, toggleTheme } = useTheme();
  const { language, changeLanguage, t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showContactSupport, setShowContactSupport] = useState(false);
  const [showReportBug, setShowReportBug] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState({
    notifications: {
      messages: true
    },
    privacy: {
      showStudyStats: true,
      showOnlineStatus: true
    }
  });

  // Load settings when modal opens and set initial section
  useEffect(() => {
    if (isOpen) {
      loadSettings();
      setActiveSection(initialSection);
    }
  }, [isOpen, initialSection]);

  // Load settings from server
  const loadSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && Object.keys(data).length > 0) {
          setSettings(data);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Save settings to server
  const saveSettings = async (newSettings) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSettings)
      });

      if (response.ok) {
        // Settings saved successfully
        console.log('Settings saved successfully');
      } else {
        console.error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle privacy setting changes with auto-save
  const handlePrivacyChange = (field, value) => {
    const newSettings = {
      ...settings,
      privacy: {
        ...settings.privacy,
        [field]: value
      }
    };
    setSettings(newSettings);
    // Auto-save immediately when privacy settings change
    saveSettings(newSettings);
    
    // If showOnlineStatus changed, trigger presence refresh via custom event
    if (field === 'showOnlineStatus') {
      window.dispatchEvent(new CustomEvent('presence-settings-changed', { 
        detail: { showOnlineStatus: value } 
      }));
    }
  };

  // Handle notification setting changes with auto-save
  const handleNotificationChange = (field, value) => {
    const newSettings = {
      ...settings,
      notifications: {
        ...settings.notifications,
        [field]: value
      }
    };
    setSettings(newSettings);
    // Auto-save notifications as well
    saveSettings(newSettings);
  };

  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle click outside modal
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
    onClose();
    }
  };

  const handleLogout = () => {
    if (window.confirm(t('settings.signOutConfirm'))) {
      onLogout();
    onClose();
    }
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    changeLanguage(newLanguage);
  };

  if (!isOpen) return null;

  const sections = [
    { id: 'account', name: t('settings.account'), icon: '👤' },
    { id: 'appearance', name: t('settings.appearance'), icon: '🎨' },
    { id: 'notifications', name: t('settings.notifications'), icon: '🔔' },
    { id: 'privacy', name: t('settings.privacy'), icon: '🔒' },
    { id: 'language', name: t('settings.language'), icon: '🌐' },
    { id: 'about', name: t('settings.about'), icon: 'ℹ️' }
  ];

  return (
    <div className="settings-modal-overlay" onClick={handleOverlayClick}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">{t('settings.title')}</h2>
          <button className="settings-close" onClick={onClose} aria-label={t('settings.close')}>
            ✕
          </button>
        </div>

        <div className="settings-content">
          {/* Sidebar Navigation */}
          <div className="settings-sidebar">
            {sections.map((section) => (
              <button
                key={section.id}
                className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="settings-nav-icon">{section.icon}</span>
                <span className="settings-nav-text">{section.name}</span>
              </button>
            ))}
          </div>
          
          {/* Main Content */}
          <div className="settings-main">
            {/* Account Section */}
            {activeSection === 'account' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.account')}</h3>
                <div className="settings-form-group">
                  <label className="settings-label">{t('settings.name')}</label>
              <input
                    type="text"
                    className="settings-input"
                    value={user?.name || ''}
                    readOnly
                    placeholder={t('settings.name')}
              />
            </div>
                <div className="settings-form-group">
                  <label className="settings-label">{t('settings.email')}</label>
              <input
                    type="email"
                    className="settings-input"
                    value={user?.email || ''}
                    readOnly
                    placeholder={t('settings.email')}
              />
            </div>
                <div className="settings-form-group">
                  <label className="settings-label">{t('settings.userId')}</label>
              <input
                    type="text"
                    className="settings-input"
                    value={user?.id || ''}
                    readOnly
                    placeholder={t('settings.userId')}
                  />
                </div>
                <div className="settings-action-group">
                  <button className="settings-logout-btn" onClick={handleLogout}>
                    {t('settings.signOut')}
                  </button>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.appearance')}</h3>
                <div className="settings-form-group">
                  <label className="settings-label">Theme</label>
                  <div className="settings-toggle-group">
                    <span className="settings-toggle-label">Dark Mode</span>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={isDarkMode}
                        onChange={toggleTheme}
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="settings-form-group">
                  <p className="settings-description">
                    {isDarkMode 
                      ? 'Dark mode is currently enabled. Toggle to switch to light mode.'
                      : 'Light mode is currently enabled. Toggle to switch to dark mode.'}
                  </p>
                </div>
              </div>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.notifications')}</h3>
                <div className="settings-form-group">
                  <div className="settings-toggle-group">
                    <div>
                      <span className="settings-toggle-label">{t('settings.messages')}</span>
                      <p className="settings-toggle-description">{t('settings.messagesDesc')}</p>
                    </div>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={settings.notifications.messages}
                        onChange={(e) => handleNotificationChange('messages', e.target.checked)}
                      />
                      <span className="settings-slider"></span>
                    </label>
            </div>
          </div>
        </div>
            )}

            {/* Privacy Section */}
            {activeSection === 'privacy' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.privacy')}</h3>
                <div className="settings-form-group">
                  <div className="settings-toggle-group">
                    <div>
                      <span className="settings-toggle-label">{t('settings.showStudyStats')}</span>
                      <p className="settings-toggle-description">{t('settings.showStudyStatsDesc')}</p>
                    </div>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={settings.privacy.showStudyStats}
                        onChange={(e) => handlePrivacyChange('showStudyStats', e.target.checked)}
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>
                </div>
                <div className="settings-form-group">
                  <div className="settings-toggle-group">
                    <div>
                      <span className="settings-toggle-label">{t('settings.showOnlineStatus')}</span>
                      <p className="settings-toggle-description">{t('settings.showOnlineStatusDesc')}</p>
                    </div>
                    <label className="settings-switch">
                      <input
                        type="checkbox"
                        checked={settings.privacy.showOnlineStatus}
                        onChange={(e) => handlePrivacyChange('showOnlineStatus', e.target.checked)}
                      />
                      <span className="settings-slider"></span>
                    </label>
                  </div>
                </div>
          </div>
            )}

            {/* Language Section */}
            {activeSection === 'language' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.language')}</h3>
                <div className="settings-form-group">
                  <label className="settings-label">{t('settings.selectLanguage')}</label>
                  <select
                    className="settings-select"
                    value={language}
                    onChange={handleLanguageChange}
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
                <div className="settings-form-group">
                  <p className="settings-description">
                    {t('settings.languageDescription')}
                  </p>
                </div>
              </div>
            )}

            {/* About / Help Section */}
            {activeSection === 'about' && (
              <div className="settings-section-content">
                <h3 className="settings-section-title">{t('settings.about')}</h3>
                <div className="settings-form-group">
                  <div className="about-section">
                    <h4 className="about-title">{t('settings.aboutTitle')}</h4>
                    <p className="settings-description">
                      {t('settings.aboutDescription')}
                    </p>
                  </div>
                </div>
                <div className="settings-form-group">
                  <div className="about-section">
                    <h4 className="about-title">{t('settings.version')}</h4>
                    <p className="settings-description">1.0.0</p>
                  </div>
                </div>
                <div className="settings-form-group">
                  <div className="about-section">
                    <h4 className="about-title">{t('settings.helpSupport')}</h4>
                    <div className="help-links">
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowUserGuide(true);
                        }}
                      >
                        {t('settings.userGuide')}
                      </a>
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowFAQ(true);
                        }}
                      >
                        {t('settings.faq')}
                      </a>
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowContactSupport(true);
                        }}
                      >
                        {t('settings.contactSupport')}
                      </a>
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowReportBug(true);
                        }}
                      >
                        {t('settings.reportBug')}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="settings-form-group">
                  <div className="about-section">
                    <h4 className="about-title">{t('settings.legal')}</h4>
                    <div className="help-links">
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowTermsOfService(true);
                        }}
                      >
                        {t('settings.termsOfService')}
                      </a>
                      <a 
                        href="#" 
                        className="help-link" 
                        onClick={(e) => {
                          e.preventDefault();
                          setShowPrivacyPolicy(true);
                        }}
                      >
                        {t('settings.privacyPolicy')}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Guide Viewer */}
      <UserGuideViewer
        isOpen={showUserGuide}
        onClose={() => setShowUserGuide(false)}
      />

      {/* FAQ Viewer */}
      <FAQViewer
        isOpen={showFAQ}
        onClose={() => setShowFAQ(false)}
      />

      {/* Terms of Service Viewer */}
      <TermsOfServiceViewer
        isOpen={showTermsOfService}
        onClose={() => setShowTermsOfService(false)}
      />

      {/* Privacy Policy Viewer */}
      <PrivacyPolicyViewer
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />

      {/* Contact Support Modal */}
      <SimpleMessageModal
        isOpen={showContactSupport}
        onClose={() => setShowContactSupport(false)}
        title={t('settings.contactSupport')}
        message="For support queries, please email 22359753@studentmail.ul.ie."
      />

      {/* Report Bug Modal */}
      <SimpleMessageModal
        isOpen={showReportBug}
        onClose={() => setShowReportBug(false)}
        title={t('settings.reportBug')}
        message="To report a bug, please email 22359753@studentmail.ul.ie with a description of the issue."
      />
    </div>
  );
};

export default SettingsModal;

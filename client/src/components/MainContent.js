import React, { useState, useEffect, useRef } from 'react';
import { useDataContext } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../context/FavoritesContext';
import DataInput from './DataInput';
import Home from './Home';
import StudySession from './StudySession';
import StudyTogether from './StudyTogether';
import Friends from './Friends';
import Messages from './Messages';
import Leaderboard from './Leaderboard';
import StudyFocusAI from './StudyFocusAI';
import Analytics from './Analytics';
import SchedulePlanner from './SchedulePlanner';
import './MainContent.css';

const MainContent = ({ activeTab, sidebarCollapsed, user, setActiveTab, minimizedSession, setMinimizedSession, studySessionRef, studyTogetherRef }) => {
  const { t } = useLanguage();
  const { 
    getTabData, 
    updateTabData, 
    loadTabData, 
    autoSave, 
    isLoading, 
    isSaving, 
    getError 
  } = useDataContext();
  const { isFavorited, toggleFavorite } = useFavorites();
  const headerRef = useRef(null);

  const [localData, setLocalData] = useState({});
  const [showDemoInputs, setShowDemoInputs] = useState(false);

  // Load data when tab changes
  useEffect(() => {
    loadTabData(activeTab).then(data => {
      setLocalData(data);
    });
  }, [activeTab, loadTabData]);

  // Handle data changes with auto-save
  const handleDataChange = (field, value) => {
    const newData = { ...localData, [field]: value };
    setLocalData(newData);
    updateTabData(activeTab, newData);
    autoSave(activeTab, newData);
  };

  // Handle nested data changes
  const handleNestedDataChange = (parentField, field, value) => {
    const newData = {
      ...localData,
      [parentField]: {
        ...localData[parentField],
        [field]: value
      }
    };
    setLocalData(newData);
    updateTabData(activeTab, newData);
    autoSave(activeTab, newData);
  };
  const getTabTitle = (tabId) => {
    const titles = {
      'study-session': t('tabs.studySession'),
      'study-together': t('tabs.studyTogether'),
      'friends': t('tabs.friends'),
      'leaderboard': t('tabs.leaderboard'),
      'analytics': t('tabs.analytics'),
      'stats': t('tabs.analytics'),
      'schedule-planner': t('tabs.schedulePlanner')
    };
    return titles[tabId] || t('sidebar.home');
  };

  const getTabIcon = (tabId) => {
    const icons = {
      'study-session': '📚',
      'friends': '👥',
      'leaderboard': '🏆',
      'analytics': '📊',
      'stats': '📊',
      'schedule-planner': '📅'
    };
    return icons[tabId] || '📚';
  };

  return (
    <div className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Header - Hidden for StudyFocus AI and Messages */}
      {activeTab !== 'study-ai' && activeTab !== 'messages' && (
        <div className="content-header" ref={headerRef}>
          <div className="header-left">
            <h1 className="page-title">{getTabTitle(activeTab)}</h1>
            <div className="page-meta">
              <span className="privacy-indicator">🔒 {t('settings.private')}</span>
            </div>
          </div>
          <div className="header-right">
            <button 
              className={`header-btn star-btn ${isFavorited(activeTab) ? 'starred' : ''}`}
              onClick={() => toggleFavorite(activeTab)}
              title={isFavorited(activeTab) ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited(activeTab) ? '⭐' : '☆'}
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="content-area">
      {activeTab === 'home' ? (
        <Home user={user} setActiveTab={setActiveTab} />
      ) : activeTab === 'study-session' ? (
        <StudySession 
          ref={studySessionRef}
          minimizedSession={minimizedSession}
          setMinimizedSession={setMinimizedSession}
        />
      ) : activeTab === 'study-together' ? (
        <StudyTogether 
          ref={studyTogetherRef}
          user={user}
          minimizedSession={minimizedSession}
          setMinimizedSession={setMinimizedSession}
        />
      ) : activeTab === 'friends' ? (
        <Friends user={user} setActiveTab={setActiveTab} />
      ) : activeTab === 'messages' ? (
        <Messages user={user} setActiveTab={setActiveTab} />
      ) : activeTab === 'leaderboard' ? (
        <Leaderboard user={user} />
           ) : activeTab === 'analytics' ? (
             <Analytics user={user} />
           ) : activeTab === 'study-ai' ? (
             <StudyFocusAI />
           ) : activeTab === 'schedule-planner' ? (
             <SchedulePlanner user={user} />
           ) : (
          <div className="welcome-section">
            <div className="welcome-emoji">👋</div>
            <div className="action-buttons">
              <button className="action-btn">
                <span className="btn-icon">📷</span>
                {t('common.edit')}
              </button>
              <button className="action-btn">
                <span className="btn-icon">💬</span>
                {t('common.edit')}
              </button>
            </div>
            <h1 className="welcome-title">{getTabTitle(activeTab)}</h1>
            <div className="welcome-content">
              <div className="checklist">
                <div className="checklist-item completed">
                  <span className="checkmark">✓</span>
                  <span className="checklist-text">{t('home.welcome')} {user ? `, ${user.name}` : ''}!</span>
                </div>
                <div className="checklist-item">
                  <span className="checkbox">☐</span>
                  <span className="checklist-text">{t('home.welcome')}</span>
                </div>
                <div className="checklist-item">
                  <span className="checkbox">☐</span>
                  <span className="checklist-text">{t('home.welcome')}</span>
                </div>
                <div className="checklist-item">
                  <span className="checkbox">☐</span>
                  <span className="checklist-text">{t('home.welcome')}</span>
                  <span className="hand-emoji">👉</span>
                </div>
                <div className="checklist-item toggle">
                  <span className="checkbox">☐</span>
                  <span className="checklist-text">{t('home.welcome')}</span>
                  <span className="toggle-arrow">▼</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notion Logo */}
    </div>
  );
};

export default MainContent;

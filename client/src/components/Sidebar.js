import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useFavorites } from '../context/FavoritesContext';
import './Sidebar.css';

// Search index with all pages and features
const searchIndex = [
    // Pages
    { type: 'page', id: 'home', name: 'Home', keywords: ['home', 'main', 'dashboard'], icon: '🏠' },
    { type: 'page', id: 'study-session', name: 'Study Session', keywords: ['study session', 'study', 'session', 'timer', 'pomodoro'], icon: '📚' },
    { type: 'page', id: 'study-together', name: 'Study Together', keywords: ['study together', 'together', 'collaborate', 'group study'], icon: '🤝' },
    { type: 'page', id: 'leaderboard', name: 'Leaderboard', keywords: ['leaderboard', 'rankings', 'scores', 'competition'], icon: '🏆' },
    { type: 'page', id: 'schedule-planner', name: 'Schedule Planner', keywords: ['schedule planner', 'schedule', 'planner', 'timetable', 'calendar', 'plan'], icon: '📅' },
    { type: 'page', id: 'analytics', name: 'Analytics', keywords: ['analytics', 'stats', 'statistics', 'data', 'insights'], icon: '📊' },
    { type: 'page', id: 'settings', name: 'Settings', keywords: ['settings', 'preferences', 'config', 'options'], icon: '⚙️' },
    { type: 'page', id: 'messages', name: 'Messages', keywords: ['messages', 'chat', 'conversations', 'inbox'], icon: '💬' },
    { type: 'page', id: 'study-ai', name: 'StudyFocus AI', keywords: ['ai', 'assistant', 'studyfocus ai', 'chatbot', 'help'], icon: '🤖' },
    { type: 'page', id: 'friends', name: 'Friends', keywords: ['friends', 'contacts', 'people', 'connections'], icon: '👥' },
    
    // Features
    { type: 'feature', id: 'start-session', name: 'Start Session', keywords: ['start session', 'start', 'begin', 'new session'], page: 'study-session', icon: '▶️' },
    { type: 'feature', id: 'join-study-together', name: 'Join Study Together', keywords: ['join study together', 'join', 'study together', 'collaborate'], page: 'study-together', icon: '🤝' },
    { type: 'feature', id: 'blackboard', name: 'Blackboard', keywords: ['blackboard', 'board', 'whiteboard', 'draw', 'sketch'], page: 'study-session', icon: '🖊️' },
    { type: 'feature', id: 'blackboard-together', name: 'Blackboard (Study Together)', keywords: ['blackboard', 'board', 'whiteboard', 'draw', 'sketch', 'together'], page: 'study-together', icon: '🖊️' },
    { type: 'feature', id: 'timer', name: 'Timer', keywords: ['timer', 'countdown', 'clock', 'time'], page: 'study-session', icon: '⏱️' },
    { type: 'feature', id: 'friends-page', name: 'Friends', keywords: ['friends', 'contacts', 'people'], page: 'friends', icon: '👥' },
];

const Sidebar = ({ studyTabs, socialTabs, messagesTab, activeTab, setActiveTab, collapsed, setCollapsed, user, onLogout, onSettingsClick, onShareAppClick, onHelpClick }) => {
  const { t } = useLanguage();
  const { getFavoritedTabs } = useFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const searchResultsRef = useRef(null);
  
  // Get favorited tabs with translated names from existing tab arrays
  const favoritedTabIds = getFavoritedTabs().map(tab => tab.id);
  const allTabs = [
    ...studyTabs,
    ...socialTabs,
    ...(messagesTab ? [messagesTab] : []),
    { id: 'study-ai', name: t('sidebar.studyFocusAI'), icon: '🤖' }
  ];
  
  const favoritedTabs = favoritedTabIds
    .map(tabId => {
      const tab = allTabs.find(t => t.id === tabId);
      return tab ? { id: tab.id, name: tab.name, icon: tab.icon } : null;
    })
    .filter(tab => tab !== null);

  // Search matching function
  const matchQuery = (query, text) => {
    if (!query) return false;
    const lowerQuery = query.toLowerCase().trim();
    const lowerText = text.toLowerCase();
    
    // Exact match
    if (lowerText === lowerQuery) return true;
    
    // Starts with
    if (lowerText.startsWith(lowerQuery)) return true;
    
    // Word matching - check if query matches any word
    const words = lowerText.split(/\s+/);
    const queryWords = lowerQuery.split(/\s+/);
    
    // Check if all query words appear in the text (in any order)
    return queryWords.every(qWord => 
      words.some(word => word.startsWith(qWord) || word.includes(qWord))
    );
  };

  // Perform search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const results = searchIndex
      .filter(item => {
        // Check name
        if (matchQuery(query, item.name)) return true;
        
        // Check keywords
        return item.keywords.some(keyword => matchQuery(query, keyword));
      })
      .slice(0, 8); // Limit to 8 results

    setSearchResults(results);
    setShowSearchResults(results.length > 0);
    setSelectedResultIndex(-1);
  }, [searchQuery]);

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Handle search result click
  const handleResultClick = (result) => {
    if (result.type === 'page') {
      if (result.id === 'settings') {
        if (onSettingsClick) {
          onSettingsClick();
        }
      } else {
        setActiveTab(result.id);
      }
    } else if (result.type === 'feature') {
      // Navigate to the parent page
      setActiveTab(result.page);
      // Note: For features like blackboard, the user will need to open it manually
      // This can be enhanced later with a callback system
    }
    
    setSearchQuery('');
    setShowSearchResults(false);
    if (searchInputRef.current) {
      searchInputRef.current.blur();
    }
  };

  // Handle keyboard navigation
  const handleSearchKeyDown = (e) => {
    if (!showSearchResults || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex(prev => 
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedResultIndex >= 0 && selectedResultIndex < searchResults.length) {
        handleResultClick(searchResults[selectedResultIndex]);
      } else if (searchResults.length > 0) {
        handleResultClick(searchResults[0]);
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setShowSearchResults(false);
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
    }
  };

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearchResults]);

  const handleLogout = () => {
    if (window.confirm(t('settings.signOutConfirm'))) {
      onLogout();
    }
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="user-info">
          <span className="user-name">{user ? `${user.name}'s` : t('sidebar.user')}</span>
        </div>
        {!collapsed && (
          <button className="logout-btn" onClick={handleLogout} title={t('sidebar.signOut')}>
            <img src="/logout.png" alt="Sign Out" className="logout-icon" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="sidebar-nav">
        <div className="search-container" ref={searchResultsRef}>
          <div className="nav-item search-item">
          <span className="nav-icon">🔍</span>
            {!collapsed ? (
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder={t('sidebar.search')}
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setShowSearchResults(true);
                  }
                }}
              />
            ) : (
              <span className="nav-text">{t('sidebar.search')}</span>
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {!collapsed && showSearchResults && searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((result, index) => (
                <div
                  key={`${result.type}-${result.id}`}
                  className={`search-result-item ${selectedResultIndex === index ? 'selected' : ''}`}
                  onClick={() => handleResultClick(result)}
                  onMouseEnter={() => setSelectedResultIndex(index)}
                >
                  <span className="search-result-icon">{result.icon}</span>
                  <div className="search-result-content">
                    <span className="search-result-name">{result.name}</span>
                    <span className="search-result-type">{result.type === 'page' ? 'Page' : 'Feature'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <span className="nav-icon">🏠</span>
          {!collapsed && <span className="nav-text">{t('sidebar.home')}</span>}
        </div>
        <div className={`nav-item ${activeTab === 'study-ai' ? 'active' : ''}`} onClick={() => setActiveTab('study-ai')}>
          <span className="nav-icon">🤖</span>
          {!collapsed && <span className="nav-text">{t('sidebar.studyFocusAI')}</span>}
        </div>
        <div className={`nav-item ${activeTab === 'messages' ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>
          <span className="nav-icon">💬</span>
          {!collapsed && (
            <div className="nav-text-container">
              <span className="nav-text">{t('sidebar.messages')}</span>
              {messagesTab?.unreadCount > 0 && (
                <span className="unread-badge">
                  {messagesTab?.unreadCount > 99 ? '99+' : messagesTab?.unreadCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sections Container */}
      <div className="sections-container">
        {/* Favorites Section - Only show if there are favorites */}
        {favoritedTabs.length > 0 && (
          <div className="sidebar-section">
            <div className="section-header">
              {!collapsed && <span className="section-title">{t('sidebar.favorites')}</span>}
            </div>
            
            <div className="section-items">
              {favoritedTabs.map((tab) => (
                <div 
                  key={tab.id}
                  className={`section-item ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="item-icon">{tab.icon}</span>
                  {!collapsed && (
                    <div className="item-text-container">
                      <span className="item-text">{tab.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Study Sections */}
        <div className="sidebar-section">
          <div className="section-header">
            {!collapsed && <span className="section-title">{t('sidebar.study')}</span>}
          </div>
          
          <div className="section-items">
            {studyTabs.map((tab) => (
              <div 
                key={tab.id}
                className={`section-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="item-icon">{tab.icon}</span>
                {!collapsed && (
                  <div className="item-text-container">
                    <span className="item-text">{tab.name}</span>
                    {tab.unreadCount > 0 && (
                      <span className="unread-badge">
                        {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Social Sections */}
        <div className="sidebar-section">
          <div className="section-header">
            {!collapsed && <span className="section-title">{t('sidebar.social')}</span>}
          </div>
          
          <div className="section-items">
            {socialTabs.map((tab) => (
              <div 
                key={tab.id}
                className={`section-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="item-icon">{tab.icon}</span>
                {!collapsed && (
                  <div className="item-text-container">
                    <span className="item-text">{tab.name}</span>
                    {tab.unreadCount > 0 && (
                      <span className="unread-badge">
                        {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="sidebar-bottom">
        <div className="bottom-items">
          <div className="bottom-item" onClick={onSettingsClick}>
            <span className="bottom-icon">⚙️</span>
            {!collapsed && <span className="bottom-text">{t('sidebar.settings')}</span>}
          </div>
          <div 
            className="bottom-item"
            onClick={onShareAppClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onShareAppClick();
              }
            }}
            aria-label={t('sidebar.share')}
          >
            <span className="bottom-icon">✈️</span>
            {!collapsed && <span className="bottom-text">{t('sidebar.share')}</span>}
          </div>
          <div 
            className="bottom-item"
            onClick={onHelpClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onHelpClick();
              }
            }}
            aria-label={t('sidebar.help')}
          >
            <span className="bottom-icon">❓</span>
            {!collapsed && <span className="bottom-text">{t('sidebar.help')}</span>}
          </div>
        </div>
      </div>

      {/* Collapse Button */}
      <button 
        className="collapse-btn"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '▶' : '◀'}
      </button>
    </div>
  );
};

export default Sidebar;

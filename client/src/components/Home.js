import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Home.css';

const Home = ({ user, setActiveTab }) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    studySessions: 0,
    friends: 0,
    totalTime: 0,
    scheduleItems: 0,
    loading: true,
    error: false
  });

  // Fetch real stats from database. Wrapped in useCallback so it can be
  // re-run from the focus / visibility / mount listeners below.
  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const [studyResponse, friendsResponse, scheduleResponse] = await Promise.all([
        fetch('http://localhost:3001/api/study-session', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }),
        fetch('http://localhost:3001/api/friends', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }),
        fetch('http://localhost:3001/api/schedule-planner', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        })
      ]);

      if (studyResponse.ok && friendsResponse.ok) {
        const studyData = await studyResponse.json();
        const friendsData = await friendsResponse.json();
        const scheduleData = scheduleResponse.ok
          ? await scheduleResponse.json()
          : { generatedSchedule: null, extractedClasses: [] };

        // Dedupe sessions by id so totals agree with the Study Session
        // history view (which dedupes on render) and with Analytics.
        const rawSessions = studyData.sessions || [];
        const seen = new Set();
        const sessions = rawSessions.filter(s => {
          if (!s || !s.id) return true;
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });

        const friendsList = friendsData.friends || [];
        const schedule = scheduleData.generatedSchedule;

        // Total time = sum of actual durations (same formula as Analytics).
        const totalMinutes = sessions.reduce(
          (sum, session) => sum + (session.actualDuration || 0),
          0
        );

        let scheduleItemsCount = 0;
        if (schedule && schedule.schedule) {
          scheduleItemsCount = schedule.schedule.reduce(
            (sum, daySchedule) => sum + (daySchedule.blocks?.length || 0),
            0
          );
        }

        setStats({
          studySessions: sessions.length,
          friends: friendsList.length,
          totalTime: totalMinutes,
          scheduleItems: scheduleItemsCount,
          loading: false,
          error: false
        });
      } else {
        setStats(prev => ({ ...prev, loading: false, error: true }));
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats(prev => ({ ...prev, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    fetchStats();

    // Refresh whenever Home regains focus or the tab becomes visible again.
    // Without this, completing a session elsewhere in the app leaves the
    // dashboard stuck on stale counts until a full page reload.
    const handleFocus = () => fetchStats();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStats();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchStats]);

  // Format time helper
  const formatTime = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const quickAccessItems = [
    {
      id: 'study-session',
      title: t('tabs.studySession'),
      description: t('home.startFocused'),
      icon: '📚',
      color: '#3b82f6',
      getStats: () => `${stats.studySessions} ${t('home.sessions')}`
    },
    {
      id: 'study-together',
      title: t('tabs.studyTogether'),
      description: t('home.scheduleJoin'),
      icon: '🤝',
      color: '#10b981',
      getStats: () => t('home.connectWithFriends')
    },
    {
      id: 'friends',
      title: t('tabs.friends'),
      description: t('home.manageNetwork'),
      icon: '👥',
      color: '#8b5cf6',
      getStats: () => `${stats.friends} ${t('home.friends')}`
    },
    {
      id: 'messages',
      title: t('sidebar.messages'),
      description: t('home.chatPartners'),
      icon: '💬',
      color: '#f59e0b',
      getStats: () => t('home.stayConnected')
    },
    {
      id: 'leaderboard',
      title: t('tabs.leaderboard'),
      description: t('home.seeRank'),
      icon: '🏆',
      color: '#ef4444',
      getStats: () => t('home.trackProgress')
    },
    {
      id: 'study-ai',
      title: t('sidebar.studyFocusAI'),
      description: t('home.getAssistance'),
      icon: '🤖',
      color: '#06b6d4',
      getStats: () => t('home.aiPoweredHelp')
    },
    {
      id: 'analytics',
      title: t('tabs.analytics'),
      description: t('home.viewStats'),
      icon: '📊',
      color: '#6366f1',
      getStats: () => formatTime(stats.totalTime) + ' ' + t('home.studied')
    },
    {
      id: 'schedule-planner',
      title: t('tabs.schedulePlanner'),
      description: t('home.planSchedule'),
      icon: '📅',
      color: '#84cc16',
      getStats: () => stats.scheduleItems > 0 ? `${stats.scheduleItems} ${t('home.items')}` : t('home.planYourWeek')
    }
  ];

  const handleQuickAccess = (tabId) => {
    setActiveTab(tabId);
  };

  return (
    <div className="home-container">
      {stats.error && !stats.loading && (
        <div
          className="home-error-banner"
          role="alert"
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: 8,
            margin: '0 0 16px',
            fontSize: 14
          }}
        >
          {t('home.statsError') || 'Unable to load your latest stats. Check your connection and try again.'}
        </div>
      )}
      {/* Header */}
      <div className="home-header">
        <div className="welcome-section">
          <h1 className="welcome-title">
            {t('home.welcome')}, {user?.name || t('sidebar.user')}
          </h1>
          <p className="welcome-subtitle">
            {t('home.readyToFocus')}
          </p>
        </div>
        <div className="quick-stats">
          <div className="stat-card">
            <div className="stat-number">{stats.loading ? '...' : stats.studySessions}</div>
            <div className="stat-label">{t('home.studySessions')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.loading ? '...' : stats.friends}</div>
            <div className="stat-label">{t('home.friends')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{stats.loading ? '...' : formatTime(stats.totalTime)}</div>
            <div className="stat-label">{t('home.totalTime')}</div>
          </div>
        </div>
      </div>

      {/* Quick Access Section */}
      <div className="quick-access-section">
        <h2 className="section-title">{t('home.quickAccess')}</h2>
        <div className="quick-access-grid">
          {quickAccessItems.map((item) => (
            <div
              key={item.id}
              className="quick-access-card"
              onClick={() => handleQuickAccess(item.id)}
              style={{ '--card-color': item.color }}
            >
              <div className="card-icon">
                {item.icon}
              </div>
              <div className="card-content">
                <h3 className="card-title">{item.title}</h3>
                <p className="card-description">{item.description}</p>
                <span className="card-stats">{item.getStats ? item.getStats() : ''}</span>
              </div>
              <div className="card-arrow">→</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;








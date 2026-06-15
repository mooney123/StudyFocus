import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useStudyTogetherSocket } from '../hooks/useStudyTogetherSocket';
import WaitingRoom from './WaitingRoom';
import SynchronizedStudySession from './SynchronizedStudySession';
import './StudyTogether.css';

const StudyTogether = forwardRef(({ user, minimizedSession, setMinimizedSession }, ref) => {
  const { t } = useLanguage();
  const synchronizedSessionRef = useRef(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState('');
  const [studyType, setStudyType] = useState('pomodoro');
  const [duration, setDuration] = useState(25);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [subject, setSubject] = useState('');
  const [friends, setFriends] = useState([]);
  const [scheduledSessions, setScheduledSessions] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sectionMessages, setSectionMessages] = useState({
    schedule: '',
    pending: '',
    upcoming: ''
  });
  
  // Session state management
  const [currentSession, setCurrentSession] = useState(null);
  const [currentSessionState, setCurrentSessionState] = useState(null);
  const [sessionView, setSessionView] = useState('list'); // 'list', 'waiting', 'active'

  // Load friends and sessions on component mount
  useEffect(() => {
    loadFriends();
    loadSessions();
  }, []);

  // Real-time socket events
  useStudyTogetherSocket(user?.id, {
    onInvite: (invite) => {
      setPendingRequests(prev => {
        const exists = prev.some(r => r.id === invite.id);
        if (exists) return prev;
        return [...prev, { ...invite, creatorName: invite.creatorName || 'Unknown', friendName: invite.friendName || 'Unknown' }];
      });
    },
    onInviteAccepted: () => { loadSessions(); },
    onInviteDeclined: () => { loadSessions(); },
    onSessionCancelled: () => { loadSessions(); },
    onReadyUpdate: (data) => {
      if (currentSession?.id === data.sessionId && sessionView === 'waiting' && data.participants) {
        setCurrentSessionState(prev => prev ? { ...prev, participants: [...data.participants] } : prev);
      }
    },
    onSessionStarted: (data) => {
      if (currentSession?.id === data.sessionId) {
        setCurrentSessionState(data.sessionState);
        setSessionView('active');
      }
    }
  });

  // Keep timer running when session is minimized (same as Solo: timer continues so restore shows correct time)
  const minimizedTimerIntervalRef = useRef(null);
  useEffect(() => {
    const isMinimized = minimizedSession?.type === 'together' && currentSession && minimizedSession?.sessionId === currentSession.id;
    const isRunning = isMinimized && minimizedSession?.isRunning && (minimizedSession?.timeLeft ?? 0) > 0;
    if (!isRunning) {
      if (minimizedTimerIntervalRef.current) {
        clearInterval(minimizedTimerIntervalRef.current);
        minimizedTimerIntervalRef.current = null;
      }
      return;
    }
    minimizedTimerIntervalRef.current = setInterval(() => {
      setMinimizedSession(prev => {
        if (!prev || prev.type !== 'together') return prev;
        const next = Math.max(0, (prev.timeLeft ?? 0) - 1);
        return { ...prev, timeLeft: next };
      });
    }, 1000);
    return () => {
      if (minimizedTimerIntervalRef.current) {
        clearInterval(minimizedTimerIntervalRef.current);
        minimizedTimerIntervalRef.current = null;
      }
    };
  }, [minimizedSession?.type, minimizedSession?.sessionId, minimizedSession?.isRunning, currentSession?.id]);

  // Restore session when returning to Study Together tab with a minimized together session
  // (Session state is lost on tab switch because the component unmounts; minimizedSession in App survives.)
  useEffect(() => {
    if (minimizedSession?.type !== 'together' || !minimizedSession?.sessionId) return;
    // Only restore when we don't already have this session loaded (e.g. after remount)
    if (currentSession?.id === minimizedSession.sessionId) return;

    let cancelled = false;
    const restoreMinimizedSession = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/study-together/session/${minimizedSession.sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (cancelled || !response.ok) return;
        const result = await response.json();
        if (!result?.session || !result?.sessionState) return;
        if (result.sessionState.status === 'completed') {
          setCurrentSession(null);
          setCurrentSessionState(null);
          setSessionView('list');
          loadSessions();
        } else {
          setCurrentSession(result.session);
          setCurrentSessionState(result.sessionState);
          setSessionView(result.sessionState.status === 'active' ? 'active' : 'waiting');
        }
      } catch (error) {
        if (!cancelled) console.error('Error restoring minimized Study Together session:', error);
      }
    };
    restoreMinimizedSession();
    return () => { cancelled = true; };
  }, [minimizedSession?.type, minimizedSession?.sessionId]);

  // Auto-dismiss messages after 4 seconds
  useEffect(() => {
    const timers = Object.keys(sectionMessages).map(section => {
      if (sectionMessages[section]) {
        return setTimeout(() => {
          setSectionMessages(prev => ({ ...prev, [section]: '' }));
        }, 4000);
      }
      return null;
    });

    return () => {
      timers.forEach(timer => timer && clearTimeout(timer));
    };
  }, [sectionMessages]);


  // Load friends from API
  const loadFriends = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/friends', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setFriends(result.friends || []);
      } else {
        console.error('Failed to load friends');
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  // Load study sessions and pending requests
  const loadSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/sessions', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setScheduledSessions(result.scheduledSessions || []);
        setPendingRequests(result.pendingRequests || []);
      } else {
        console.error('Failed to load sessions');
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  const handleScheduleSession = async () => {
    try {
      setLoading(true);
      setSectionMessages(prev => ({ ...prev, schedule: '' }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/schedule', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          friendId: selectedFriend,
          subject: subject,
          studyType: studyType,
          duration: duration,
          scheduledDate: scheduledDate,
          scheduledTime: scheduledTime
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSectionMessages(prev => ({ ...prev, schedule: t('studyTogether.sessionScheduled') }));
        setShowScheduleModal(false);
        // Reset form
        setSelectedFriend('');
        setSubject('');
        setScheduledDate('');
        setScheduledTime('');
        // Reload sessions
        loadSessions();
      } else {
        const error = await response.json();
        setSectionMessages(prev => ({ ...prev, schedule: error.error || t('studyTogether.failedToSchedule') }));
      }
    } catch (error) {
      console.error('Error scheduling session:', error);
      setSectionMessages(prev => ({ ...prev, schedule: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (sessionId) => {
    try {
      setLoading(true);
      setSectionMessages(prev => ({ ...prev, pending: '' }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/accept', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        setSectionMessages(prev => ({ ...prev, pending: t('studyTogether.requestAccepted') }));
        loadSessions();
      } else {
        const error = await response.json();
        setSectionMessages(prev => ({ ...prev, pending: error.error || t('studyTogether.failedToSchedule') }));
      }
    } catch (error) {
      console.error('Error accepting session:', error);
      setSectionMessages(prev => ({ ...prev, pending: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRequest = async (sessionId) => {
    try {
      setLoading(true);
      setSectionMessages(prev => ({ ...prev, pending: '' }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/decline', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        setSectionMessages(prev => ({ ...prev, pending: t('studyTogether.requestDeclined') }));
        loadSessions();
      } else {
        const error = await response.json();
        setSectionMessages(prev => ({ ...prev, pending: error.error || t('studyTogether.failedToSchedule') }));
      }
    } catch (error) {
      console.error('Error declining session:', error);
      setSectionMessages(prev => ({ ...prev, pending: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSession = async (sessionId) => {
    try {
      setLoading(true);
      setSectionMessages(prev => ({ ...prev, upcoming: '' }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/cancel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        setSectionMessages(prev => ({ ...prev, upcoming: t('studyTogether.requestDeclined') }));
        loadSessions();
      } else {
        const error = await response.json();
        setSectionMessages(prev => ({ ...prev, upcoming: error.error || t('studyTogether.failedToSchedule') }));
      }
    } catch (error) {
      console.error('Error cancelling session:', error);
      setSectionMessages(prev => ({ ...prev, upcoming: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (session) => {
    try {
      setLoading(true);
      setSectionMessages(prev => ({ ...prev, upcoming: '' }));
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/join', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: session.id })
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentSession(result.session);
        setCurrentSessionState(result.sessionState);
        
        // Check if session should show waiting room or active session
        if (result.sessionState.status === 'active') {
          setSessionView('active');
        } else {
          setSessionView('waiting');
        }
        
        // Message will be shown when returning to the list view
      } else {
        const error = await response.json();
        setSectionMessages(prev => ({ ...prev, upcoming: error.error || 'Failed to join session' }));
      }
    } catch (error) {
      console.error('Error joining session:', error);
      setSectionMessages(prev => ({ ...prev, upcoming: 'Network error. Please try again.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-together/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionId: currentSession.id })
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentSessionState(result.sessionState);
        setSessionView('active');
        // Message will be shown when returning to the list view
      } else {
        const error = await response.json();
        // Error handling for waiting room - could show in a different way
        console.error('Failed to start session:', error);
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const handleLeaveSession = () => {
    setCurrentSession(null);
    setCurrentSessionState(null);
    setSessionView('list');
    setSectionMessages(prev => ({ ...prev, upcoming: 'Left session successfully.' }));
    loadSessions(); // Refresh the sessions list to remove the session
  };

  const handleEndSession = () => {
    setCurrentSession(null);
    setCurrentSessionState(null);
    setSessionView('list');
    setSectionMessages(prev => ({ ...prev, schedule: 'Study session completed!' }));
    loadSessions(); // Refresh the sessions list
    // Clear minimized session if it exists
    if (minimizedSession && minimizedSession.type === 'together') {
      setMinimizedSession(null);
    }
  };

  // Expose stopSession, clearSession, and restoreSessionTime via ref for App (minimized timer)
  useImperativeHandle(ref, () => ({
    stopSession: () => {
      if (synchronizedSessionRef.current) {
        synchronizedSessionRef.current.stopSession();
      }
    },
    clearSession: () => {
      setCurrentSession(null);
      setCurrentSessionState(null);
      setSessionView('list');
      loadSessions();
    },
    restoreSessionTime: (minimized) => {
      if (minimized?.timeLeft !== undefined && currentSessionState) {
        setCurrentSessionState(prev => (prev ? { ...prev, timeLeft: minimized.timeLeft } : prev));
      }
    }
  }));


  const refreshSessionState = async () => {
    if (currentSession) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/study-together/session/${currentSession.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          setCurrentSessionState(result.sessionState);
          
          // Update view based on session status
          if (result.sessionState.status === 'active' && sessionView === 'waiting') {
            setSessionView('active');
          }
          
          // Handle session completion (when someone stops the session)
          if (result.sessionState.status === 'completed' && sessionView === 'active') {
            // Exit the session view after a short delay
            setTimeout(() => {
              setCurrentSession(null);
              setCurrentSessionState(null);
              setSessionView('list');
              setSectionMessages(prev => ({ ...prev, schedule: 'Session has been ended by the organizer.' }));
              loadSessions(); // Refresh the sessions list
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Error refreshing session state:', error);
      }
    }
  };

  // Periodic refresh for active sessions
  useEffect(() => {
    if (sessionView === 'active' && currentSession) {
      const interval = setInterval(() => {
        refreshSessionState();
      }, 1000); // Refresh every 1 second for faster response to session changes

      return () => clearInterval(interval);
    }
  }, [sessionView, currentSession]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // When the current session is minimized, show list content (same as Solo: tab shows content while minimized)
  const isCurrentSessionMinimized =
    minimizedSession?.type === 'together' &&
    currentSession &&
    minimizedSession?.sessionId === currentSession.id;

  // If we're in a session view and not minimized, show the session UI
  if (sessionView === 'waiting' && currentSession && currentSessionState && !isCurrentSessionMinimized) {
    return (
      <WaitingRoom
        session={currentSession}
        sessionState={currentSessionState}
        user={user}
        onStartSession={handleStartSession}
        onJoinSession={refreshSessionState}
        onLeaveSession={handleLeaveSession}
      />
    );
  }

  return (
    <>
      {/*
        Active session — rendered at a FIXED React-tree position so the component
        never unmounts when the user minimizes it.  CSS display:none hides it
        visually while keeping all state, effects, refs, and the running timer
        intact.  The old early-return + separate hidden-div approach put the
        component at two different tree positions, causing React to unmount/remount
        it on every minimize/restore and resetting the timer.
      */}
      {sessionView === 'active' && currentSession && currentSessionState && (
        <div style={isCurrentSessionMinimized ? { display: 'none' } : { height: '100%' }}>
          <SynchronizedStudySession
            ref={synchronizedSessionRef}
            session={currentSession}
            sessionState={currentSessionState}
            user={user}
            onEndSession={handleEndSession}
            onLeaveSession={handleLeaveSession}
            minimizedSession={minimizedSession}
            setMinimizedSession={setMinimizedSession}
          />
        </div>
      )}

      {(sessionView !== 'active' || isCurrentSessionMinimized || !currentSession || !currentSessionState) && (
        <div className="study-together-container">
      <div className="study-together-layout">
        {/* Left: Pending Requests */}
        <aside className="study-together-side-panel study-together-side-panel-left">
          <div className="side-panel-header">
            <h3>{t('studyTogether.pendingRequests')}</h3>
            <span className="side-panel-badge" aria-label={`${pendingRequests.length} pending`}>
              {pendingRequests.length}
            </span>
          </div>
          {sectionMessages.pending && (
            <div className={`section-message side-panel-message ${sectionMessages.pending.includes('successfully') || sectionMessages.pending.includes('accepted') || sectionMessages.pending.includes('declined') ? 'success' : 'error'}`}>
              {sectionMessages.pending}
            </div>
          )}
          {pendingRequests.length === 0 ? (
            <div className="side-panel-empty">
              <span className="side-panel-empty-icon">📭</span>
              <p>{t('studyTogether.noPending')}</p>
            </div>
          ) : (
            <div className="side-panel-list">
              {pendingRequests.map(request => (
                <div key={request.id} className="side-panel-card request-card-mini">
                  <div className="side-panel-card-title">{request.subject}</div>
                  <div className="side-panel-card-meta">from {request.creatorName || 'Unknown'}</div>
                  <div className="side-panel-card-meta">{formatDate(request.scheduledFor)}</div>
                  <div className="side-panel-card-actions">
                    <button
                      className="action-btn primary mini"
                      onClick={() => handleAcceptRequest(request.id)}
                      disabled={loading}
                    >
                      {t('studyTogether.accept')}
                    </button>
                    <button
                      className="action-btn danger mini"
                      onClick={() => handleDeclineRequest(request.id)}
                      disabled={loading}
                    >
                      {t('studyTogether.decline')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Center: Main session box (Solo Study Session style) */}
        <main className="study-together-main-wrap">
          <div className="study-together-main-box">
            <h2 className="study-together-box-title">{t('studyTogether.title')}</h2>
            <p className="study-together-box-subtitle">{t('studyTogether.subtitle')}</p>

            {sectionMessages.schedule && (
              <div className={`section-message ${sectionMessages.schedule.includes('successfully') || sectionMessages.schedule.includes('accepted') || sectionMessages.schedule.includes('scheduled') || sectionMessages.schedule.includes('completed') ? 'success' : 'error'}`}>
                {sectionMessages.schedule}
              </div>
            )}

            {/* Session options inside box: Friend, Date/Time, Type, Duration */}
            <div className="study-together-session-setup">
              <div className="form-group">
                <label>{t('studyTogether.selectFriend')}</label>
                <select
                  value={selectedFriend}
                  onChange={(e) => setSelectedFriend(e.target.value)}
                  className="form-select"
                  disabled={friends.length === 0}
                >
                  <option value="">
                    {friends.length === 0 ? t('studyTogether.noFriends') : t('studyTogether.selectFriend')}
                  </option>
                  {friends.map(friend => (
                    <option key={friend.id} value={friend.id}>
                      {friend.name} ({friend.status === 'online' ? '🟢' : '🔴'})
                    </option>
                  ))}
                </select>
                {friends.length === 0 && (
                  <small className="form-help">{t('studyTogether.noFriends')}</small>
                )}
              </div>

              <div className="form-group">
                <label>{t('studyTogether.subject')}</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('studySession.enterSubject')}
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{t('studyTogether.studyType')}</label>
                  <select
                    value={studyType}
                    onChange={(e) => setStudyType(e.target.value)}
                    className="form-select"
                  >
                    <option value="pomodoro">🍅 {t('studySession.pomodoro')} (25 {t('studySession.minutes')})</option>
                    <option value="deep-focus">🧠 {t('studySession.study')} (90 {t('studySession.minutes')})</option>
                    <option value="study-group">👥 {t('tabs.studyTogether')} (2+ {t('home.totalTime')})</option>
                    <option value="custom">⚙️ {t('studySession.custom')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('studyTogether.duration')}</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    min="15"
                    max="480"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>{t('studyTogether.date')}</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>{t('studyTogether.time')}</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="study-together-box-actions">
                <button
                  className="schedule-btn primary"
                  onClick={handleScheduleSession}
                  disabled={!selectedFriend || !subject || !scheduledDate || !scheduledTime || loading}
                >
                  {loading ? t('common.loading') : t('studyTogether.scheduleSession')}
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Right: Upcoming Sessions */}
        <aside className="study-together-side-panel study-together-side-panel-right">
          <div className="side-panel-header">
            <h3>{t('studyTogether.upcomingSessions')}</h3>
            <span className="side-panel-badge" aria-label={`${scheduledSessions.length} upcoming`}>
              {scheduledSessions.length}
            </span>
          </div>
          {sectionMessages.upcoming && (
            <div className={`section-message side-panel-message ${sectionMessages.upcoming.includes('successfully') || sectionMessages.upcoming.includes('accepted') || sectionMessages.upcoming.includes('declined') || sectionMessages.upcoming.includes('completed') || sectionMessages.upcoming.includes('ended') || sectionMessages.upcoming.includes('Left') ? 'success' : 'error'}`}>
              {sectionMessages.upcoming}
            </div>
          )}
          {scheduledSessions.length === 0 ? (
            <div className="side-panel-empty">
              <span className="side-panel-empty-icon">📅</span>
              <p>{t('studyTogether.noUpcoming')}</p>
            </div>
          ) : (
            <div className="side-panel-list">
              {scheduledSessions.map(session => (
                <div key={session.id} className={`side-panel-card session-card-mini ${session.status}`}>
                  <div className="side-panel-card-title">{session.subject}</div>
                  <div className="side-panel-card-meta">
                    {session.creatorId === user?.id ? `with ${session.friendName || 'Friend'}` : `with ${session.creatorName || 'Friend'}`}
                  </div>
                  <div className="side-panel-card-meta">{formatDate(session.scheduledFor)}</div>
                  <div className={`status-badge mini ${session.status}`}>
                    {session.status === 'accepted' ? `✅ ${t('common.confirm')}` : `⏳ Pending`}
                  </div>
                  <div className="side-panel-card-actions">
                    {(session.status === 'accepted' || session.status === 'active') && (
                      <button
                        className="action-btn primary mini"
                        onClick={() => handleJoinSession(session)}
                        disabled={loading}
                      >
                        {session.status === 'active' ? t('studyTogether.rejoin') : t('studyTogether.join')}
                      </button>
                    )}
                    {session.creatorId === user?.id && session.status !== 'active' && (
                      <button
                        className="action-btn danger mini"
                        onClick={() => handleCancelSession(session.id)}
                        disabled={loading}
                      >
                        {t('studyTogether.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Schedule Modal (optional fallback for small screens if needed) */}
      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('studyTogether.scheduleNew')}</h2>
              <button className="close-btn" onClick={() => setShowScheduleModal(false)}>×</button>
            </div>
            <div className="modal-content">
              <div className="modal-content-inner">
                <div className="form-group">
                  <label>{t('studyTogether.selectFriend')}</label>
                  <select value={selectedFriend} onChange={(e) => setSelectedFriend(e.target.value)} className="form-select" disabled={friends.length === 0}>
                    <option value="">{friends.length === 0 ? t('studyTogether.noFriends') : t('studyTogether.selectFriend')}</option>
                    {friends.map(friend => (
                      <option key={friend.id} value={friend.id}>{friend.name} ({friend.status === 'online' ? '🟢' : '🔴'})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('studyTogether.subject')}</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('studySession.enterSubject')} className="form-input" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('studyTogether.studyType')}</label>
                    <select value={studyType} onChange={(e) => setStudyType(e.target.value)} className="form-select">
                      <option value="pomodoro">🍅 {t('studySession.pomodoro')} (25 {t('studySession.minutes')})</option>
                      <option value="deep-focus">🧠 {t('studySession.study')} (90 {t('studySession.minutes')})</option>
                      <option value="study-group">👥 {t('tabs.studyTogether')} (2+ {t('home.totalTime')})</option>
                      <option value="custom">⚙️ {t('studySession.custom')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('studyTogether.duration')}</label>
                    <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min="15" max="480" className="form-input" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('studyTogether.date')}</label>
                    <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="form-input" />
                  </div>
                  <div className="form-group">
                    <label>{t('studyTogether.time')}</label>
                    <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="form-input" />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowScheduleModal(false)}>{t('studyTogether.cancel')}</button>
              <button className="btn-schedule" onClick={handleScheduleSession} disabled={!selectedFriend || !subject || !scheduledDate || !scheduledTime || loading}>
                {loading ? t('common.loading') : t('studyTogether.schedule')}
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      )}
    </>
  );
});

export default StudyTogether;

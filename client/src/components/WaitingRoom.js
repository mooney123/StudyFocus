import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './WaitingRoom.css';

const WaitingRoom = ({ session, sessionState, user, onStartSession, onJoinSession, onLeaveSession }) => {
  const { t } = useLanguage();
  const [isReady, setIsReady] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [timeUntilStart, setTimeUntilStart] = useState('');
  const [canStart, setCanStart] = useState(false);

  // Sync isReady from sessionState (authoritative source; updated via real-time socket)
  useEffect(() => {
    if (sessionState?.participants) {
      const currentParticipant = sessionState.participants.find(p => String(p.userId) === String(user?.id));
      if (currentParticipant) {
        setIsReady(Boolean(currentParticipant.isReady));
      }
    }
  }, [sessionState?.participants, user?.id]);

  // Fallback refresh (real-time updates via socket are primary; this is a safety net)
  useEffect(() => {
    const interval = setInterval(() => {
      if (onJoinSession) {
        onJoinSession();
      }
    }, 30000); // Refresh every 30 seconds as fallback

    return () => clearInterval(interval);
  }, [onJoinSession]);

  useEffect(() => {
    // Calculate time until session starts
    const updateTimeUntilStart = () => {
      const now = new Date();
      const startTime = new Date(session.scheduledFor);
      const diff = startTime - now;

      if (diff <= 0) {
        setTimeUntilStart(t('waitingRoom.sessionCanStart'));
        setCanStart(true);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        if (hours > 0) {
          setTimeUntilStart(`${hours}h ${minutes}m ${seconds}s`);
        } else if (minutes > 0) {
          setTimeUntilStart(`${minutes}m ${seconds}s`);
        } else {
          setTimeUntilStart(`${seconds}s`);
        }
        setCanStart(false);
      }
    };

    updateTimeUntilStart();
    const interval = setInterval(updateTimeUntilStart, 1000);

    return () => clearInterval(interval);
  }, [session.scheduledFor]);

  const handleReadyToggle = async () => {
    if (isToggling) return;
    const newReadyState = !isReady;
    setIsToggling(true);
    setIsReady(newReadyState); // Optimistic update for immediate feedback
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/study-together/ready', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id,
          isReady: newReadyState
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update ready status:', error);
        setIsReady(!newReadyState); // Revert on error
      }
      // Success: real-time socket will broadcast to all participants and update sessionState.
      // Our useEffect will sync isReady from sessionState, keeping us in sync with the server.
    } catch (error) {
      console.error('Error updating ready status:', error);
      setIsReady(!newReadyState); // Revert on error
    } finally {
      setIsToggling(false);
    }
  };

  const handleStartSession = async () => {
    // Defense-in-depth: the button below is disabled when participants aren't
    // ready or the clock hasn't hit scheduledFor, but guard here too in case
    // the handler is wired up from somewhere else or state races. The server
    // should also enforce this; this is the cheap client-side short-circuit.
    if (!canStart || !allParticipantsReady) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/study-together/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id
        })
      });

      if (response.ok) {
        if (onStartSession) {
          onStartSession();
        }
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const isCreator = String(session.creatorId) === String(user?.id);
  const allParticipantsReady = sessionState.participants?.every(p => Boolean(p.isReady)) || false;
  const participantCount = sessionState.participants?.length || 0;

  return (
    <div className="waiting-room">
      <div className="waiting-room-container">
        {/* Header */}
        <div className="waiting-header">
          <h1>{t('waitingRoom.title')}</h1>
          <h2>{session.subject}</h2>
          <div className="session-info">
            <span className="study-type">{session.studyType}</span>
            <span className="duration">{session.duration} {t('waitingRoom.minutes')}</span>
          </div>
        </div>

        {/* Time Display */}
        <div className="time-display">
          <div className="time-message">
            {canStart ? (
              <div className="ready-to-start">
                <div className="ready-icon">🚀</div>
                <p>{t('waitingRoom.allReady')}</p>
                <small>{t('waitingRoom.allReady')}</small>
              </div>
            ) : (
              <div className="waiting-message">
                <div className="clock-icon">⏰</div>
                <p>{t('waitingRoom.waitingForStart')}</p>
                <small>{t('waitingRoom.waitingForStart')}</small>
              </div>
            )}
          </div>
          
          {!canStart && (
            <div className="countdown">
              <div className="countdown-time">{timeUntilStart}</div>
              <div className="countdown-label">{t('waitingRoom.waitingForStart')}</div>
            </div>
          )}
        </div>

        {/* Participants List */}
        <div className="participants-section">
          <h3>{t('waitingRoom.participants')} ({participantCount})</h3>
          <div className="participants-list">
            {sessionState.participants?.map((participant) => (
              <div key={String(participant.userId)} className={`participant-card ${participant.isReady ? 'ready' : 'not-ready'}`}>
                <div className="participant-avatar">
                  {participant.name ? participant.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="participant-info">
                  <div className="participant-name">
                    {participant.name}
                    {String(participant.userId) === String(user?.id) && <span className="you-badge">(You)</span>}
                    {String(participant.userId) === String(session.creatorId) && <span className="creator-badge">👑</span>}
                  </div>
                  <div className="participant-status">
                    {participant.isReady ? `✅ ${t('waitingRoom.ready')}` : `⏳ ${t('waitingRoom.notReady')}`}
                  </div>
                </div>
                <div className={`status-indicator ${participant.isReady ? 'ready' : 'waiting'}`}>
                  {participant.isReady ? '✓' : '○'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ready Status */}
        <div className="ready-section">
          <div className="ready-toggle">
            <label className="ready-checkbox">
              <input
                type="checkbox"
                checked={isReady}
                onChange={handleReadyToggle}
                disabled={isToggling}
              />
              {t('waitingRoom.toggleReady')}
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="waiting-actions">
          {/*
            Three states for the creator:
              1. Scheduled time hasn't arrived  → disabled, "waiting for start time"
              2. Time arrived but not all ready → disabled, "waiting for all ready"
              3. Time arrived and all ready     → enabled, Start
            Previously state 2 was treated the same as state 3, letting a creator
            start the session while half the group was still marked "not ready".
          */}
          {isCreator && canStart && allParticipantsReady && (
            <button
              className="start-session-btn"
              onClick={handleStartSession}
            >
              🚀 {t('waitingRoom.startSession')}
            </button>
          )}

          {isCreator && canStart && !allParticipantsReady && (
            <button
              className="start-session-btn disabled"
              disabled
              title={t('waitingRoom.waitingForAllReady') || 'Waiting for all participants to be ready'}
            >
              ⏳ {t('waitingRoom.waitingForAllReady') || 'Waiting for all to be ready'}
            </button>
          )}

          {isCreator && !canStart && (
            <button
              className="start-session-btn disabled"
              disabled
              title={t('waitingRoom.waitingForStart')}
            >
              ⏰ {t('waitingRoom.waitingForStart')}
            </button>
          )}

          <button 
            className="leave-session-btn"
            onClick={onLeaveSession}
          >
            {t('waitingRoom.leaveSession')}
          </button>
        </div>

        {/* Session Settings */}
        <div className="session-settings">
          <h4>{t('settings.title')}</h4>
          <div className="settings-grid">
            <div className="setting-item">
              <span className="setting-label">{t('studyTogether.studyType')}:</span>
              <span className="setting-value">{session.studyType}</span>
            </div>
            <div className="setting-item">
              <span className="setting-label">{t('studyTogether.duration')}:</span>
              <span className="setting-value">{session.duration} {t('waitingRoom.minutes')}</span>
            </div>
            <div className="setting-item">
              <span className="setting-label">Scheduled:</span>
              <span className="setting-value">
                {new Date(session.scheduledFor).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitingRoom;

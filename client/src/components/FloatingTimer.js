import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './FloatingTimer.css';

// Purely presentational — it renders whatever `session.timeLeft` the parent
// (StudySession) pushes in every second. It does NOT run its own interval,
// which previously double-decremented the clock and caused visible drift
// when the parent's interval and this one fell out of lock-step.
const FloatingTimer = ({ session, onExpand, onClose }) => {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 200, y: 80 });
  const dragRef = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const formatTime = (seconds) => {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('.floating-timer-expand') || e.target.closest('.floating-timer-close')) {
      return; // Don't drag if clicking buttons
    }
    setIsDragging(true);
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.offsetX = position.x;
    dragRef.current.offsetY = position.y;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    // Clamp inside viewport so the widget can never be dragged off-screen.
    const maxX = Math.max(0, window.innerWidth - 180);
    const maxY = Math.max(0, window.innerHeight - 80);
    setPosition({
      x: Math.min(maxX, Math.max(0, dragRef.current.offsetX + deltaX)),
      y: Math.min(maxY, Math.max(0, dragRef.current.offsetY + deltaY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  // Render straight from the session prop — StudySession is the single
  // source of truth for `timeLeft`, `isRunning`, and `isPaused`.
  const displayTime = typeof session.timeLeft === 'number' ? session.timeLeft : 0;

  const getStateText = () => {
    if (session.isPaused) return t('studySession.paused');
    if (session.isBreakMode) return t('studySession.break');
    return session.sessionType || t('studySession.study');
  };

  return (
    <div
      className="floating-timer"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className="floating-timer-content">
        <div className="floating-timer-time">{formatTime(displayTime)}</div>
        <div className="floating-timer-state">{getStateText()}</div>
        {session.subject && (
          <div className="floating-timer-subject">{session.subject}</div>
        )}
      </div>
      <div className="floating-timer-actions">
        <button
          className="floating-timer-expand"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onExpand();
          }}
          title={t('studySession.expand')}
        >
          ⛶
        </button>
        <button
          className="floating-timer-close"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          title={t('studySession.close')}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default FloatingTimer;

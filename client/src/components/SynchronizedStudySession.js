import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useDataContext } from '../context/DataContext';
import SessionSettingsModal from './SessionSettingsModal';
import './SynchronizedStudySession.css';

const SynchronizedStudySession = forwardRef(({ session, sessionState, user, onEndSession, onLeaveSession, minimizedSession, setMinimizedSession }, ref) => {
  const { loadTabData, updateTabData, autoSave } = useDataContext();
  const [localData, setLocalData] = useState({});
  const [timeLeft, setTimeLeft] = useState(session.duration * 60); // Convert minutes to seconds
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(sessionState.isPaused || false);
  const [participants, setParticipants] = useState(sessionState.participants || []);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [lastReadMessageId, setLastReadMessageId] = useState(null);
  const [showBlackboard, setShowBlackboard] = useState(false);
  const [blackboardTool, setBlackboardTool] = useState('pen'); // 'pen', 'eraser'
  const [blackboardColor, setBlackboardColor] = useState('#ffffff');
  const [isDrawing, setIsDrawing] = useState(false);
  const intervalRef = useRef(null);
  const chatMessagesEndRef = useRef(null);
  const chatPollIntervalRef = useRef(null);
  const blackboardCanvasRef = useRef(null);
  const blackboardCtxRef = useRef(null);
  const blackboardSyncIntervalRef = useRef(null);
  const lastBlackboardStateRef = useRef(null);
  const suppressSyncUntilRef = useRef(0); // Skip sync after local actions (undo/redo/clear/draw) until saved
  const lastAppliedRemoteUpdatedAtRef = useRef(0);
  const lastLocalMutationAtRef = useRef(0);
  const lastSuccessfulSaveAtRef = useRef(0);
  const pendingSaveRef = useRef(false);
  const drawSaveTimeoutRef = useRef(null);
  const containerRef = useRef(null);
  // Mirror minimizedSession in a ref so the timer interval can read the
  // latest value without listing it as a dependency (which would tear down
  // and recreate the interval every second and drift the timer).
  const minimizedSessionRef = useRef(minimizedSession);
  useEffect(() => { minimizedSessionRef.current = minimizedSession; }, [minimizedSession]);

  // Load settings for theme support
  useEffect(() => {
    loadTabData('study-session').then(data => {
      setLocalData(data);
    });
  }, [loadTabData]);

  // Initialize timer from sessionState only once when component mounts or session becomes active
  const timerInitializedRef = useRef(false);
  useEffect(() => {
    if (sessionState && sessionState.timeLeft !== undefined && sessionState.status === 'active') {
      // Only initialize timer once, or when status changes from inactive to active
      if (!timerInitializedRef.current || !isActive) {
        setTimeLeft(sessionState.timeLeft);
        setIsActive(true);
        timerInitializedRef.current = true;
      }
    }
    // Reset initialization flag if session becomes inactive
    if (sessionState?.status !== 'active') {
      timerInitializedRef.current = false;
    }
  }, [sessionState?.status]);

  // Load chat messages
  const loadChatMessages = async () => {
    if (!session?.id) {
      console.warn('Cannot load chat messages: no session ID');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('Cannot load chat messages: no token');
        return;
      }
      
      const response = await fetch(`http://localhost:3001/api/study-together/chat/${session.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        // Handle both { messages: [...] } format and direct array format
        const newMessages = Array.isArray(result) ? result : (result.messages || []);
        const prevMessageCount = chatMessages.length;
        
        // Only update if messages actually changed to avoid unnecessary re-renders
        const messagesChanged = JSON.stringify(newMessages) !== JSON.stringify(chatMessages);
        if (messagesChanged) {
          setChatMessages(newMessages);
          
          // Update unread count - reset to 0 if chat is open (all messages are read)
          if (showChat) {
            // Chat is open - no unread messages, hide badge
            setUnreadCount(0);
            // Update last read message ID
            if (newMessages.length > 0) {
              const lastMessage = newMessages[newMessages.length - 1];
              setLastReadMessageId(lastMessage.id);
            }
          } else {
            // Chat is closed - calculate unread count
            if (newMessages.length > 0) {
              if (lastReadMessageId) {
                const lastReadIndex = newMessages.findIndex(m => m.id === lastReadMessageId);
                const unread = lastReadIndex >= 0 ? newMessages.length - lastReadIndex - 1 : newMessages.length;
                // Only set if there are unread messages, otherwise set to 0 (badge will hide)
                setUnreadCount(unread > 0 ? unread : 0);
              } else if (newMessages.length > prevMessageCount) {
                // New messages arrived while chat was closed
                const newCount = newMessages.length - prevMessageCount;
                setUnreadCount(newCount > 0 ? newCount : 0);
              } else {
                // No new messages - reset to 0 (badge will hide)
                setUnreadCount(0);
              }
            } else {
              // No messages at all - reset to 0 (badge will hide)
              setUnreadCount(0);
            }
          }
          
          // Auto-scroll to bottom if chat is open and new messages arrived
          if (showChat && chatMessagesEndRef.current && newMessages.length > prevMessageCount) {
            setTimeout(() => {
              chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to load chat messages:', errorData.error || `Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading chat messages:', error);
    }
  };

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const token = localStorage.getItem('token');
    const messageText = chatInput.trim();
    const originalInput = chatInput; // Keep original for error restoration
    
    // Clear input immediately for better UX
    setChatInput('');
    
    try {
      const response = await fetch('http://localhost:3001/api/study-together/chat/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id,
          message: messageText
        })
      });

      if (response.ok) {
        // Reload messages to get the latest (including the one just sent)
        await loadChatMessages();
      } else {
        // Restore input on error
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to send message:', errorData.error || 'Unknown error');
        setChatInput(originalInput);
        alert(`Failed to send message: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setChatInput(originalInput);
      alert(`Error sending message: ${error.message || 'Network error'}`);
    }
  };

  // Handle chat toggle
  const toggleChat = async () => {
    const newShowChat = !showChat;
    
    if (newShowChat) {
      // Opening chat - immediately reset unread count and hide badge BEFORE loading messages
      setUnreadCount(0);
      setShowChat(true);
      
      // Load messages when opening
      await loadChatMessages();
      
      // Mark all messages as read when opening
      setChatMessages(currentMessages => {
        if (currentMessages.length > 0) {
          const lastMessage = currentMessages[currentMessages.length - 1];
          setLastReadMessageId(lastMessage.id);
        }
        return currentMessages;
      });
    } else {
      // Closing chat
      setShowChat(false);
      // Don't modify unreadCount - it will update on next message load when chat is closed
    }
  };

  // Poll for new chat messages (poll whenever session exists, not just when timer is active)
  useEffect(() => {
    if (session?.id && sessionState && (sessionState.status === 'active' || sessionState.status === 'waiting')) {
      // Initial load
      loadChatMessages();
      
      // Poll every 2 seconds for new messages
      chatPollIntervalRef.current = setInterval(() => {
        loadChatMessages();
      }, 2000);

      return () => {
        if (chatPollIntervalRef.current) {
          clearInterval(chatPollIntervalRef.current);
        }
      };
    }
  }, [session?.id, sessionState?.status]);

  // Initialize blackboard canvas whenever blackboard is shown (reinitialize on every open)
  useEffect(() => {
    if (showBlackboard && blackboardCanvasRef.current) {
      const canvas = blackboardCanvasRef.current;
      
      // Always reinitialize context when blackboard is shown
      // This ensures drawing works after re-entry
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match container
      const container = canvas.parentElement;
      if (container) {
        // Save current state before resizing (if canvas was already initialized)
        let savedState = null;
        if (blackboardCtxRef.current && canvas.width > 0 && canvas.height > 0) {
          savedState = canvas.toDataURL();
        }
        
        const newWidth = container.offsetWidth;
        const newHeight = container.offsetHeight;
        const oldWidth = canvas.width;
        const oldHeight = canvas.height;
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Restore saved state if it existed (preserve drawing during resize)
        if (savedState && oldWidth > 0 && oldHeight > 0) {
          const img = new Image();
          img.onload = () => {
            if (ctx) {
              ctx.clearRect(0, 0, newWidth, newHeight);
              ctx.drawImage(img, 0, 0, oldWidth, oldHeight, 0, 0, newWidth, newHeight);
            }
          };
          img.src = savedState;
        }
      }
      
      // Set drawing styles
      ctx.strokeStyle = blackboardColor;
      ctx.fillStyle = blackboardColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      blackboardCtxRef.current = ctx;
      
      // Load saved state after initialization
      if (session?.id) {
        setTimeout(() => {
          loadBlackboardState({ forceApply: true });
        }, 100);
      }
    }
    
    // Handle window resize - preserve canvas content
    const handleResize = () => {
      if (showBlackboard && blackboardCanvasRef.current && blackboardCtxRef.current) {
        const canvas = blackboardCanvasRef.current;
        const container = canvas.parentElement;
        if (container && (canvas.width !== container.offsetWidth || canvas.height !== container.offsetHeight)) {
          // Save current state before resize
          const currentState = canvas.toDataURL();
          const oldWidth = canvas.width;
          const oldHeight = canvas.height;
          canvas.width = container.offsetWidth;
          canvas.height = container.offsetHeight;
          // Restore state after resize
          const img = new Image();
          img.onload = () => {
            if (blackboardCtxRef.current) {
              blackboardCtxRef.current.clearRect(0, 0, canvas.width, canvas.height);
              blackboardCtxRef.current.drawImage(img, 0, 0, oldWidth, oldHeight, 0, 0, canvas.width, canvas.height);
            }
          };
          img.src = currentState;
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [showBlackboard, session?.id, blackboardColor]);

  const markLocalMutation = () => {
    lastLocalMutationAtRef.current = Date.now();
  };

  const applyStateToCanvas = ({ state, updatedAt, force = false }) => {
    if (!state) {
      return;
    }

    ensureCanvasInitialized();

    if (!blackboardCtxRef.current || !blackboardCanvasRef.current) {
      return;
    }

    const remoteUpdatedAt = updatedAt ? Date.parse(updatedAt) : 0;
    if (!force && remoteUpdatedAt && remoteUpdatedAt <= lastAppliedRemoteUpdatedAtRef.current) {
      return;
    }

    if (!force && pendingSaveRef.current && remoteUpdatedAt && remoteUpdatedAt < lastLocalMutationAtRef.current) {
      return;
    }

    if (!force && state === lastBlackboardStateRef.current) {
      if (remoteUpdatedAt) {
        lastAppliedRemoteUpdatedAtRef.current = Math.max(lastAppliedRemoteUpdatedAtRef.current, remoteUpdatedAt);
      }
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (blackboardCtxRef.current && blackboardCanvasRef.current) {
        blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
        blackboardCtxRef.current.drawImage(img, 0, 0);
        lastBlackboardStateRef.current = state;
        if (remoteUpdatedAt) {
          lastAppliedRemoteUpdatedAtRef.current = Math.max(lastAppliedRemoteUpdatedAtRef.current, remoteUpdatedAt);
        }
      }
    };
    img.onerror = () => {
      console.error('Error loading blackboard image');
    };
    img.src = state;
  };

  // Load blackboard state from server
  const loadBlackboardState = async ({ forceApply = false } = {}) => {
    if (!session?.id || !blackboardCanvasRef.current) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/study-together/blackboard/${session.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.state && (forceApply || Date.now() >= suppressSyncUntilRef.current)) {
          applyStateToCanvas({
            state: result.state,
            updatedAt: result.updatedAt,
            force: forceApply
          });
        } else {
          ensureCanvasInitialized();
        }
      } else {
        // Failed to load - ensure canvas is initialized anyway
        ensureCanvasInitialized();
      }
    } catch (error) {
      console.error('Error loading blackboard state:', error);
      // On error, still ensure canvas is initialized
      ensureCanvasInitialized();
    }
  };

  // Save blackboard state to server
  const saveBlackboardState = async ({ force = false, reason = 'draw' } = {}) => {
    if (!blackboardCanvasRef.current || !session?.id) return false;
    
    try {
      const state = blackboardCanvasRef.current.toDataURL();
      if (!force && state === lastBlackboardStateRef.current) return true; // No changes
      
      const token = localStorage.getItem('token');
      pendingSaveRef.current = true;
      const response = await fetch(`http://localhost:3001/api/study-together/blackboard/${session.id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state, reason })
      });

      if (response.ok) {
        const result = await response.json();
        lastBlackboardStateRef.current = result.state || state;
        lastSuccessfulSaveAtRef.current = Date.now();
        if (result.updatedAt) {
          const remoteUpdatedAt = Date.parse(result.updatedAt);
          if (remoteUpdatedAt) {
            lastAppliedRemoteUpdatedAtRef.current = Math.max(lastAppliedRemoteUpdatedAtRef.current, remoteUpdatedAt);
          }
        }
        pendingSaveRef.current = false;
        return true;
      }
      pendingSaveRef.current = false;
      return false;
    } catch (error) {
      pendingSaveRef.current = false;
      console.error('Error saving blackboard state:', error);
      return false;
    }
  };

  const performBlackboardAction = async (action) => {
    if (!session?.id) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/study-together/blackboard/${session.id}/action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        return;
      }

      const result = await response.json();
      applyStateToCanvas({
        state: result.state,
        updatedAt: result.updatedAt,
        force: true
      });
    } catch (error) {
      console.error(`Error performing blackboard action (${action}):`, error);
    }
  };

  // Initialize canvas context if needed (helper function)
  const ensureCanvasInitialized = () => {
    if (!blackboardCanvasRef.current) return false;
    
    if (!blackboardCtxRef.current) {
      const canvas = blackboardCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to match container
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.offsetWidth;
        canvas.height = container.offsetHeight;
      }
      
      // Set drawing styles
      ctx.strokeStyle = blackboardColor;
      ctx.fillStyle = blackboardColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      blackboardCtxRef.current = ctx;
    }
    
    return true;
  };

  // Update drawing context when color changes
  useEffect(() => {
    if (blackboardCtxRef.current) {
      blackboardCtxRef.current.strokeStyle = blackboardColor;
      blackboardCtxRef.current.fillStyle = blackboardColor;
    }
  }, [blackboardColor]);

  // Save blackboard state when hiding (but don't clear context - preserve it for next open)
  useEffect(() => {
    if (!showBlackboard && blackboardCanvasRef.current && blackboardCtxRef.current) {
      // Save state before hiding
      saveBlackboardState();
      // Note: We don't clear blackboardCtxRef.current here - we keep it so drawing works immediately on re-entry
    }
  }, [showBlackboard]);

  useEffect(() => () => {
    if (drawSaveTimeoutRef.current) {
      clearTimeout(drawSaveTimeoutRef.current);
    }
  }, []);

  // Sync blackboard state (poll for updates) - only when blackboard is visible
  useEffect(() => {
    if (showBlackboard && session?.id) {
      // Ensure canvas is initialized first
      ensureCanvasInitialized();
      
      // Load state when showing blackboard (with a small delay to ensure canvas is ready)
      setTimeout(() => {
        loadBlackboardState({ forceApply: true });
      }, 50);
      
      // Poll every 1 second for blackboard updates from other participants (only if session is active)
      // Skip sync when we just did a local action (undo/redo/clear/draw) so it can be saved first
      if (isActive) {
        blackboardSyncIntervalRef.current = setInterval(() => {
          if (Date.now() < suppressSyncUntilRef.current) return;
          if (blackboardCanvasRef.current && blackboardCtxRef.current) {
            loadBlackboardState();
          }
        }, 1000);
      }

      return () => {
        if (blackboardSyncIntervalRef.current) {
          clearInterval(blackboardSyncIntervalRef.current);
        }
      };
    }
  }, [showBlackboard, session?.id, isActive]);

  // Blackboard drawing functions
  const getCoordinates = (e) => {
    const canvas = blackboardCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    // Ensure canvas is initialized before drawing
    if (!ensureCanvasInitialized()) return;

    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    
    if (blackboardCtxRef.current) {
      blackboardCtxRef.current.beginPath();
      blackboardCtxRef.current.moveTo(x, y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    // Ensure canvas is initialized before drawing
    if (!ensureCanvasInitialized() || !blackboardCtxRef.current) return;
    
    const { x, y } = getCoordinates(e);
    
    if (blackboardTool === 'pen') {
      blackboardCtxRef.current.strokeStyle = blackboardColor;
      blackboardCtxRef.current.lineWidth = 3;
      blackboardCtxRef.current.lineTo(x, y);
      blackboardCtxRef.current.stroke();
    } else if (blackboardTool === 'eraser') {
      blackboardCtxRef.current.strokeStyle = '#1a1a1a';
      blackboardCtxRef.current.lineWidth = 20;
      blackboardCtxRef.current.lineTo(x, y);
      blackboardCtxRef.current.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && blackboardCtxRef.current) {
      blackboardCtxRef.current.beginPath();
      setIsDrawing(false);
      markLocalMutation();
      // Suppress sync so our stroke is not overwritten before save completes
      suppressSyncUntilRef.current = Date.now() + 2500;
      // Save state after drawing (debounced to avoid too many saves)
      if (drawSaveTimeoutRef.current) {
        clearTimeout(drawSaveTimeoutRef.current);
      }
      drawSaveTimeoutRef.current = setTimeout(() => {
        saveBlackboardState({ reason: 'draw' });
      }, 500);
    }
  };

  const clearBlackboard = () => {
    if (window.confirm('Are you sure you want to clear the blackboard? This will clear it for everyone.')) {
      // Ensure canvas is initialized
      if (ensureCanvasInitialized() && blackboardCanvasRef.current && blackboardCtxRef.current) {
        markLocalMutation();
        // Suppress sync so our clear is not overwritten before save completes
        suppressSyncUntilRef.current = Date.now() + 3000;

        blackboardCtxRef.current.clearRect(0, 0, blackboardCanvasRef.current.width, blackboardCanvasRef.current.height);
        saveBlackboardState({ force: true, reason: 'clear' });
      }
    }
  };

  const undoDrawing = async () => {
    markLocalMutation();
    // Suppress sync so our undo is not overwritten before save completes
    suppressSyncUntilRef.current = Date.now() + 3000;
    await performBlackboardAction('undo');
  };

  const redoDrawing = async () => {
    markLocalMutation();
    // Suppress sync so our redo is not overwritten before save completes
    suppressSyncUntilRef.current = Date.now() + 3000;
    await performBlackboardAction('redo');
  };

  // Start the session when it becomes active
  useEffect(() => {
    if (sessionState && sessionState.status === 'active') {
      setIsActive(true);
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sessionState?.status]);

  // Sync session state from server (pause, participants, status) - but NOT timer to avoid resets
  useEffect(() => {
    if (sessionState) {
      // Sync pause state
      if (sessionState.isPaused !== undefined) {
        setIsPaused(sessionState.isPaused);
      }
      
      // Sync participants
      if (sessionState.participants) {
        setParticipants(sessionState.participants);
      }
      
      // Sync timer from server ONLY if the difference is very large (60+ seconds)
      // This prevents frequent resets while still keeping timers roughly in sync
      // Only sync if timer was already initialized to avoid resetting on rejoin
      if (sessionState.timeLeft !== undefined && sessionState.status === 'active' && timerInitializedRef.current) {
        const timeDiff = Math.abs(timeLeft - sessionState.timeLeft);
        // Only sync if difference is very large (60+ seconds) to prevent constant resets
        // Small differences (< 60s) are normal due to local timer counting down vs server polling
        if (timeDiff > 60) {
          console.log(`Timer sync: Local ${timeLeft}s, Server ${sessionState.timeLeft}s, diff ${timeDiff}s - syncing`);
          setTimeLeft(sessionState.timeLeft);
        }
      }
      
      // Handle session completion
      if (sessionState.status === 'completed') {
        setIsActive(false);
        clearInterval(intervalRef.current);
        timerInitializedRef.current = false;
        // The parent component will handle the UI transition
      }
    }
  }, [sessionState]);

  // Update server state periodically for timer sync
  const updateServerState = async (currentTimeLeft) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:3001/api/study-together/update-state', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id,
          timeLeft: currentTimeLeft
        })
      });
    } catch (error) {
      console.error('Error updating server state:', error);
    }
  };

  // Timer continues running even when minimized.
  // minimizedSession is intentionally read via minimizedSessionRef (not listed
  // as a dep) to prevent the interval from being torn down and recreated every
  // second — which would cause timer drift and flicker.
  useEffect(() => {
    if (isActive && !isPaused && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(time => {
          const newTime = time > 0 ? time - 1 : 0;

          // Update minimized session state if minimized (read via ref — always current)
          const ms = minimizedSessionRef.current;
          if (ms && ms.type === 'together' && ms.sessionId === session.id) {
            setMinimizedSession(prev => ({
              ...prev,
              timeLeft: newTime,
              isRunning: true,
              isPaused: false,
              state: 'study'
            }));
          }

          // Update server state every 10 seconds for timer sync
          if (newTime % 10 === 0 && newTime > 0) {
            updateServerState(newTime);
          }

          return newTime;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isActive, isPaused, session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timeLeft === 0) {
      handleSessionComplete();
    }
  }, [timeLeft]);

  const handleSessionComplete = () => {
    setIsActive(false);
    clearInterval(intervalRef.current);
    
    // Show completion message
    if (window.confirm('Study session completed! Would you like to end the session?')) {
      if (onEndSession) {
        onEndSession();
      }
    }
  };

  const handlePause = async () => {
    try {
      const newPauseState = !isPaused;
      const token = localStorage.getItem('token');
      
      const response = await fetch('http://localhost:3001/api/study-together/pause', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: session.id,
          isPaused: newPauseState
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Pause/Resume result:', result);
        // The session state will be updated via the refresh mechanism
      } else {
        console.error('Failed to pause/resume session');
      }
    } catch (error) {
      console.error('Error pausing/resuming session:', error);
    }
  };

  const handleStop = async () => {
    if (window.confirm('Are you sure you want to stop the session for everyone?')) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3001/api/study-together/stop', {
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
          const result = await response.json();
          console.log('Session stopped:', result);
          setIsActive(false);
          clearInterval(intervalRef.current);
          if (onEndSession) {
            onEndSession();
          }
        } else {
          console.error('Failed to stop session');
        }
      } catch (error) {
        console.error('Error stopping session:', error);
      }
    }
  };

  const handleLeave = async () => {
    if (window.confirm('Are you sure you want to leave the session? Others can continue studying.')) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3001/api/study-together/leave', {
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
          const result = await response.json();
          console.log('Left session:', result);
          if (onLeaveSession) {
            onLeaveSession();
          }
        } else {
          console.error('Failed to leave session');
        }
      } catch (error) {
        console.error('Error leaving session:', error);
      }
    }
  };

  // Expose handleStop via ref so App can call it from minimized timer X button
  useImperativeHandle(ref, () => ({
    stopSession: handleStop
  }));

  // Handle settings changes
  const handleSettingsChange = (newSettings) => {
    const updatedData = {
      ...localData,
      settings: {
        ...localData.settings,
        ...newSettings
      }
    };
    setLocalData(updatedData);
    updateTabData('study-session', updatedData);
    autoSave('study-session', updatedData);
    // Note: Settings are applied locally to this user's view
    // Timer durations and theme preferences are visual settings
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isCreator = session.creatorId === user?.id;
  const settings = localData.settings || {};
  const gradientTheme = settings.gradientTheme || 'original';
  const otherParticipants = participants.filter(p => p.userId !== user?.id);

  const scrollToBlackboard = () => {
    setShowBlackboard(true);
    // Save current state before switching (if needed)
    if (blackboardCanvasRef.current) {
      saveBlackboardState();
    }
  };

  const scrollToSession = () => {
    // Save blackboard state before hiding
    if (blackboardCanvasRef.current) {
      saveBlackboardState();
    }
    setShowBlackboard(false);
  };

  // Update minimized session state if session is minimized (timer continues running)
  useEffect(() => {
    if (minimizedSession && minimizedSession.type === 'together' && minimizedSession.sessionId === session.id) {
      setMinimizedSession(prev => ({
        ...prev,
        timeLeft: timeLeft,
        isRunning: isActive && !isPaused,
        isPaused: false, // Timer continues, so not paused
        state: 'study'
      }));
    }
  }, [timeLeft, isActive, isPaused, session.id]);

  // No longer needed - using simple show/hide instead of scrolling
  // Removed scroll-related useEffect
  /*
  useEffect(() => {
    const updateContainerSize = () => {
      const container = containerRef.current;
      if (!container) {
        console.log('Container ref not set in useEffect');
        return;
      }

      // Preserve current scroll position - but don't reset if we're in the middle of scrolling
      const currentScroll = container.scrollLeft;
      const isScrolling = currentScroll > 0 && currentScroll < viewportWidth * 1.5;

      const viewportWidth = window.innerWidth;
      
      // Force container to be scrollable
      // Container should be viewport width (visible area), content is 2x viewport
      // NOTE: Do NOT set display: flex on the wrapper - it's not flex, the inner container is
      container.style.overflowX = 'auto';
      container.style.overflowY = 'hidden';
      container.style.width = `${viewportWidth}px`; // Container is viewport width
      container.style.maxWidth = `${viewportWidth}px`; // Prevent expansion
      container.style.minWidth = `${viewportWidth}px`; // Prevent shrinking
      // Do NOT set display: flex here - wrapper is not flex
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.height = '100vh';
      container.style.boxSizing = 'border-box';
      
      // Restore scroll position after style changes (only if we weren't scrolling)
      if (!isScrolling) {
        requestAnimationFrame(() => {
          container.scrollLeft = currentScroll;
        });
      }
      
      // Find the inner container (holds the scrollable content)
      const innerContainer = container.querySelector('.session-container-inner');
      if (!innerContainer) {
        console.error('Inner container not found');
        return;
      }
      
      // Set inner container to 200vw (2x viewport)
      innerContainer.style.width = `${viewportWidth * 2}px`;
      innerContainer.style.minWidth = `${viewportWidth * 2}px`;
      
      // Ensure children are properly sized - they need to be viewport width each
      // This creates the scrollable content (2x viewport width total)
      Array.from(innerContainer.children).forEach((child) => {
        child.style.width = `${viewportWidth}px`;
        child.style.minWidth = `${viewportWidth}px`;
        child.style.maxWidth = `${viewportWidth}px`;
        child.style.flexShrink = '0';
        child.style.flexGrow = '0';
        child.style.flexBasis = `${viewportWidth}px`;
        child.style.boxSizing = 'border-box';
      });
      
      // Force a reflow to ensure browser calculates scrollWidth correctly
      void container.offsetHeight;
      
      // Verify scrollability
      setTimeout(() => {
        if (container.scrollWidth <= container.clientWidth) {
          console.warn('Container is not scrollable!', {
            scrollWidth: container.scrollWidth,
            clientWidth: container.clientWidth,
            innerContainerWidth: innerContainer.offsetWidth,
            childrenCount: innerContainer.children.length,
            totalChildrenWidth: Array.from(innerContainer.children).reduce((sum, c) => sum + c.offsetWidth, 0)
          });
        } else {
          console.log('Container is scrollable!', {
            scrollWidth: container.scrollWidth,
            clientWidth: container.clientWidth,
            innerContainerWidth: innerContainer.offsetWidth
          });
        }
      }, 100);
      
      // Log container state for debugging
      setTimeout(() => {
        const totalChildrenWidth = Array.from(innerContainer.children).reduce((sum, child) => sum + child.offsetWidth, 0);
        console.log('Container initialized:', {
          scrollWidth: container.scrollWidth,
          clientWidth: container.clientWidth,
          offsetWidth: container.offsetWidth,
          scrollLeft: container.scrollLeft,
          overflowX: window.getComputedStyle(container).overflowX,
          innerContainerWidth: innerContainer.offsetWidth,
          children: innerContainer.children.length,
          totalChildrenWidth: totalChildrenWidth,
          expectedScrollWidth: viewportWidth * 2,
          childrenWidths: Array.from(innerContainer.children).map(c => ({
            width: c.offsetWidth,
            className: c.className,
            computedWidth: window.getComputedStyle(c).width
          }))
        });
      }, 200);
    };

    // Initial setup
    updateContainerSize();

    // Handle window resize
    window.addEventListener('resize', updateContainerSize);

    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const viewportWidth = window.innerWidth;
      const isOnBlackboard = scrollLeft >= viewportWidth * 0.5;
      setShowBlackboard(isOnBlackboard);
    };

    container.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('resize', updateContainerSize);
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);
  */

  return (
    <>
      {!minimizedSession && (
        <>
          {!showBlackboard ? (
            /* Main Study Session Screen */
            <div className={`synchronized-study-session active-session fullscreen theme-${gradientTheme}`}>
              {/* Minimize Button */}
              <button 
                className="session-minimize-btn"
                onClick={() => {
                  setMinimizedSession({
                    type: 'together',
                    sessionId: session.id,
                    subject: session.subject,
                    timeLeft: timeLeft,
                    isRunning: isActive && !isPaused,
                    isPaused: false, // Timer continues, so not paused
                    isBreakMode: false,
                    sessionType: session.studyType,
                    state: 'study',
                    minimizedAt: Date.now()
                  });
                }}
                title="Minimize Session"
              >
                ←
              </button>
              
              {/* Subject Display */}
              <div className="session-subject-display">
                <h2 className="session-subject-title">{session.subject || 'Study Together'}</h2>
        {otherParticipants.length > 0 && (
          <div className="participants-indicator" onClick={() => setShowParticipants(!showParticipants)}>
            <span className="participants-count">🤝 {otherParticipants.length} {otherParticipants.length === 1 ? 'friend' : 'friends'} studying</span>
          </div>
        )}
      </div>
      
      {/* Timer Display */}
      <div className="timer-display">
        <span className="time-text">{formatTime(timeLeft)}</span>
        {isPaused && (
          <div className="break-indicator">
            <span className="break-text">Paused</span>
          </div>
        )}
      </div>

      {/* Mode Selector - Show study type */}
      <div className="mode-selector">
        <button 
          className={`mode-btn active`}
          disabled={true}
        >
          {session.studyType}
        </button>
      </div>

      {/* Timer Controls */}
      <div className="timer-controls">
            <button 
          className="control-btn play"
              onClick={handlePause}
              disabled={!isActive}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>
            {isCreator && (
              <button 
            className="control-btn stop" 
                onClick={handleStop}
                title="Stop Session for Everyone"
              >
                ⏹️
              </button>
            )}
            <button 
          className="control-btn leave" 
              onClick={handleLeave}
              title={isCreator ? "Leave Session (Others Continue)" : "Leave Session"}
            >
              🚪
            </button>
        <button 
          className="control-btn settings" 
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          ⚙️
        </button>
          </div>
          
      {/* Participants Panel - Expandable */}
      {showParticipants && (
        <div className="participants-panel">
          <div className="participants-panel-header">
            <h3>Study Partners</h3>
            <button 
              className="close-participants-btn"
              onClick={() => setShowParticipants(false)}
            >
              ✕
            </button>
          </div>
          <div className="participants-list">
            {participants.map((participant) => (
              <div key={participant.userId} className="participant-item">
                <div className="participant-avatar-small">
                  {participant.name ? participant.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="participant-info">
                  <div className="participant-name-small">
                    {participant.name}
                    {participant.userId === user?.id && <span className="you-badge-small">(You)</span>}
                    {participant.userId === session.creatorId && <span className="creator-badge-small">👑</span>}
                  </div>
                  <div className="participant-status-small">
                      {isActive && !isPaused ? '🟢 Studying' : '🔴 Inactive'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SessionSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={localData.settings || { studyTime: 25, shortBreak: 5, longBreak: 15, gradientTheme: 'original' }}
        onSettingsChange={handleSettingsChange}
      />

      {/* Chat Button - Floating */}
      <button 
        className="chat-toggle-btn"
        onClick={toggleChat}
        title={showChat ? 'Close Chat' : 'Open Chat'}
      >
        💬
        {!showChat && unreadCount > 0 && (
          <span className="chat-unread-badge">{unreadCount}</span>
        )}
      </button>

      {/* Chat Panel - Floating */}
      {showChat && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <h3>Session Chat</h3>
            <button 
              className="chat-close-btn"
              onClick={toggleChat}
              title="Close Chat"
            >
              ✕
            </button>
            </div>
          
          <div className="chat-messages-container">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">
                <p>No messages yet. Start the conversation!</p>
            </div>
            ) : (
              chatMessages.map((msg) => {
                // Handle both userId (server format) and senderId (legacy format)
                const messageUserId = msg.userId || msg.senderId;
                const isOwnMessage = String(messageUserId) === String(user?.id);
                const sender = participants.find(p => String(p.userId) === String(messageUserId));
                // Server sends userName, but also check senderName for legacy support
                const senderName = msg.userName || sender?.name || msg.senderName || 'Unknown';
                
                return (
                  <div 
                    key={msg.id} 
                    className={`chat-message ${isOwnMessage ? 'own' : 'other'}`}
                  >
                    <div className="chat-message-header">
                      <span className="chat-sender-name">
                        {isOwnMessage ? 'You' : senderName}
                      </span>
                      <span className="chat-timestamp">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : ''}
                      </span>
                    </div>
                    <div className="chat-message-text">{msg.message || msg.text || ''}</div>
                  </div>
                );
              })
            )}
            <div ref={chatMessagesEndRef} />
          </div>
          
          <div className="chat-input-container">
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
            />
            <button 
              className="chat-send-btn"
              onClick={sendChatMessage}
              disabled={!chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Blackboard Button - Right Edge (on session screen) */}
      <button 
        className="blackboard-open-btn"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          scrollToBlackboard();
        }}
        title="Open Blackboard"
      >
        <div className="blackboard-btn-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Marker body */}
            <rect x="8" y="2" width="8" height="16" rx="1" fill="currentColor" opacity="0.9"/>
            {/* Marker tip */}
            <path d="M8 18L12 22L16 18L16 16L8 16L8 18Z" fill="currentColor" opacity="0.9"/>
            {/* Marker cap */}
            <rect x="9" y="1" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.7"/>
            {/* Highlight on marker body */}
            <rect x="9" y="3" width="2" height="13" rx="0.5" fill="white" opacity="0.3"/>
          </svg>
        </div>
        <span className="blackboard-btn-text">Board</span>
      </button>
      </div>
      ) : (
        /* Blackboard Screen - Full Screen */
        <div className="blackboard-screen fullscreen">
        {/* Blackboard Handle - Left Edge (on blackboard screen) */}
        <button 
          className="blackboard-handle left-edge"
          onClick={scrollToSession}
          title="Back to Session"
        >
          ▶
        </button>

        <div className="blackboard-panel">
          <div className="blackboard-header">
            <div className="blackboard-header-left">
              <button 
                className="blackboard-back-btn"
                onClick={scrollToSession}
                title="Back to Session"
              >
                ← Back to Session
              </button>
            </div>
            <h3>Collaborative Blackboard</h3>
            <div className="blackboard-header-right">
              {/* Mini Timer */}
              <div className="blackboard-mini-timer">
                <span className="mini-timer-time">{formatTime(timeLeft)}</span>
                <span className="mini-timer-state">
                  {isPaused ? '⏸ Paused' : session.studyType || 'Study'}
                </span>
              </div>
              <button 
                className="blackboard-close-btn"
                onClick={() => setShowBlackboard(false)}
                title="Close Blackboard"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div className="blackboard-toolbar">
            <button 
              className={`toolbar-btn ${blackboardTool === 'pen' ? 'active' : ''}`}
              onClick={() => setBlackboardTool('pen')}
              title="Pen"
            >
              ✏️
            </button>
            <button 
              className={`toolbar-btn ${blackboardTool === 'eraser' ? 'active' : ''}`}
              onClick={() => setBlackboardTool('eraser')}
              title="Eraser"
            >
              🧹
            </button>
            
            <div className="color-picker">
              <button 
                className={`color-btn ${blackboardColor === '#ffffff' ? 'active' : ''}`}
                onClick={() => setBlackboardColor('#ffffff')}
                style={{ backgroundColor: '#ffffff' }}
                title="White"
              />
              <button 
                className={`color-btn ${blackboardColor === '#3b82f6' ? 'active' : ''}`}
                onClick={() => setBlackboardColor('#3b82f6')}
                style={{ backgroundColor: '#3b82f6' }}
                title="Blue"
              />
              <button 
                className={`color-btn ${blackboardColor === '#22c55e' ? 'active' : ''}`}
                onClick={() => setBlackboardColor('#22c55e')}
                style={{ backgroundColor: '#22c55e' }}
                title="Green"
              />
              <button 
                className={`color-btn ${blackboardColor === '#f59e0b' ? 'active' : ''}`}
                onClick={() => setBlackboardColor('#f59e0b')}
                style={{ backgroundColor: '#f59e0b' }}
                title="Orange"
              />
              <button 
                className={`color-btn ${blackboardColor === '#ef4444' ? 'active' : ''}`}
                onClick={() => setBlackboardColor('#ef4444')}
                style={{ backgroundColor: '#ef4444' }}
                title="Red"
              />
        </div>

            <button 
              className="toolbar-btn"
              onClick={undoDrawing}
              title="Undo"
            >
              ↶
            </button>
            <button 
              className="toolbar-btn"
              onClick={redoDrawing}
              title="Redo"
            >
              ↷
            </button>
            <button 
              className="toolbar-btn clear-btn"
              onClick={clearBlackboard}
              title="Clear Board"
            >
              🗑️
            </button>
        </div>

          <div className="blackboard-canvas-container">
            <canvas
              ref={blackboardCanvasRef}
              className="blackboard-canvas"
              data-tool={blackboardTool}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={(e) => {
                e.preventDefault();
                startDrawing(e.touches[0]);
              }}
              onTouchMove={(e) => {
                e.preventDefault();
                draw(e.touches[0]);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopDrawing();
              }}
            />
          </div>
          </div>
        </div>
      )}
        </>
      )}
    </>
  );
});

export default SynchronizedStudySession;

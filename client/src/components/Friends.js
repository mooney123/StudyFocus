import React, { useState, useEffect, useCallback } from 'react';
import { useDataContext } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { usePresence } from '../hooks/usePresence';
import './Friends.css';

const Friends = ({ user, setActiveTab }) => {
  const { t } = useLanguage();
  const { getTabData, updateTabData } = useDataContext();
  const [localData, setLocalData] = useState({ friends: [], pendingRequests: [] });
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [friendStatuses, setFriendStatuses] = useState({}); // Map of friendId -> status

  // Auto-clear success messages after 3 seconds
  useEffect(() => {
    if (!message) return;
    const isSuccess = !message.toLowerCase().includes('error') &&
                      !message.toLowerCase().includes('failed') &&
                      !message.toLowerCase().includes('network');
    if (!isSuccess) return;
    const timer = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  // Initialize presence tracking
  const { socket } = usePresence(user?.id);

  // Fetch authoritative data from server and sync to local state + cache.
  // Wrapped in useCallback so it can be listed as a stable dep in useEffect.
  const refreshFromServer = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await fetch('http://localhost:3001/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLocalData(data);
        updateTabData('friends', data);
      }
    } catch (_e) {
      // Fall back to cached data silently
    }
  }, [updateTabData]);

  // Load friends data — prefer fresh server copy, fall back to cache.
  useEffect(() => {
    const cached = getTabData('friends');
    setLocalData(cached);
    refreshFromServer();
  }, [getTabData, refreshFromServer]);

  // Subscribe to presence updates
  useEffect(() => {
    if (!socket) return;

    const handleFriendsPresence = (friendsPresence) => {
      const statusMap = {};
      friendsPresence.forEach(({ userId, status }) => {
        statusMap[userId] = status;
      });
      setFriendStatuses(statusMap);
    };

    const handlePresenceUpdate = ({ userId, status }) => {
      setFriendStatuses(prev => ({
        ...prev,
        [userId]: status
      }));
    };

    socket.on('friends-presence', handleFriendsPresence);
    socket.on('presence-update', handlePresenceUpdate);

    return () => {
      socket.off('friends-presence', handleFriendsPresence);
      socket.off('presence-update', handlePresenceUpdate);
    };
  }, [socket]);

  // Send friend request
  const sendFriendRequest = async () => {
    if (!friendEmail.trim()) {
      setMessage(t('friends.pleaseEnterEmail'));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setMessage(t('friends.sessionExpired'));
        setLoading(false);
        return;
      }

      const response = await fetch('http://localhost:3001/api/friends/send-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: friendEmail.trim() })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(t('friends.requestSent'));
        setFriendEmail('');
        setShowAddFriend(false);
        // Refresh from server so the outgoing request appears immediately.
        await refreshFromServer();
      } else {
        setMessage(result.error || t('friends.failedToSend'));
      }
    } catch (error) {
      console.error('Network error:', error);
      setMessage(t('friends.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Accept friend request
  const acceptFriendRequest = async (requestId) => {
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/friends/accept-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      const result = await response.json();

      if (response.ok) {
        // Pull authoritative state from server (avoids stale cache drift).
        await refreshFromServer();
      } else {
        setMessage(result.error || t('friends.failedToAccept'));
      }
    } catch (error) {
      setMessage(t('friends.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Decline friend request
  const declineFriendRequest = async (requestId) => {
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/friends/decline-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      const result = await response.json();

      if (response.ok) {
        await refreshFromServer();
      } else {
        setMessage(result.error || t('friends.failedToDecline'));
      }
    } catch (error) {
      setMessage(t('friends.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Cancel an outgoing friend request (sent by the current user, not yet accepted)
  const cancelFriendRequest = async (requestId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/friends/cancel-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });
      const result = await response.json();
      if (response.ok) {
        await refreshFromServer();
      } else {
        setMessage(result.error || t('friends.failedToCancel') || 'Failed to cancel request');
      }
    } catch (error) {
      setMessage(t('friends.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Remove friend
  const removeFriend = async (friendId) => {
    if (!window.confirm(t('friends.removeConfirm'))) {
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/friends/remove', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ friendId })
      });

      const result = await response.json();

      if (response.ok) {
        await refreshFromServer();
      } else {
        setMessage(result.error || t('friends.failedToRemove'));
      }
    } catch (error) {
      setMessage(t('friends.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Start chat with friend
  const startChat = (friend) => {
    // Store the selected friend in localStorage so Messages component can access it
    localStorage.setItem('selectedChatFriend', JSON.stringify({
      friendId: friend.id,
      friendName: friend.name,
      friendEmail: friend.email
    }));
    
    // Switch to messages tab
    setActiveTab('messages');
  };

  return (
    <div className="friends-container">
      <div className="friends-header">
        <h2>{t('friends.title')}</h2>
        <button 
          className="add-friend-btn"
          onClick={() => setShowAddFriend(true)}
        >
          + {t('friends.addFriend')}
        </button>
      </div>

      {message && (
        <div className={`message ${message.includes('error') || message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {/* Incoming Friend Requests Section */}
      {(localData.pendingRequests || []).filter(r => !r.direction || r.direction === 'incoming').length > 0 && (
        <div className="friend-requests-section">
          <h3>
            {t('friends.pendingRequests')} ({(localData.pendingRequests || []).filter(r => !r.direction || r.direction === 'incoming').length})
          </h3>
          <div className="requests-list">
            {(localData.pendingRequests || [])
              .filter(r => !r.direction || r.direction === 'incoming')
              .map(request => (
                <div key={request.id} className="friend-request-item">
                  <div className="request-info">
                    <div className="request-name">{request.fromName}</div>
                    <div className="request-email">{request.fromEmail}</div>
                    <div className="request-time">
                      {new Date(request.sentAt).toLocaleDateString()} {t('friends.at')} {new Date(request.sentAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="request-actions">
                    <button
                      className="accept-btn"
                      onClick={() => acceptFriendRequest(request.id)}
                      disabled={loading}
                    >
                      ✓ {t('friends.accept')}
                    </button>
                    <button
                      className="decline-btn"
                      onClick={() => declineFriendRequest(request.id)}
                      disabled={loading}
                    >
                      ✗ {t('friends.decline')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Outgoing Friend Requests Section */}
      {(localData.pendingRequests || []).filter(r => r.direction === 'outgoing').length > 0 && (
        <div className="friend-requests-section outgoing-requests-section">
          <h3>
            Sent Requests ({(localData.pendingRequests || []).filter(r => r.direction === 'outgoing').length})
          </h3>
          <div className="requests-list">
            {(localData.pendingRequests || [])
              .filter(r => r.direction === 'outgoing')
              .map(request => (
                <div key={request.id} className="friend-request-item outgoing-request-item">
                  <div className="request-info">
                    <div className="request-name">{request.toEmail}</div>
                    <div className="request-email outgoing-status">
                      <span className="pending-dot" /> Pending
                    </div>
                    <div className="request-time">
                      Sent on {new Date(request.sentAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div className="request-actions">
                    <button
                      className="cancel-request-btn"
                      onClick={() => cancelFriendRequest(request.id)}
                      disabled={loading}
                      title="Cancel Request"
                    >
                      Cancel Request
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Friends List Section */}
      <div className="friends-list-section">
        <h3>{t('friends.myFriends')} ({(localData.friends || []).length})</h3>
        {(localData.friends || []).length === 0 ? (
          <div className="no-friends">
            <p>{t('friends.noFriends')}</p>
          </div>
        ) : (
          <div className="friends-list">
            {localData.friends.map(friend => {
              const status = friendStatuses[friend.id] || 'offline';
              return (
                <div key={friend.id} className="friend-item">
                  <div className="friend-info">
                    <div className="friend-avatar">
                      {friend.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="friend-details">
                      <div className="friend-name-row">
                        <span className="friend-name">{friend.name}</span>
                        <span className={`friend-status status-${status}`} title={t(`friends.status.${status}`)}>
                          <span className="status-dot"></span>
                          <span className="status-text">{t(`friends.status.${status}`)}</span>
                        </span>
                      </div>
                      <div className="friend-email">{friend.email}</div>
                      <div className="friend-added">
                        {t('friends.friendsSince')} {new Date(friend.addedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button 
                      className="chat-friend-btn"
                      onClick={() => startChat(friend)}
                      title={t('friends.startChat')}
                    >
                      💬
                    </button>
                    <button 
                      className="remove-friend-btn"
                      onClick={() => removeFriend(friend.id)}
                      disabled={loading}
                      title={t('friends.removeFriend')}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Friend Modal */}
      {showAddFriend && (
        <div className="add-friend-modal-overlay" onClick={() => setShowAddFriend(false)}>
          <div className="add-friend-modal" onClick={(e) => e.stopPropagation()}>
            <div className="add-friend-modal__header">
              <h3 className="add-friend-modal__title">{t('friends.addFriendModalTitle')}</h3>
              <button
                type="button"
                className="add-friend-modal__close"
                onClick={() => setShowAddFriend(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="add-friend-modal__body">
              <p className="add-friend-modal__description">{t('friends.addFriendDescription')}</p>
              <input
                type="email"
                placeholder={t('friends.emailPlaceholder')}
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                className="add-friend-modal__input"
                onKeyPress={(e) => e.key === 'Enter' && sendFriendRequest()}
                autoComplete="email"
                autoFocus
              />
              <div className="add-friend-modal__actions">
                <button
                  type="button"
                  className="add-friend-modal__cancel"
                  onClick={() => setShowAddFriend(false)}
                >
                  {t('friends.cancel')}
                </button>
                <button
                  type="button"
                  className="add-friend-modal__send"
                  onClick={sendFriendRequest}
                  disabled={loading || !friendEmail.trim()}
                >
                  {loading ? t('friends.sending') : t('friends.sendRequest')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Friends;

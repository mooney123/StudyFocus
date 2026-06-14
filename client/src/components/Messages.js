import React, { useState, useEffect, useRef } from 'react';
import { useUnreadCount } from '../hooks/useUnreadCount';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../context/FavoritesContext';
import { useDataContext } from '../context/DataContext';
import { usePresence } from '../hooks/usePresence';
import './Messages.css';

const Messages = ({ user, setActiveTab }) => {
  const { t } = useLanguage();
  const { refreshUnreadCount } = useUnreadCount();
  const { showToast } = useToast();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { getTabData } = useDataContext();
  const { socket } = usePresence(user?.id);
  const [friendStatuses, setFriendStatuses] = useState({});
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [menuOpenMessageId, setMenuOpenMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const menuRefs = useRef({});
  
  // Shared processed messages tracker (using localStorage to persist across components)
  const getProcessedMessages = () => {
    try {
      const stored = localStorage.getItem('processedMessageToasts');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const addProcessedMessage = (messageId) => {
    try {
      const processed = getProcessedMessages();
      processed.add(messageId);
      // Keep only last 100 processed messages to avoid memory issues
      const array = Array.from(processed);
      const trimmed = array.slice(-100);
      localStorage.setItem('processedMessageToasts', JSON.stringify(trimmed));
    } catch {
      // Ignore errors
    }
  };

  const isMessageProcessed = (messageId) => {
    const processed = getProcessedMessages();
    return processed.has(messageId);
  };
  
  // Store the actual current user ID from server
  const [currentUserId, setCurrentUserId] = useState(null);

  // Subscribe to presence updates for friends
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
  
  // Get current user ID from server (most reliable source)
  useEffect(() => {
    const fetchCurrentUserId = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      try {
        const response = await fetch('http://localhost:3001/api/auth/verify', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.valid && data.user?.id) {
            setCurrentUserId(String(data.user.id));
            console.log('Current user ID from server:', String(data.user.id));
          }
        }
      } catch (error) {
        console.error('Error fetching current user ID:', error);
      }
    };
    
    fetchCurrentUserId();
  }, []);
  
  // Get current user ID - use state first, then fallbacks
  const getCurrentUserId = () => {
    // First try the server-verified ID
    if (currentUserId) {
      return currentUserId;
    }
    // Fallback to user prop
    if (user?.id) {
      return String(user.id);
    }
    // Fallback to localStorage
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed.id) {
          return String(parsed.id);
        }
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
    return null;
  };
  
  // Helper to check if message is from current user
  const isMyMessage = (msg) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !msg.senderId) return false;
    return String(msg.senderId) === currentUserId;
  };

  // Helper to check if message notifications are enabled
  const areMessageNotificationsEnabled = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return true; // Default to enabled if can't check
      
      const response = await fetch('http://localhost:3001/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Check if notifications.messages is explicitly false
        // Default to true if setting doesn't exist or is undefined
        if (data?.notifications?.messages === false) {
          return false;
        }
        return true;
      }
    } catch (error) {
      console.debug('Error checking notification settings:', error);
    }
    // Default to enabled if error
    return true;
  };

  // Poll for new messages in other conversations (when in Messages tab but not viewing that conversation)
  useEffect(() => {
    if (!selectedConversation || loading || uploadingFile) return;
    
    const currentConversationFriendId = String(selectedConversation.friendId);
    const notificationsEnabledRef = { current: true };
    
    // Check notification settings
    areMessageNotificationsEnabled().then(enabled => {
      notificationsEnabledRef.current = enabled;
    });
    
    const checkOtherConversations = async () => {
      // Don't show toasts if notifications are disabled
      if (!notificationsEnabledRef.current) {
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const currentUserId = getCurrentUserId();
        if (!currentUserId) return;
        
        // Re-check notification settings periodically
        const enabled = await areMessageNotificationsEnabled();
        notificationsEnabledRef.current = enabled;
        if (!enabled) return;
        
        // Get all conversations
        const response = await fetch('http://localhost:3001/api/messages/conversations', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) return;
        
        const result = await response.json();
        const allConversations = Array.isArray(result.conversations) ? result.conversations : [];
        
        // Check other conversations (not the one currently being viewed)
        for (const conversation of allConversations) {
          const friendId = conversation.friendId;
          if (!friendId || String(friendId) === currentConversationFriendId) continue;
          
          // Check if this conversation has unread messages
          if (conversation.unreadCount > 0 && conversation.lastMessage) {
            const lastMsg = conversation.lastMessage;
            const messageId = lastMsg.id;
            
            // Only show toast if message is incoming and not already processed
            if (String(lastMsg.receiverId) === currentUserId && 
                !isMessageProcessed(messageId)) {
              addProcessedMessage(messageId);
              
              showToast({
                senderId: lastMsg.senderId,
                senderName: conversation.friendName || lastMsg.senderName || 'Unknown',
                message: lastMsg.deleted 
                  ? 'Message deleted' 
                  : (lastMsg.file || lastMsg.type === 'file')
                    ? '📎 File'
                    : normalizeMessage(lastMsg.message || 'New message').substring(0, 50),
                friendId: friendId,
                avatar: conversation.friendName ? conversation.friendName.charAt(0).toUpperCase() : '?',
                onClick: () => {
                  // Store friend info to open when navigating
                  localStorage.setItem('selectedChatFriend', JSON.stringify({
                    friendId: friendId,
                    friendName: conversation.friendName || lastMsg.senderName,
                    friendEmail: conversation.friendEmail
                  }));
                  
                  // Already in Messages tab, just load the conversation
                  loadConversation(friendId, conversation);
                  setTimeout(() => {
                    messageInputRef.current?.focus();
                  }, 300);
                }
              });
            }
          }
        }
      } catch (error) {
        console.debug('Error checking other conversations:', error);
      }
    };
    
    // Poll every 3 seconds for new messages in other conversations
    const pollInterval = setInterval(checkOtherConversations, 3000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [selectedConversation, loading, uploadingFile, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load conversations on component mount and check for selected friend (from toast or Friends tab)
  useEffect(() => {
    loadConversations();
    
    // Check if a friend was selected from Friends tab or toast click
    const selectedFriend = localStorage.getItem('selectedChatFriend');
    if (selectedFriend) {
      const friend = JSON.parse(selectedFriend);
      console.log('Loading conversation for friend:', friend);
      // Clear the selection first
      localStorage.removeItem('selectedChatFriend');
      // Small delay to ensure component is fully mounted
      setTimeout(() => {
        loadConversation(friend.friendId, friend);
        // Focus input after conversation loads
        setTimeout(() => {
          messageInputRef.current?.focus();
        }, 400);
      }, 100);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus message input when a conversation is selected
  useEffect(() => {
    if (selectedConversation && !loading && messageInputRef.current) {
      // Small delay to ensure the DOM is fully rendered
      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    }
  }, [selectedConversation, loading]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuOpenMessageId && !event.target.closest('.message-menu-popover') && !event.target.closest('.message-dots-button')) {
        setMenuOpenMessageId(null);
      }
    };

    if (menuOpenMessageId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [menuOpenMessageId]);

  // Poll for new messages while a conversation is open
  useEffect(() => {
    if (!selectedConversation || loading) {
      return; // Don't poll if no conversation is selected or if still loading
    }

    const friendId = selectedConversation.friendId;
    if (!friendId) {
      return;
    }

    // Function to check for new messages
    const checkForNewMessages = async () => {
      // Don't poll if we're currently loading or uploading
      if (loading || uploadingFile) {
        return;
      }

      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch(`http://localhost:3001/api/messages/conversation/${friendId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const result = await response.json();
          const serverMessages = result.conversation || [];
          const currentUserId = getCurrentUserId();
          
          // Normalize server messages - preserve all fields and ensure defaults
          const normalizedServerMsgs = serverMessages.map(msg => ({
            ...msg,
            senderId: String(msg.senderId || ''),
            receiverId: String(msg.receiverId || ''),
            readByReceiver: msg.readByReceiver !== undefined ? msg.readByReceiver : false,
            edited: msg.edited || false,
            deleted: msg.deleted || false,
            editedAt: msg.editedAt || null,
            deletedAt: msg.deletedAt || null
          }));

          // Check if there are new messages or any updates (edits, deletes, read status)
          setMessages(prevMessages => {
            const prevMessageIds = new Set(prevMessages.map(m => m.id));
            const newMessages = normalizedServerMsgs.filter(msg => !prevMessageIds.has(msg.id));
            
            // Check for any updates on existing messages (edits, deletes, read status)
            let hasUpdates = false;
            const prevMessagesMap = new Map(prevMessages.map(m => [m.id, m]));
            
            for (const serverMsg of normalizedServerMsgs) {
              const prevMsg = prevMessagesMap.get(serverMsg.id);
              if (prevMsg) {
                // Check if message content changed (edit)
                if (prevMsg.message !== serverMsg.message) {
                  hasUpdates = true;
                  break;
                }
                // Check if edited flag changed
                if (prevMsg.edited !== serverMsg.edited) {
                  hasUpdates = true;
                  break;
                }
                // Check if deleted flag changed
                if (prevMsg.deleted !== serverMsg.deleted) {
                  hasUpdates = true;
                  break;
                }
                // Check if read status changed
                const prevRead = prevMsg.readByReceiver !== undefined ? prevMsg.readByReceiver : false;
                const serverRead = serverMsg.readByReceiver !== undefined ? serverMsg.readByReceiver : false;
                if (prevRead !== serverRead) {
                  hasUpdates = true;
                  break;
                }
                // Check if editedAt timestamp changed (message was just edited)
                if (prevMsg.editedAt !== serverMsg.editedAt) {
                  hasUpdates = true;
                  break;
                }
                // Check if deletedAt timestamp changed (message was just deleted)
                if (prevMsg.deletedAt !== serverMsg.deletedAt) {
                  hasUpdates = true;
                  break;
                }
              }
            }
            
            // If there are new messages or any updates, update the entire list
            if (newMessages.length > 0 || hasUpdates) {
              // Check for new incoming messages
              const incomingNewMessages = newMessages.filter(msg => String(msg.receiverId) === currentUserId);
              
              if (incomingNewMessages.length > 0) {
                // Mark messages as read if user is viewing this conversation
                if (selectedConversation && String(selectedConversation.friendId) === friendId) {
                  fetch('http://localhost:3001/api/messages/mark-read', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ friendId })
                  }).catch(err => console.error('Error marking messages as read:', err));
                } else {
                  // Don't show toast here - let global polling handle it
                  // This prevents duplicates when polling the active conversation
                }
                
                // Refresh unread count
                refreshUnreadCount();
              }
              
              // Return the full list from server to ensure proper ordering and all updates
              // Normalize all messages to ensure readByReceiver exists
              return normalizedServerMsgs.map(msg => ({
                ...msg,
                readByReceiver: msg.readByReceiver !== undefined ? msg.readByReceiver : false
              }));
            }
            
            // No new messages or updates, return previous state
            return prevMessages;
          });
        }
      } catch (error) {
        // Silently fail - don't spam console with polling errors
        console.debug('Error checking for new messages:', error);
      }
    };

    // Poll every 2 seconds
    const pollInterval = setInterval(checkForNewMessages, 2000);

    // Cleanup interval on unmount or when conversation changes
    return () => {
      clearInterval(pollInterval);
    };
  }, [selectedConversation, loading, uploadingFile]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load all conversations
  const loadConversations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/messages/conversations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        // Ensure conversations is always an array
        setConversations(Array.isArray(result.conversations) ? result.conversations : []);
        // Refresh unread count after loading conversations
        refreshUnreadCount();
      } else {
        console.error('Failed to load conversations');
        setConversations([]);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  // Load conversation with a specific friend
  const loadConversation = async (friendId, friendInfo = null) => {
    try {
      setLoading(true);
      setMessage(''); // Clear any previous error messages
      const token = localStorage.getItem('token');
      
      // Mark messages as read (only if conversation exists)
      try {
        await fetch('http://localhost:3001/api/messages/mark-read', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ friendId })
        });
      } catch (error) {
        // Ignore errors if no conversation exists yet
        console.log('No existing conversation to mark as read');
      }

      // Load conversation messages
      const response = await fetch(`http://localhost:3001/api/messages/conversation/${friendId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        const msgs = result.conversation || [];
        const currentUserId = getCurrentUserId();
        
        // Normalize and validate messages - ensure all fields are present
        const normalizedMsgs = msgs.map(msg => {
          const normalized = {
            ...msg,
            senderId: String(msg.senderId || ''),
            receiverId: String(msg.receiverId || ''),
            readByReceiver: msg.readByReceiver !== undefined ? msg.readByReceiver : false,
            edited: msg.edited || false,
            deleted: msg.deleted || false,
            editedAt: msg.editedAt || null,
            deletedAt: msg.deletedAt || null
          };
          
          // Debug log for each message
          console.log('Loading message:', {
            id: normalized.id,
            senderId: normalized.senderId,
            currentUserId,
            isMine: isMyMessage(normalized),
            message: normalized.message?.substring(0, 30),
            edited: normalized.edited,
            deleted: normalized.deleted,
            readByReceiver: normalized.readByReceiver
          });
          
          return normalized;
        });
        
        setMessages(normalizedMsgs);
        
        // Mark all messages in this conversation as processed (so they don't trigger toasts)
        normalizedMsgs.forEach(msg => {
          if (!isMyMessage(msg)) {
            addProcessedMessage(msg.id);
          }
        });
        
        // Find the friend info from conversations or use provided friendInfo
        let friend = conversations.find(conv => conv.friendId === friendId);
        if (!friend && friendInfo) {
          friend = friendInfo;
        }
        setSelectedConversation(friend);
        
        // Update conversations to remove unread count
        setConversations(prev => prev.map(conv => 
          conv.friendId === friendId ? { ...conv, unreadCount: 0 } : conv
        ));
        
        // Refresh global unread count
        refreshUnreadCount();
      } else if (response.status === 404) {
        // No conversation exists yet, create empty conversation
        setMessages([]);
        let friend = conversations.find(conv => conv.friendId === friendId);
        if (!friend && friendInfo) {
          friend = friendInfo;
        }
        setSelectedConversation(friend);
      } else {
        const result = await response.json();
        setMessage(result.error || t('messages.failedToLoad'));
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
      setMessage(t('messages.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setMessage(t('messages.fileSizeError'));
        return;
      }
      setSelectedFile(file);
      setMessage('');
    }
  };

  // Remove selected file
  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Send message (with optional file)
  const sendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedConversation || loading || uploadingFile) {
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setMessage('Please log in again. Session expired.');
        return;
      }

      let fileData = null;

      // Upload file if one is selected
      if (selectedFile) {
        setUploadingFile(true);
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadResponse = await fetch('http://localhost:3001/api/messages/upload-file', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok) {
          setMessage(uploadResult.error || t('messages.failedToUpload'));
          setUploadingFile(false);
          setLoading(false);
          return;
        }

        fileData = uploadResult.file;
        setUploadingFile(false);
      }

      // Send message with file info
      const response = await fetch('http://localhost:3001/api/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          friendId: selectedConversation.friendId,
          message: newMessage.trim(),
          file: fileData
        })
      });

      const result = await response.json();

      if (response.ok) {
        // Add message to local state
        const userId = getCurrentUserId();
        if (!userId) {
          console.error('Cannot send message: No user ID available');
          setMessage(t('messages.userIdError'));
          return;
        }
        
        const messageObj = {
          id: result.messageId,
          senderId: userId,
          senderName: user?.name,
          receiverId: String(selectedConversation.friendId),
          message: newMessage.trim(),
          timestamp: new Date().toISOString(),
          read: true
        };

        if (fileData) {
          messageObj.file = fileData;
          messageObj.type = 'file';
        }
        
        setMessages(prev => [...prev, messageObj]);
        setNewMessage('');
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        // Update conversations list
        await loadConversations();
        
        // Refresh unread count after sending message
        if (refreshUnreadCount) {
          refreshUnreadCount();
        }
      } else {
        setMessage(result.error || t('messages.failedToSend'));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessage(t('messages.networkErrorDetail').replace('{error}', error.message));
    } finally {
      setLoading(false);
      setUploadingFile(false);
    }
  };

  // Handle file download
  const handleFileDownload = async (file) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setMessage(t('messages.sessionExpired'));
        return;
      }

      const response = await fetch(`http://localhost:3001/api/messages/file/${file.filename}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        setMessage(error.error || t('messages.failedToDownload'));
        return;
      }

      // Get the file as a blob
      const blob = await response.blob();
      
      // For images, open in new tab; for other files, download
      if (file.mimetype?.startsWith('image/')) {
        const url = window.URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
          // Clean up URL after window closes (approximate)
          setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } else {
          // Popup blocked, fall back to download
          const a = document.createElement('a');
          a.href = url;
          a.download = file.originalName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      } else {
        // For non-images, download the file
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.originalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      setMessage(t('messages.failedToDownload'));
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle Edit Message
  const handleEditMessage = (msg) => {
    setEditingMessageId(msg.id);
    setEditText(msg.message || '');
  };

  // Save edited message
  const saveEditedMessage = async (messageId) => {
    if (!editText.trim()) {
      setEditingMessageId(null);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/messages/edit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageId,
          newMessage: editText.trim()
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Update message with server response to ensure consistency
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, ...result.message, message: editText.trim(), edited: true, editedAt: new Date().toISOString() }
            : msg
        ));
        setEditingMessageId(null);
        setEditText('');
        // Reload conversation to get latest state from server
        if (selectedConversation) {
          await loadConversation(selectedConversation.friendId);
        }
        await loadConversations();
      } else {
        const result = await response.json();
        setMessage(result.error || 'Failed to edit message');
      }
    } catch (error) {
      console.error('Error editing message:', error);
      setMessage('Failed to edit message');
    }
  };

  // Handle Delete Message
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/messages/delete', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId })
      });

      if (response.ok) {
        // Reload conversation to get latest state from server (ensures both users see the same state)
        if (selectedConversation) {
          await loadConversation(selectedConversation.friendId);
        } else {
          // Update local state as fallback
          setMessages(prev => prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, deleted: true, message: 'Message deleted', deletedAt: new Date().toISOString() }
              : msg
          ));
        }
        await loadConversations();
      } else {
        const result = await response.json();
        setMessage(result.error || 'Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      setMessage('Failed to delete message');
    }
  };

  // Get the most recent outgoing message for status display
  const getMostRecentOutgoingMessage = () => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    
    const outgoingMessages = messages
      .filter(msg => String(msg.senderId) === currentUserId && !msg.deleted)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    return outgoingMessages.length > 0 ? outgoingMessages[0] : null;
  };

  // Normalize message to ensure readByReceiver exists
  const normalizeMessageForDisplay = (msg) => {
    return {
      ...msg,
      readByReceiver: msg.readByReceiver !== undefined ? msg.readByReceiver : false
    };
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString();
    }
  };

  // Normalize message content - ensure it's a string and fix any character-by-character newline issues
  const normalizeMessage = (message) => {
    if (!message) return '';
    let msgStr = String(message);
    
    // Remove any null bytes or control characters
    msgStr = msgStr.replace(/\0/g, '');
    
    // Aggressively fix character-by-character newline issues
    // Pattern: any non-whitespace character, followed by newline, followed by any non-whitespace character
    // This catches cases like "h\ni" where each character is on a new line
    msgStr = msgStr.replace(/([^\r\n\s])\s*\r?\n\s*([^\r\n\s])/g, '$1$2');
    
    // Also handle cases where there might be spaces: "h \n i" -> "h i"
    msgStr = msgStr.replace(/([^\r\n])\s*\r?\n\s*([^\r\n])/g, '$1 $2');
    
    // Normalize multiple spaces to single space
    msgStr = msgStr.replace(/[ \t]+/g, ' ');
    
    // Trim the result
    msgStr = msgStr.trim();
    
    return msgStr;
  };

  console.log('Messages component rendering:', { selectedConversation, conversations: conversations.length });
  
  return (
    <div className="messages-container">
        {!selectedConversation ? (
          <div className="messages-header">
            <h2>{t('messages.title')}</h2>
            <button 
              className={`header-btn star-btn ${isFavorited('messages') ? 'starred' : ''}`}
              onClick={() => toggleFavorite('messages')}
              title={isFavorited('messages') ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited('messages') ? '⭐' : '☆'}
            </button>
          </div>
        ) : (
        <div className="chat-header">
          <div className="chat-header-content">
            <button 
              className="back-btn"
              onClick={() => {
                setSelectedConversation(null);
                setMessages([]);
              }}
            >
              ←
            </button>
            <div className="friend-info">
              <div className="friend-avatar">
                {selectedConversation.friendName ? selectedConversation.friendName.charAt(0).toUpperCase() : '?'}
              </div>
              <div className="friend-details">
                <div className="friend-name">{selectedConversation.friendName || 'Unknown'}</div>
                <div className={`friend-status status-${friendStatuses[String(selectedConversation.friendId)] || 'offline'}`}>
                  {friendStatuses[String(selectedConversation.friendId)] ? 
                    t(`friends.status.${friendStatuses[String(selectedConversation.friendId)]}`) : 
                    t('friends.status.offline')}
                </div>
              </div>
            </div>
            <div className="chat-actions">
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className={`message ${message.includes('error') || message.includes('Failed') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {!selectedConversation ? (
        // Conversations list
        <div className="conversations-list">
          {!Array.isArray(conversations) || conversations.length === 0 ? (
            <div className="no-conversations">
              <div className="no-conversations-icon">💬</div>
              <h3>{t('messages.noConversations')}</h3>
              <p>{t('messages.noConversations')}</p>
            </div>
          ) : (
            (Array.isArray(conversations) ? conversations : []).map(conversation => (
              <div 
                key={conversation.friendId} 
                className={`conversation-item ${conversation.unreadCount > 0 ? 'unread' : ''}`}
                onClick={() => loadConversation(conversation.friendId)}
              >
                <div className="conversation-avatar">
                  {conversation.friendName ? conversation.friendName.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="conversation-details">
                  <div className="conversation-header-info">
                    <div className="conversation-name">{conversation.friendName || 'Unknown'}</div>
                    <div className="conversation-time">
                      {conversation.lastMessage ? formatTime(conversation.lastMessage.timestamp) : ''}
                    </div>
                  </div>
                  <div className="conversation-preview">
                    {conversation.lastMessage && (
                      <>
                        <span className={isMyMessage(conversation.lastMessage) ? 'sent' : 'received'}>
                          {isMyMessage(conversation.lastMessage) ? `${t('leaderboard.you')}: ` : ''}
                        </span>
                        {conversation.lastMessage.file || conversation.lastMessage.type === 'file' ? (
                          <span>📎 {conversation.lastMessage.file?.originalName || 'File'}</span>
                        ) : (
                          normalizeMessage(conversation.lastMessage.message)
                        )}
                      </>
                    )}
                  </div>
                  {conversation.unreadCount > 0 && (
                    <div className="unread-badge">
                      {conversation.unreadCount}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        // Chat interface
        <div className="chat-container">
          <div className="messages-area">
            {loading && messages.length === 0 ? (
              <div className="loading">Loading conversation...</div>
            ) : messages.length === 0 ? (
              <div className="empty-conversation">
                <div className="empty-conversation-icon">💬</div>
                <h3>Start a conversation</h3>
                <p>Send your first message to {selectedConversation?.friendName || 'your friend'}!</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const normalizedMsg = normalizeMessageForDisplay(msg);
                const isMine = isMyMessage(normalizedMsg);
                const hasFile = normalizedMsg.file || normalizedMsg.type === 'file';
                const isEditing = editingMessageId === normalizedMsg.id;
                const mostRecentOutgoing = getMostRecentOutgoingMessage();
                const showStatus = isMine && mostRecentOutgoing && normalizedMsg.id === mostRecentOutgoing.id;
                const isDeleted = normalizedMsg.deleted;
                
                return (
                  <div 
                    key={normalizedMsg.id} 
                    className={`message-bubble-wrapper ${isMine ? 'sent' : 'received'}`}
                    onMouseEnter={(e) => {
                      if (isMine && !isDeleted && !isEditing) {
                        e.currentTarget.querySelector('.message-dots-button')?.classList.add('visible');
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (menuOpenMessageId !== normalizedMsg.id) {
                        e.currentTarget.querySelector('.message-dots-button')?.classList.remove('visible');
                      }
                    }}
                    >
                    <div 
                      className={`message-bubble ${isMine ? 'sent' : 'received'} ${isDeleted ? 'deleted' : ''}`}
                    >
                      {isMine && !isDeleted && !isEditing && (
                        <>
                          <button
                            className="message-dots-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenMessageId(menuOpenMessageId === normalizedMsg.id ? null : normalizedMsg.id);
                            }}
                            title="Message options"
                            ref={(el) => {
                              if (el) menuRefs.current[normalizedMsg.id] = el;
                            }}
                          >
                            ⋯
                          </button>
                          {menuOpenMessageId === normalizedMsg.id && (
                            <div 
                              className="message-menu-popover"
                              ref={(el) => {
                                if (el && menuRefs.current[normalizedMsg.id]) {
                                  const buttonRect = menuRefs.current[normalizedMsg.id].getBoundingClientRect();
                                  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                                  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                                  
                                  // Position to the left of the button for sent messages
                                  el.style.left = `${buttonRect.left - 132 + scrollLeft}px`;
                                  el.style.top = `${buttonRect.top + scrollTop}px`;
                                }
                              }}
                            >
                              <button
                                className="message-menu-item message-menu-item-edit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMessage(normalizedMsg);
                                  setMenuOpenMessageId(null);
                                }}
                              >
                                <span className="menu-item-icon">✎</span>
                                <span>Edit</span>
                              </button>
                              <button
                                className="message-menu-item message-menu-item-delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMessage(normalizedMsg.id);
                                  setMenuOpenMessageId(null);
                                }}
                              >
                                <span className="menu-item-icon">✕</span>
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {isEditing ? (
                      <div className="message-edit-container">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="message-edit-input"
                          rows="2"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveEditedMessage(normalizedMsg.id);
                            }
                            if (e.key === 'Escape') {
                              setEditingMessageId(null);
                              setEditText('');
                            }
                          }}
                        />
                        <div className="message-edit-actions">
                          <button 
                            className="edit-save-btn"
                            onClick={() => saveEditedMessage(normalizedMsg.id)}
                          >
                            Save
                          </button>
                          <button 
                            className="edit-cancel-btn"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditText('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {hasFile && !isDeleted && (
                      <div className="message-file">
                        <div className="file-icon">
                              {normalizedMsg.file?.mimetype?.startsWith('image/') ? '🖼️' : 
                               normalizedMsg.file?.mimetype?.includes('pdf') ? '📄' :
                               normalizedMsg.file?.mimetype?.includes('word') || normalizedMsg.file?.mimetype?.includes('document') ? '📝' :
                               normalizedMsg.file?.mimetype?.includes('sheet') || normalizedMsg.file?.mimetype?.includes('excel') ? '📊' :
                           '📎'}
                        </div>
                        <div className="file-info">
                          <button
                                onClick={() => handleFileDownload(normalizedMsg.file)}
                            className="file-link"
                            type="button"
                          >
                                {normalizedMsg.file.originalName}
                          </button>
                          <span className="file-size">
                                {(normalizedMsg.file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                    )}
                        {normalizedMsg.message && (
                          <div className="message-content">
                            {normalizeMessage(normalizedMsg.message)}
                            {normalizedMsg.edited && !isDeleted && (
                              <span className="edited-indicator"> (Edited)</span>
                            )}
                          </div>
                        )}
                        <div className="message-footer">
                          <div className="message-time">{formatTime(normalizedMsg.timestamp)}</div>
                          {showStatus && !isDeleted && (
                            <div className="message-status">
                              {normalizedMsg.readByReceiver ? 'Read' : 'Sent'}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="message-input-area">
            {selectedFile && (
              <div className="file-preview">
                <span className="file-preview-name">📎 {selectedFile.name}</span>
                <button 
                  className="file-remove-btn"
                  onClick={removeSelectedFile}
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            )}
            <div className="message-input-container">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="file-input"
                id="file-input"
                style={{ display: 'none' }}
                disabled={loading || uploadingFile}
              />
              <label htmlFor="file-input" className="file-input-label" title="Attach file">
                📎
              </label>
              <textarea
                ref={messageInputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('messages.typeMessage')}
                className="message-input"
                rows="1"
                disabled={loading || uploadingFile}
              />
              <button 
                className="send-btn"
                onClick={sendMessage}
                disabled={loading || uploadingFile || (!newMessage.trim() && !selectedFile)}
              >
                {uploadingFile ? '⏳' : loading ? '⏳' : '➤'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;


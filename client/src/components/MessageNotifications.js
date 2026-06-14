import React, { useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';

// Helper to normalize message text
const normalizeMessage = (message) => {
  if (!message) return 'New message';
  let msgStr = String(message);
  msgStr = msgStr.replace(/\0/g, '');
  msgStr = msgStr.replace(/([^\r\n\s])\s*\r?\n\s*([^\r\n\s])/g, '$1$2');
  msgStr = msgStr.replace(/([^\r\n])\s*\r?\n\s*([^\r\n])/g, '$1 $2');
  msgStr = msgStr.replace(/[ \t]+/g, ' ');
  return msgStr.trim();
};

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

// Global message notification polling component
// This stays mounted even when Messages tab is not active
const MessageNotifications = ({ activeTab, setActiveTab, currentUserId }) => {
  const { showToast } = useToast();
  const notificationsEnabledRef = useRef(true);

  // Get current user ID
  const getCurrentUserId = () => {
    if (currentUserId) return String(currentUserId);
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed.id) return String(parsed.id);
      }
    } catch (e) {
      // Ignore
    }
    return null;
  };

  // Check notification settings periodically
  useEffect(() => {
    const checkNotificationSettings = async () => {
      notificationsEnabledRef.current = await areMessageNotificationsEnabled();
    };
    
    // Check immediately and then every 10 seconds
    checkNotificationSettings();
    const settingsInterval = setInterval(checkNotificationSettings, 10000);
    
    return () => {
      clearInterval(settingsInterval);
    };
  }, []);

  useEffect(() => {
    const checkForNewMessages = async () => {
      // Don't show toasts if notifications are disabled
      if (!notificationsEnabledRef.current) {
        return;
      }
      
      const userId = getCurrentUserId();
      if (!userId) return;

      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Get all conversations
        const response = await fetch('http://localhost:3001/api/messages/conversations', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) return;

        const result = await response.json();
        const conversations = Array.isArray(result.conversations) ? result.conversations : [];

        // Skip showing toasts if user is in Messages tab (let Messages component handle it)
        // This avoids duplicate toasts and allows Messages to check selectedConversation
        if (activeTab === 'messages') {
          return;
        }

        // Check each conversation for new unread messages
        for (const conversation of conversations) {
          const friendId = conversation.friendId;
          if (!friendId || !conversation.unreadCount || !conversation.lastMessage) continue;

          const lastMsg = conversation.lastMessage;
          const messageId = lastMsg.id;
          
          // Only show toast for incoming messages that haven't been processed
          if (String(lastMsg.receiverId) === userId && 
              !isMessageProcessed(messageId)) {
            
            // Mark as processed
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
                // Store friend info to open when navigating to Messages
                localStorage.setItem('selectedChatFriend', JSON.stringify({
                  friendId: friendId,
                  friendName: conversation.friendName || lastMsg.senderName,
                  friendEmail: conversation.friendEmail
                }));
                
                // Navigate to Messages tab
                if (setActiveTab) {
                  setActiveTab('messages');
                }
              }
            });
          }
        }
      } catch (error) {
        console.debug('Error checking for new messages:', error);
      }
    };

    // Poll every 3 seconds for new messages
    const pollInterval = setInterval(checkForNewMessages, 3000);
    
    // Initial check
    checkForNewMessages();

    return () => {
      clearInterval(pollInterval);
    };
  }, [activeTab, setActiveTab, showToast, currentUserId]);

  return null; // This component doesn't render anything
};

export default MessageNotifications;


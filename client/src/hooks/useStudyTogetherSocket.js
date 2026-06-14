import { useEffect, useRef } from 'react';
import { usePresence } from './usePresence';

/**
 * Hook to subscribe to Study Together real-time events via Socket.IO.
 * Requires usePresence to be active (socket connected) - typically from App or parent.
 * @param {string} userId - Current user ID
 * @param {object} callbacks - Event handlers
 * @param {function} callbacks.onInvite - New invite received (for recipient)
 * @param {function} callbacks.onInviteAccepted - Creator notified when friend accepts
 * @param {function} callbacks.onInviteDeclined - Creator notified when friend declines
 * @param {function} callbacks.onSessionCancelled - Friend notified when creator cancels
 * @param {function} callbacks.onReadyUpdate - Participants notified when ready status changes
 * @param {function} callbacks.onSessionStarted - Participants notified when session starts
 */
export function useStudyTogetherSocket(userId, callbacks = {}) {
  const { socket, isConnected } = usePresence(userId);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handlers = [];
    const add = (event, key) => {
      const wrapped = (data) => {
        const fn = callbacksRef.current[key];
        if (typeof fn === 'function') fn(data);
      };
      socket.on(event, wrapped);
      handlers.push(() => socket.off(event, wrapped));
    };

    add('study-together:invite', 'onInvite');
    add('study-together:invite-accepted', 'onInviteAccepted');
    add('study-together:invite-declined', 'onInviteDeclined');
    add('study-together:session-cancelled', 'onSessionCancelled');
    add('study-together:ready-update', 'onReadyUpdate');
    add('study-together:session-started', 'onSessionStarted');

    return () => handlers.forEach((h) => h());
  }, [socket, isConnected]);
}

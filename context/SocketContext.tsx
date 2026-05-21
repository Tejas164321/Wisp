'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { generateNickname } from '@/lib/nickname';

export interface Message {
  id: string;
  nickname: string;
  text: string;
  createdAt: number;
}

interface SocketContextType {
  socket: Socket | null;
  nickname: string;
  isConnected: boolean;
  onlineCount: number;
  messages: Message[];
  typingUsers: string[];
  sendMessage: (text: string) => void;
  sendTypingStatus: (isTyping: boolean) => void;
  error: string | null;
  clearError: () => void;
  regenerateUserNickname: () => void;
  soundEnabled: boolean;
  toggleSoundEnabled: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  // Track typing timeout to clear status client side after inactivity
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  // Keep sound enabled state fresh in stale socket event closure
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Lazy load audio utility properties to avoid server-side render mismatch
  const audioRef = useRef<{
    playReceiveSound: () => void;
    playSendSound: () => void;
    triggerHaptic: (type: 'light' | 'success' | 'double') => void;
  } | null>(null);

  useEffect(() => {
    import('@/lib/audio-effects').then((module) => {
      audioRef.current = module;
    });
  }, []);

  // 1. Update nickname post-hydrate
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let storedNickname = localStorage.getItem('ghostroom_nickname');
      if (!storedNickname) {
        storedNickname = generateNickname();
        localStorage.setItem('ghostroom_nickname', storedNickname);
      }
      const finalNickname = storedNickname;
      setTimeout(() => {
        setNickname(finalNickname);
      }, 0);
    }
  }, []);

  // 2. Initialise Socket IO Client connection
  useEffect(() => {
    if (!nickname) return; // Wait until nickname is resolved from localStorage

    // Socket.IO client auto-resolves to current browser window host
    const socketClient = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'], // Crucial for multi-replica Cloud Run deployments to bypass session stickiness issues on HTTP polling
    });

    socketClient.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('🤖 Real-time chat connected to sanctuary.');
    });

    socketClient.on('disconnect', () => {
      setIsConnected(false);
      console.warn('⚠️ Disconnected from the sanctuary, seeking visual re-attachment...');
    });

    socketClient.on('history', (historyMessages: Message[]) => {
      setMessages(historyMessages);
    });

    socketClient.on('message', (newMsg: Message) => {
      setMessages((prev) => {
        // Prevent duplicate append for idempotency
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }

        // Play subtle sound alert + haptic vibe if received from others
        if (newMsg.nickname !== nickname) {
          if (soundEnabledRef.current && audioRef.current) {
            audioRef.current.playReceiveSound();
          }
          if (audioRef.current) {
            audioRef.current.triggerHaptic('light');
          }
        }

        return [...prev, newMsg];
      });
    });

    socketClient.on('user_count', (count: number) => {
      setOnlineCount(count);
    });

    socketClient.on('typing', (data: { nickname: string }) => {
      if (data.nickname && data.nickname !== nickname) {
        setTypingUsers((prev) => {
          if (prev.includes(data.nickname)) return prev;
          return [...prev, data.nickname];
        });
      }
    });

    socketClient.on('stop_typing', (data: { nickname?: string }) => {
      if (data.nickname) {
        setTypingUsers((prev) => prev.filter((name) => name !== data.nickname));
      } else {
        // Disconnect catch-all, trigger simple aging out
        setTypingUsers([]);
      }
    });

    socketClient.on('error', (errMessage: string) => {
      setError(errMessage);
      // Automatically dismiss socket errors after 4 seconds
      setTimeout(() => {
        setError((current) => current === errMessage ? null : current);
      }, 4000);
    });

    setTimeout(() => {
      setSocket(socketClient);
    }, 0);

    return () => {
      socketClient.disconnect();
    };
  }, [nickname]);

  // Actions
  const sendMessage = (text: string) => {
    if (socket && isConnected) {
      socket.emit('message', { nickname, text });
      
      // Trigger soft send chime + subtle haptic vibration
      if (soundEnabledRef.current && audioRef.current) {
        audioRef.current.playSendSound();
      }
      if (audioRef.current) {
        audioRef.current.triggerHaptic('success');
      }

      // Stop typing status instantly upon send
      sendTypingStatus(false);
    } else {
      setError('Connection interrupted. Unable to reach a spatial gateway.');
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (!socket || !isConnected) return;

    // Guard to avoid spamming typing events unnecessarily
    if (isCurrentlyTypingRef.current === isTyping) return;
    isCurrentlyTypingRef.current = isTyping;

    if (isTyping) {
      socket.emit('typing', { nickname });
    } else {
      socket.emit('stop_typing', { nickname });
    }

    // Handle typing indicator expiration
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 4000); // Expiry target indicator
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
  };

  const clearError = () => {
    setError(null);
  };

  const regenerateUserNickname = () => {
    const oldNickname = nickname;
    const freshNickname = generateNickname();
    if (typeof window !== 'undefined') {
      localStorage.setItem('ghostroom_nickname', freshNickname);
    }
    
    // Notify server of typing state swap (clearing typing reference)
    if (socket && isConnected) {
      socket.emit('stop_typing', { nickname: oldNickname });
    }
    
    setNickname(freshNickname);
  };

  const toggleSoundEnabled = () => {
    setSoundEnabled((prev) => {
      const nextVal = !prev;
      // Double tap vibration feedback upon configuration toggle
      if (audioRef.current) {
        audioRef.current.triggerHaptic('double');
      }
      return nextVal;
    });
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        nickname,
        isConnected,
        onlineCount,
        messages,
        typingUsers,
        sendMessage,
        sendTypingStatus,
        error,
        clearError,
        regenerateUserNickname,
        soundEnabled,
        toggleSoundEnabled,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketState() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocketState must be consumed inside a SocketProvider context context wrapper.');
  }
  return context;
}

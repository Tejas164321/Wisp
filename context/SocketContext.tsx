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
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isPollingMode, setIsPollingMode] = useState(false);
  const isConnected = isSocketConnected || isPollingMode;
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
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 3000, // Short timeout for faster fallback to polling on Vercel
    });

    let fallbackTimeout: NodeJS.Timeout;

    // Fall back to polling mode if socket fails to connect in 2.5 seconds
    fallbackTimeout = setTimeout(() => {
      console.log('🔌 Socket connection timed out. Falling back to HTTP polling mode.');
      setIsPollingMode(true);
    }, 2500);

    socketClient.on('connect', () => {
      clearTimeout(fallbackTimeout);
      setIsSocketConnected(true);
      setIsPollingMode(false);
      setError(null);
      console.log('🤖 Real-time chat connected to sanctuary.');
    });

    socketClient.on('disconnect', () => {
      setIsSocketConnected(false);
      console.warn('⚠️ Disconnected from the sanctuary, seeking visual re-attachment...');
      // Start polling fallback immediately on disconnect
      setIsPollingMode(true);
    });

    socketClient.on('connect_error', () => {
      clearTimeout(fallbackTimeout);
      setIsPollingMode(true);
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
      clearTimeout(fallbackTimeout);
      socketClient.disconnect();
    };
  }, [nickname]);

  // 3. Polling loop fallback when Socket.io is unavailable (e.g. on Vercel serverless)
  useEffect(() => {
    if (!isPollingMode || !nickname) return;

    const fetchPoll = async () => {
      try {
        const res = await fetch(`/api/messages?nickname=${encodeURIComponent(nickname)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setMessages(data.messages);
          }
          if (typeof data.onlineCount === 'number') {
            setOnlineCount(data.onlineCount);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    fetchPoll();

    const interval = setInterval(fetchPoll, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [isPollingMode, nickname]);

  // Actions
  const sendMessage = async (text: string) => {
    if (isPollingMode) {
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nickname, text }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'A spatial anomaly occurred. Whisper failed.');
          return;
        }

        const data = await res.json();
        if (data.success && data.message) {
          if (soundEnabledRef.current && audioRef.current) {
            audioRef.current.playSendSound();
          }
          if (audioRef.current) {
            audioRef.current.triggerHaptic('success');
          }

          // Append locally immediately for responsiveness
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
      } catch (err) {
        console.error('Failed to send message in polling mode:', err);
        setError('Connection interrupted. Unable to reach a spatial gateway.');
      }
      return;
    }

    if (socket && isSocketConnected) {
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
    if (isPollingMode) return; // Typing status not supported/needed in polling mode
    if (!socket || !isSocketConnected) return;

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
    if (socket && isSocketConnected) {
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

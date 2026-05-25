'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { generateNickname } from '@/lib/nickname';
import type { MemeAudio, Message, MessageType } from '@/lib/message-types';

export type { Message } from '@/lib/message-types';

export interface SendMessagePayload {
  type?: MessageType;
  text?: string;
  memeAudio?: MemeAudio;
}

interface SocketContextType {
  socket: Socket | null;
  nickname: string;
  isConnected: boolean;
  onlineCount: number;
  messages: Message[];
  typingUsers: string[];
  sendMessage: (payload: SendMessagePayload, replyTo?: { id: string; nickname: string; text: string }) => void;
  sendTypingStatus: (isTyping: boolean) => void;
  error: string | null;
  clearError: () => void;
  regenerateUserNickname: () => void;
  soundEnabled: boolean;
  toggleSoundEnabled: () => void;
  isScrolledUp: boolean;
  setIsScrolledUp: (val: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isPollingMode, setIsPollingMode] = useState(false);
  const isConnected = isSocketConnected || isPollingMode;
  const [onlineCount, setOnlineCount] = useState(1);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  
  // Track typing timeout to clear status client side after inactivity
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);

  // Keep state variables fresh in stale socket event closure
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const nicknameRef = useRef(nickname);
  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

  const isScrolledUpRef = useRef(isScrolledUp);
  useEffect(() => {
    isScrolledUpRef.current = isScrolledUp;
  }, [isScrolledUp]);

  // Lazy load audio utility properties to avoid server-side render mismatch
  const audioRef = useRef<{
    playReceiveSound: () => void;
    playSendSound: () => void;
    playUnreadReceiveSound: () => void;
    triggerHaptic: (type: 'light' | 'success' | 'double') => void;
  } | null>(null);

  useEffect(() => {
    import('@/lib/audio-effects').then((module) => {
      audioRef.current = module;
    });
  }, []);

  // 1. Update nickname and clientId post-hydrate
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

      let storedClientId = localStorage.getItem('ghostroom_client_id');
      if (!storedClientId) {
        storedClientId = 'client-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('ghostroom_client_id', storedClientId);
      }
      setClientId(storedClientId);
    }
  }, []);

  // 2. Initialise Socket IO Client connection on mount
  useEffect(() => {
    // Socket.IO client auto-resolves to current browser window host
    const socketClient = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 3000, // Short timeout for faster fallback to polling on Vercel
      transports: ['websocket'], // Crucial for multi-replica Cloud Run deployments to bypass session stickiness issues on HTTP polling
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
        if (newMsg.nickname !== nicknameRef.current) {
          if (soundEnabledRef.current && audioRef.current) {
            if (isScrolledUpRef.current) {
              audioRef.current.playUnreadReceiveSound();
            } else {
              audioRef.current.playReceiveSound();
            }
          }
          if (audioRef.current) {
            audioRef.current.triggerHaptic('success');
          }
        }

        return [...prev, newMsg];
      });
    });

    socketClient.on('user_count', (count: number) => {
      setOnlineCount(count);
    });

    socketClient.on('typing', (data: { nickname: string }) => {
      if (data.nickname && data.nickname !== nicknameRef.current) {
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
  }, []);

  // 3. Polling loop fallback when Socket.io is unavailable (e.g. on Vercel serverless)
  useEffect(() => {
    if (!isPollingMode || !nickname || !clientId) return;

    const fetchPoll = async () => {
      try {
        const res = await fetch(`/api/messages?nickname=${encodeURIComponent(nickname)}&clientId=${encodeURIComponent(clientId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setMessages((prev) => {
              // Extract any optimistic messages currently in the local state
              const optimisticMsgs = prev.filter((m) => m.id.startsWith('optimistic-'));
              
              // Filter out optimistic messages that have been confirmed by the server response
              const pendingOptimistics = optimisticMsgs.filter((opt) => {
                const isConfirmed = data.messages.some((m: Message) => 
                  m.nickname === opt.nickname &&
                  m.text === opt.text &&
                  Math.abs(m.createdAt - opt.createdAt) < 15000
                );
                return !isConfirmed;
              });
              
              // Check for new incoming messages from other users to trigger audio/haptics
              const newIncoming = data.messages.filter((m: Message) => 
                !prev.some((p) => p.id === m.id) && m.nickname !== nicknameRef.current
              );

              if (newIncoming.length > 0) {
                if (soundEnabledRef.current && audioRef.current) {
                  if (isScrolledUpRef.current) {
                    audioRef.current.playUnreadReceiveSound();
                  } else {
                    audioRef.current.playReceiveSound();
                  }
                }
                if (audioRef.current) {
                  audioRef.current.triggerHaptic('success');
                }
              }

              // Merge server messages with pending optimistic ones
              return [...data.messages, ...pendingOptimistics];
            });
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
  }, [isPollingMode, nickname, clientId]);

  // Actions
  const sendMessage = async (payload: SendMessagePayload, replyTo?: { id: string; nickname: string; text: string }) => {
    const messageType: MessageType = payload.type || (payload.memeAudio ? 'meme_audio' : 'text');
    const outgoingText =
      payload.text || payload.memeAudio?.title || (messageType === 'meme_audio' ? 'Meme sound' : '');
    if (messageType === 'text' && !outgoingText.trim()) {
      setError('Cannot whisper empty voids.');
      return;
    }
    if (isPollingMode) {
      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const optimisticMessage: Message = {
        id: tempId,
        nickname,
        text: outgoingText,
        createdAt: Date.now(),
        replyToId: replyTo?.id,
        replyToNickname: replyTo?.nickname,
        replyToText: replyTo?.text,
        type: messageType,
        memeAudio: payload.memeAudio,
      };

      // Play sound + haptic immediately for responsive feedback
      if (soundEnabledRef.current && audioRef.current) {
        audioRef.current.playSendSound();
      }
      if (audioRef.current) {
        audioRef.current.triggerHaptic('success');
      }

      // Append locally immediately
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            nickname, 
            text: outgoingText,
            type: messageType,
            memeAudio: payload.memeAudio,
            clientId,
            replyToId: replyTo?.id,
            replyToNickname: replyTo?.nickname,
            replyToText: replyTo?.text,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'A spatial anomaly occurred. Whisper failed.');
          // Remove the optimistic message on failure
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        const data = await res.json();
        if (data.success && data.message) {
          // Replace the optimistic message with the official server message
          setMessages((prev) => 
            prev.map((m) => m.id === tempId ? data.message : m)
          );
        }
      } catch (err) {
        console.error('Failed to send message in polling mode:', err);
        setError('Connection interrupted. Unable to reach a spatial gateway.');
        // Remove the optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
      return;
    }

    if (socket && isSocketConnected) {
      socket.emit('message', { 
        nickname, 
        text: outgoingText,
        type: messageType,
        memeAudio: payload.memeAudio,
        clientId,
        replyToId: replyTo?.id,
        replyToNickname: replyTo?.nickname,
        replyToText: replyTo?.text,
      });
      
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
        isScrolledUp,
        setIsScrolledUp,
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

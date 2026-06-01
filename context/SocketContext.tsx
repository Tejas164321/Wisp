'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { generateNickname } from '@/lib/nickname';
import { generateRoom, isValidRoomKey } from '@/lib/room-utils';
import type { ChatRoom, MemeAudio, Message, MessageType } from '@/lib/message-types';

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
  activeRoom: ChatRoom | null;
  joinedRooms: ChatRoom[];
  roomJoinError: string | null;
  isJoiningRoom: boolean;
  createRoom: () => ChatRoom;
  joinRoom: (roomKey: string, roomNameHint?: string) => Promise<boolean>;
  switchRoom: (roomKey: string) => Promise<boolean>;
  leaveRoom: () => void;
  exitRoom: () => void;
  clearRoomError: () => void;
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

const ACTIVE_ROOM_STORAGE_KEY = 'ghostroom_active_room';
const JOINED_ROOMS_STORAGE_KEY = 'ghostroom_joined_rooms';
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
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [joinedRooms, setJoinedRooms] = useState<ChatRoom[]>([]);
  const [roomJoinError, setRoomJoinError] = useState<string | null>(null);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const rememberRoom = (room: ChatRoom) => {
    setJoinedRooms((prev) => {
      const next = [room, ...prev.filter((item) => item.key !== room.key)];
      return next.slice(0, 20);
    });
  };

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCurrentlyTypingRef = useRef(false);
  const pendingJoinResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const pendingJoinRoomRef = useRef<ChatRoom | null>(null);
  const joinedRoomKeyRef = useRef<string | null>(null);

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

  const activeRoomRef = useRef<ChatRoom | null>(activeRoom);
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  const joinedRoomsRef = useRef<ChatRoom[]>(joinedRooms);
  useEffect(() => {
    joinedRoomsRef.current = joinedRooms;
    if (typeof window !== 'undefined') {
      localStorage.setItem(JOINED_ROOMS_STORAGE_KEY, JSON.stringify(joinedRooms));
    }
  }, [joinedRooms]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let storedNickname = localStorage.getItem('ghostroom_nickname');
    if (!storedNickname) {
      storedNickname = generateNickname();
      localStorage.setItem('ghostroom_nickname', storedNickname);
    }
    setTimeout(() => {
      setNickname(storedNickname);
    }, 0);

    let storedClientId = localStorage.getItem('ghostroom_client_id');
    if (!storedClientId) {
      storedClientId = `client-${Math.random().toString(36).substring(2, 15)}${Date.now().toString(36)}`;
      localStorage.setItem('ghostroom_client_id', storedClientId);
    }
    setTimeout(() => {
      setClientId(storedClientId);
    }, 0);

    const storedRoomsRaw = localStorage.getItem(JOINED_ROOMS_STORAGE_KEY);
    let storedRooms: ChatRoom[] = [];
    if (storedRoomsRaw) {
      try {
        const parsedRooms = JSON.parse(storedRoomsRaw);
        if (Array.isArray(parsedRooms)) {
          storedRooms = parsedRooms
            .filter((room): room is ChatRoom => Boolean(room?.key && room?.name && isValidRoomKey(room.key)))
            .slice(0, 20);
          setTimeout(() => {
            setJoinedRooms(storedRooms);
          }, 0);
        }
      } catch {
        localStorage.removeItem(JOINED_ROOMS_STORAGE_KEY);
      }
    }

    const storedRoomRaw = localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
    if (storedRoomRaw) {
      try {
        const parsed = JSON.parse(storedRoomRaw) as ChatRoom;
        if (parsed?.key && parsed?.name && isValidRoomKey(parsed.key)) {
          if (!storedRooms.some((room) => room.key === parsed.key)) {
            setTimeout(() => {
              setJoinedRooms((prev) => [parsed, ...prev].slice(0, 20));
            }, 0);
          }
          setTimeout(() => {
            setActiveRoom({ key: parsed.key, name: parsed.name });
          }, 0);
        } else {
          localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const socketClient = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 3000,
      transports: ['websocket'],
    });

    let fallbackTimeout: NodeJS.Timeout;
    fallbackTimeout = setTimeout(() => {
      setIsPollingMode(true);
    }, 2500);

    socketClient.on('connect', () => {
      clearTimeout(fallbackTimeout);
      setIsSocketConnected(true);
      setIsPollingMode(false);
      setError(null);
      const room = activeRoomRef.current;
      if (room) {
        socketClient.emit('join_room', { roomKey: room.key, roomName: room.name });
      }
    });

    socketClient.on('room_required', () => {
      const room = activeRoomRef.current;
      if (room) {
        socketClient.emit('join_room', { roomKey: room.key, roomName: room.name });
      }
    });

    socketClient.on('room_joined', (room: ChatRoom) => {
      joinedRoomKeyRef.current = room.key;
      setActiveRoom(room);
      rememberRoom(room);
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, JSON.stringify(room));
      }
      setRoomJoinError(null);
      setIsJoiningRoom(false);
      setMessages([]);
      if (pendingJoinResolverRef.current) {
        pendingJoinResolverRef.current(true);
        pendingJoinResolverRef.current = null;
        pendingJoinRoomRef.current = null;
      }
    });

    socketClient.on('room_join_failed', (payload: { reason?: string }) => {
      joinedRoomKeyRef.current = null;
      setIsJoiningRoom(false);
      setRoomJoinError(payload?.reason || 'Unable to join this room.');
      if (pendingJoinResolverRef.current) {
        pendingJoinResolverRef.current(false);
        pendingJoinResolverRef.current = null;
      }
      pendingJoinRoomRef.current = null;
    });

    socketClient.on('disconnect', () => {
      setIsSocketConnected(false);
      setIsPollingMode(true);
    });

    socketClient.on('connect_error', () => {
      clearTimeout(fallbackTimeout);
      setIsPollingMode(true);
    });

    socketClient.on('history', (historyMessages: Message[]) => {
      setMessages(historyMessages);
      setTypingUsers([]);
    });

    socketClient.on('message', (newMsg: Message) => {
      if (!activeRoomRef.current) return;
      if (!newMsg.roomKey || newMsg.roomKey !== activeRoomRef.current.key) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          return prev;
        }

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
        setTypingUsers([]);
      }
    });

    socketClient.on('error', (errMessage: string) => {
      setError(errMessage);
      setTimeout(() => {
        setError((current) => (current === errMessage ? null : current));
      }, 4000);
    });

    setSocket(socketClient);
    return () => {
      clearTimeout(fallbackTimeout);
      socketClient.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !isSocketConnected || !activeRoom) return;
    if (joinedRoomKeyRef.current === activeRoom.key) return;
    socket.emit('join_room', { roomKey: activeRoom.key, roomName: activeRoom.name });
  }, [socket, isSocketConnected, activeRoom]);

  useEffect(() => {
    if (!isPollingMode || !nickname || !clientId || !activeRoom) return;

    const fetchPoll = async () => {
      try {
        const res = await fetch(
          `/api/messages?nickname=${encodeURIComponent(nickname)}&clientId=${encodeURIComponent(clientId)}&roomKey=${encodeURIComponent(activeRoom.key)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.messages) {
            setMessages((prev) => {
              const optimisticMsgs = prev.filter((m) => m.id.startsWith('optimistic-'));
              const pendingOptimistics = optimisticMsgs.filter((opt) => {
                const isConfirmed = data.messages.some(
                  (m: Message) => m.nickname === opt.nickname && m.text === opt.text && Math.abs(m.createdAt - opt.createdAt) < 15000
                );
                return !isConfirmed;
              });

              const newIncoming = data.messages.filter(
                (m: Message) => !prev.some((p) => p.id === m.id) && m.nickname !== nicknameRef.current
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
    return () => clearInterval(interval);
  }, [isPollingMode, nickname, clientId, activeRoom]);

  const clearRoomError = () => setRoomJoinError(null);

  const createRoom = (): ChatRoom => {
    const room = generateRoom();
    setMessages([]);
    setTypingUsers([]);
    setOnlineCount(1);
    setIsJoiningRoom(true);
    setRoomJoinError(null);
    pendingJoinRoomRef.current = room;
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, JSON.stringify(room));
    }
    rememberRoom(room);
    setActiveRoom(room);
    if (socket && isSocketConnected) {
      joinedRoomKeyRef.current = null;
      socket.emit('join_room', { roomKey: room.key, roomName: room.name });
    } else {
      setIsJoiningRoom(false);
    }
    return room;
  };

  const joinRoom = async (roomKeyInput: string, roomNameHint?: string): Promise<boolean> => {
    const key = roomKeyInput.trim();
    if (!isValidRoomKey(key)) {
      setRoomJoinError('Room key must be exactly 4 digits.');
      return false;
    }

    setMessages([]);
    setTypingUsers([]);
    setOnlineCount(1);
    setIsJoiningRoom(true);
    setRoomJoinError(null);
    const existingRoom = joinedRoomsRef.current.find((item) => item.key === key);
    const room: ChatRoom = {
      key,
      name: roomNameHint || existingRoom?.name || pendingJoinRoomRef.current?.name || `Room-${key}`,
    };

    if (socket && isSocketConnected) {
      return new Promise((resolve) => {
        pendingJoinResolverRef.current = resolve;
        pendingJoinRoomRef.current = room;
        joinedRoomKeyRef.current = null;
        socket.emit('join_room', { roomKey: key });
      });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, JSON.stringify(room));
    }
    rememberRoom(room);
    setActiveRoom(room);
    setIsJoiningRoom(false);
    return true;
  };

  const switchRoom = async (roomKey: string): Promise<boolean> => {
    const targetRoom = joinedRoomsRef.current.find((room) => room.key === roomKey);
    if (!targetRoom) {
      setRoomJoinError('Room not found in your recent rooms.');
      return false;
    }
    if (activeRoomRef.current?.key === targetRoom.key) {
      return true;
    }
    return joinRoom(targetRoom.key, targetRoom.name);
  };

  const exitRoom = () => {
    if (socket && isSocketConnected) {
      socket.emit('leave_room');
    }
    joinedRoomKeyRef.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    }
    setActiveRoom(null);
    setMessages([]);
    setTypingUsers([]);
    setOnlineCount(1);
    setRoomJoinError(null);
    setIsJoiningRoom(false);
    if (pendingJoinResolverRef.current) {
      pendingJoinResolverRef.current(false);
      pendingJoinResolverRef.current = null;
    }
    pendingJoinRoomRef.current = null;
  };

  const leaveRoom = () => {
    const roomToLeave = activeRoomRef.current;
    if (!roomToLeave) {
      return;
    }
    if (socket && isSocketConnected) {
      socket.emit('leave_room');
    }
    joinedRoomKeyRef.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
    }
    setJoinedRooms((prev) => prev.filter((room) => room.key !== roomToLeave.key));
    setActiveRoom(null);
    setMessages([]);
    setTypingUsers([]);
    setOnlineCount(1);
    setRoomJoinError(null);
    setIsJoiningRoom(false);
    if (pendingJoinResolverRef.current) {
      pendingJoinResolverRef.current(false);
      pendingJoinResolverRef.current = null;
    }
    pendingJoinRoomRef.current = null;
  };

  const sendMessage = async (payload: SendMessagePayload, replyTo?: { id: string; nickname: string; text: string }) => {
    if (!activeRoom) {
      setError('Create or join a room first.');
      return;
    }

    const messageType: MessageType = payload.type || (payload.memeAudio ? 'meme_audio' : 'text');
    const outgoingText = payload.text || payload.memeAudio?.title || (messageType === 'meme_audio' ? 'Meme sound' : '');
    if (messageType === 'text' && !outgoingText.trim()) {
      setError('Cannot whisper empty voids.');
      return;
    }

    if (isPollingMode) {
      const now = Math.max((messages[messages.length - 1]?.createdAt || 0) + 1, 1);
      const tempId = `optimistic-${globalThis.crypto?.randomUUID?.() || `${clientId}-${now}`}`;
      const optimisticMessage: Message = {
        id: tempId,
        nickname,
        text: outgoingText,
        createdAt: now,
        roomKey: activeRoom.key,
        replyToId: replyTo?.id,
        replyToNickname: replyTo?.nickname,
        replyToText: replyTo?.text,
        type: messageType,
        memeAudio: payload.memeAudio,
      };

      if (soundEnabledRef.current && audioRef.current) {
        audioRef.current.playSendSound();
      }
      if (audioRef.current) {
        audioRef.current.triggerHaptic('success');
      }

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
            roomKey: activeRoom.key,
            replyToId: replyTo?.id,
            replyToNickname: replyTo?.nickname,
            replyToText: replyTo?.text,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'A spatial anomaly occurred. Whisper failed.');
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }

        const data = await res.json();
        if (data.success && data.message) {
          setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
        }
      } catch (err) {
        console.error('Failed to send message in polling mode:', err);
        setError('Connection interrupted. Unable to reach a spatial gateway.');
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
        roomKey: activeRoom.key,
        replyToId: replyTo?.id,
        replyToNickname: replyTo?.nickname,
        replyToText: replyTo?.text,
      });

      if (soundEnabledRef.current && audioRef.current) {
        audioRef.current.playSendSound();
      }
      if (audioRef.current) {
        audioRef.current.triggerHaptic('success');
      }

      sendTypingStatus(false);
    } else {
      setError('Connection interrupted. Unable to reach a spatial gateway.');
    }
  };

  const sendTypingStatus = (isTyping: boolean) => {
    if (!activeRoom) return;
    if (isPollingMode) return;
    if (!socket || !isSocketConnected) return;

    if (isCurrentlyTypingRef.current === isTyping) return;
    isCurrentlyTypingRef.current = isTyping;

    if (isTyping) {
      socket.emit('typing', { nickname, roomKey: activeRoom.key });
    } else {
      socket.emit('stop_typing', { nickname, roomKey: activeRoom.key });
    }

    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(false);
      }, 4000);
    } else if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
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

    if (socket && isSocketConnected) {
      socket.emit('stop_typing', { nickname: oldNickname });
    }

    setNickname(freshNickname);
  };

  const toggleSoundEnabled = () => {
    setSoundEnabled((prev) => {
      const nextVal = !prev;
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
        activeRoom,
        joinedRooms,
        roomJoinError,
        isJoiningRoom,
        createRoom,
        joinRoom,
        switchRoom,
        leaveRoom,
        exitRoom,
        clearRoomError,
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

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { 
  Ghost, 
  Send, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Sparkle,
  Clock,
  AlertCircle,
  Volume2,
  VolumeX,
  ArrowDown,
  CornerUpLeft,
  X,
  Download,
  Search,
  ExternalLink,
  AudioLines,
  Plus,
  LogOut,
  DoorOpen,
  UserRound,
  Palette,
  ListTree,
  Copy,
  Check,
  Hash,
  ArrowRight
} from 'lucide-react';
import { useSocketState } from '@/context/SocketContext';
import { useTheme } from '@/context/ThemeContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { MemeAudio, Message, ChatRoom } from '@/lib/message-types';
import { getMemeAudioPreviewLabel } from '@/lib/meme-utils';
import { generateRoomName } from '@/lib/room-utils';

const MEME_PROVIDER_LABELS: Record<MemeAudio['provider'], string> = {
  myinstants: 'MyInstants',
  voicy: 'Voicy',
  soundboard101: '101Soundboards',
  freesound: 'Freesound',
  pixabay: 'Pixabay',
  mixkit: 'Mixkit',
};

function getMemeAudioSourceUrl(memeAudio?: MemeAudio): string {
  if (!memeAudio) return '';
  const sourceUrl = memeAudio.previewUrl || memeAudio.sourceUrl;
  if (!sourceUrl) return '';
  if (memeAudio.provider === 'myinstants') {
    return `/api/memes/stream?url=${encodeURIComponent(sourceUrl)}`;
  }
  return sourceUrl;
}

interface MessageBubbleProps {
  line: {
    id: string;
    text: string;
    createdAt: number;
    replyToId?: string;
    replyToNickname?: string;
    replyToText?: string;
    type?: Message['type'];
    memeAudio?: MemeAudio;
  };
  groupNickname: string;
  isSelf: boolean;
  index: number;
  formatTime: (timestamp: number) => string;
  onReply: (msg: { id: string; nickname: string; text: string }) => void;
  isTargetGhosted: boolean;
}

function MessageBubble({
  line,
  groupNickname,
  isSelf,
  index,
  formatTime,
  onReply,
  isTargetGhosted
}: MessageBubbleProps) {
  const dragX = useMotionValue(0);
  const iconOpacity = useTransform(dragX, isSelf ? [0, -32] : [0, 32], [0, 1]);
  const iconScale = useTransform(dragX, isSelf ? [0, -32] : [0, 32], [0.8, 1.1]);

  const [scaleState, setScaleState] = useState(1);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isMemeAudio = line.type === 'meme_audio' && line.memeAudio;
  const messagePreview = isMemeAudio ? getMemeAudioPreviewLabel(line.memeAudio) : (line.text || '');
  const providerLabel = line.memeAudio?.provider ? MEME_PROVIDER_LABELS[line.memeAudio.provider] : undefined;
  const memeAudioSource = isMemeAudio ? getMemeAudioSourceUrl(line.memeAudio) : '';

  const triggerReply = () => {
    onReply({ id: line.id, nickname: groupNickname, text: messagePreview });
    // Play bounce scale animation
    setScaleState(1.06);
    setTimeout(() => setScaleState(1), 150);
    // Haptic vibe
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(15);
    }
  };

  // Handle touch events for mobile long press
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      triggerReply();
    }, 550); // 550ms hold triggers reply
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  // Handle mouse events for desktop hold
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click hold
    longPressTimer.current = setTimeout(() => {
      triggerReply();
    }, 550);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleQuoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!line.replyToId || isTargetGhosted) return;
    const el = document.getElementById(`msg-${line.replyToId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('reply-highlight');
      setTimeout(() => {
        el.classList.remove('reply-highlight');
      }, 1200);
    }
  };

  const borderStyles = isSelf 
    ? 'bg-violet-50/80 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-500/30 text-violet-900 dark:text-violet-200 rounded-2xl rounded-tr-sm shadow-sm' 
    : 'bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-tl-sm shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4)]';

  return (
    <div className="relative group/bubble flex items-center w-full my-0.5">
      {/* Underlying swipe disclosure reply icon */}
      <motion.div 
        style={{ opacity: iconOpacity, scale: iconScale }}
        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center p-1.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 pointer-events-none ${
          isSelf ? 'left-full ml-3' : 'right-full mr-3'
        }`}
      >
        <CornerUpLeft className="h-4 w-4" />
      </motion.div>

      {/* Main draggable bubble */}
      <motion.div
        id={`msg-${line.id}`}
        drag="x"
        dragDirectionLock
        style={{ x: dragX }}
        dragConstraints={isSelf ? { left: -32, right: 0 } : { left: 0, right: 32 }}
        dragElastic={0.1}
        onDragEnd={(event, info) => {
          const threshold = isSelf ? -24 : 24;
          const didSwipe = isSelf ? info.offset.x < threshold : info.offset.x > threshold;
          if (didSwipe) {
            triggerReply();
          }
          // Smooth spring snap back
          animate(dragX, 0, { type: 'spring', stiffness: 380, damping: 38 });
        }}
        animate={{ scale: scaleState }}
        transition={{ type: "spring", stiffness: 350, damping: 20 }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className={`relative px-4 py-2.5 transition-all select-text cursor-grab active:cursor-grabbing w-fit max-w-full ${borderStyles}`}
      >
        {/* Reply Quote header context inside the bubble */}
        {line.replyToId && (
          <div 
            onClick={isTargetGhosted ? undefined : handleQuoteClick}
            className={`flex flex-col border-l-2 pl-2.5 py-1 mb-2 rounded text-[11px] select-none transition-opacity ${
              isTargetGhosted 
                ? 'opacity-60 cursor-not-allowed border-zinc-400 dark:border-zinc-700 bg-zinc-200/20 dark:bg-zinc-800/10 text-zinc-400 dark:text-zinc-550'
                : 'cursor-pointer hover:opacity-85 ' + (isSelf 
                    ? 'bg-violet-100/60 dark:bg-violet-950/40 border-violet-300/85 dark:border-violet-500/30 text-violet-850 dark:text-violet-300' 
                    : 'bg-zinc-50 dark:bg-zinc-800/80 border-violet-500 text-zinc-500 dark:text-zinc-400')
            }`}
          >
            <div className="flex items-center justify-between gap-1.5 mb-0.5">
              <span className="font-bold font-mono">@{line.replyToNickname}</span>
              {isTargetGhosted && (
                <span className="flex items-center text-[9px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-200/50 dark:bg-zinc-800/50 px-1 rounded">
                  Ghosted
                </span>
              )}
            </div>
            <span className="truncate max-w-[200px] italic flex items-center gap-1">
              {isTargetGhosted ? (
                <>
                  <X className="h-3 w-3 inline shrink-0" />
                  <span>Whisper faded into the void...</span>
                </>
              ) : (
                line.replyToText
              )}
            </span>
          </div>
        )}

        {isMemeAudio ? (
          <div className="flex flex-col gap-2 min-w-[220px]">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100/70 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300">
                <AudioLines className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {line.memeAudio?.title}
                </span>
                <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                  {providerLabel}
                </span>
              </div>
              {line.memeAudio?.pageUrl && (
                <a
                  href={line.memeAudio.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200/70 dark:border-zinc-700/70 text-zinc-400 hover:text-violet-500 hover:border-violet-300 dark:hover:border-violet-600 transition-colors"
                  title="Open source"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <audio
              controls
              preload="none"
              className="w-full h-9 rounded-lg"
              src={memeAudioSource}
            />
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{line.text}</p>
        )}
        
        {/* Hover visual timestamp */}
        {index > 0 && (
          <span 
            className={`absolute hidden group-hover/bubble:inline-block text-[10px] text-zinc-400 dark:text-zinc-655 font-mono -bottom-3.5 ${
              isSelf ? 'right-1' : 'left-1'
            }`}
          >
            {formatTime(line.createdAt)}
          </span>
        )}
      </motion.div>

      {/* Side-hover shortcuts for desktop experience */}
      <button
        onClick={triggerReply}
        className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-md opacity-0 group-hover/bubble:opacity-100 hover:scale-110 active:scale-90 transition-all text-zinc-500 hover:text-violet-600 dark:text-zinc-400 dark:hover:text-violet-400 cursor-pointer hidden md:flex ${
          isSelf ? 'right-full mr-2' : 'left-full ml-2'
        }`}
        title="Reply to message"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function Home() {
  const {
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
    activeRoom,
    joinedRooms,
    roomJoinError,
    isJoiningRoom,
    createRoom,
    joinRoom,
    switchRoom,
    leaveRoom,
    exitRoom,
    clearRoomError
  } = useSocketState();

  const { theme, toggleTheme } = useTheme();
  const { isSupported: isPushSupported, subscription: pushSubscription, permission, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string; text: string } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<ChatRoom | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pendingRoomName, setPendingRoomName] = useState('');

  const [inputVal, setInputVal] = useState('');
  const [composerMode, setComposerMode] = useState<'text' | 'meme'>('text');
  const [memeQuery, setMemeQuery] = useState('');
  const [memeResults, setMemeResults] = useState<MemeAudio[]>([]);
  const [memeLoading, setMemeLoading] = useState(false);
  const [memeError, setMemeError] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showRoomTools, setShowRoomTools] = useState(false);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [joinRoomKey, setJoinRoomKey] = useState('');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const memeSearchRequestIdRef = useRef(0);
  const memeSearchAbortRef = useRef<AbortController | null>(null);
  const [viewportHeight, setViewportHeight] = useState('100dvh');

  const isScrolledUpRef = useRef(isScrolledUp);
  useEffect(() => {
    isScrolledUpRef.current = isScrolledUp;
  }, [isScrolledUp]);

  useEffect(() => {
    return () => {
      memeSearchAbortRef.current?.abort();
    };
  }, []);

  // Capture PWA install prompt event
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show banner if user hasn't dismissed it before
      const dismissed = localStorage.getItem('wisp_pwa_dismissed');
      if (!dismissed) setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    // Hide banner if app already installed
    window.addEventListener('appinstalled', () => {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    });
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    localStorage.setItem('wisp_pwa_dismissed', 'true');
  };

  // Track mobile visual viewport size dynamically to handle on-screen keyboard
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      if (window.visualViewport) {
        setViewportHeight(`${window.visualViewport.height}px`);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  // Auto-grow textarea height to match its content dynamically
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 80);
    textarea.style.height = `${newHeight}px`;
  }, [inputVal]);

  // Monitor the client-side whisper rate-limit cooldown
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const interval = setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownLeft]);

  // Auto-scroll to bottom of message list on state updates
  useEffect(() => {
    // Check if user already dismissed welcome flow
    const dismissed = localStorage.getItem('wisp_welcome_dismissed');
    if (!dismissed) {
      const handle = setTimeout(() => {
        setShowWelcome(true);
      }, 50);
      return () => clearTimeout(handle);
    }
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem('wisp_welcome_dismissed', 'true');
    setShowWelcome(false);
    // Seamlessly prompt for push notifications on first real interaction
    if (isPushSupported && !pushSubscription && permission === 'default') {
      subscribePush();
    }
  };

  const handleConfirmCreateRoom = () => {
    clearRoomError();
    setShowRoomTools(false);
    setShowProfileMenu(false);
    createRoom(pendingRoomName.trim() || undefined);
    setShowCreateModal(false);
  };

  const handleConfirmLeaveRoom = () => {
    leaveRoom(pendingRoom?.key);
    setShowLeaveModal(false);
    setPendingRoom(null);
  };

  const handleCreateRoom = () => {
    clearRoomError();
    const defaultName = generateRoomName();
    setPendingRoomName(defaultName);
    setShowCreateModal(true);
  };

  const handleJoinRoom = async () => {
    clearRoomError();
    const success = await joinRoom(joinRoomKey);
    if (success) {
      setJoinRoomKey('');
    }
  };

  const handleSwitchRoom = async (roomKey: string) => {
    clearRoomError();
    await switchRoom(roomKey);
    setShowProfileMenu(false);
  };

  const toggleRoomTools = () => {
    clearRoomError();
    setShowRoomTools((prev) => !prev);
    setShowProfileMenu(false);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current;
      scrollContainerRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior
      });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Threshold is 60px from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (isAtBottom) {
      setIsScrolledUp(false);
      setUnreadCount(0);
    } else {
      setIsScrolledUp(true);
    }
  };

  const prevMessagesLength = useRef(0);

  // Run scroll to bottom or handle unread count when messages update
  useEffect(() => {
    const prevCount = prevMessagesLength.current;
    prevMessagesLength.current = messages.length;

    if (messages.length === 0) return;

    // Initial load of messages: scroll to bottom instantly
    if (prevCount === 0) {
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 50);
      return () => clearTimeout(timer);
    }

    // Check if new messages were added
    if (messages.length > prevCount) {
      const lastMsg = messages[messages.length - 1];
      const sentBySelf = lastMsg?.nickname === nickname;

      if (sentBySelf) {
        // If sent by ourselves, always scroll to bottom immediately and clear unreads
        const timer = setTimeout(() => {
          scrollToBottom('smooth');
          setUnreadCount(0);
        }, 50);
        return () => clearTimeout(timer);
      } else {
        // Sent by someone else
        if (isScrolledUpRef.current) {
          // Scrolled up: increment unread count without pulling view
          setUnreadCount((c) => c + 1);
        } else {
          // At the bottom: auto scroll
          const timer = setTimeout(() => {
            scrollToBottom('smooth');
            setUnreadCount(0);
          }, 50);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [messages, nickname]);

  // Handle typing indicator scrolling if at the bottom
  useEffect(() => {
    if (!isScrolledUpRef.current && typingUsers.length > 0) {
      const timer = setTimeout(() => {
        scrollToBottom('smooth');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [typingUsers]);

  // Handle client-side typing indicator debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= 200) {
      setInputVal(val);
    }

    // Handle typing indicator emission
    if (!isTypingLocal) {
      setIsTypingLocal(true);
      sendTypingStatus(true);
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    
    typingTimerRef.current = setTimeout(() => {
      setIsTypingLocal(false);
      sendTypingStatus(false);
    }, 2500);
  };

  // Keyboard controls
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      setReplyTo(null);
    }
  };

  // Dispatch message send
  const handleSend = () => {
    if (cooldownLeft > 0) return;
    const cleanMsg = inputVal.trim();
    if (!cleanMsg) return;

    sendMessage({ type: 'text', text: cleanMsg }, replyTo || undefined);
    setReplyTo(null);
    setInputVal('');
    setIsTypingLocal(false);
    sendTypingStatus(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    
    // Set 5-second rate limit cooldown to prevent spamming
    setCooldownLeft(5);

    // Prompt for push notifications if they haven't been asked yet
    if (isPushSupported && !pushSubscription && permission === 'default') {
      subscribePush();
    }

    // Re-focus textarea to guarantee keyboard stays open on all mobile devices
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleMemeSearch = async () => {
    const searchTerm = memeQuery.trim();
    if (!searchTerm) {
      setMemeError('Type a search term to find sounds.');
      setMemeResults([]);
      return;
    }

    memeSearchAbortRef.current?.abort();
    const requestId = memeSearchRequestIdRef.current + 1;
    memeSearchRequestIdRef.current = requestId;
    const controller = new AbortController();
    memeSearchAbortRef.current = controller;

    setMemeResults([]);
    setMemeLoading(true);
    setMemeError(null);

    try {
      const res = await fetch(`/api/memes?q=${encodeURIComponent(searchTerm)}`, { signal: controller.signal });
      if (requestId !== memeSearchRequestIdRef.current) return;
      const data = await res.json();
      if (!res.ok) {
        setMemeError(data.error || 'Meme search failed.');
        setMemeResults([]);
        return;
      }
      setMemeResults(data.results || []);
      if (!data.results || data.results.length === 0) {
        setMemeError('No meme sounds found.');
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      if (requestId !== memeSearchRequestIdRef.current) return;
      setMemeError('Meme search failed.');
      setMemeResults([]);
    } finally {
      if (requestId === memeSearchRequestIdRef.current) {
        setMemeLoading(false);
      }
    }
  };

  const handleSendMeme = (memeAudio: MemeAudio) => {
    if (!isConnected || cooldownLeft > 0) return;

    sendMessage({ type: 'meme_audio', text: memeAudio.title, memeAudio }, replyTo || undefined);
    setReplyTo(null);
    setComposerMode('text');
    setMemeQuery('');
    setMemeResults([]);
    setMemeError(null);

    setCooldownLeft(5);

    if (isPushSupported && !pushSubscription && permission === 'default') {
      subscribePush();
    }

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Helper: Format timestamp (e.g., 10:45 AM)
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper: Format exact date header (e.g., "MAY 21, 2026")
  const formatDateHeader = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group consecutive messages by user within 2 minutes
  const renderMessageGroups = () => {
    if (messages.length === 0) return null;

    const grouped: any[] = [];
    let currentGroup: any = null;

    messages.forEach((msg, idx) => {
      const prevMsg = messages[idx - 1];
      const isConsecutiveUser = prevMsg && prevMsg.nickname === msg.nickname;
      const isWithinTimeThreshold = prevMsg && (msg.createdAt - prevMsg.createdAt) < 2 * 60 * 1000; // 2 minutes

      if (isConsecutiveUser && isWithinTimeThreshold) {
        currentGroup.lines.push({
          id: msg.id,
          text: msg.text,
          createdAt: msg.createdAt,
          replyToId: msg.replyToId,
          replyToNickname: msg.replyToNickname,
          replyToText: msg.replyToText,
          type: msg.type,
          memeAudio: msg.memeAudio,
        });
      } else {
        if (currentGroup) {
          grouped.push(currentGroup);
        }
        currentGroup = {
          id: msg.id,
          nickname: msg.nickname,
          baseTimestamp: msg.createdAt,
          lines: [{
            id: msg.id,
            text: msg.text,
            createdAt: msg.createdAt,
            replyToId: msg.replyToId,
            replyToNickname: msg.replyToNickname,
            replyToText: msg.replyToText,
            type: msg.type,
            memeAudio: msg.memeAudio,
          }]
        };
      }
    });

    if (currentGroup) {
      grouped.push(currentGroup);
    }

    return grouped.map((group) => {
      const isSelf = group.nickname === nickname;

      return (
        <motion.div
          key={group.id}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-col mb-4 ${isSelf ? 'items-end' : 'items-start'}`}
        >
          {/* Header block for message group (Name + first timestamp) */}
          <div className={`flex items-center mb-1 gap-1.5 px-1 select-none ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
            <span className="font-mono text-[9px] tracking-wide text-zinc-400/70 dark:text-zinc-500/60">
              {group.nickname}
            </span>
            <span className="text-[8px] font-mono text-zinc-300/80 dark:text-zinc-600/70">
              {formatTime(group.baseTimestamp)}
            </span>
          </div>

          {/* List of lines written by that user in succession */}
          <div className={`flex flex-col space-y-1.5 max-w-[85%] md:max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}>
            {group.lines.map((line: any, index: number) => {
              const isTargetGhosted = line.replyToId ? !messages.some((m: any) => m.id === line.replyToId) : false;
              return (
                <MessageBubble
                  key={line.id}
                  line={line}
                  groupNickname={group.nickname}
                  isSelf={isSelf}
                  index={index}
                  formatTime={formatTime}
                  onReply={setReplyTo}
                  isTargetGhosted={isTargetGhosted}
                />
              );
            })}
          </div>
        </motion.div>
      );
    });
  };

  if (!activeRoom) {
    return (
      <div style={{ height: viewportHeight }} className="relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 overflow-hidden animate-fade-in">
        {/* Ambient background glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-400/10 dark:bg-violet-600/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-400/10 dark:bg-indigo-600/5 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md rounded-3xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl p-5 sm:p-6 shadow-2xl relative z-10 flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
          <div className="text-center space-y-1.5 shrink-0">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 mb-1 border border-violet-200/30 dark:border-violet-800/30">
              <Ghost className="h-5 w-5 animate-float" />
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Choose your chat room
            </h1>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
              Create a private room or enter a 4-digit key to slip into an anonymous space.
            </p>
          </div>

          <div className="space-y-3.5 mt-4 shrink-0">
            {/* Create Room trigger */}
            <button
              onClick={handleCreateRoom}
              disabled={isJoiningRoom}
              className="w-full flex items-center justify-between gap-3 rounded-2xl border border-dashed border-zinc-200 hover:border-violet-500/50 dark:border-zinc-800 dark:hover:border-violet-500/40 bg-zinc-50/50 hover:bg-violet-50/20 dark:bg-zinc-900/30 dark:hover:bg-violet-950/10 p-3.5 sm:p-4 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 flex items-center justify-center transition-transform group-hover:scale-110">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {isJoiningRoom ? 'Creating...' : 'Create Room'}
                  </span>
                  <span className="block text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Start a new private room
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-0.5">
                Go <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </button>

            {/* Join Room inline group */}
            <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 p-3.5 sm:p-4">
              <div className="text-center sm:text-left">
                <span className="block text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Enter 4-digit room key
                </span>
                <span className="block text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Join an existing room key
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  value={joinRoomKey}
                  onChange={(e) => setJoinRoomKey(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  aria-label="Room key"
                  className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-sm font-mono tracking-[0.2em] text-center outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={joinRoomKey.length !== 4 || isJoiningRoom}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-4 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isJoiningRoom ? '...' : 'Join'}
                </button>
              </div>
            </div>
          </div>

          {roomJoinError && (
            <p className="text-xs text-red-500 text-center animate-pulse font-medium shrink-0 mt-2">{roomJoinError}</p>
          )}

          {/* Joined Rooms List (Single-Column for optimization and proper inner scroll) */}
          {joinedRooms.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/80 flex-1 flex flex-col min-h-0 overflow-hidden">
              <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 shrink-0 mb-2">
                <ListTree className="h-3.5 w-3.5" />
                Joined Rooms ({joinedRooms.length})
              </p>
              
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar min-h-0">
                {joinedRooms.map((room) => {
                  const isCopied = copiedKey === room.key;
                  return (
                    <motion.div
                      key={room.key}
                      whileHover={{ scale: 1.01, y: -0.5 }}
                      className="group relative flex items-center justify-between rounded-xl border border-zinc-200/60 dark:border-zinc-800/80 bg-white/40 dark:bg-zinc-900/40 p-2.5 transition-all duration-300 hover:border-violet-500/50 dark:hover:border-violet-500/40 hover:bg-white/80 dark:hover:bg-zinc-900/80 hover:shadow-md dark:hover:shadow-violet-950/25 cursor-pointer"
                      onClick={() => handleSwitchRoom(room.key)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="font-display font-semibold text-xs text-zinc-850 dark:text-zinc-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">
                          {room.name}
                        </span>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(room.key);
                            setCopiedKey(room.key);
                            setTimeout(() => setCopiedKey(null), 1500);
                          }}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-mono transition-all border shrink-0 ${
                            isCopied
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/50'
                              : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-450 border-zinc-200/20 dark:border-zinc-700/20 hover:border-violet-500/30 hover:text-violet-600 dark:hover:text-violet-400'
                          }`}
                          title="Copy key"
                        >
                          {isCopied ? <Check className="h-2.5 w-2.5" /> : null}
                          <span>{room.key}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[9px] font-semibold text-violet-650 dark:text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                          Enter <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingRoom(room);
                            setShowLeaveModal(true);
                          }}
                          className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                          title="Leave room"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentRoom = activeRoom;

  return (
    <>
      <div 
        style={{ height: viewportHeight }}
        className="flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-ghost-light-text dark:text-ghost-dark-text selection:bg-zinc-200 dark:selection:bg-zinc-800 w-full"
      >
      
      {/* Center column container to align header, chat track, and bottom bar */}
      <div className="mx-auto flex flex-col h-full w-full max-w-3xl relative px-4 sm:px-4">

      {/* 1. Header Navigation Bar */}
      <header className="sticky top-3 z-40 mt-3 mb-2 mx-auto w-full max-w-2xl rounded-3xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-md select-none transition-all shrink-0">
        <div className="flex w-full items-center gap-2 px-3 py-2 sm:h-14 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={toggleRoomTools}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                showRoomTools
                  ? 'border-violet-350 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/40'
                  : 'bg-zinc-200/50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800/30'
              }`}
              aria-label={showRoomTools ? 'Close room list' : 'Open room list'}
              title={showRoomTools ? 'Close room list' : 'Open room list'}
            >
              <Ghost className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </button>
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-display font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-55 shrink-0">Wisp</span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0 font-medium">·</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="block truncate text-[11px] font-semibold text-zinc-850 dark:text-zinc-200">
                  {currentRoom.name}
                </span>
                <span className="inline-flex items-center rounded-full bg-violet-50 dark:bg-violet-950/40 border border-violet-200/40 dark:border-violet-850 px-2.5 py-0.5 text-[10px] font-mono font-bold text-violet-600 dark:text-violet-400 shrink-0 tracking-wider shadow-sm">
                  {currentRoom.key}
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Repositioned active indicator left of wifi with just dot and count */}
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-500 select-none">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-mono">{onlineCount}</span>
            </div>

            <div className="text-xs">
              {isConnected ? (
                <span className="text-emerald-500" title="Connected">
                  <Wifi className="h-4 w-4" />
                </span>
              ) : (
                <span className="text-red-505" title="Reconnecting">
                  <WifiOff className="h-4 w-4 animate-pulse" />
                </span>
              )}
            </div>

            <button
              onClick={regenerateUserNickname}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/70 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
              aria-label="Refresh username"
              title="Refresh username"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setShowProfileMenu((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/70 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
              aria-label={showProfileMenu ? 'Close profile menu' : 'Open profile menu'}
              aria-expanded={showProfileMenu}
              title={showProfileMenu ? 'Close profile menu' : 'Profile menu'}
            >
              {showProfileMenu ? <X className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showProfileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="border-t border-zinc-205/60 dark:border-zinc-800/60 px-3 py-2.5 sm:px-4"
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleCreateRoom}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/70 dark:border-zinc-750 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create room
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/70 dark:border-zinc-750 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  id="theme_switch"
                >
                  <Palette className="h-3.5 w-3.5" />
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  onClick={toggleSoundEnabled}
                  id="sound_switch"
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/70 dark:border-zinc-750 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {soundEnabled ? 'Mute' : 'Unmute'}
                </button>
                <button
                  onClick={toggleRoomTools}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/70 dark:border-zinc-750 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700"
                >
                  <ListTree className="h-3.5 w-3.5" />
                  Rooms
                </button>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (activeRoom) {
                      setPendingRoom(activeRoom);
                      setShowLeaveModal(true);
                    }
                    setShowProfileMenu(false);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/40"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  Leave room
                </button>
                <button
                  onClick={() => {
                    exitRoom();
                    setShowProfileMenu(false);
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200/70 dark:border-red-900/50 bg-red-50 dark:bg-red-955/20 px-2.5 py-2 text-[11px] font-semibold text-red-650 dark:text-red-355 transition-colors hover:bg-red-100 dark:hover:bg-red-950/40"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Exit room
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <AnimatePresence>
        {showRoomTools && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mx-auto w-full max-w-2xl mb-2 shrink-0"
          >
            <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/90 dark:bg-zinc-900/80 px-3 py-3 backdrop-blur-sm shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Joined & created rooms
                </span>
                <button
                  onClick={() => setShowRoomTools(false)}
                  className="h-6 w-6 rounded-full border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors flex items-center justify-center"
                  aria-label="Close room list"
                  title="Close room list"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateRoom}
                  disabled={isJoiningRoom}
                  className="flex h-8 items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 disabled:opacity-60 transition-colors"
                  title="Create a new room"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create room
                </button>
                <input
                  value={joinRoomKey}
                  onChange={(e) => setJoinRoomKey(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  aria-label="Join room key"
                  className="h-8 w-20 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 text-[11px] font-mono tracking-[0.22em] text-center outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={joinRoomKey.length !== 4 || isJoiningRoom}
                  className="h-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 text-[11px] font-semibold text-zinc-800 dark:text-zinc-100 disabled:opacity-60 transition-colors"
                >
                  Join
                </button>
              </div>

              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {joinedRooms.map((room) => (
                  <button
                    key={room.key}
                    onClick={() => handleSwitchRoom(room.key)}
                    className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors ${
                      room.key === currentRoom.key
                        ? 'border-violet-400 bg-violet-150 text-violet-700 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-200'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-105 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                    title={`${room.name} (${room.key})`}
                  >
                    <span className="truncate text-xs font-medium">{room.name}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-violet-600 dark:text-violet-450 bg-violet-50 dark:bg-violet-955/40 px-1.5 py-0.5 rounded border border-violet-200/20 dark:border-violet-800/20 font-bold tracking-wider">{room.key}</span>
                  </button>
                ))}
              </div>

              {roomJoinError && (
                <p className="text-xs text-red-500">{roomJoinError}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mx-auto w-full max-w-2xl mb-2 shrink-0"
          >
            <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-violet-50/80 dark:bg-violet-950/40 border border-violet-200/60 dark:border-violet-800/40 backdrop-blur-sm shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-violet-100 dark:bg-violet-900/60 rounded-xl shrink-0">
                  <Download className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300 leading-tight">
                    Add Wisp to Home Screen
                  </span>
                  <span className="text-[10px] text-violet-500/80 dark:text-violet-400/70 font-mono truncate">
                    Works offline · No app store needed
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleInstallApp}
                  className="px-3 py-1 text-[11px] font-semibold rounded-full bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer"
                >
                  Install
                </button>
                <button
                  onClick={handleDismissInstall}
                  className="p-1 text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 rounded-lg transition-colors cursor-pointer"
                  title="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Main Chat Scrollable Window Frame */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Connection Loader Skeleton Overlay */}
        <AnimatePresence>
          {!isConnected && messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center max-w-sm text-center px-4 space-y-4">
                <div className="p-4 rounded-full border border-dashed border-zinc-600 dark:border-zinc-800 animate-spin">
                  <Ghost className="h-5 w-5 text-zinc-400" />
                </div>
                <h3 className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-200">
                  Establishing Room Connection
                </h3>
                <p className="text-xs text-ghost-light-sec dark:text-ghost-dark-sec leading-relaxed">
                  Connecting to room {currentRoom.key}. Establishing socket pipeline, preparing your temporary memory sandbox.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages scroll viewport: stretches full-width */}
        <div className="flex-1 overflow-hidden relative w-full">
          <div className="h-full flex flex-col px-4">
            {/* Scrollable Area */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden pt-2 pb-4 custom-scrollbar pr-1 relative"
            >
              {/* Render Empty State if no messages fetched */}
              {messages.length === 0 ? (
                <div className="flex h-56 flex-col items-center justify-center text-center space-y-1 select-none">
                  <div className="text-2xl mb-1 animate-float">👻</div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Nobody whispered yet
                  </p>
                  <p className="text-xs text-ghost-light-sec dark:text-ghost-dark-sec">
                    Be the first ghost to speak. Write below.
                  </p>
                </div>
              ) : (
                // Message stream loop
                renderMessageGroups()
              )}

              {/* Typing bubble — renders inside chat stream like WhatsApp/Instagram */}
              <AnimatePresence>
                {typingUsers.length > 0 && (
                  <motion.div
                    key="typing-bubble"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className="flex items-end gap-2 mb-2 mt-1"
                  >
                    <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
                          animate={{ scale: [0.6, 1.1, 0.6], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-mono text-zinc-400/70 dark:text-zinc-600/60 mb-1 select-none">
                      {typingUsers.length === 1 ? typingUsers[0] : 'Ghost'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Floating ChatGPT style Scroll to Bottom / Unread messages button */}
          <AnimatePresence>
            {isScrolledUp && (
              <motion.button
                initial={{ opacity: 0, y: 15, scale: 0.9, x: '-50%' }}
                animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
                exit={{ opacity: 0, y: 10, scale: 0.9, x: '-50%' }}
                onClick={() => {
                  scrollToBottom('smooth');
                  setUnreadCount(0);
                  setIsScrolledUp(false);
                }}
                className="absolute bottom-4 left-1/2 p-2.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 shadow-xl hover:shadow-2xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all duration-200 z-30 cursor-pointer"
                aria-label="Scroll to bottom"
              >
                <ArrowDown className="h-4 w-4 animate-bounce-slow text-violet-600 dark:text-violet-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center bg-violet-600 dark:bg-violet-500 text-white text-[9px] font-bold font-mono h-4 px-1 rounded-full min-w-[16px] shadow-md border border-white dark:border-zinc-900">
                    {unreadCount}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Section: floating input box with safe zone in mobile */}
        <div 
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          className="w-full pt-2 bg-transparent px-4 sm:px-4"
        >
          <div className="flex flex-col">
            {/* Rate limiter error banner / Network Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mb-3 w-full flex items-center justify-between rounded-lg border border-red-500/20 bg-red-950/10 dark:bg-red-950/20 px-3 py-2 text-xs text-red-500 select-none"
                >
                  <div className="flex items-center space-x-1.5 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 cursor-pointer" />
                    <span>{error}</span>
                  </div>
                  <button 
                    onClick={clearError} 
                    className="font-mono text-[10px] uppercase tracking-wider text-red-400 hover:text-red-300 transition-colors bg-red-900/10 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Meme sounds panel */}
            <AnimatePresence>
              {composerMode === 'meme' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                  className="mb-3"
                >
                  <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/80 backdrop-blur-md p-3 shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1 rounded-full bg-zinc-100/70 dark:bg-zinc-800/70 p-1">
                        <button
                          onClick={() => setComposerMode('text')}
                          className="px-3 py-1 text-[11px] font-semibold rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                        >
                          Text
                        </button>
                        <button
                          onClick={() => setComposerMode('meme')}
                          className="px-3 py-1 text-[11px] font-semibold rounded-full bg-violet-600 text-white shadow-sm"
                        >
                          Meme Sounds
                        </button>
                      </div>
                      <button
                        onClick={() => setComposerMode('text')}
                        className="h-7 w-7 rounded-full border border-zinc-200/70 dark:border-zinc-700/70 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                        aria-label="Close meme panel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 rounded-full border border-zinc-200/70 dark:border-zinc-700/70 bg-white dark:bg-zinc-950/40 px-3 py-1.5">
                        <Search className="h-3.5 w-3.5 text-zinc-400" />
                        <input
                          value={memeQuery}
                          onChange={(e) => setMemeQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleMemeSearch();
                            }
                          }}
                          placeholder="Search meme sounds (multi-source)"
                          className="flex-1 bg-transparent text-xs text-zinc-700 dark:text-zinc-200 outline-none placeholder:text-zinc-400"
                          aria-label="Search meme sounds"
                        />
                      </div>
                      <button
                        onClick={handleMemeSearch}
                        disabled={memeLoading || memeQuery.trim().length < 2}
                        className="px-3 py-1.5 text-[11px] font-semibold rounded-full bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 transition-colors"
                      >
                        {memeLoading ? 'Searching...' : 'Search'}
                      </button>
                    </div>

                    {memeError && (
                      <div className="mt-2 text-[11px] text-red-500 font-medium">
                        {memeError}
                      </div>
                    )}

                    <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {memeResults.map((result) => {
                        const audioSource = getMemeAudioSourceUrl(result);
                        const resultProvider = MEME_PROVIDER_LABELS[result.provider];
                        return (
                          <div
                            key={result.id}
                            className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/80 dark:bg-zinc-950/40 p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-8 w-8 rounded-xl bg-violet-100/70 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-300">
                                  <AudioLines className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                                    {result.title}
                                  </p>
                                  <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-wide">
                                    {resultProvider}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {result.pageUrl && (
                                  <a
                                    href={result.pageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-7 w-7 rounded-full border border-zinc-200/70 dark:border-zinc-700/70 flex items-center justify-center text-zinc-400 hover:text-violet-500 transition-colors"
                                    title="Open source"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                <button
                                  onClick={() => handleSendMeme(result)}
                                  disabled={!isConnected || cooldownLeft > 0}
                                  className="px-3 py-1 text-[10px] font-semibold rounded-full bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 text-white disabled:text-zinc-400 transition-colors"
                                >
                                  Send
                                </button>
                              </div>
                            </div>
                            <audio controls preload="none" className="w-full h-9 rounded-lg" src={audioSource} />
                          </div>
                        );
                      })}

                      {!memeLoading && memeResults.length === 0 && !memeError && (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          Search for meme sounds and share them instantly.
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reply strip — minimal pill above input */}
            <AnimatePresence>
              {replyTo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 py-1 mb-1.5 rounded-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200/40 dark:border-zinc-800/40">
                    <CornerUpLeft className="h-3 w-3 text-violet-400/80 dark:text-violet-500/70 shrink-0" />
                    <span className="text-[10px] font-mono text-violet-500/80 dark:text-violet-400/70 shrink-0">@{replyTo.nickname}</span>
                    <span className="text-[10px] text-zinc-400/80 dark:text-zinc-500/70 truncate flex-1">{replyTo.text}</span>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="text-zinc-400/70 hover:text-zinc-500 dark:text-zinc-600/70 dark:hover:text-zinc-400 transition-colors cursor-pointer shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Input Box */}
            <div className={`relative flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-full shadow-lg focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 dark:focus-within:ring-violet-500/20 dark:focus-within:border-violet-500 transition-all ${
              cooldownLeft > 0 ? 'opacity-85 select-none bg-neutral-50/50 dark:bg-zinc-950/20' : ''
            }`}>
              
              {/* Cooldown progress tracker line wrapped to crop straight line at rounded corners */}
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                {cooldownLeft > 0 && (
                  <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: 5, ease: "linear" }}
                    className="absolute top-0 left-0 h-[2px] bg-zinc-300 dark:bg-zinc-700"
                  />
                )}
              </div>

              {/* Meme toggle */}
              <button
                onClick={() => setComposerMode((prev) => (prev === 'meme' ? 'text' : 'meme'))}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors shadow-sm ${
                  composerMode === 'meme'
                    ? 'border-violet-300 bg-violet-50 text-violet-600 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-200'
                    : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
                aria-label="Open meme audio sharing"
                title="Share meme audio"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Text area input for message writing */}
              <textarea
                ref={textareaRef}
                value={cooldownLeft > 0 ? "" : inputVal}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={cooldownLeft > 0 ? `Hold up bro, let it cook (${cooldownLeft}s)...` : `${nickname || 'You'} is whispering...`}
                className={`flex-1 resize-none bg-transparent pl-0 pr-1 py-1 text-sm outline-none focus:outline-none custom-scrollbar min-h-[24px] max-h-[80px] transition-all ${
                  cooldownLeft > 0 
                  ? 'text-zinc-400 dark:text-zinc-500 placeholder-zinc-450 dark:placeholder-zinc-650 cursor-not-allowed' 
                  : 'text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500'
                }`}
                rows={1}
                disabled={!isConnected}
                readOnly={cooldownLeft > 0}
                aria-label="Whisper editor input"
              />

              {/* Right actions section (Character count + Send Button) */}
              <div className="flex items-center space-x-2 shrink-0 select-none">
                {/* Character count */}
                {inputVal.length > 0 && cooldownLeft <= 0 && (
                  <span className={`font-mono text-[10px] pr-1 ${
                    inputVal.length > 180 
                      ? 'text-yellow-500 font-bold' 
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}>
                    {inputVal.length}/205
                  </span>
                )}

                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={!isConnected || !inputVal.trim() || cooldownLeft > 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-100 dark:disabled:bg-zinc-800/80 text-white disabled:text-zinc-400 dark:disabled:text-zinc-500 transition-all cursor-pointer overflow-hidden font-mono shrink-0"
                  aria-label="Send whisper message"
                >
                  {cooldownLeft > 0 ? (
                    <span className="text-[11px] font-bold text-neutral-500 dark:text-zinc-400">
                      {cooldownLeft}
                    </span>
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>
      </main>
      
      </div>
    </div>

    {/* Onboarding Welcome Splash Overlay Modal */}
    <AnimatePresence>
      {showWelcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissWelcome}
            className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-neutral-100 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 text-zinc-100 dark:text-zinc-800/25 opacity-10 pointer-events-none select-none">
              <Ghost size={160} />
            </div>

            <div className="relative z-10 flex flex-col space-y-4">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900 dark:bg-zinc-800 dark:text-white">
                  <Ghost className="h-5 w-5 animate-float" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
                    Welcome to Wisp
                  </h2>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Anonymous Transient Chat
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <p className="text-xs text-neutral-600 dark:text-zinc-300 leading-relaxed">
                  You have entered a quiet, completely ephemeral global stream. No sign-ups, no registration cookies, zero tracking.
                </p>

                <div className="space-y-2 border-y border-neutral-100 dark:border-zinc-800 py-3 my-2 text-xs">
                  <div className="flex items-start space-x-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <p className="text-neutral-500 dark:text-zinc-400">
                      <strong className="text-neutral-800 dark:text-neutral-200">3-hour dissolved history:</strong> Every whisper fades and is deleted permanently after exactly 3 hours.
                    </p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RefreshCw className="mt-0.5 h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <p className="text-neutral-500 dark:text-zinc-400">
                      <strong className="text-neutral-800 dark:text-neutral-200">Fluid identities:</strong> You are assigned a random transient code-name. You can regenerate this identity anytime from the top bar.
                    </p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <Sparkle className="mt-0.5 h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <p className="text-neutral-500 dark:text-zinc-400">
                      <strong className="text-neutral-800 dark:text-neutral-200">Zero persistent data:</strong> There are no database logs saving your IP or session keys permanently.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-zinc-400 leading-normal text-center">
                By entering Wisp, you agree to respect other ghosts and write mindful thoughts in the void.
              </p>

              <button
                onClick={dismissWelcome}
                className="w-full py-2.5 px-4 rounded-xl font-medium text-xs text-white bg-black hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-white transition-all duration-150 shadow-md cursor-pointer text-center select-none"
              >
                Enter the Sanctuary
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* 4. Modals */}
    <AnimatePresence>
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl"
          >
            <div className="space-y-4 text-left">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-100/30 dark:border-violet-800/30">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Create Chat Room
                  </h2>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    Custom Room Name (Optional)
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 font-mono">
                  Room Name
                </label>
                <input
                  type="text"
                  value={pendingRoomName}
                  onChange={(e) => setPendingRoomName(e.target.value)}
                  placeholder="Enter room name..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCreateRoom}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowLeaveModal(false);
              setPendingRoom(null);
            }}
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ scale: 0.95, y: 15, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl"
          >
            <div className="space-y-4 text-left">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100/30 dark:border-amber-800/30">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Leave Chat Room?
                  </h2>
                  <p className="text-[10px] text-amber-650 dark:text-amber-400 font-mono">
                    {pendingRoom?.name || currentRoom?.name}
                  </p>
                </div>
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Leaving this room removes it from your saved list. To rejoin in the future, you will need to enter the 4-digit room key manually.
              </p>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowLeaveModal(false);
                    setPendingRoom(null);
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmLeaveRoom}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-amber-650 hover:bg-amber-700 text-white transition-colors cursor-pointer"
                >
                  Leave Room
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}

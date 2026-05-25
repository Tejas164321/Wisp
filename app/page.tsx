'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { 
  Ghost, 
  Send, 
  RefreshCw, 
  Sun, 
  Moon, 
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
  AudioLines
} from 'lucide-react';
import { useSocketState } from '@/context/SocketContext';
import { useTheme } from '@/context/ThemeContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { MemeAudio, Message } from '@/lib/message-types';
import { getMemeAudioPreviewLabel } from '@/lib/meme-utils';

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
  const providerLabel = line.memeAudio?.provider === 'myinstants' ? 'MyInstants' : line.memeAudio?.provider;
  const memeAudioSource = isMemeAudio
    ? `/api/memes/stream?url=${encodeURIComponent(line.memeAudio?.previewUrl || line.memeAudio?.sourceUrl || '')}`
    : '';

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
    setIsScrolledUp
  } = useSocketState();

  const { theme, toggleTheme } = useTheme();
  const { isSupported: isPushSupported, subscription: pushSubscription, permission, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string; text: string } | null>(null);

  const [inputVal, setInputVal] = useState('');
  const [composerMode, setComposerMode] = useState<'text' | 'meme'>('text');
  const [memeQuery, setMemeQuery] = useState('');
  const [memeResults, setMemeResults] = useState<MemeAudio[]>([]);
  const [memeLoading, setMemeLoading] = useState(false);
  const [memeError, setMemeError] = useState<string | null>(null);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [viewportHeight, setViewportHeight] = useState('100dvh');

  const isScrolledUpRef = useRef(isScrolledUp);
  useEffect(() => {
    isScrolledUpRef.current = isScrolledUp;
  }, [isScrolledUp]);

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
        }, 50);
        setUnreadCount(0);
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
          }, 50);
          setUnreadCount(0);
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

    setMemeLoading(true);
    setMemeError(null);

    try {
      const res = await fetch(`/api/memes?q=${encodeURIComponent(searchTerm)}`);
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
      setMemeError('Meme search failed.');
      setMemeResults([]);
    } finally {
      setMemeLoading(false);
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

  return (
    <>
      <div 
        style={{ height: viewportHeight }}
        className="flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-ghost-light-text dark:text-ghost-dark-text selection:bg-zinc-200 dark:selection:bg-zinc-800 w-full"
      >
      
      {/* Center column container to align header, chat track, and bottom bar */}
      <div className="mx-auto flex flex-col h-full w-full max-w-3xl relative px-4 sm:px-4">

      {/* 1. Header Navigation Bar (Dynamic Island Capsule shape) */}
      <header className="sticky top-3 z-40 mt-3 mb-2 mx-auto w-full max-w-2xl rounded-full border border-zinc-200/50 dark:border-zinc-900 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md shadow-md select-none transition-all shrink-0">
        <div className="flex h-14 w-full items-center justify-between px-4 gap-2">
          
          {/* Brand Logo */}
          <div className="flex items-center space-x-2.5 shrink-0 select-none">
            <div className="p-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50">
              <Ghost className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="font-display font-bold text-base tracking-tight text-zinc-900 dark:text-zinc-50 hidden xs:inline-block">
              Wisp
            </span>
          </div>

          {/* User identity badge (Consolidated inline to prevent header splitting) */}
          <div className="flex items-center space-x-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-2.5 py-1 text-xs select-none shadow-inner min-w-0">
            <Sparkle className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 animate-pulse-slow shrink-0" />
            <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline shrink-0">Handle:</span>
            <span className="font-mono font-bold text-violet-600 dark:text-violet-400 truncate max-w-[80px] xs:max-w-[100px] sm:max-w-none">
              {nickname || 'Resolving...'}
            </span>
            <button
              onClick={regenerateUserNickname}
              className="p-1 ml-0.5 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors rounded-md hover:bg-violet-50 dark:hover:bg-violet-950/40 cursor-pointer shrink-0"
              title="Regenerate random identity"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          {/* Right toggle panel */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Global Network / Online status */}
            <div className="flex items-center space-x-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 px-2.5 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 shadow-sm backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5 mr-0.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[10px] font-medium">
                {onlineCount} <span className="hidden sm:inline">{onlineCount === 1 ? 'ghost' : 'ghosts'}</span>
              </span>
            </div>
            
            {/* Network Indicator status */}
            <div className="text-xs">
              {isConnected ? (
                <span className="text-emerald-500" title="Connected in Sanctuary">
                  <Wifi className="h-4 w-4" />
                </span>
              ) : (
                <span className="text-red-500" title="Space Portal Broken, searching reconnect...">
                  <WifiOff className="h-4 w-4 animate-pulse" />
                </span>
              )}
            </div>

            {/* Toggle sound effects */}
            <button
              id="sound_switch"
              onClick={toggleSoundEnabled}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-zinc-800 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
              aria-label="Toggle notification sounds"
              title={soundEnabled ? "Mute whispers" : "Unmute whispers"}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
              )}
            </button>

            {/* Toggle dark system */}
            <button
              id="theme_switch"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-zinc-800 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
              aria-label="Toggle visual theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

        </div>
      </header>

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
                  Aligning Quantum Portals
                </h3>
                <p className="text-xs text-ghost-light-sec dark:text-ghost-dark-sec leading-relaxed">
                  Connecting to the secure single room. Establishing socket pipeline, preparing your temporary memory sandbox.
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
                          placeholder="Search meme sounds (MyInstants)"
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
                        const audioSource = `/api/memes/stream?url=${encodeURIComponent(result.previewUrl || result.sourceUrl)}`;
                        const resultProvider = result.provider === 'myinstants' ? 'MyInstants' : result.provider;
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
                aria-label="Toggle meme sounds"
              >
                <AudioLines className="h-4 w-4" />
              </button>

              {/* Text area input for message writing */}
              <textarea
                ref={textareaRef}
                value={cooldownLeft > 0 ? "" : inputVal}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={cooldownLeft > 0 ? `Hold up bro, let it cook (${cooldownLeft}s)...` : `Whisper to the void...`}
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
    </>
  );
}

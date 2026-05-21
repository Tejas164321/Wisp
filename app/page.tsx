'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Ghost, 
  Send, 
  RefreshCw, 
  Sun, 
  Moon, 
  Wifi, 
  WifiOff, 
  Sparkle,
  Calendar,
  Clock,
  MessageSquare,
  AlertCircle,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useSocketState } from '@/context/SocketContext';
import { useTheme } from '@/context/ThemeContext';

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
    toggleSoundEnabled
  } = useSocketState();

  const { theme, toggleTheme } = useTheme();

  const [inputVal, setInputVal] = useState('');
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Run scroll to bottom when messages load/update or typing users listing fluctuates
  useEffect(() => {
    // Small timeout ensures browser completes rendering before scrolling
    const timer = setTimeout(() => {
      scrollToBottom('smooth');
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, typingUsers]);

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
    }
  };

  // Dispatch message send
  const handleSend = () => {
    if (cooldownLeft > 0) return;
    const cleanMsg = inputVal.trim();
    if (!cleanMsg) return;

    sendMessage(cleanMsg);
    setInputVal('');
    setIsTypingLocal(false);
    sendTypingStatus(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    
    // Set 5-second rate limit cooldown to prevent spamming
    setCooldownLeft(5);
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
          createdAt: msg.createdAt
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
            createdAt: msg.createdAt
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
          <div className={`flex items-baseline mb-1 space-x-2 text-xs select-none ${isSelf ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
            <span className={`font-mono font-medium tracking-tight px-1.5 py-0.5 rounded ${
              isSelf 
                ? 'bg-zinc-800 text-zinc-300 dark:bg-zinc-900 dark:text-zinc-400' 
                : 'text-ghost-light-sec dark:text-ghost-dark-sec'
            }`}>
              {group.nickname}
              {isSelf && <span className="opacity-60 text-[10px] ml-1">(You)</span>}
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
              {formatTime(group.baseTimestamp)}
            </span>
          </div>

          {/* List of lines written by that user in succession */}
          <div className={`flex flex-col space-y-1 max-w-[85%] md:max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}>
            {group.lines.map((line: any, index: number) => {
              const borderStyles = isSelf 
                ? 'bg-zinc-900 border border-zinc-700/60 text-zinc-100 rounded-2xl rounded-tr-sm' 
                : 'bg-ghost-light-card border border-ghost-light-border dark:bg-ghost-dark-card dark:border-ghost-dark-border text-ghost-light-text dark:text-ghost-dark-text rounded-2xl rounded-tl-sm';

              return (
                <div
                  key={line.id}
                  className={`group relative px-3.5 py-2.5 shadow-sm transition-all duration-150 select-text ${borderStyles}`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{line.text}</p>
                  
                  {/* Hover visual timestamp */}
                  {index > 0 && (
                    <span 
                      className={`absolute hidden group-hover:inline-block text-[10px] text-zinc-400 dark:text-zinc-600 font-mono -bottom-3.5 ${
                        isSelf ? 'right-1' : 'left-1'
                      }`}
                    >
                      {formatTime(line.createdAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      );
    });
  };

  return (
    <>
      <div className="flex flex-col min-h-screen bg-ghost-light-bg text-ghost-light-text dark:bg-ghost-dark-bg dark:text-ghost-dark-text selection:bg-zinc-200 dark:selection:bg-zinc-800">
      
      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-ghost-light-border bg-white/80 dark:border-ghost-dark-border dark:bg-ghost-dark-bg/80 backdrop-blur-md select-none">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          
          {/* Brand Logo */}
          <div className="flex items-center space-x-2 select-none">
            <Ghost className="h-5 w-5 text-neutral-900 dark:text-white" />
            <span className="font-sans font-medium tracking-tight text-neutral-900 dark:text-white">
              Wisp
            </span>
          </div>

          {/* Global Network / Online status */}
          <div className="flex items-center space-x-1.5 rounded-full border border-ghost-light-border bg-ghost-light-card px-2.5 py-1 text-xs text-neutral-600 dark:border-ghost-dark-border dark:bg-ghost-dark-card dark:text-ghost-dark-sec shrink-0">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[10px] sm:text-xs">
              {onlineCount} <span className="hidden xs:inline">{onlineCount === 1 ? 'ghost' : 'ghosts'} online</span>
            </span>
          </div>

          {/* Right toggle panel */}
          <div className="flex items-center space-x-2">
            
            {/* Network Indicator status */}
            <div className="text-xs">
              {isConnected ? (
                <span className="text-emerald-500" title="Connected in Sanctuary">
                  <Wifi className="h-4.5 w-4.5" />
                </span>
              ) : (
                <span className="text-red-500" title="Space Portal Broken, searching reconnect...">
                  <WifiOff className="h-4.5 w-4.5 animate-pulse" />
                </span>
              )}
            </div>

            {/* Toggle sound effects */}
            <button
              id="sound_switch"
              onClick={toggleSoundEnabled}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ghost-light-border bg-ghost-light-card text-neutral-800 hover:bg-neutral-100 dark:border-ghost-dark-border dark:bg-ghost-dark-card dark:text-neutral-200 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer"
              aria-label="Toggle notification sounds"
              title={soundEnabled ? "Mute whispers" : "Unmute whispers"}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              )}
            </button>

            {/* Toggle dark system */}
            <button
              id="theme_switch"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-ghost-light-border bg-ghost-light-card text-neutral-800 hover:bg-neutral-100 dark:border-ghost-dark-border dark:bg-ghost-dark-card dark:text-neutral-200 dark:hover:bg-neutral-800/80 transition-colors cursor-pointer"
              aria-label="Toggle visual theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>

        </div>
      </header>

      {/* 2. Top Banner (Shows allocated auto generated identity) */}
      <section className="w-full border-b border-ghost-light-border bg-neutral-50 dark:bg-ghost-dark-card/30 dark:border-ghost-dark-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-3 sm:px-4 py-2 text-xs font-mono">
          <div className="flex items-center space-x-1.5 text-ghost-light-sec dark:text-ghost-dark-sec text-[10px] sm:text-[11px] truncate mr-2">
            <Sparkle className="h-3 w-3 text-zinc-400 shrink-0" />
            <span className="hidden xs:inline shrink-0">Anonymous handle assigned:</span>
            <span className="xs:hidden shrink-0">Handle:</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200 bg-neutral-150 dark:bg-neutral-900 px-1.5 py-0.5 rounded border border-ghost-light-border dark:border-ghost-dark-border truncate max-w-[120px] xs:max-w-none">
              {nickname || 'Resolving...'}
            </span>
          </div>

          <button
            onClick={regenerateUserNickname}
            className="flex items-center space-x-1 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors px-1.5 py-0.5 rounded hover:bg-neutral-200/50 dark:hover:bg-neutral-800/30 cursor-pointer text-[9px] sm:text-[10px] shrink-0"
            title="Generate a new random identity"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            <span>Regenerate ID</span>
          </button>
        </div>
      </section>

      {/* 3. Main Chat Scrollable Window Frame */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* Connection Loader Skeleton Overlay */}
        <AnimatePresence>
          {!isConnected && messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ghost-light-bg/95 dark:bg-ghost-dark-bg/95 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center max-w-sm text-center px-4 space-y-4">
                <div className="p-4 rounded-full border border-dashed border-zinc-600 dark:border-zinc-800 animate-spin">
                  <Ghost className="h-6 w-6 text-zinc-400 animate-pulse" />
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

        {/* Outer Grid alignment */}
        <div className="mx-auto h-full max-w-3xl flex flex-col justify-between px-4">
          
          {/* Scrollable Area */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto py-5 custom-scrollbar pr-1 relative"
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
          </div>

          {/* Rate limiter error banner / Network Error Banner */}
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-1 w-full flex items-center justify-between rounded-lg border border-red-500/20 bg-red-950/10 dark:bg-red-950/20 px-3 py-2 text-xs text-red-500 select-none"
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

          {/* Typing users feedback banner */}
          <div className="h-6 flex items-center text-[11px] text-ghost-light-sec dark:text-ghost-dark-sec select-none overflow-hidden pl-1">
            <AnimatePresence>
              {typingUsers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center space-x-1.5 font-mono"
                >
                  <div className="flex space-x-1 items-center mr-1.5 h-3">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 bg-neutral-500 dark:bg-zinc-400 rounded-full"
                        animate={{
                          scale: [0.7, 1.2, 0.7],
                          opacity: [0.4, 1, 0.4]
                        }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.16
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-zinc-400 font-mono">
                    {typingUsers.length === 1 
                      ? `${typingUsers[0]} is typing...`
                      : `Ghost is typing...`
                    }
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 4. Chat Input Box */}
          <div className="border-t border-ghost-light-border dark:border-ghost-dark-border py-4 w-full">
            <div className={`relative flex flex-col p-2 bg-ghost-light-card border border-ghost-light-border dark:bg-ghost-dark-card dark:border-ghost-dark-border rounded-xl focus-within:ring-1 focus-within:ring-zinc-400 focus-within:border-zinc-400 dark:focus-within:ring-zinc-600 dark:focus-within:border-zinc-600 transition-all overflow-hidden ${
              cooldownLeft > 0 ? 'opacity-85 select-none bg-neutral-50/50 dark:bg-zinc-950/20' : ''
            }`}>
              
              {/* Cooldown progress tracker line */}
              {cooldownLeft > 0 && (
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 5, ease: "linear" }}
                  className="absolute top-0 left-0 h-[2px] bg-neutral-500 dark:bg-zinc-400"
                />
              )}

              {/* Text area input for message writing */}
              <textarea
                value={cooldownLeft > 0 ? "" : inputVal}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={cooldownLeft > 0 ? `Please wait ${cooldownLeft}s before whispering again...` : `Whisper to the void...`}
                className={`w-full resize-none bg-transparent px-3 py-2 text-sm outline-none focus:outline-none custom-scrollbar min-h-[44px] max-h-[120px] transition-all ${
                  cooldownLeft > 0 
                  ? 'text-zinc-400 dark:text-zinc-500 placeholder-zinc-450 dark:placeholder-zinc-650 cursor-not-allowed' 
                  : 'text-ghost-light-text dark:text-ghost-dark-text placeholder-zinc-400 dark:placeholder-zinc-650'
                }`}
                rows={1}
                disabled={!isConnected || cooldownLeft > 0}
                aria-label="Whisper editor input"
              />

              {/* Input Action Controls Footer Row */}
              <div className="flex items-center justify-between border-t border-neutral-100 dark:border-zinc-800/80 pt-2 px-2 select-none">
                
                {/* Character count scale or warning */}
                {cooldownLeft > 0 ? (
                  <span className="font-mono text-[9px] text-zinc-500 animate-pulse">
                    Muted for anti-spam: {cooldownLeft}s
                  </span>
                ) : (
                  <span className={`font-mono text-[10px] ${
                    inputVal.length > 180 
                      ? 'text-yellow-500 font-bold' 
                      : 'text-zinc-400 dark:text-zinc-600'
                  }`}>
                    {inputVal.length}/200
                  </span>
                )}

                {/* Submitting controls */}
                <div className="flex items-center space-x-2">
                  <span className="hidden md:inline-block text-[9px] text-zinc-400 font-mono">
                    {cooldownLeft > 0 ? "Spam shield active" : "Press Enter to send"}
                  </span>
                  
                  <button
                    onClick={handleSend}
                    disabled={!isConnected || !inputVal.trim() || cooldownLeft > 0}
                    className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-black hover:bg-zinc-800 disabled:bg-neutral-100 dark:bg-zinc-200 dark:hover:bg-white dark:disabled:bg-zinc-800/40 text-white dark:text-black disabled:text-neutral-400 dark:disabled:text-zinc-600 transition-colors shadow-sm cursor-pointer overflow-hidden font-mono"
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

        </div>
      </main>
      
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
                      <strong className="text-neutral-800 dark:text-neutral-200">24-hour dissolved history:</strong> Every whisper fades and is deleted permanently after exactly one day.
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


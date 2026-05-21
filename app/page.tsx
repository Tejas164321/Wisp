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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    const cleanMsg = inputVal.trim();
    if (!cleanMsg) return;

    sendMessage(cleanMsg);
    setInputVal('');
    setIsTypingLocal(false);
    sendTypingStatus(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
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
            <span className={`font-mono font-medium tracking-tight px-2 py-0.5 rounded-md text-[10px] border ${
              isSelf 
                ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border-violet-100/60 dark:border-violet-900/30' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-700/30'
            }`}>
              {group.nickname}
              {isSelf && <span className="opacity-60 text-[9px] ml-1">(You)</span>}
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
              {formatTime(group.baseTimestamp)}
            </span>
          </div>

          {/* List of lines written by that user in succession */}
          <div className={`flex flex-col space-y-1.5 max-w-[85%] md:max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}>
            {group.lines.map((line: any, index: number) => {
              const borderStyles = isSelf 
                ? 'bg-gradient-to-br from-violet-600 to-indigo-600 border border-violet-500/30 text-white rounded-2xl rounded-tr-sm shadow-md shadow-indigo-500/10' 
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-100 rounded-2xl rounded-tl-sm shadow-[0_2px_8px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]';

              return (
                <div
                  key={line.id}
                  className={`group relative px-4 py-2.5 transition-all duration-150 select-text ${borderStyles}`}
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
      <div className="flex flex-col h-screen h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 text-ghost-light-text dark:text-ghost-dark-text selection:bg-zinc-200 dark:selection:bg-zinc-800">
      
      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-200/80 dark:border-zinc-800 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-xl select-none transition-all">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          
          {/* Brand Logo */}
          <div className="flex items-center space-x-3 select-none">
            <div className="p-1.5 bg-gradient-to-br from-violet-600/10 to-indigo-600/10 dark:from-violet-400/10 dark:to-indigo-400/10 rounded-xl border border-violet-500/20 dark:border-violet-400/20">
              <Ghost className="h-7 w-7 text-indigo-600 dark:text-indigo-400 filter drop-shadow-[0_0_6px_rgba(99,102,241,0.3)] animate-float" />
            </div>
            <span className="font-display font-bold text-xl md:text-2xl tracking-tight bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
              Wisp
            </span>
          </div>

          {/* Global Network / Online status */}
          <div className="flex items-center space-x-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 shadow-sm backdrop-blur-sm">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[11px] font-medium">{onlineCount} {onlineCount === 1 ? 'ghost' : 'ghosts'} online</span>
          </div>

          {/* Right toggle panel */}
          <div className="flex items-center space-x-2">
            
            {/* Network Indicator status */}
            <div className="text-xs mr-1">
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
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-zinc-800 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
              aria-label="Toggle notification sounds"
              title={soundEnabled ? "Mute whispers" : "Unmute whispers"}
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
              )}
            </button>

            {/* Toggle dark system */}
            <button
              id="theme_switch"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-zinc-800 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/80 transition-colors shadow-sm cursor-pointer"
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
      <section className="w-full border-b border-zinc-200/50 dark:border-zinc-850/50 bg-white/40 dark:bg-zinc-900/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5 text-xs font-mono">
          <div className="flex items-center space-x-2 text-zinc-500 dark:text-zinc-400 text-[11px]">
            <Sparkle className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400 animate-pulse-slow" />
            <span>Anonymous handle assigned:</span>
            <span className="font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 rounded-md border border-violet-100 dark:border-violet-900/30 shadow-sm">
              {nickname || 'Resolving...'}
            </span>
          </div>

          <button
            onClick={regenerateUserNickname}
            className="flex items-center space-x-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-250 transition-colors px-2.5 py-1 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/40 cursor-pointer text-[10px] font-medium"
            title="Generate a new random identity"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Regenerate ID</span>
          </button>
        </div>
      </section>

      {/* 3. Main Chat Scrollable Window Frame */}
      <main className="flex-1 overflow-hidden relative">
        {/* Background Decorative Glows */}
        <div className="absolute top-1/4 left-[5%] w-72 h-72 bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-[5%] w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
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
          <div className="border-t border-zinc-200/85 dark:border-zinc-800/60 py-4 w-full bg-zinc-50/40 dark:bg-zinc-950/20 backdrop-blur-md">
            <div className="relative flex flex-col p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl shadow-lg shadow-zinc-150/40 dark:shadow-black/45 focus-within:ring-2 focus-within:ring-indigo-500/35 focus-within:border-indigo-500 dark:focus-within:ring-indigo-500/25 dark:focus-within:border-indigo-500 transition-all">
              
              {/* Text area input for message writing */}
              <textarea
                value={inputVal}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Whisper to the void...`}
                className="w-full resize-none bg-transparent px-3 py-2 text-sm text-zinc-850 dark:text-zinc-100 outline-none focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-500 custom-scrollbar min-h-[44px] max-h-[120px]"
                rows={1}
                disabled={!isConnected}
                aria-label="Whisper editor input"
              />

              {/* Input Action Controls Footer Row */}
              <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/75 pt-2.5 px-2 select-none">
                
                {/* Character count scale */}
                <span className={`font-mono text-[10px] ${
                  inputVal.length > 180 
                    ? 'text-yellow-500 font-bold' 
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}>
                  {inputVal.length}/200
                </span>

                {/* Submitting controls */}
                <div className="flex items-center space-x-2.5">
                  <span className="hidden md:inline-block text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">
                    Press <span className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1 rounded">Enter</span> to send
                  </span>
                  
                  <button
                    onClick={handleSend}
                    disabled={!isConnected || !inputVal.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-550 hover:to-indigo-550 disabled:from-zinc-100 disabled:to-zinc-100 dark:disabled:from-zinc-800/40 dark:disabled:to-zinc-800/40 text-white disabled:text-zinc-400 dark:disabled:text-zinc-600 transition-all shadow-md shadow-indigo-500/20 dark:shadow-none cursor-pointer"
                    aria-label="Send whisper message"
                  >
                    <Send className="h-3.5 w-3.5" />
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


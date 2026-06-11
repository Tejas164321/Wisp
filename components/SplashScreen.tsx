'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ghost } from 'lucide-react';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Automatically dismiss the splash screen
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onFinish, 800); // 800ms exit transition
    }, 3800); // Extended slightly so the luxurious animations can breathe

    return () => clearTimeout(timer);
  }, [onFinish]);

  // Full-screen ambient smoke variants - Sweeping, lazy, and hyper-smooth
  const smokeTopLeft = {
    animate: {
      scale: [1, 1.3, 0.9, 1.2, 1],
      x: [0, 80, -30, 50, 0],
      y: [0, 50, 80, -40, 0],
      transition: { duration: 15, repeat: Infinity, ease: "easeInOut" }
    }
  };

  const smokeBottomRight = {
    animate: {
      scale: [0.9, 1.4, 1, 1.3, 0.9],
      x: [0, -90, 40, -60, 0],
      y: [0, -60, -90, 40, 0],
      transition: { duration: 18, repeat: Infinity, ease: "easeInOut" }
    }
  };

  const smokeTopRight = {
    animate: {
      scale: [1.2, 0.8, 1.3, 0.9, 1.2],
      x: [0, -60, 80, -40, 0],
      y: [0, 80, 40, 60, 0],
      transition: { duration: 16, repeat: Infinity, ease: "easeInOut" }
    }
  };

  const smokeBottomLeft = {
    animate: {
      scale: [1, 1.5, 0.9, 1.2, 1],
      x: [0, 60, -50, 70, 0],
      y: [0, -50, -80, 50, 0],
      transition: { duration: 20, repeat: Infinity, ease: "easeInOut" }
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(20px)", scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030303] overflow-hidden"
        >
          {/* Full Screen Ethereal Smoke Glows */}
          <div className="absolute inset-0 pointer-events-none opacity-50 mix-blend-screen">
            <motion.div
              variants={smokeTopLeft}
              animate="animate"
              className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vh] rounded-full bg-violet-600/30 filter blur-[120px] sm:blur-[160px]"
            />
            <motion.div
              variants={smokeBottomRight}
              animate="animate"
              className="absolute -bottom-[20%] -right-[10%] w-[80vw] h-[80vh] rounded-full bg-indigo-600/20 filter blur-[120px] sm:blur-[160px]"
            />
            <motion.div
              variants={smokeTopRight}
              animate="animate"
              className="absolute -top-[10%] -right-[20%] w-[60vw] h-[60vh] rounded-full bg-fuchsia-600/20 filter blur-[120px] sm:blur-[140px]"
            />
            <motion.div
              variants={smokeBottomLeft}
              animate="animate"
              className="absolute -bottom-[10%] -left-[20%] w-[70vw] h-[70vh] rounded-full bg-cyan-600/15 filter blur-[120px] sm:blur-[140px]"
            />
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center w-full px-6">
            
            {/* Grand Entrance Wrapper */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} // Super smooth cinematic bezier curve
              className="mb-8"
            >
              {/* Infinite Floating Platform */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-[1.5rem] bg-zinc-900/60 backdrop-blur-xl border border-zinc-700/50 shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden"
              >
                {/* Subtle inner premium gloss */}
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/15 to-transparent pointer-events-none" />
                
                {/* Delayed logo pop */}
                <motion.div
                  initial={{ opacity: 0, rotate: -15, scale: 0.6 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  transition={{ duration: 1.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Ghost className="h-12 w-12 sm:h-14 sm:w-14 text-violet-400 drop-shadow-[0_0_15px_rgba(167,139,250,0.4)]" />
                </motion.div>
              </motion.div>
            </motion.div>

            {/* App Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-white drop-shadow-lg"
            >
              Wisp
            </motion.h1>

            {/* Subtitle / Tagline */}
            <motion.p
              initial={{ opacity: 0, filter: "blur(8px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 1.5, delay: 0.6, ease: "easeOut" }}
              className="mt-4 text-[10px] sm:text-xs font-mono tracking-[0.3em] uppercase text-zinc-400"
            >
              Anonymous Realtime Chat
            </motion.p>
            
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

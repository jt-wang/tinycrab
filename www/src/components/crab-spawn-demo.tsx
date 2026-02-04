'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';

interface Crab {
  id: number;
  x: number;
  size: number;
}

export function CrabSpawnDemo() {
  const t = useTranslations('spawn');
  const [crabs, setCrabs] = useState<Crab[]>([]);
  const [isSpawning, setIsSpawning] = useState(true);

  useEffect(() => {
    if (!isSpawning) return;

    const maxCrabs = 5;
    let currentId = 0;

    const spawnCrab = () => {
      if (currentId >= maxCrabs) {
        setIsSpawning(false);
        // Reset after a pause
        setTimeout(() => {
          setCrabs([]);
          setIsSpawning(true);
        }, 4000);
        return;
      }

      const newCrab: Crab = {
        id: currentId,
        x: 15 + currentId * 18, // Spread across horizontally
        size: 0.7 + Math.random() * 0.4, // Slight size variation
      };

      setCrabs((prev) => [...prev, newCrab]);
      currentId++;
    };

    // Initial delay
    const initialTimeout = setTimeout(() => {
      spawnCrab();
    }, 500);

    // Spawn subsequent crabs
    const interval = setInterval(() => {
      spawnCrab();
    }, 600);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [isSpawning]);

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Container */}
      <div className="relative h-32 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px),
                              linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Spawning crabs */}
        <AnimatePresence>
          {crabs.map((crab) => (
            <motion.div
              key={crab.id}
              initial={{ opacity: 0, scale: 0, y: 20 }}
              animate={{
                opacity: 1,
                scale: crab.size,
                y: [0, -8, 0],
              }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.4, ease: 'backOut' },
                y: {
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: crab.id * 0.2,
                },
              }}
              className="absolute bottom-6"
              style={{ left: `${crab.x}%` }}
            >
              <CrabSVG className="w-10 h-10 text-crab drop-shadow-sm" />
              {/* Spawn number label */}
              <motion.span
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-mono text-muted-foreground"
              >
                #{crab.id + 1}
              </motion.span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Spawn command hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: crabs.length > 0 ? 1 : 0 }}
          className="absolute top-3 left-3 font-mono text-xs text-muted-foreground"
        >
          <span className="text-crab">$</span> tinycrab spawn worker-{crabs.length}
        </motion.div>
      </div>

      {/* Description */}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {t('description')}
      </p>
    </div>
  );
}

function CrabSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" className={className}>
      {/* Body - oval shape */}
      <ellipse cx="32" cy="36" rx="18" ry="14" />
      {/* Left claw */}
      <path d="M8 28c-3-3-4-8-1-11s8-2 11 1l-2 3c-1-1-4-2-5-1s0 4 1 5l-4 3z" />
      <circle cx="6" cy="19" r="3" />
      <circle cx="12" cy="15" r="3" />
      {/* Right claw */}
      <path d="M56 28c3-3 4-8 1-11s-8-2-11 1l2 3c1-1 4-2 5-1s0 4-1 5l4 3z" />
      <circle cx="58" cy="19" r="3" />
      <circle cx="52" cy="15" r="3" />
      {/* Eyes */}
      <circle cx="26" cy="30" r="3" fill="white" />
      <circle cx="38" cy="30" r="3" fill="white" />
      <circle cx="26" cy="30" r="1.5" fill="black" />
      <circle cx="38" cy="30" r="1.5" fill="black" />
      {/* Legs - left */}
      <path d="M16 40l-8 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M17 44l-10 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M18 48l-10 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Legs - right */}
      <path d="M48 40l8 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M47 44l10 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M46 48l10 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

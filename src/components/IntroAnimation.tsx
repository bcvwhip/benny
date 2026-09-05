import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';

interface IntroAnimationProps {
  onComplete: () => void;
}

export const IntroAnimation: React.FC<IntroAnimationProps> = ({ onComplete }) => {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Step 0 -> 1: Symbol "3" appears with subtle glow (~200ms)
    const t1 = setTimeout(() => setStep(1), 200);

    // Step 1 -> 2: Glow intensifies and "athlas" emerges (~550ms)
    const t2 = setTimeout(() => setStep(2), 550);

    // Step 2 -> 3: Full unified "3 athlas" emblem locks in (~950ms)
    const t3 = setTimeout(() => setStep(3), 950);

    // Step 3 -> 4: Fade out and complete (~1300ms)
    const t4 = setTimeout(() => {
      setStep(4);
      setTimeout(() => {
        onCompleteRef.current?.();
      }, 250);
    }, 1300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <AnimatePresence>
      {step < 4 && (
        <motion.div
          id="intro-animation-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeInOut' } }}
          onClick={() => onCompleteRef.current?.()}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0A0A] cursor-pointer select-none overflow-hidden"
        >
          {/* Subtle radial background glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05),transparent_70%)] pointer-events-none" />

          <div className="relative flex items-center justify-center space-x-3.5">
            {/* Elegant emblem 3 */}
            {step >= 1 && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0, filter: 'blur(8px)' }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  filter: 'blur(0px)',
                  transition: { duration: 0.35, ease: 'easeOut' },
                }}
                className="relative flex items-center justify-center"
              >
                {/* Glow ring */}
                <div
                  className={`absolute -inset-2 rounded-2xl bg-white/20 blur-lg transition-opacity duration-300 ${
                    step >= 2 ? 'opacity-80' : 'opacity-40'
                  }`}
                />
                
                <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-white text-black font-bold text-3xl shadow-[0_0_25px_rgba(255,255,255,0.25)]">
                  <span>3</span>
                </div>
              </motion.div>
            )}

            {/* Typography "athlas" */}
            {step >= 2 && (
              <motion.div
                initial={{ opacity: 0, x: -10, filter: 'blur(6px)' }}
                animate={{
                  opacity: 1,
                  x: 0,
                  filter: 'blur(0px)',
                  transition: { duration: 0.3, ease: 'easeOut' },
                }}
                className="flex items-baseline space-x-2"
              >
                <span className="text-4xl font-light tracking-tight italic text-white">
                  athlas
                </span>
                <span className="text-[10px] tracking-widest text-gray-500 uppercase font-mono not-italic">
                  intelligence
                </span>
              </motion.div>
            )}
          </div>

          {/* Quick skip hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4, transition: { delay: 0.6 } }}
            className="absolute bottom-6 text-xs text-gray-500 font-mono tracking-wider"
          >
            Tocca per saltare
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

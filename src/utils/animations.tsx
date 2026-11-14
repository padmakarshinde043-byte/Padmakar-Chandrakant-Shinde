import React, { useEffect, useRef, useState } from 'react';

export interface AnimatedCounterProps {
  target: number;
  suffix?: string;
  duration?: number;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  target,
  suffix = '',
  duration = 1200,
}) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated.current) {
            hasAnimated.current = true;
            let startTime: number | null = null;
            const step = (timestamp: number) => {
              if (!startTime) startTime = timestamp;
              const progress = Math.min((timestamp - startTime) / duration, 1);
              const easeProgress = progress * (2 - progress);
              const current = Math.floor(easeProgress * target);
              setCount(current);
              if (progress < 1) {
                requestAnimationFrame(step);
              } else {
                setCount(target);
              }
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return (
    <span ref={ref} className="tabular-nums font-mono">
      {count.toLocaleString('en-IN')}{suffix}
    </span>
  );
};

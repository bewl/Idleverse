import { useMemo } from 'react';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  baseOpacity: number;
  color: string;
}

/** Linear congruential generator — deterministic, no import needed. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Mostly white/ice-blue; occasional cyan and violet accents
const STAR_COLORS = [
  '#ffffff', '#ffffff', '#ffffff', '#ffffff',
  '#e0f7ff', '#c8eeff',
  '#67e8f9', // cyan-300
  '#c4b5fd', // violet-300
];

export function StarField({ count = 200 }: { count?: number }) {
  const stars = useMemo<Star[]>(() => {
    const rand = lcg(0xdeadbeef);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: rand() * 100,
      y: rand() * 100,
      size: rand() * 2.0 + 0.4,
      duration: rand() * 5 + 2,
      delay: -(rand() * 10), // negative delay starts stars mid-cycle immediately
      baseOpacity: rand() * 0.55 + 0.15,
      color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
    }));
  }, [count]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {stars.map(star => (
        <span
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.color,
            boxShadow: star.size > 1.8 ? `0 0 ${star.size * 2}px ${star.color}` : undefined,
            animation: `twinkle ${star.duration}s ease-in-out ${star.delay}s infinite`,
            ['--base-opacity' as string]: star.baseOpacity,
          }}
        />
      ))}
    </div>
  );
}

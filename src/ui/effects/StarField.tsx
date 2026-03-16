import { useMemo, useEffect, useRef } from 'react';

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  layer: 0 | 1 | 2;
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

/** Parallax translation magnitude per layer (fraction of viewport half-width). */
const LAYER_PARALLAX = [0.003, 0.006, 0.011];

export function StarField({ count = 200 }: { count?: number }) {
  const layerRefs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ];

  const stars = useMemo<Star[]>(() => {
    const rand = lcg(0xdeadbeef);
    return Array.from({ length: count }, (_, i) => {
      const size = rand() * 2.0 + 0.4;
      const layer: 0 | 1 | 2 = size < 1.1 ? 0 : size < 1.7 ? 1 : 2;
      return {
        id: i,
        x: rand() * 100,
        y: rand() * 100,
        size,
        layer,
        duration: rand() * 5 + 2,
        delay: -(rand() * 10), // negative delay starts stars mid-cycle immediately
        baseOpacity: rand() * 0.55 + 0.15,
        color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
      };
    });
  }, [count]);

  // Attach a single window-level listener; update 3 layer divs via refs — no React re-renders.
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const nx = (e.clientX - window.innerWidth  / 2) / (window.innerWidth  / 2);
      const ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      layerRefs.forEach((ref, i) => {
        if (!ref.current) return;
        const dx = nx * LAYER_PARALLAX[i] * window.innerWidth;
        const dy = ny * LAYER_PARALLAX[i] * window.innerHeight;
        ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    }
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byLayer = useMemo(() => {
    const groups: [Star[], Star[], Star[]] = [[], [], []];
    for (const star of stars) groups[star.layer].push(star);
    return groups;
  }, [stars]);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {byLayer.map((layerStars, layerIdx) => (
        <div
          key={layerIdx}
          ref={layerRefs[layerIdx]}
          className="absolute inset-0"
          style={{ willChange: 'transform' }}
        >
          {layerStars.map(star => (
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
      ))}
    </div>
  );
}

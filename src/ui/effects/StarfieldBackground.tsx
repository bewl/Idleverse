import { useEffect, useRef, useState } from 'react';

interface Star {
  x: number; // 0–1 normalized
  y: number;
  size: number;
  opacity: number;
  layer: 0 | 1 | 2; // 0=far, 1=mid, 2=near
}

const LAYER_COUNT = [80, 40, 15];
const LAYER_SPEED = [0.008, 0.018, 0.035]; // parallax multiplier per layer

function generateStars(): Star[] {
  const stars: Star[] = [];
  for (let layer = 0 as 0 | 1 | 2; layer < 3; layer++) {
    for (let i = 0; i < LAYER_COUNT[layer]; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: layer === 0 ? 0.8 : layer === 1 ? 1.2 : 1.8,
        opacity: 0.2 + Math.random() * (layer === 0 ? 0.4 : layer === 1 ? 0.5 : 0.7),
        layer,
      });
    }
  }
  return stars;
}

export function StarfieldBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [stars] = useState<Star[]>(() => generateStars());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parent = container.closest('[data-exploration-panel]') ?? container.parentElement;
    if (!parent) return;

    function onMouseMove(e: MouseEvent) {
      const rect = (parent as HTMLElement).getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setOffset({
        x: (e.clientX - cx) / rect.width,
        y: (e.clientY - cy) / rect.height,
      });
    }
    (parent as HTMLElement).addEventListener('mousemove', onMouseMove);
    return () => (parent as HTMLElement).removeEventListener('mousemove', onMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
    >
      {stars.map((star, i) => {
        const speed = LAYER_SPEED[star.layer];
        const px = (star.x + offset.x * speed) * 100;
        const py = (star.y + offset.y * speed) * 100;
        const twinkleClass = star.layer === 2 ? 'animate-pulse' : '';
        return (
          <div
            key={i}
            className={`absolute rounded-full ${twinkleClass}`}
            style={{
              left: `${px}%`,
              top: `${py}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: star.opacity,
              backgroundColor: star.layer === 2 ? '#c7d2fe' : '#94a3b8',
              transform: 'translate(-50%, -50%)',
              willChange: 'transform',
            }}
          />
        );
      })}
    </div>
  );
}

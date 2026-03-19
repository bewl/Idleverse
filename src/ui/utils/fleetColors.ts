export const FLEET_COLOURS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#60a5fa'] as const;

export function getFleetColorByIndex(index: number) {
  if (index < 0) return '#94a3b8';
  return FLEET_COLOURS[index % FLEET_COLOURS.length] ?? '#94a3b8';
}
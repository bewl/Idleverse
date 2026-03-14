import type { SaveFile, GameState } from '@/types/game.types';
import { SAVE_VERSION } from '@/game/balance/constants';

const SAVE_KEY = 'idleverse-save';

export function saveGame(state: GameState): void {
  const save: SaveFile = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {
    console.error('[Idleverse] Failed to save game:', e);
  }
}

export function loadGame(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as SaveFile;
    if (typeof save.version !== 'number') return null;
    // Future: run version migrations here before returning
    return save;
  } catch (e) {
    console.error('[Idleverse] Failed to load game:', e);
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

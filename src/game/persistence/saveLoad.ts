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
    // Migrate: ensure all pilots have commandSkills (FC-2)
    const fleetState = save.state?.systems?.fleet;
    if (fleetState) {
      for (const pilot of Object.values(fleetState.pilots ?? {}) as any[]) {
        if (!pilot.commandSkills) {
          pilot.commandSkills = { levels: {}, queue: [], activeSkillId: null, activeProgress: 0 };
        }
      }
      for (const fleet of Object.values(fleetState.fleets ?? {}) as any[]) {
        if (!('commanderId' in fleet)) {
          fleet.commanderId = null;
        }
        if (!Array.isArray(fleet.wings)) {
          fleet.wings = [];
        }
        for (const wing of fleet.wings) {
          if (!('commanderId' in wing)) {
            wing.commanderId = null;
          }
          if (!wing.cargoHold) {
            wing.cargoHold = {};
          }
        }
      }
    }
    return save;
  } catch (e) {
    console.error('[Idleverse] Failed to load game:', e);
    return null;
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

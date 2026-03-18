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
          if (!('lastEscortCombatAt' in wing)) {
            wing.lastEscortCombatAt = 0;
          }
        }
      }
    }
    const factionsState = save.state?.systems?.factions as (GameState['systems']['factions'] & {
      homeStationSystemId?: string | null;
      registeredStations?: string[];
    }) | undefined;
    if (factionsState) {
      if (!Array.isArray(factionsState.registeredStations)) {
        factionsState.registeredStations = [];
      }
      if (factionsState.homeStationId && !factionsState.registeredStations.includes(factionsState.homeStationId)) {
        factionsState.registeredStations.push(factionsState.homeStationId);
      }
      if (typeof factionsState.homeStationSystemId === 'undefined') {
        factionsState.homeStationSystemId = null;
      }
      if (!factionsState.outposts || typeof factionsState.outposts !== 'object') {
        factionsState.outposts = {};
      }
      for (const [systemId, outpost] of Object.entries(factionsState.outposts) as Array<[string, any]>) {
        if (!outpost) continue;
        if (!('id' in outpost) || typeof outpost.id !== 'string' || outpost.id.length === 0) {
          outpost.id = `outpost-${systemId}`;
        }
      }
    }
    if (!save.state.notifications || !Array.isArray(save.state.notifications.entries)) {
      save.state.notifications = { entries: [] };
    }
    if (!save.state.systems?.rewards || typeof save.state.systems.rewards !== 'object') {
      save.state.systems.rewards = {
        inventory: [],
        history: [],
        discoveredDefinitionIds: {},
      };
    } else {
      if (!Array.isArray(save.state.systems.rewards.inventory)) {
        save.state.systems.rewards.inventory = [];
      }
      if (!Array.isArray(save.state.systems.rewards.history)) {
        save.state.systems.rewards.history = [];
      }
      if (!save.state.systems.rewards.discoveredDefinitionIds || typeof save.state.systems.rewards.discoveredDefinitionIds !== 'object') {
        save.state.systems.rewards.discoveredDefinitionIds = {};
      }
      for (const item of save.state.systems.rewards.inventory as any[]) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.quantity !== 'number') {
          item.quantity = 1;
        }
        if (typeof item.stackable !== 'boolean') {
          item.stackable = false;
        }
        if (!item.source || typeof item.source !== 'object') {
          item.source = {
            type: 'combat',
            id: 'legacy-save',
            name: 'Legacy Reward',
            acquiredAt: save.savedAt ?? Date.now(),
          };
        }
      }
    }
    if (!save.state.tutorial || typeof save.state.tutorial !== 'object') {
      save.state.tutorial = {
        currentStepId: null,
        completedStepIds: [],
        skippedAt: Date.now(),
        completedAt: null,
      };
    } else {
      if (!Array.isArray(save.state.tutorial.completedStepIds)) {
        save.state.tutorial.completedStepIds = [];
      }
      if (typeof save.state.tutorial.currentStepId === 'undefined') {
        save.state.tutorial.currentStepId = null;
      }
      if (typeof save.state.tutorial.skippedAt === 'undefined') {
        save.state.tutorial.skippedAt = null;
      }
      if (typeof save.state.tutorial.completedAt === 'undefined') {
        save.state.tutorial.completedAt = null;
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

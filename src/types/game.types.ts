// ─── Resource ──────────────────────────────────────────────────────────────

export interface ResourceDefinition {
  id: string;
  name: string;
  category: string;
  tier: 1 | 2 | 3 | 4 | 5;
  precision: number;
  description: string;
  isHidden?: boolean;
}

// ─── Mining ────────────────────────────────────────────────────────────────

export interface MiningTargetOutput {
  resourceId: string;
  baseRate: number; // units per second
}

export interface MiningTargetDefinition {
  id: string;
  name: string;
  description: string;
  outputs: MiningTargetOutput[];
  energyCost: number;
  unlockResearch?: string;
}

export interface MiningUpgradeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'efficiency' | 'extraction' | 'drone' | 'deepMining';
  systemId: 'mining';
  baseCost: Record<string, number>;
  maxLevel: number;
  effects: Record<string, number>; // modifier id -> delta per level
  prerequisiteUpgrade?: string;
  prerequisiteResearch?: string;
}

export interface MiningState {
  targets: Record<string, boolean>; // target id -> active
  upgrades: Record<string, number>; // upgrade id -> level
  lifetimeProduced: Record<string, number>;
  masteryXp: number;
}

// ─── Energy ────────────────────────────────────────────────────────────────

export interface EnergySourceDefinition {
  id: string;
  name: string;
  description: string;
  supplyPerLevel: number;
  baseCost: Record<string, number>;
  maxLevel: number;
  unlockResearch?: string;
}

export interface EnergyState {
  sources: Record<string, number>; // source id -> level
  totalSupply: number;
  totalDemand: number;
  powerFactor: number;
  masteryXp: number;
}

// ─── Research ──────────────────────────────────────────────────────────────

export type ResearchCategory = 'industrial' | 'energy' | 'ai' | 'exploration';

export interface ResearchEffect {
  modifier: string;
  value: number;
}

export interface ResearchNodeDefinition {
  id: string;
  name: string;
  description: string;
  category: ResearchCategory;
  tier: number;
  depth: number;
  baseCost: Record<string, number>;
  baseTime: number; // base seconds
  prerequisites: string[];
  effects: ResearchEffect[];
  unlocks: string[];
}

export interface ResearchState {
  unlockedNodes: Record<string, boolean>;
  activeNodeId: string | null;
  activeProgress: number; // seconds elapsed
  masteryXp: number;
}

// ─── Manufacturing ─────────────────────────────────────────────────────────

export interface ManufacturingRecipeDefinition {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  timeCost: number; // seconds per unit
  prerequisiteResearch?: string;
}

export interface ManufacturingJob {
  recipeId: string;
  progress: number; // seconds elapsed
  quantity: number;
}

export interface ManufacturingState {
  queue: ManufacturingJob[];
  completedCount: Record<string, number>;
  masteryXp: number;
}

// ─── Prestige ──────────────────────────────────────────────────────────────

export interface PrestigeState {
  points: number;
  totalLifetimeProduction: number;
  runCount: number;
  permanentBonuses: Record<string, number>;
}

// ─── Mastery ───────────────────────────────────────────────────────────────

export interface SystemMasteryState {
  level: number;
  xp: number;
  milestonesClaimed: string[];
}

// ─── Automation ────────────────────────────────────────────────────────────

export interface AutomationState {
  tier: number;
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface GameSettings {
  autoSave: boolean;
  autoSaveInterval: number; // ms
}

// ─── Unlocks ───────────────────────────────────────────────────────────────

export type UnlockRequirementType =
  | 'resource'
  | 'research'
  | 'systemLevel'
  | 'milestone'
  | 'prestige';

export interface UnlockRequirement {
  type: UnlockRequirementType;
  target: string;
  value: number | string;
}

// ─── Global game state ─────────────────────────────────────────────────────

export interface GameSystems {
  mining: MiningState;
  energy: EnergyState;
  research: ResearchState;
  manufacturing: ManufacturingState;
}

export interface GameState {
  version: number;
  lastUpdatedAt: number;
  resources: Record<string, number>;
  systems: GameSystems;
  unlocks: Record<string, boolean>;
  modifiers: Record<string, number>;
  mastery: Record<string, SystemMasteryState>;
  prestige: PrestigeState;
  automation: AutomationState;
  settings: GameSettings;
}

// ─── Save / Offline ────────────────────────────────────────────────────────

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export interface OfflineSummary {
  elapsedSeconds: number;
  resourcesGained: Record<string, number>;
  completedResearch: string[];
  completedManufacturing: Record<string, number>;
  wasCapped: boolean;
}

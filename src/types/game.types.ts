import type { GalaxyState } from '@/types/galaxy.types';
import type { FactionsState, FleetOrder } from '@/types/faction.types';
import type { CombatOrder, CombatLogEntry } from '@/types/combat.types';

// ─── Exploration ───────────────────────────────────────────────────────────

export type AnomalyType = 'ore-pocket' | 'data-site' | 'relic-site' | 'combat-site' | 'wormhole';

export interface Anomaly {
  id: string;
  systemId: string;
  type: AnomalyType;
  name: string;
  /** Lower = harder to scan (takes more fleet sensor-time). */
  signatureRadius: number;
  /** 0–100. Scanning fleets advance this each tick. */
  scanProgress: number;
  /** true once scanProgress reaches 100. */
  revealed: boolean;
  /** true once the site has been looted / mined out / collapsed. */
  depleted: boolean;
  /** Ore pocket: unix-ms when the bonus belt expires. null = not yet activated. */
  bonusExpiresAt: number | null;
  /** Wormhole: destination system ID. */
  linkedSystemId: string | null;
  /** Wormhole: mass units remaining before collapse. */
  massRemaining: number | null;
  /** Wormhole / time-limited anomaly expiry (unix-ms). null = does not expire. */
  expiresAt: number | null;
}

export interface DiscoveryEntry {
  id: string;
  timestamp: number;
  anomalyType: AnomalyType;
  anomalyName: string;
  systemId: string;
  systemName: string;
}

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

export type RewardSourceType = 'combat' | 'mining' | 'anomaly' | 'mission';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface RewardItemRolls {
  effects?: Record<string, number>;
}

export interface RewardItemSource {
  type: RewardSourceType;
  id: string;
  name: string;
  acquiredAt: number;
}

export interface RewardInventoryItem {
  id: string;
  definitionId: string;
  rarity: ItemRarity;
  quantity: number;
  stackable: boolean;
  source: RewardItemSource;
  rolls?: RewardItemRolls;
}

export interface RewardHistoryItemEntry {
  definitionId: string;
  rarity: ItemRarity;
  quantity: number;
}

export interface RewardHistoryEntry {
  id: string;
  timestamp: number;
  sourceType: RewardSourceType;
  sourceId: string;
  sourceName: string;
  creditsEarned: number;
  resourceRewards: Record<string, number>;
  itemRewards: RewardHistoryItemEntry[];
}

export interface RewardsState {
  inventory: RewardInventoryItem[];
  history: RewardHistoryEntry[];
  discoveredDefinitionIds: Record<string, boolean>;
}

// ─── Skills ────────────────────────────────────────────────────────────────

export type SkillCategory = 'spaceship' | 'mining' | 'industry' | 'science' | 'electronics' | 'trade';

export interface SkillEffect {
  /** Key into GameState.modifiers, e.g. 'mining-yield', 'reprocessing-efficiency'. */
  modifier: string;
  /** Added to the modifier per skill level owned. */
  valuePerLevel: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  /** Training time rank (1–5). Level training time = SKILL_LEVEL_SECONDS[level-1] × rank. */
  rank: 1 | 2 | 3 | 4 | 5;
  effects: SkillEffect[];
  /** skillId → minimum level required before this skill can be trained. */
  prerequisiteSkills?: Record<string, number>;
  /** Unlock keys granted when the skill reaches level 1. */
  unlocks?: string[];
  /** If true, pilots can train this skill individually (in addition to corp-wide leveling). */
  pilotTrainable?: boolean;
}

export interface SkillQueueEntry {
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
}

export interface SkillsState {
  /** Current level per skill (0 = untrained). */
  levels: Record<string, number>;
  activeSkillId: string | null;
  /** Seconds elapsed training the current active level. */
  activeProgress: number;
  /** Queued skills (up to 50 entries). */
  queue: SkillQueueEntry[];
}

// ─── Mining ────────────────────────────────────────────────────────────────

export type OreSecurityTier = 'highsec' | 'lowsec' | 'nullsec';

export interface OreBeltDefinition {
  id: string;
  name: string;
  description: string;
  securityTier: OreSecurityTier;
  outputs: Array<{ resourceId: string; baseRate: number }>;
  requiredSkill?: { skillId: string; minLevel: number };
  /** Total ore units in the belt before it is exhausted. */
  poolSize: number;
  /** Seconds until the belt respawns after being exhausted. */
  respawnSeconds: number;
}

export interface MiningUpgradeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'laser' | 'drone' | 'yield' | 'hull';
  systemId: 'mining';
  baseCost: Record<string, number>;
  maxLevel: number;
  effects: Record<string, number>;
  prerequisiteSkill?: { skillId: string; minLevel: number };
}

export interface MiningState {
  targets: Record<string, boolean>;           // beltId → active
  upgrades: Record<string, number>;           // upgradeId → level
  lifetimeProduced: Record<string, number>;
  /** Ore currently in the hold, waiting to be hauled to inventory. */
  oreHold: Record<string, number>;
  /** Remaining ore pool per belt (undefined = full). */
  beltPool: Record<string, number>;
  /** Unix-ms timestamp when each depleted belt will respawn (0 = not depleted). */
  beltRespawnAt: Record<string, number>;
  /** Unix-ms timestamp of the last auto/manual haul. */
  lastHaulAt: number;
}

// ─── Reprocessing ──────────────────────────────────────────────────────────

export interface ReprocessingJob {
  oreId: string;
  amount: number;
  progress: number; // seconds elapsed
  /** True if this batch was added by the auto-reprocessing system. */
  isAuto?: boolean;
}

export interface ReprocessingState {
  queue: ReprocessingJob[];
  /** Ores for which auto-reprocessing is enabled. */
  autoTargets: Record<string, boolean>;
  /** Minimum ore units to keep in inventory before auto-reprocessing the rest. */
  autoThreshold: Record<string, number>;
}

// ─── Manufacturing ─────────────────────────────────────────────────────────

export interface ManufacturingRecipeDefinition {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  timeCost: number;
  category: 'component' | 'ship' | 'module' | 'ammo';
  requiredSkill?: { skillId: string; minLevel: number };
  /** True for T2 recipes — requires a corresponding T2 BPC to queue the job. */
  isTech2?: boolean;
}

export interface ManufacturingJob {
  recipeId: string;
  progress: number;
  quantity: number;
  /** If set, this BPC is consumed (runs decremented) on job completion. */
  blueprintId?: string;
}

// ─── Blueprints & Research ─────────────────────────────────────────────────

export interface Blueprint {
  id: string;
  /** Recipe ID this blueprint corresponds to (e.g. 'recipe-ship-frigate'). */
  itemId: string;
  tier: 1 | 2;
  type: 'original' | 'copy';
  /** 0–10; applies to originals only. Level 5 grants a corresponding T2 BPO. */
  researchLevel: number;
  /** null = unlimited (originals); number = remaining runs (copies). */
  copiesRemaining: number | null;
  /** True while being researched or copied — prevents concurrent operations. */
  isLocked: boolean;
}

export interface ResearchJob {
  id: string;
  blueprintId: string;
  targetLevel: number;
  /** Seconds elapsed since job started. */
  progress: number;
  /** Pre-computed total time in seconds for this level. */
  totalTime: number;
}

export interface CopyJob {
  id: string;
  blueprintId: string;
  /** How many runs the resulting BPC will have. */
  runs: number;
  progress: number;
  totalTime: number;
}

export interface ManufacturingState {
  queue: ManufacturingJob[];
  completedCount: Record<string, number>;
  blueprints: Blueprint[];
  researchJobs: ResearchJob[];
  copyJobs: CopyJob[];
}

// ─── Market ────────────────────────────────────────────────────────────────

export interface MarketState {
  /** Current NPC buy prices per unit in Credits (what NPC pays player). */
  prices: Record<string, number>;
  lastTickAt: number;
  /** Auto-sell settings per resource: auto-sell surplus above threshold. */
  autoSell: Record<string, { enabled: boolean; threshold: number }>;
  /** Lifetime ISK earned per resource from manual and auto sells. */
  lifetimeSold: Record<string, number>;
  /** Lifetime Credits spent per resource from direct market purchases. */
  lifetimeBought: Record<string, number>;
}

// ─── Notifications / Inbox ───────────────────────────────────────────────

export type NotificationCategory =
  | 'progression'
  | 'industry'
  | 'fleet'
  | 'combat'
  | 'exploration'
  | 'economy'
  | 'faction'
  | 'system';

export type NotificationKind = 'alert' | 'message' | 'update';

export type NotificationSeverity = 'critical' | 'warning' | 'success' | 'info' | 'queued';

export type NotificationTargetPanelId =
  | 'overview'
  | 'inbox'
  | 'skills'
  | 'mining'
  | 'manufacturing'
  | 'reprocessing'
  | 'market'
  | 'fleet'
  | 'starmap'
  | 'system';

export type NotificationTargetEntityType = 'fleet' | 'pilot' | 'ship' | 'wing' | 'skill' | 'resource' | 'system' | 'anomaly' | 'panel';

export interface NotificationFocusTarget {
  panelId: NotificationTargetPanelId;
  entityType: NotificationTargetEntityType;
  entityId: string;
  panelSection?: string;
  parentEntityId?: string;
}

export interface NotificationEntry {
  id: string;
  category: NotificationCategory;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  archivedAt: number | null;
  sourceSystem: string;
  sourceKey?: string;
  actionLabel?: string;
  focusTarget?: NotificationFocusTarget;
}

export interface NotificationState {
  entries: NotificationEntry[];
}

// ─── Tutorial / Onboarding ───────────────────────────────────────────────

export type TutorialStepId =
  | 'welcome-briefing'
  | 'command-deck'
  | 'queue-first-skill'
  | 'complete-first-skill'
  | 'first-sale'
  | 'fleet-command-intro'
  | 'starmap-dispatch-fleet'
  | 'fleet-arrival-watch'
  | 'system-assign-mining'
  | 'mining-readout'
  | 'guidance-handoff';

export interface TutorialState {
  currentStepId: TutorialStepId | null;
  completedStepIds: TutorialStepId[];
  skippedAt: number | null;
  completedAt: number | null;
}

// ─── Trade Routes ────────────────────────────────────────────────────────────

export interface TradeRoute {
  id: string;
  name: string;
  /** Fleet group assigned to run this route autonomously. */
  fleetId: string;
  fromSystemId: string;
  toSystemId: string;
  resourceId: string;
  /** Units to buy at fromSystem and sell at toSystem per run. */
  amountPerRun: number;
  /** Whether the route is actively running (false = paused). */
  enabled: boolean;
  /** Units currently in transit (bought at fromSystem, not yet sold at toSystem). */
  inTransit: number;
  /** Total ISK cost paid to purchase the in-transit cargo. Used to compute run profit. */
  buyCostForTransit: number;
  /** ISK profit from the most recently completed run. null = no run completed yet. */
  lastRunProfit: number | null;
  /** Total runs completed since route creation. */
  totalRunsCompleted: number;
}

// ─── Fleet ─────────────────────────────────────────────────────────────────

export type ShipClass =
  | 'shuttle' | 'frigate' | 'mining-frigate'
  | 'destroyer' | 'cruiser' | 'battleship'
  | 'exhumer' | 'hauler';

export type FleetActivity = 'idle' | 'mining' | 'hauling' | 'transport';

export type ShipRole = 'tank' | 'dps' | 'support' | 'scout' | 'unassigned';
export type FleetDoctrine = 'balanced' | 'brawl' | 'sniper' | 'shield-wall' | 'stealth-raid';

export interface ShipDefinition {
  id: string;
  name: string;
  shipClass: ShipClass;
  description: string;
  miningYieldMultiplier: number;
  cargoCapacity: number;
  missionIncomePerSecond: number;
  requiredSkill?: { skillId: string; minLevel: number };
}

export interface ShipInstance {
  id: string;
  shipDefinitionId: string;
  customName?: string;
  activity: FleetActivity;
  assignedBeltId?: string;
  assignedPilotId: string | null;
  systemId: string;
  fittedModules: { high: string[]; mid: string[]; low: string[] };
  deployedAt: number;
  /** Active autonomous movement order. null = ship stays put. Only used for ships NOT in a fleet group. */
  fleetOrder: FleetOrder | null;
  /** The fleet group this ship belongs to, or null if standalone. */
  fleetId: string | null;
  /** Combat role assigned to this ship. Affects doctrine multipliers. */
  role: ShipRole;
  /** Hull damage percentage (0–100). Higher = reduced combat effectiveness. */
  hullDamage: number;
}

// ─── Fleet Wings ──────────────────────────────────────────────────────────

export type WingType = 'mining' | 'hauling' | 'combat' | 'recon' | 'industrial';

export interface RecentTransitArrival {
  fromSystemId: string;
  toSystemId: string;
  arrivedAt: number;
}

export interface FleetWing {
  id: string;
  name: string;
  type: WingType;
  /** IDs of ships assigned to this wing. A ship belongs to at most one wing. */
  shipIds: string[];
  /** Pilot ID of the wing commander, or null if none. */
  commanderId: string | null;
  /** Ore currently stored in this wing's hold. Used by hauling wings. */
  cargoHold: Record<string, number>;
  /** Combat wing that escorts this wing on haul trips. */
  escortWingId: string | null;
  /** True while this wing's ships are dispatched on a haul trip to Corp HQ. */
  isDispatched: boolean;
  /** System the wing departed from — used to issue the return trip. */
  haulingOriginSystemId: string | null;
  /** Timestamp (ms) when HQ offloading started for this detached wing. */
  hqOffloadStartedAt?: number | null;
  /** Most recent completed inter-system arrival for local scene presentation. */
  recentTransitArrival?: RecentTransitArrival | null;
  /** Timestamp (ms) of the last detached escort combat engagement for this wing convoy. */
  lastEscortCombatAt: number;
}

// ─── Player Fleet (named group of ships) ───────────────────────────────────

/**
 * A named group of ships that travel and receive orders as a single unit.
 * The fleet has one shared position (currentSystemId) and one active order.
 */
export interface PlayerFleet {
  id: string;
  name: string;
  /** IDs of ships assigned to this fleet. */
  shipIds: string[];
  /** Where the fleet is currently located. */
  currentSystemId: string;
  /** Active movement order for the whole fleet. null = fleet is stationary. */
  fleetOrder: FleetOrder | null;
  /** Maximum single-hop jump range in LY, computed from the hull composition. */
  maxJumpRangeLY: number;
  /** Combat doctrine governing how ships fight together. */
  doctrine: FleetDoctrine;
  /** Active combat engagement order. null = fleet is not engaged. */
  combatOrder: CombatOrder | null;
  /** When true the fleet is actively scanning its current system for anomalies. */
  isScanning: boolean;
  /** Ore currently held in this fleet's cargo holds, waiting to haul to Corp HQ. */
  cargoHold: Record<string, number>;
  /** The system the fleet was mining when auto-haul fired. Used to return the fleet after unloading. */
  miningOriginSystemId?: string;
  /** Timestamp (ms) when HQ offloading started for a whole-fleet auto-haul trip. */
  hqOffloadStartedAt?: number | null;
  /** Most recent completed inter-system arrival for local scene presentation. */
  recentTransitArrival?: RecentTransitArrival | null;
  /** Pilot ID of the designated fleet commander, or null if none. */
  commanderId: string | null;
  /** Sub-groups of ships organized by role. Empty array = no wings defined. */
  wings: FleetWing[];
}

// ─── Pilot ─────────────────────────────────────────────────────────────────

export type PilotTrainingFocus = 'mining' | 'combat' | 'hauling' | 'exploration' | 'balanced';

export interface PilotSkillQueueEntry {
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
}

export interface PilotSkillState {
  /** Current level per pilot-trainable skill (0 = untrained). */
  levels: Record<string, number>;
  queue: PilotSkillQueueEntry[];
  activeSkillId: string | null;
  /** Seconds elapsed training the current active level. */
  activeProgress: number;
  /** When set, idle system will auto-select training from this focus tree. */
  idleTrainingFocus: PilotTrainingFocus | null;
}

export interface PilotStats {
  oreMinedTotal: number;
  iskEarnedTotal: number;
  systemsVisited: number;
  combatKills: number;
}

// ─── Commander Skills ──────────────────────────────────────────────────────

export interface CommanderSkillQueueEntry {
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4 | 5;
}

export interface CommanderSkillState {
  /** Trained command skill levels (0 = untrained). */
  levels: Record<string, number>;
  queue: CommanderSkillQueueEntry[];
  activeSkillId: string | null;
  /** Seconds elapsed training the current active level. */
  activeProgress: number;
}

export interface PilotInstance {
  id: string;
  name: string;
  isPlayerPilot: boolean;
  portraitSeed: number;
  backstory: string;
  hiredAt: number;
  status: 'idle' | 'active' | 'docked' | 'incapacitated';
  currentSystemId: string;
  assignedShipId: string | null;
  skills: PilotSkillState;
  /** 0–100. Below 30 incurs performance penalty; above 80 grants bonus. */
  morale: number;
  experience: number;
  stats: PilotStats;
  /** ISK per real day. 0 for the player pilot. */
  payrollPerDay: number;
  /** Command skill training state. Active only when this pilot is a designated fleet commander. */
  commandSkills: CommanderSkillState;
}

export interface PilotRecruitmentOffer {
  id: string;
  pilotSeed: number;
  name: string;
  trainingFocus: PilotTrainingFocus;
  hiringCost: number;
  payrollPerDay: number;
  backstory: string;
  previewSkills: Record<string, number>;
  source?: 'contracts' | 'milestone';
  sourceLabel?: string;
  recommendationReason?: string;
  milestoneId?: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  slotType: 'high' | 'mid' | 'low';
  /** Key → additive multiplier bonus applied while fitted. */
  effects: Record<string, number>;
  buildCost: Record<string, number>;
}

export interface HullDefinition {
  id: string;
  name: string;
  shipClass: ShipClass;
  description: string;
  /** Resource id for this hull (e.g. 'ship-frigate'). */
  resourceId: string;
  baseMiningBonus: number;
  baseCombatRating: number;
  baseCargoMultiplier: number;
  warpSpeedBonus: number;
  moduleSlots: { high: number; mid: number; low: number };
  requiredPilotSkill?: { skillId: string; minLevel: number };
  /** Base sensor strength contributed to fleet scanning each tick. */
  baseSensorStrength: number;
}

export interface FleetState {
  ships: Record<string, ShipInstance>;
  pilots: Record<string, PilotInstance>;
  recruitmentOffers: PilotRecruitmentOffer[];
  recruitmentMilestones: Record<string, boolean>;
  /** Named fleet groups (ships travel as a unit under one order). */
  fleets: Record<string, PlayerFleet>;
  /** Maximum number of concurrent fleet groups the player may command. */
  maxFleets: number;
  /** Recent combat engagements across all fleets. */
  combatLog: CombatLogEntry[];
  /** Autonomous inter-system trade routes. */
  tradeRoutes: TradeRoute[];
  /** Anomaly discoveries log (most recent first, capped at 50). */
  discoveries: DiscoveryEntry[];
}

// ─── Structures ────────────────────────────────────────────────────────────

export interface StructureDefinition {
  id: string;
  name: string;
  description: string;
  baseCost: Record<string, number>;
  maxLevel: number;
  effects: Record<string, number>;
}

export interface StructuresState {
  levels: Record<string, number>;
}

// ─── Corp Director ────────────────────────────────────────────────────────

export interface CorpState {
  name: string;
  foundedAt: number; // ms timestamp
}

/** @deprecated Use CorpState --- kept for save migration */
export type PilotState = CorpState;

// ─── Settings ──────────────────────────────────────────────────────────────

export interface GameSettings {
  autoSave: boolean;
  autoSaveInterval: number;
  audioEnabled: boolean;
  /** Master audio volume in the range 0..1. */
  masterVolume: number;
}

// ─── Unlocks ───────────────────────────────────────────────────────────────

export type UnlockRequirementType = 'resource' | 'skill' | 'milestone';

export interface UnlockRequirement {
  type: UnlockRequirementType;
  target: string;
  value: number | string;
}

// ─── Global game state ─────────────────────────────────────────────────────

export interface GameSystems {
  skills: SkillsState;
  mining: MiningState;
  reprocessing: ReprocessingState;
  manufacturing: ManufacturingState;
  market: MarketState;
  fleet: FleetState;
  rewards: RewardsState;
  structures: StructuresState;
  factions: FactionsState;
}

export interface GameState {
  version: number;
  lastUpdatedAt: number;
  corp: CorpState;
  /** @deprecated legacy field - present only during save migration */
  pilot?: PilotState;
  resources: Record<string, number>;
  systems: GameSystems;
  unlocks: Record<string, boolean>;
  /** Aggregated multipliers computed from skills + structures. */
  modifiers: Record<string, number>;
  notifications: NotificationState;
  tutorial: TutorialState;
  settings: GameSettings;
  galaxy: GalaxyState;
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
  completedManufacturing: Record<string, number>;
  skillsAdvanced: Array<{ skillId: string; fromLevel: number; toLevel: number }>;
  wasCapped: boolean;
  /** How many ore-hold hauls were triggered during offline simulation. */
  oreHoldFilled: number;
}


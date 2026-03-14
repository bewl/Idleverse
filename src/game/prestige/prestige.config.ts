/** What gets reset on prestige. */
export const PRESTIGE_RESET_SYSTEMS = [
  'mining',
  'energy',
  'research',
  'manufacturing',
] as const;

/** Minimum cumulative lifetime production required to trigger prestige. */
export const PRESTIGE_MIN_LIFETIME_PRODUCTION = 1000;

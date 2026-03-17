// ─── Ore → Mineral Yield Table ─────────────────────────────────────────────
// Units of mineral produced per BATCH_SIZE_BASE ore at 1.0 reprocessing-efficiency.
// Actual yield = floor(tableValue * (amount / BATCH_SIZE_BASE) * efficiency).
//
// Highsec ores → common minerals (ferrite, silite, vexirite, isorium)
// Lowsec  ores → add noxium
// Nullsec ores → add zyridium, megacite, voidsteel

/** Ore units per processing batch (base). */
export const BATCH_SIZE_BASE = 100;

/** Seconds to process one batch at base speed. */
export const BATCH_TIME_SECONDS = 60;

/** Maximum auto-batches queued per ore type at a time (prevents queue flooding). */
export const MAX_AUTO_BATCHES_PER_ORE = 5;

export const ORE_YIELD_TABLE: Record<string, Record<string, number>> = {

  // ── Highsec ──────────────────────────────────────────────────────────────

  'ferrock': {
    // "Yields Ferrite and Silite"
    'ferrite': 80,
    'silite':  15,
  },

  'corite': {
    // "high Ferrite yields and trace Vexirite"
    'ferrite':  50,
    'silite':   20,
    'vexirite': 15,
  },

  'silisite': {
    // "reprocesses into Silite and Isorium"
    'silite':  70,
    'isorium': 18,
  },

  'platonite': {
    // "broad mineral yields across all common types"
    'ferrite':  30,
    'silite':   25,
    'vexirite': 20,
    'isorium':  12,
  },

  // ── Lowsec ───────────────────────────────────────────────────────────────

  'darkstone': {
    // "Rich in Isorium and trace Noxium"
    'ferrite':  10,
    'isorium':  55,
    'noxium':   12,
  },

  'hematite': {
    // "Notable Vexirite and Noxium source"
    'vexirite': 40,
    'isorium':  22,
    'noxium':   12,
  },

  'voidite': {
    // "Uncommon source of Zyridium crystals"
    'silite':   10,
    'noxium':   18,
    'zyridium': 25,
  },

  'ionite': {
    // "Charged ore for reactor-conductor supply chains"
    'isorium': 18,
    'noxium':  14,
    'fluxite': 20,
  },

  // ── Nullsec ───────────────────────────────────────────────────────────────

  'arkonite': {
    // "Yields Zyridium and Megacite"
    'zyridium': 35,
    'megacite': 12,
  },

  'crokitite': {
    // "The only natural source of Voidsteel"
    'zyridium':  8,
    'megacite':  15,
    'voidsteel': 22,
  },
};

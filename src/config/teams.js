// Config équipes : drapeaux, slugs, normalisation

export const TEAM_FLAGS = {
  'QUÉBEC':          '/assets/flags/qc.svg',
  'QUEBEC':          '/assets/flags/qc.svg',
  "CÔTE D'IVOIRE":   '/assets/flags/ci.svg',
  "COTE D'IVOIRE":   '/assets/flags/ci.svg',
  'GAMBIE':          '/assets/flags/gm.svg',
  'MADAGASCAR':      '/assets/flags/mg.svg',
  'NATIONS-UNIES':   '/assets/flags/un.svg',
  'CAMEROUN':        '/assets/flags/cm.svg',
  'ALGÉRIE':         '/assets/flags/dz.svg',
  'ALGERIE':         '/assets/flags/dz.svg',
  'CENTRAFRIQUE':    '/assets/flags/cf.svg',
  'CANADA':          '/assets/flags/ca.svg',
  'HAÏTI':           '/assets/flags/ht.svg',
  'HAITI':           '/assets/flags/ht.svg',
  'RD CONGO':        '/assets/flags/cd.svg',
  'TOGO':            '/assets/flags/tg.svg',
  'GABON':           '/assets/flags/ga.svg',
  'SÉNÉGAL':         '/assets/flags/sn.svg',
  'SENEGAL':         '/assets/flags/sn.svg',
  'GUINÉE':          '/assets/flags/gn.svg',
  'GUINEE':          '/assets/flags/gn.svg',
  'TANZANIE':        '/assets/flags/tz.svg',
  'BURKINA FASO':    '/assets/flags/bf.svg',
  'MALI':            '/assets/flags/ml.svg',
};

// Mapping noms de feuilles Excel → noms normalisés
export const SHEET_TO_TEAM = {
  // Groupe A
  'ALGÉRIE':       'ALGÉRIE',
  'CiV':           "CÔTE D'IVOIRE",
  'CANADA':        'CANADA',
  'NATIONS-UNIES': 'NATIONS-UNIES',
  'GAMBIE':        'GAMBIE',
  'MADAGAS':       'MADAGASCAR',
  'CAMEROUN':      'CAMEROUN',
  'QUÉBEC':        'QUÉBEC',
  'CENTRAFRIQUE':  'CENTRAFRIQUE',
  // Groupe B
  'CONGO':         'RD CONGO',
  'SENEGAL':       'SÉNÉGAL',
  'GABON':         'GABON',
  'GUINÉE':        'GUINÉE',
  'TOGO':          'TOGO',
  'TANZANIE':      'TANZANIE',
  'BURKINA FASO':  'BURKINA FASO',
  'HAITI':         'HAÏTI',
  'MALI':          'MALI',
};

/**
 * Normalise un nom d'équipe (trim, uppercase, apostrophe unifiée)
 */
export function normalizeTeamName(name) {
  if (!name) return '';
  return name
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\u2019/g, "'")   // apostrophe typographique → droite
    .replace(/\s+/g, ' ');
}

/**
 * Génère un slug URL depuis un nom d'équipe
 * ex: "CÔTE D'IVOIRE" → "cote-d-ivoire"
 */
export function generateSlug(teamName) {
  return normalizeTeamName(teamName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // enlève les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Construit une map slug → nom normalisé pour tous les teams
 */
export function buildSlugMap(teams) {
  const map = {};
  for (const team of teams) {
    map[generateSlug(team.name)] = team.name;
  }
  return map;
}

/**
 * Retourne le drapeau d'une équipe (emoji ou fallback)
 */
export function getFlag(teamName) {
  return TEAM_FLAGS[normalizeTeamName(teamName)] ?? '🏴';
}

// Noms courts pour l'affichage mobile
export const TEAM_SHORT = {
  "CÔTE D'IVOIRE": 'CIV',
  'NATIONS-UNIES': 'N-UNIES',
  'CENTRAFRIQUE':  'CAF',
  'BURKINA FASO':  'BURKINA',
  'MADAGASCAR':    'MADA',
};

export function getShortName(teamName) {
  return TEAM_SHORT[normalizeTeamName(teamName)] ?? teamName;
}

// Labels lisibles pour les postes
export const POSITION_LABELS = {
  '1-GARDIEN':    'Gardien',
  '2-DEFENSEUR':  'Défenseur',
  '3-MILIEU':     'Milieu',
  '4-ATTAQUANT':  'Attaquant',
};

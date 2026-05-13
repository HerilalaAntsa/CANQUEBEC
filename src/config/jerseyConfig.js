/**
 * jerseyConfig.js
 * Données statiques des maillots par équipe.
 * Source: MAILLOTS.xlsx
 */

// Mapping nom couleur → code CSS
export const COLOR_MAP = {
  'BLANC':        '#f8f8f8',
  'BLEU':         '#1d4ed8',
  'ROUGE':        '#dc2626',
  'ORANGE':       '#ea580c',
  'NOIR':         '#1c1c1c',
  'VERT':         '#16a34a',
  'JAUNE':        '#eab308',
  'MAUVE':        '#7c3aed',
  'GRIS':         '#9ca3af',
  'ROSE':         '#ec4899',
};

/**
 * Convertit une chaîne couleur en tableau de 1 ou 2 codes CSS.
 * "ROUGE" → ['#dc2626']
 * "BLANC-BLEU" → ['#f8f8f8', '#1d4ed8']
 * "JAUNE,NOIR" → ['#eab308', '#1c1c1c']
 */
export function parseColors(str) {
  if (!str) return null;
  // Séparateurs : tiret ou virgule
  const parts = str.toUpperCase().split(/[-,]/).map(s => s.trim()).filter(Boolean);
  const colors = parts.map(p => COLOR_MAP[p] ?? '#cccccc').slice(0, 2);
  return colors.length > 0 ? colors : null;
}

// Données maillots — clé = nom normalisé de l'équipe (même que TEAM_FLAGS)
export const JERSEYS = {
  'QUÉBEC':          { principal: 'BLANC-BLEU',  secondaire: null,        gardien: 'BLEU' },
  "CÔTE D'IVOIRE":   { principal: 'ORANGE',       secondaire: 'BLANC-VERT', gardien: 'NOIR' },
  'GAMBIE':          { principal: 'ROUGE',         secondaire: 'BLANC',     gardien: 'MAUVE-GRIS' },
  'MADAGASCAR':      { principal: 'ROUGE-NOIR',    secondaire: 'BLANC-GRIS', gardien: null },
  'NATIONS-UNIES':   { principal: 'BLEU',          secondaire: null,        gardien: 'ROUGE' },
  'CAMEROUN':        { principal: 'NOIR-VERT',     secondaire: null,        gardien: 'ROSE' },
  'ALGÉRIE':         { principal: 'VERT',          secondaire: null,        gardien: 'BLEU' },
  'CENTRAFRIQUE':    { principal: 'BLEU',          secondaire: 'BLANC',     gardien: 'BLANC-NOIR' },
  'CANADA':          { principal: 'NOIR',          secondaire: null,        gardien: 'MAUVE' },
  'HAÏTI':           { principal: 'ROUGE',         secondaire: null,        gardien: 'ORANGE' },
  'RD CONGO':        { principal: 'BLEU',          secondaire: null,        gardien: 'VERT' },
  'TOGO':            { principal: 'JAUNE',         secondaire: null,        gardien: 'GRIS' },
  'GABON':           { principal: 'VERT',          secondaire: null,        gardien: 'MAUVE' },
  'SÉNÉGAL':         { principal: 'BLANC',         secondaire: 'VERT',      gardien: 'JAUNE-NOIR' },
  'TANZANIE':        { principal: 'BLEU',          secondaire: null,        gardien: 'JAUNE' },
  'BURKINA FASO':    { principal: 'VERT',          secondaire: null,        gardien: 'NOIR' },
  'MALI':            { principal: 'JAUNE',         secondaire: 'VERT',      gardien: 'MAUVE' },
  'GUINÉE':          { principal: 'ROUGE',         secondaire: 'ROUGE',     gardien: 'VERT' },
};

/**
 * Retourne les données maillots d'une équipe depuis son nom.
 * Fait une recherche insensible à la casse / accents.
 */
export function getJerseys(teamName) {
  if (!teamName) return null;
  const key = teamName.toString().trim().toUpperCase()
    .replace(/\u2019/g, "'").replace(/\s+/g, ' ');
  // Correspondance directe
  for (const [k, v] of Object.entries(JERSEYS)) {
    if (k.toUpperCase() === key) return v;
  }
  // Correspondance partielle (ex: "R.D CONGO" → "RD CONGO")
  for (const [k, v] of Object.entries(JERSEYS)) {
    const kn = k.toUpperCase().replace(/[^A-Z]/g, '');
    const kq = key.replace(/[^A-Z]/g, '');
    if (kn === kq || kn.includes(kq) || kq.includes(kn)) return v;
  }
  return null;
}

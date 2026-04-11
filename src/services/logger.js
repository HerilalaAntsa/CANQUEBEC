// Logger structuré — LNQ 2026
// Format JSON en prod, coloré en dev

const isDev = import.meta.env.DEV;

function generateCorrId() {
  return `lnq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildEntry(level, message, ctx = {}) {
  return {
    level,
    message,
    ts: new Date().toISOString(),
    ...ctx,
  };
}

function formatDev(level, message, ctx) {
  const colors = {
    INFO:  '#58a6ff',
    WARN:  '#d29922',
    ERROR: '#f85149',
    AUDIT: '#3fb950',
  };
  const color = colors[level] ?? '#8b949e';
  const ctxStr = Object.keys(ctx).length ? JSON.stringify(ctx, null, 0) : '';
  return [`%c[${level}]%c ${message} %c${ctxStr}`, `color:${color};font-weight:bold`, 'color:inherit', 'color:#8b949e'];
}

export const log = {
  info(message, ctx = {}) {
    if (isDev) {
      console.info(...formatDev('INFO', message, ctx));
    } else {
      console.info(JSON.stringify(buildEntry('INFO', message, ctx)));
    }
  },

  warn(message, ctx = {}) {
    if (isDev) {
      console.warn(...formatDev('WARN', message, ctx));
    } else {
      console.warn(JSON.stringify(buildEntry('WARN', message, ctx)));
    }
  },

  error(message, ctx = {}) {
    if (isDev) {
      console.error(...formatDev('ERROR', message, ctx));
    } else {
      console.error(JSON.stringify(buildEntry('ERROR', message, ctx)));
    }
  },

  audit(action, ctx = {}) {
    const entry = buildEntry('AUDIT', action, ctx);
    if (isDev) {
      console.log(...formatDev('AUDIT', action, ctx));
    } else {
      console.info(JSON.stringify(entry));
    }
  },

  corrId: generateCorrId,
};

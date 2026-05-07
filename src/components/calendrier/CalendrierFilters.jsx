import styles from './CalendrierFilters.module.css';

export default function CalendrierFilters({ teams, referees = [], venues = [], filters, onChange }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div className={styles.bar}>
      <select
        className={styles.select}
        value={filters.team}
        onChange={e => set('team', e.target.value)}
      >
        <option value="">Toutes les équipes</option>
        {teams.map(t => (
          <option key={t.name} value={t.name}>{t.name}</option>
        ))}
      </select>

      <select
        className={styles.select}
        value={filters.group}
        onChange={e => set('group', e.target.value)}
      >
        <option value="">Groupe A + B</option>
        <option value="A">Groupe A</option>
        <option value="B">Groupe B</option>
      </select>

      <select
        className={styles.select}
        value={filters.venue}
        onChange={e => set('venue', e.target.value)}
      >
        <option value="">Tous les terrains</option>
        {venues.map(v => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>

      <select
        className={styles.select}
        value={filters.status}
        onChange={e => set('status', e.target.value)}
      >
        <option value="">Tous les matchs</option>
        <option value="upcoming">À venir</option>
        <option value="played">Joués</option>
      </select>

      {referees.length > 0 && (
        <select
          className={styles.select}
          value={filters.referee}
          onChange={e => set('referee', e.target.value)}
        >
          <option value="">Tous les arbitres</option>
          {referees.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      {Object.values(filters).some(Boolean) && (
        <button
          className={styles.reset}
          onClick={() => onChange({ team: '', group: '', venue: '', status: '', referee: '' })}
        >
          ✕ Réinitialiser
        </button>
      )}
    </div>
  );
}

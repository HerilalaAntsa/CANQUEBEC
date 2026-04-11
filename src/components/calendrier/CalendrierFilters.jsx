import styles from './CalendrierFilters.module.css';

export default function CalendrierFilters({ teams, filters, onChange }) {
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
        <option value="VANIER">Vanier</option>
        <option value="NEUFCHATEL">Neufchâtel</option>
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

      {Object.values(filters).some(Boolean) && (
        <button
          className={styles.reset}
          onClick={() => onChange({ team: '', group: '', venue: '', status: '' })}
        >
          ✕ Réinitialiser
        </button>
      )}
    </div>
  );
}

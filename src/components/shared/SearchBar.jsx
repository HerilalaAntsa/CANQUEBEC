import { useState, useRef } from 'react';
import styles from './SearchBar.module.css';
import { useSearch } from '../../hooks/useSearch';
import { useNavigate } from 'react-router-dom';
import { generateSlug } from '../../config/teams';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const { teams, players } = useSearch(query);

  const hasResults = teams.length > 0 || players.length > 0;

  const handleSelect = (type, item) => {
    setQuery('');
    setOpen(false);
    if (type === 'team') {
      navigate(`/equipe/${generateSlug(item.name)}`);
    } else {
      navigate(`/equipe/${generateSlug(item.team)}`);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.inputWrap}>
        <span className={styles.icon}>🔍</span>
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="Équipe, joueur..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>

      {open && query.length >= 2 && (
        <div className={styles.dropdown}>
          {!hasResults && (
            <div className={styles.empty}>Aucun résultat pour « {query} »</div>
          )}
          {teams.length > 0 && (
            <>
              <div className={styles.groupLabel}>Équipes</div>
              {teams.map(t => (
                <button key={t.name} className={styles.result} onClick={() => handleSelect('team', t)}>
                  <span>{t.flag ?? '🏴'} {t.name}</span>
                  <span className={styles.meta}>Groupe {t.group}</span>
                </button>
              ))}
            </>
          )}
          {players.length > 0 && (
            <>
              <div className={styles.groupLabel}>Joueurs</div>
              {players.map((p, i) => (
                <button key={`${p.number}-${p.team}-${i}`} className={styles.result} onClick={() => handleSelect('player', p)}>
                  <span>#{p.number} {p.name}</span>
                  <span className={styles.meta}>{p.team}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

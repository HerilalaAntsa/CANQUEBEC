import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardList, faXmark, faDownload, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import styles from './ReglementsModal.module.css';

const PDF_URL = '/reglements.pdf';
const PDF_PUBLIC_URL = 'https://qcn.vercel.app/reglements.pdf';
const VIEWER_URL = `https://docs.google.com/viewer?url=${encodeURIComponent(PDF_PUBLIC_URL)}&embedded=true`;

export default function ReglementsModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Bouton flottant */}
      <button
        className={styles.fab}
        onClick={() => setOpen(true)}
        aria-label="Voir les règlements"
        title="Règlements"
      >
        <FontAwesomeIcon icon={faClipboardList} />
        <span className={styles.fabLabel}>Règlements</span>
      </button>

      {/* Modal */}
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.header}>
              <span className={styles.title}>
                <FontAwesomeIcon icon={faClipboardList} /> Règlements QCN 2026
              </span>
              <div className={styles.actions}>
                <a
                  href={PDF_URL}
                  download="RÈGLEMENTS-QCN-2026.pdf"
                  className={styles.btnAction}
                  title="Télécharger"
                >
                  <FontAwesomeIcon icon={faDownload} />
                </a>
                <a
                  href={PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.btnAction}
                  title="Ouvrir dans un nouvel onglet"
                >
                  <FontAwesomeIcon icon={faUpRightFromSquare} />
                </a>
                <button className={styles.btnClose} onClick={() => setOpen(false)} aria-label="Fermer">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
            <div className={styles.body}>
              <iframe
                src={VIEWER_URL}
                title="Règlements QCN 2026"
                className={styles.iframe}
              />
              {/* Fallback mobile */}
              <div className={styles.mobileFallback}>
                <p>Votre navigateur ne supporte pas l'aperçu PDF.</p>
                <a href={PDF_URL} download className={styles.btnDownload}>
                  <FontAwesomeIcon icon={faDownload} /> Télécharger le PDF
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

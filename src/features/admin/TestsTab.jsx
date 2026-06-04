// Admin-fane: oversigt over alle gennemførte (automatiserede) tests.
// Data genereres fra den faktiske test-suite via `npm run test:report`.
import report from '../../data/testReport.json';

const AREA_LABELS = { frontend: 'Frontend (UI)', functions: 'Cloud Functions' };

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('da-DK', {
      dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Copenhagen',
    }).format(new Date(iso));
  } catch { return iso; }
}

export default function TestsTab() {
  const { totals, suites, generatedAt } = report;
  const areas = [...new Set(suites.map((s) => s.area))];

  return (
    <div>
      {/* Sammenfatning */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <span className="badge badge--blue">{totals.tests} tests</span>
        <span className="badge badge--muted">{totals.files} testfiler</span>
        <span className={`badge ${totals.failed === 0 ? 'badge--green' : 'badge--red'}`}>
          {totals.failed === 0 ? `✓ Alle ${totals.passed} bestået` : `${totals.failed} fejlede`}
        </span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginTop: 0 }}>
        Senest opdateret: {formatDate(generatedAt)} · opdateres med <code>npm run test:report</code>
      </p>

      {areas.map((area) => {
        const areaSuites = suites.filter((s) => s.area === area);
        const areaTests = areaSuites.reduce((n, s) => n + s.tests.length, 0);
        return (
          <div key={area} style={{ marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>
              {AREA_LABELS[area] ?? area}{' '}
              <span style={{ color: 'var(--c-muted)', fontWeight: 400, fontSize: '0.85rem' }}>
                ({areaTests} tests)
              </span>
            </h3>

            {areaSuites.map((s) => (
              <details key={s.file} style={{ borderBottom: '1px solid var(--c-border)', padding: '0.4rem 0' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className={`badge ${s.failed === 0 ? 'badge--green' : 'badge--red'}`}>
                    {s.failed === 0 ? `✓ ${s.passed}` : `${s.passed}/${s.passed + s.failed}`}
                  </span>
                  <code style={{ fontSize: '0.82rem' }}>{s.file}</code>
                </summary>
                <ul style={{ margin: '0.5rem 0 0.25rem', paddingLeft: '1.25rem', listStyle: 'none' }}>
                  {s.tests.map((t, i) => (
                    <li key={i} style={{ fontSize: '0.84rem', padding: '0.1rem 0', color: t.status === 'passed' ? 'var(--c-text)' : 'var(--c-err)' }}>
                      <span style={{ color: t.status === 'passed' ? 'var(--c-ok)' : 'var(--c-err)' }}>
                        {t.status === 'passed' ? '✓' : '✗'}
                      </span>{' '}
                      {t.name}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        );
      })}
    </div>
  );
}

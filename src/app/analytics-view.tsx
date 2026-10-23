'use client';

import { useMemo, useState } from 'react';

type AnalyticsData = {
  projects: any[];
  tasks: any[];
  materials: any[];
  comparisons: any[];
  projectHistory: any[];
  reportSummary: { count: number; last_report: string | null };
};

const palette = ['#3478a8', '#4e8b62', '#d09232', '#8c6bb1', '#cf6659', '#3b9b98', '#bb7095', '#718096', '#79a548', '#d17e34'];
const fmt = (value: number | string | null | undefined, digits = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(value) || 0);
const pct = (value: number | null | undefined) => value == null ? '—' : `${fmt(Number(value) * 100)} %`;
const dateLabel = (value: string | Date) => new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftedDay = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + amount); return isoDay(date); };

export function AnalyticsPages({ data }: { data: AnalyticsData }) {
  const [page, setPage] = useState<'overview' | 'projects' | 'forecasts' | 'deviations' | 'methods'>('overview');
  const [projectId, setProjectId] = useState('');
  const today = isoDay(new Date());
  const [deviationProjectId, setDeviationProjectId] = useState('');
  const [deviationFrom, setDeviationFrom] = useState(shiftedDay(today, -30));
  const [deviationTo, setDeviationTo] = useState(today);
  const [forecastPage, setForecastPage] = useState(0);
  const [variancePage, setVariancePage] = useState(0);
  const pageList = [
    ['overview', 'Synthèse'], ['projects', 'Chantiers & consommations'],
    ['forecasts', 'Prévisions'], ['deviations', 'Écarts'], ['methods', 'Méthodes'],
  ] as const;
  const projects = data.projects ?? [];
  const tasks = data.tasks ?? [];
  const pageSize = 20;
  const forecastRows = tasks.slice(forecastPage * pageSize, (forecastPage + 1) * pageSize);
  const deviationTasks = tasks.filter((task) => !deviationProjectId || String(task.project_id) === deviationProjectId);
  const varianceRows = deviationTasks.slice(variancePage * pageSize, (variancePage + 1) * pageSize);
  const deviationOveruseCount = deviationTasks.filter((task) => Number(task.materialOverrunPercent) > 8).length;
  const comparisons = data.comparisons ?? [];
  const history = data.projectHistory ?? [];
  const selectedId = projectId || String(projects[0]?.id ?? '');
  const selectedProject = projects.find((project) => String(project.id) === selectedId);
  const projectRows = history.filter((row) => String(row.project_id) === selectedId);
  const materialTotals = useMemo(() => {
    const totals = new Map<string, { name: string; unit: string; quantity: number }>();
    projectRows.forEach((row) => {
      const key = `${row.material_name}:${row.unit}`;
      const current = totals.get(key) ?? { name: row.material_name, unit: row.unit, quantity: 0 };
      current.quantity += Number(row.quantity);
      totals.set(key, current);
    });
    return [...totals.values()].sort((a, b) => b.quantity - a.quantity);
  }, [projectRows]);
  const readyPredictions = tasks.flatMap((task) => [task.prediction?.combinedProbability].filter((v) => v !== null && v !== undefined));
  const avgProbability = readyPredictions.length ? readyPredictions.reduce((sum: number, v: number) => sum + Number(v), 0) / readyPredictions.length : null;
  const overuseCount = tasks.filter((task) => Number(task.materialOverrunPercent) > 8).length;
  const deviationComparisons = comparisons.filter((comparison) => {
    const day = String(comparison.created_at).slice(0, 10);
    return (!deviationProjectId || String(comparison.project_id) === deviationProjectId)
      && day >= deviationFrom && day <= deviationTo;
  });
  const compared = deviationComparisons.filter((comparison) => comparison.predictionErrorPoints !== null);
  const pendingComparisons = deviationComparisons.length - compared.length;
  const meanAbsError = compared.length ? compared.reduce((sum: number, row: any) => sum + Math.abs(Number(row.predictionErrorPoints)), 0) / compared.length : null;

  return <div className="bi-workspace">
    <nav className="bi-tabs" aria-label="Pages analytiques">
      {pageList.map(([id, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{label}</button>)}
    </nav>
    {page === 'overview' && <>
      <div className="bi-kpis">
        <Kpi label="Chantiers actifs" value={projects.length} detail="Chantiers suivis" color="blue" />
        <Kpi label="Avancement moyen" value={`${fmt(projects.length ? projects.reduce((sum: number, p: any) => sum + Number(p.progressPercent), 0) / projects.length : 0)} %`} detail="Moyenne des tâches" color="green" />
        <Kpi label="Réussite estimée" value={pct(avgProbability)} detail={`${readyPredictions.length} tâches évaluables`} color="purple" />
        <Kpi label="Surconsommations" value={overuseCount} detail="Tâches au-delà de 8 %" color="red" />
      </div>
      <section className="bi-panel">
        <div className="bi-panel-heading"><div><h2>Avancement par chantier</h2><p>Comparaison de la progression et de la réussite estimée.</p></div><Legend items={ [['Progression', '#3478a8'], ['Réussite estimée', '#4e8b62']] } /></div>
        {projects.length ? <div className="bi-project-chart">{projects.map((project: any, index: number) => <div className="bi-chart-row" key={project.id}>
          <div className="bi-chart-label"><b>{project.name}</b><small>{project.location || 'Localisation non renseignée'}</small></div>
          <div className="bi-chart-bars"><MetricBar label="Progression" value={Number(project.progressPercent)} color="#3478a8"/><MetricBar label="Réussite estimée" value={project.successProbability == null ? null : Number(project.successProbability) * 100} color="#4e8b62"/></div>
          <span className="bi-project-index" style={{ background: palette[index % palette.length] }}>{index + 1}</span>
        </div>)}</div> : <Empty title="Aucun chantier" body="Les indicateurs apparaîtront après la création des chantiers."/>}
      </section>
      <section className="bi-panel bi-note"><b>Lecture BI</b><p>La progression vient des quantités déclarées par rapport aux quantités prévues. La probabilité estimée est une moyenne des méthodes disponibles; elle dépend des relevés terrain et ne constitue pas une garantie.</p></section>
    </>}

    {page === 'projects' && <section className="bi-panel">
      <div className="bi-panel-heading"><div><h2>Historique des consommations par chantier</h2><p>Quantités réellement déclarées dans les journaux de réalisation.</p></div>
        <label className="bi-project-select">Chantier<select value={selectedId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>
      {selectedProject && <div className="bi-project-detail"><span>{selectedProject.location || 'Localisation non renseignée'}</span><b>{fmt(selectedProject.progressPercent)} %</b><small>avancement moyen</small></div>}
      {materialTotals.length > 0 && <><h3 className="bi-subtitle">Quantités cumulées par matériau</h3><div className="bi-material-chart">{materialTotals.map((item, index) => <div className="bi-material-item" key={`${item.name}-${item.unit}`}><div><b>{item.name}</b><span>{fmt(item.quantity, 2)} {item.unit}</span></div><div className="bi-material-track"><i style={{ width: `${Math.max(2, item.quantity / materialTotals[0].quantity * 100)}%`, background: palette[index % palette.length] }} /></div></div>)}</div></>}
      <h3 className="bi-subtitle">Détail des réalisations et matériaux</h3>
      <div className="bi-table-scroll"><table className="bi-table"><thead><tr><th>Date</th><th>Tâche</th><th>Matériau</th><th>Quantité utilisée</th></tr></thead><tbody>{projectRows.map((row: any, index: number) => <tr key={`${row.report_id}-${row.material_id}-${index}`}><td>{dateLabel(row.report_date)}</td><td>{row.task_code ? `${row.task_code} · ` : ''}{row.task_name}</td><td><span className="bi-color-key" style={{ background: palette[index % palette.length] }} />{row.material_name}</td><td><b>{fmt(row.quantity, 3)} {row.unit}</b></td></tr>)}</tbody></table>{!projectRows.length && <Empty title="Aucune consommation enregistrée" body="Les relevés validés par le responsable de chantier apparaîtront ici."/>}</div>
    </section>}

    {page === 'forecasts' && <>
      <section className="bi-panel bi-model-summary"><div><h2>Prévisions de réussite des tâches</h2><p>Chaque valeur estime la probabilité de terminer selon les hypothèses de la méthode et les données disponibles.</p></div><div className="bi-model-legend"><Legend items={ [['Logistique', '#8c6bb1'], ['Normale', '#3478a8'], ['Uniforme', '#d09232']] } /></div></section>
      <section className="bi-panel"><div className="bi-table-scroll"><table className="bi-table"><thead><tr><th>Tâche / chantier</th><th>Avancement</th><th>Logistique</th><th>Normale</th><th>Uniforme</th><th>Observations</th></tr></thead><tbody>{forecastRows.map((task: any) => <tr key={task.id}><td><b>{task.name}</b><small className="bi-cell-sub">{task.project_name} · {task.code || 'Sans code'}</small></td><td><ColoredValue value={`${fmt(task.progress_percent)} %`} color="#3478a8"/></td><td><ColoredValue value={pct(task.prediction?.logisticProbability)} color="#8c6bb1"/></td><td><ColoredValue value={pct(task.prediction?.normalProbability)} color="#3478a8"/></td><td><ColoredValue value={pct(task.prediction?.uniformProbability)} color="#d09232"/></td><td>{task.prediction?.sampleDays ?? 0} jour(s) · preuve {String(task.prediction?.evidence ?? 'faible').toLowerCase()}</td></tr>)}</tbody></table>{!tasks.length && <Empty title="Aucune prévision disponible" body="Ajoutez des tâches et des relevés terrain pour calculer les estimations."/>}</div><Pagination page={forecastPage} pageSize={pageSize} total={tasks.length} onChange={setForecastPage}/></section>
    </>}

    {page === 'deviations' && <>
      <div className="bi-kpis"><Kpi label="Évaluations matures à 7 jours" value={compared.length} detail={`${pendingComparisons} prévision(s) en attente du délai d’observation`} color="blue"/><Kpi label="Erreur absolue moyenne" value={meanAbsError == null ? '—' : `${fmt(meanAbsError)} pts`} detail={meanAbsError == null ? 'Disponible après une comparaison à 7 jours' : 'Sur les évaluations disponibles'} color="purple"/><Kpi label="Tâches en surconsommation" value={deviationOveruseCount} detail="Écart moyen supérieur à 8 %" color="red"/></div>
      <section className="bi-panel"><div className="bi-panel-heading"><div><h2>Prévision comparée à la réalisation</h2><p>Chaque point compare une prévision à son réalisé constaté sept jours plus tard. Choisissez un chantier et une période d’au moins trois jours.</p></div><Legend items={ [['Prévision', '#8c6bb1'], ['Réalisé', '#4e8b62'], ['Sous-prévision', '#cf6659'], ['Sur-prévision', '#3478a8']] } /></div>
        <div className="bi-deviation-filters"><label className="bi-project-select">Chantier<select value={deviationProjectId} onChange={(event) => {setDeviationProjectId(event.target.value);setVariancePage(0)}}><option value="">Tous les chantiers</option>{projects.map((project: any) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="bi-project-select">Du<input type="date" value={deviationFrom} max={shiftedDay(deviationTo, -2)} onChange={(event) => setDeviationFrom(event.target.value)}/></label><label className="bi-project-select">Au<input type="date" value={deviationTo} min={shiftedDay(deviationFrom, 2)} max={today} onChange={(event) => setDeviationTo(event.target.value)}/></label><small>{fmt((new Date(`${deviationTo}T12:00:00`).getTime() - new Date(`${deviationFrom}T12:00:00`).getTime()) / 86_400_000 + 1, 0)} jours sélectionnés · minimum 3 jours</small></div>
        {deviationComparisons.map((row: any) => <div className="bi-compare-row" key={row.id}><div className="bi-compare-title"><b>{row.task_name}</b><small>{row.project_name} · {dateLabel(row.created_at)}</small></div><MetricBar label="Prévision à 7 jours" value={Number(row.predicted_percent_7d)} color="#8c6bb1"/><MetricBar label="Réalisé constaté" value={row.actualProgressPercent == null ? null : Number(row.actualProgressPercent)} color="#4e8b62"/><strong className={row.predictionErrorPoints == null ? '' : Number(row.predictionErrorPoints) > 0 ? 'bi-error-high' : Number(row.predictionErrorPoints) < 0 ? 'bi-error-low' : ''}>{row.predictionErrorPoints == null ? 'En attente 7 j' : `${Number(row.predictionErrorPoints) > 0 ? '+' : ''}${fmt(row.predictionErrorPoints)} pts`}</strong></div>)}
        {!deviationComparisons.length && <Empty title="Aucun point de prévision sur cette période" body="Choisissez un autre chantier ou élargissez la période. Les points récents affichent la prévision tout de suite; le réalisé et l’écart apparaissent après sept jours."/>}
      </section>
      <section className="bi-panel"><div className="bi-panel-heading"><div><h2>Écart des consommations matériaux</h2><p>Écart cumulé par tâche entre consommations réelles et ratios théoriques, pour le chantier sélectionné.</p></div><Legend items={ [['Dans la tolérance', '#4e8b62'], ['Surconsommation > 8 %', '#cf6659'], ['Consommation sous le ratio', '#3478a8']] } /></div><div className="bi-table-scroll"><table className="bi-table"><thead><tr><th>Tâche / chantier</th><th>Écart matériaux</th><th>Lecture</th></tr></thead><tbody>{varianceRows.map((task: any) => { const variance = Number(task.materialOverrunPercent); return <tr key={task.id}><td><b>{task.name}</b><small className="bi-cell-sub">{task.project_name}</small></td><td><ColoredValue value={`${variance > 0 ? '+' : ''}${fmt(variance)} %`} color={variance > 8 ? '#cf6659' : variance < -5 ? '#3478a8' : '#4e8b62'}/></td><td>{variance > 8 ? 'Surconsommation à analyser' : variance < -5 ? 'Consommation inférieure au ratio' : 'Dans la tolérance indicative'}</td></tr>; })}</tbody></table></div><Pagination page={variancePage} pageSize={pageSize} total={deviationTasks.length} onChange={setVariancePage}/></section>
    </>}

    {page === 'methods' && <div className="bi-method-grid">
      <MethodCard title="Régression logistique" color="#8c6bb1" summary="Convertit un score de situation en probabilité comprise entre 0 et 100 %." formula="z = 1,15 + 0,055 × écart calendrier − 1,3 × écart matériaux ; p = 1 / (1 + e⁻ᶻ)" details="L’écart calendrier est l’avancement réel moins l’avancement théorique à la date du jour, plafonné à ±40 points. L’écart matériaux est la moyenne des consommations réelles comparées aux ratios théoriques, plafonnée entre −50 % et +200 %. Une avance augmente le score; un retard et une surconsommation le réduisent. Les coefficients sont des paramètres exploratoires, pas des coefficients entraînés sur un historique de chantiers." />
      <MethodCard title="Loi normale" color="#3478a8" summary="Estime si la production restante peut être réalisée dans le délai restant." formula="P = Φ((cadence moyenne × jours − restant) / (écart-type × √jours))" details="La cadence moyenne est calculée à partir des quantités positives déclarées par journée. L’écart-type mesure la dispersion de ces cadences et représente l’incertitude; elle augmente avec l’horizon. Φ est la fonction de répartition normale. Sans cadence observée ou cadence cible, ou si le délai est nul, cette estimation n’est pas disponible." />
      <MethodCard title="Loi uniforme" color="#d09232" summary="Encadre la cadence future entre le minimum et le maximum observés." formula="P = clamp((cadence max − restant / jours) / (cadence max − cadence min))" details="La méthode suppose que chaque cadence comprise entre le minimum et le maximum observés est également plausible. Elle nécessite au moins deux journées de production. Si les cadences observées sont identiques, elle renvoie 100 % lorsque le rythme suffit, sinon 0 %. Le résultat est borné entre 0 % et 100 %." />
      <MethodCard title="Indice combiné" color="#4e8b62" summary="Fait la moyenne des probabilités disponibles pour une tâche." formula="Indice = moyenne des modèles disponibles" details="Les méthodes qui manquent de données sont ignorées. Une moyenne combinée n’est calculée que lorsqu’au moins une méthode fournit une valeur. Cet indice est exploratoire : il n’est ni calibré, ni une garantie contractuelle de réussite." />
      <section className="bi-panel bi-note"><b>Comment lire les couleurs</b><p>Violet : logistique ou prévision. Bleu : méthode normale, avancement ou écart négatif. Ambre : méthode uniforme. Vert : réalisation ou écart dans la tolérance. Rouge : dépassement significatif ou sous-prévision.</p><p>Une probabilité décrit les hypothèses du calcul et la qualité des données disponibles. Elle ne remplace pas l’analyse du conducteur de travaux.</p></section>
    </div>}
  </div>;
}

function Kpi({ label, value, detail, color }: { label: string; value: string | number; detail: string; color: string }) {
  return <article className={`bi-kpi ${color}`}><span>{label}</span><b>{value}</b><small>{detail}</small></article>;
}

function Legend({ items }: { items: [string, string][] }) {
  return <div className="bi-legend">{items.map(([label, color]) => <span key={label}><i style={{ background: color }}/>{label}</span>)}</div>;
}

function MetricBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const safe = value == null ? null : Math.max(0, Math.min(100, value));
  return <div className="bi-metric"><div><span>{label}</span><b>{safe == null ? '—' : `${fmt(safe)} %`}</b></div><div className="bi-meter"><i style={{ width: `${safe ?? 0}%`, background: color }}/></div></div>;
}

function ColoredValue({ value, color }: { value: string; color: string }) {
  return <b className="bi-colored-value" style={{ color }}>{value}</b>;
}

function MethodCard({ title, color, summary, formula, details }: { title: string; color: string; summary: string; formula: string; details: string }) {
  return <article className="bi-panel bi-method" style={{ borderTopColor: color }}><h2>{title}</h2><p>{summary}</p><code>{formula}</code><small>{details}</small></article>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="bi-empty"><b>{title}</b><p>{body}</p></div>;
}

function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (next: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages < 2) return null;
  return <div className="bi-pagination"><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} sur {total}</span><div><button disabled={page === 0} onClick={() => onChange(page - 1)}>Précédent</button><b>{page + 1} / {pages}</b><button disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>Suivant</button></div></div>;
}

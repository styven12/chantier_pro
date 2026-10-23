import mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import env from '@next/env';
import { predictTask, type ProgressSample } from '../src/lib/prediction';

env.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const legacyDateOnly = args.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(args[0]);
const projectRef = legacyDateOnly ? 'VIL-RF1' : (args[0] ?? 'VIL-RF1').toUpperCase();
const targetPercent = legacyDateOnly ? 75 : Number(args[1] ?? 75);
const reportDate = legacyDateOnly ? args[0] : (args[2] ?? new Date().toISOString().slice(0, 10));
if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) {
  throw new Error('Le pourcentage cible doit être supérieur à 0 et inférieur ou égal à 100.');
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(Date.parse(`${reportDate}T00:00:00Z`))) {
  throw new Error('Date invalide. Utilisez le format AAAA-MM-JJ, par exemple 2026-10-23.');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'chantier_pro',
  charset: 'utf8mb4',
  timezone: 'Z',
});

try {
  await connection.beginTransaction();
  const [projects] = await connection.execute<RowDataPacket[]>(
    `SELECT id,name FROM projects WHERE reference_code=? AND is_active=TRUE ORDER BY id LIMIT 1 FOR UPDATE`, [projectRef],
  );
  if (!projects[0]) throw new Error(`Projet ${projectRef} introuvable ou inactif.`);
  const projectId = Number(projects[0].id);

  const [managers] = await connection.execute<RowDataPacket[]>(
    `SELECT u.id FROM users u JOIN project_members pm ON pm.user_id=u.id
     WHERE u.username='chantier' AND u.is_active=TRUE AND pm.project_id=? LIMIT 1`, [projectId],
  );
  if (!managers[0]) throw new Error('Le responsable chantier doit être actif et affecté à la Villa familiale.');
  const siteManagerId = Number(managers[0].id);
  const [resourceManagers] = await connection.execute<RowDataPacket[]>(
    `SELECT u.id FROM users u JOIN project_members pm ON pm.user_id=u.id
     WHERE u.username='ressources' AND u.is_active=TRUE AND pm.project_id=? LIMIT 1`, [projectId],
  );
  if (!resourceManagers[0]) throw new Error('Le responsable des ressources doit être actif et affecté à la Villa familiale.');
  const resourceManagerId = Number(resourceManagers[0].id);

  const [tasks] = await connection.execute<RowDataPacket[]>(
    `SELECT id,project_id,code,name,unit,planned_quantity,completed_quantity,progress_percent,
       target_daily_quantity,start_date,due_date
     FROM tasks WHERE project_id=? AND is_active=TRUE ORDER BY id FOR UPDATE`, [projectId],
  );
  if (!tasks.length) throw new Error('Aucune tâche active n’est enregistrée pour la Villa familiale.');

  let reportsAdded = 0;
  let alreadyAtTarget = 0;
  const demoSupply = new Map<string, number>();
  for (const task of tasks) {
    const taskId = Number(task.id);
    const planned = Number(task.planned_quantity);
    const beforeQuantity = Number(task.completed_quantity);
    const beforePercent = Number(task.progress_percent);
    const targetQuantity = Number((planned * targetPercent / 100).toFixed(4));
    if (beforePercent >= targetPercent || beforeQuantity >= targetQuantity) {
      alreadyAtTarget += 1;
      continue;
    }

    const quantity = Number((targetQuantity - beforeQuantity).toFixed(4));
    const percentDelta = Number((targetPercent - beforePercent).toFixed(3));
    const [ratios] = await connection.execute<RowDataPacket[]>(
      `SELECT tm.material_id,tm.quantity_per_unit,m.name,m.unit,m.current_stock
       FROM task_materials tm JOIN materials m ON m.id=tm.material_id
       WHERE tm.task_id=? AND m.is_active=TRUE ORDER BY m.id FOR UPDATE`, [taskId],
    );
    const consumptions = ratios.map((ratio) => ({
      materialId: Number(ratio.material_id),
      name: String(ratio.name),
      unit: String(ratio.unit),
      available: Number(ratio.current_stock),
      expected: Number((Number(ratio.quantity_per_unit) * quantity).toFixed(4)),
      actual: Number((Number(ratio.quantity_per_unit) * quantity * 1.02).toFixed(4)),
    }));
    const [report] = await connection.execute<ResultSetHeader>(
      `INSERT INTO daily_reports (task_id,report_date,progress_quantity,progress_percent_delta,note,created_by)
       VALUES (?,?,?,?,?,?)`,
      [taskId, reportDate, quantity, percentDelta,
        `Réalisation de démonstration — ${projects[0].name}, tâche ${task.code ?? taskId} : avancement cumulé porté à ${targetPercent} %. Saisie détaillée avec consommations terrain.`,
        siteManagerId],
    );
    const reportId = report.insertId;
    for (const item of consumptions) {
      const replenishment = Number(Math.max(0, item.actual - item.available).toFixed(4));
      if (replenishment > 0) {
        item.available = Number((item.available + replenishment).toFixed(4));
        await connection.execute('UPDATE materials SET current_stock=? WHERE id=?', [item.available, item.materialId]);
        await connection.execute(
          `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,report_id,note,created_by)
           VALUES (?,'IN',?,?,?,?,?)`,
          [item.materialId, replenishment, item.available, reportId,
            `Approvisionnement fictif de démonstration · ${projects[0].name} · tâche ${task.code ?? taskId}`, resourceManagerId],
        );
        const supplyKey = `${item.name} (${item.unit})`;
        demoSupply.set(supplyKey, (demoSupply.get(supplyKey) ?? 0) + replenishment);
      }
      const balance = Number((item.available - item.actual).toFixed(4));
      await connection.execute(
        'INSERT INTO report_materials (report_id,material_id,quantity) VALUES (?,?,?)',
        [reportId, item.materialId, item.actual],
      );
      await connection.execute('UPDATE materials SET current_stock=? WHERE id=?', [balance, item.materialId]);
      await connection.execute(
        `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,report_id,note,created_by)
         VALUES (?,'OUT',?,?,?,?,?)`,
        [item.materialId, item.actual, balance, reportId, `Consommation de réalisation ${projects[0].name} · tâche ${task.code ?? taskId}`, siteManagerId],
      );
    }

    await connection.execute(
      `UPDATE tasks SET completed_quantity=?,progress_percent=?,status='ACTIVE' WHERE id=?`,
      [targetQuantity, targetPercent, taskId],
    );
    const [samples] = await connection.execute<RowDataPacket[]>(
      'SELECT report_date,progress_quantity FROM daily_reports WHERE task_id=? AND report_date<=? ORDER BY report_date',
      [taskId, reportDate],
    );
    const prediction = predictTask({
      plannedQuantity: planned,
      completedQuantity: targetQuantity,
      progressPercent: targetPercent,
      startDate: task.start_date,
      dueDate: task.due_date,
      targetDailyQuantity: task.target_daily_quantity == null ? null : Number(task.target_daily_quantity),
      overrunRatio: consumptions.length ? consumptions.reduce((sum, item) => sum + (item.expected > 0 ? item.actual / item.expected - 1 : 0), 0) / consumptions.length : 0,
      samples: samples.map((sample): ProgressSample => ({ report_date: sample.report_date, progress_quantity: Number(sample.progress_quantity) })),
    });
    await connection.execute(
      `INSERT INTO prediction_snapshots
       (project_id,task_id,baseline_percent,predicted_percent_7d,logistic_success_probability,normal_success_probability,uniform_success_probability,sample_days)
       VALUES (?,?,?,?,?,?,?,?)`,
      [projectId, taskId, targetPercent, prediction.predictedPercent7d, prediction.logisticProbability,
        prediction.normalProbability, prediction.uniformProbability, prediction.sampleDays],
    );
    reportsAdded += 1;
  }

  await connection.commit();
  const supplySummary = [...demoSupply.entries()].map(([material, quantity]) => `${material} : ${quantity.toFixed(4)}`).join(', ') || 'aucun';
  console.log(`${projects[0].name} (${projectRef}) : ${reportsAdded} réalisation(s) enregistrée(s) au ${reportDate}, cible ${targetPercent} %; ${alreadyAtTarget} tâche(s) étaient déjà au seuil ou au-dessus; approvisionnements fictifs de démonstration : ${supplySummary}.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { predictTask, type ProgressSample } from '@/lib/prediction';

type AnalyticsTaskRow = RowDataPacket & {
  id: number | string;
  project_id: number | string;
  code: string;
  name: string;
  unit: string;
  planned_quantity: number | string;
  completed_quantity: number | string;
  progress_percent: number | string;
  target_daily_quantity: number | string | null;
  start_date: string | Date | null;
  due_date: string | Date | null;
  status: string;
  project_name: string;
  location: string | null;
  target_end_date: string | Date | null;
};

export async function GET() {
  try {
    await requireUser(['ANALYST']);
    const [tasks] = await db.execute<AnalyticsTaskRow[]>(
      `SELECT t.id,t.project_id,t.code,t.name,t.unit,t.planned_quantity,t.completed_quantity,t.progress_percent,
        t.target_daily_quantity,COALESCE(t.start_date,p.start_date) AS start_date,t.due_date,t.status,p.name AS project_name,p.location,p.target_end_date
       FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.is_active=TRUE AND p.is_active=TRUE ORDER BY p.id,t.id`,
    );
    const [materials] = await db.execute<RowDataPacket[]>(
      `SELECT m.id,m.name,m.unit,m.current_stock,m.minimum_stock,
        (SELECT COALESCE(SUM(rm.quantity),0) FROM report_materials rm WHERE rm.material_id=m.id) AS consumed_total
       FROM materials m WHERE m.is_active=TRUE ORDER BY m.name`,
    );
    const [ratioRows] = await db.execute<RowDataPacket[]>(
      `SELECT tm.task_id,tm.material_id,tm.quantity_per_unit,m.name AS material_name,m.unit
       FROM task_materials tm JOIN materials m ON m.id=tm.material_id WHERE m.is_active=TRUE`,
    );
    const [sampleRows] = await db.execute<RowDataPacket[]>(
      `SELECT task_id,report_date,SUM(progress_quantity) AS progress_quantity FROM daily_reports
       WHERE report_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) GROUP BY task_id,report_date ORDER BY report_date`,
    );
    const [useRows] = await db.execute<RowDataPacket[]>(
      `SELECT dr.task_id,rm.material_id,SUM(rm.quantity) AS consumed
       FROM report_materials rm JOIN daily_reports dr ON dr.id=rm.report_id GROUP BY dr.task_id,rm.material_id`,
    );
    const byTask = new Map<number, RowDataPacket[]>();
    ratioRows.forEach((row) => byTask.set(Number(row.task_id), [...(byTask.get(Number(row.task_id)) ?? []), row]));
    const samplesByTask = new Map<number, ProgressSample[]>();
    sampleRows.forEach((row) => {
      const taskId = Number(row.task_id);
      const sample: ProgressSample = {
        report_date: row.report_date,
        progress_quantity: Number(row.progress_quantity),
      };
      samplesByTask.set(taskId, [...(samplesByTask.get(taskId) ?? []), sample]);
    });
    const usageByTask = new Map<string, number>();
    useRows.forEach((row) => usageByTask.set(`${row.task_id}:${row.material_id}`, Number(row.consumed)));

    const forecastTasks = tasks.map((task) => {
      const quantityDone = Number(task.completed_quantity);
      const ratios = byTask.get(Number(task.id)) ?? [];
      const overs = ratios.map((ratio) => {
        const expected = Number(ratio.quantity_per_unit) * quantityDone;
        const actual = usageByTask.get(`${task.id}:${ratio.material_id}`) ?? 0;
        return expected > 0 ? actual / expected - 1 : 0;
      });
      const overrunRatio = overs.length ? overs.reduce((a, b) => a + b, 0) / overs.length : 0;
      const prediction = predictTask({
        plannedQuantity: Number(task.planned_quantity), completedQuantity: quantityDone,
        progressPercent: Number(task.progress_percent), startDate: task.start_date, dueDate: task.due_date,
        targetDailyQuantity: task.target_daily_quantity === null ? null : Number(task.target_daily_quantity), overrunRatio,
        samples: samplesByTask.get(Number(task.id)) ?? [],
      });
      return { ...task, progress_percent: Number(task.progress_percent), completed_quantity: quantityDone,
        materialOverrunPercent: overrunRatio * 100, prediction, ratios };
    });
    const projectMap = new Map<number, {
      id: number;
      name: string;
      location: string | null;
      progressTotal: number;
      tasks: number;
      probabilityTotal: number;
      probabilityCount: number;
    }>();
    for (const task of forecastTasks) {
      const id = Number(task.project_id);
      const project = projectMap.get(id) ?? { id, name: task.project_name, location: task.location,
        progressTotal: 0, tasks: 0, probabilityTotal: 0, probabilityCount: 0 };
      project.progressTotal += Number(task.progress_percent);
      project.tasks += 1;
      project.probabilityTotal += task.prediction.combinedProbability ?? 0;
      if (task.prediction.combinedProbability !== null) project.probabilityCount += 1;
      projectMap.set(id, project);
    }
    const projects = [...projectMap.values()].map((p) => ({ ...p,
      progressPercent: p.tasks ? p.progressTotal / p.tasks : 0,
      successProbability: p.probabilityCount ? p.probabilityTotal / p.probabilityCount : null,
    }));
    const [snapshots] = await db.execute<RowDataPacket[]>(
      `SELECT s.id,s.task_id,s.project_id,s.baseline_percent,s.predicted_percent_7d,
        s.logistic_success_probability,s.normal_success_probability,s.uniform_success_probability,
        s.sample_days,s.created_at,t.name AS task_name,p.name AS project_name,t.progress_percent AS current_percent
       FROM prediction_snapshots s JOIN tasks t ON t.id=s.task_id JOIN projects p ON p.id=s.project_id
       ORDER BY s.created_at DESC LIMIT 30`,
    );
    const comparisons = snapshots.map((snapshot) => {
      const ageDays = Math.floor((Date.now() - new Date(snapshot.created_at).getTime()) / 86_400_000);
      const actual = Number(snapshot.current_percent);
      const predicted = Number(snapshot.predicted_percent_7d);
      return { ...snapshot, ageDays, actualProgressPercent: ageDays >= 7 ? actual : null,
        actualDeltaPoints: ageDays >= 7 ? actual - Number(snapshot.baseline_percent) : null,
        predictionErrorPoints: ageDays >= 7 ? actual - predicted : null };
    });
    const [reportSummary] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count,MAX(report_date) AS last_report FROM daily_reports`,
    );
    return NextResponse.json({ projects, tasks: forecastTasks, materials, comparisons, reportSummary: reportSummary[0] });
  } catch (error) { return jsonError(error); }
}

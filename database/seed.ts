import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import env from '@next/env';

env.loadEnvConfig(process.cwd());
const db = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root', password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'chantier_pro', charset: 'utf8mb4',
});

const users = [
  { name: 'Awa Ndiaye', username: 'ingenieur', code: '123456', role: 'ENGINEER' },
  { name: 'Moussa Diop', username: 'ressources', code: '234567', role: 'RESOURCE_MANAGER' },
  { name: 'Ibrahima Sarr', username: 'chantier', code: '345678', role: 'SITE_MANAGER' },
  { name: 'Fatou Ba', username: 'analyste', code: '456789', role: 'ANALYST' },
];

const projects = [
  { ref: 'BAT-R2', name: 'Immeuble R+2', type: 'Logement collectif', location: 'Dakar — Liberté 6', area: 420, floors: 3, budget: 185000000, desc: 'Immeuble résidentiel avec commerces au rez-de-chaussée.' },
  { ref: 'VIL-RF1', name: 'Villa familiale R+1', type: 'Logement individuel', location: 'Rufisque — Keury Souf', area: 185, floors: 2, budget: 48500000, desc: 'Villa familiale de quatre chambres avec terrasse.' },
  { ref: 'ECO-TH1', name: 'École primaire des six classes', type: 'Équipement scolaire', location: 'Thiès — Mbour 3', area: 960, floors: 1, budget: 215000000, desc: 'Six salles de classe, administration, sanitaires et cour.' },
  { ref: 'CSR-MB1', name: 'Centre de santé de proximité', type: 'Équipement de santé', location: 'Mbour — Grand Mbour', area: 740, floors: 1, budget: 268000000, desc: 'Consultations, maternité, pharmacie et locaux techniques.' },
  { ref: 'ENT-DM1', name: 'Entrepôt logistique', type: 'Bâtiment industriel', location: 'Diamniadio — zone logistique', area: 1800, floors: 1, budget: 395000000, desc: 'Entrepôt avec bureaux, quai de déchargement et aire de manœuvre.' },
  { ref: 'IMM-PA4', name: 'Immeuble résidentiel R+4', type: 'Logement collectif', location: 'Dakar — Parcelles Assainies', area: 1250, floors: 5, budget: 510000000, desc: 'Résidence de vingt logements avec cage d’escalier et ascenseur.' },
  { ref: 'RES-SL1', name: 'Résidence du fleuve', type: 'Logement collectif', location: 'Saint-Louis — Sor', area: 620, floors: 3, budget: 245000000, desc: 'Résidence adaptée au contexte côtier, avec ventilation traversante.' },
  { ref: 'COM-KL1', name: 'Boutique commerciale', type: 'Commerce', location: 'Kaolack — centre-ville', area: 230, floors: 2, budget: 72000000, desc: 'Espace commercial avec réserve, sanitaires et bureaux à l’étage.' },
  { ref: 'ATL-ZG1', name: 'Atelier technique municipal', type: 'Bâtiment industriel', location: 'Ziguinchor — Néma', area: 510, floors: 1, budget: 132000000, desc: 'Atelier de maintenance et magasins de pièces détachées.' },
  { ref: 'MRC-LG1', name: 'Marché couvert de Louga', type: 'Équipement commercial', location: 'Louga — quartier Artillerie', area: 1450, floors: 1, budget: 325000000, desc: 'Halles couvertes, étals, bloc sanitaire et espace de livraison.' },
];

const materials = [
  { name: 'Ciment', unit: 'sac de 50 kg', stock: 800, minimum: 100 },
  { name: 'Sable', unit: 'm³', stock: 80, minimum: 15 },
  { name: 'Gravier', unit: 'm³', stock: 75, minimum: 15 },
  { name: 'Eau', unit: 'litre', stock: 100000, minimum: 10000 },
  { name: 'Blocs de béton', unit: 'unité', stock: 45000, minimum: 4000 },
  { name: 'Acier HA 8 mm', unit: 'kg', stock: 2500, minimum: 300 },
  { name: 'Acier HA 10 mm', unit: 'kg', stock: 3500, minimum: 400 },
  { name: 'Acier HA 12 mm', unit: 'kg', stock: 5000, minimum: 500 },
  { name: 'Fil recuit', unit: 'kg', stock: 180, minimum: 25 },
  { name: 'Bois de coffrage', unit: 'm²', stock: 600, minimum: 80 },
  { name: 'Pointes de coffrage', unit: 'kg', stock: 120, minimum: 20 },
  { name: 'Briques creuses', unit: 'unité', stock: 18000, minimum: 2000 },
  { name: 'Carreaux de sol', unit: 'm²', stock: 900, minimum: 100 },
  { name: 'Peinture acrylique', unit: 'litre', stock: 700, minimum: 80 },
  { name: 'Conduite PVC Ø 100', unit: 'ml', stock: 300, minimum: 40 },
  { name: 'Conduite PVC Ø 25 mm', unit: 'ml', stock: 400, minimum: 50 },
  { name: 'Câble électrique 2,5 mm²', unit: 'ml', stock: 2500, minimum: 300 },
  { name: 'Tôle bac acier', unit: 'm²', stock: 1200, minimum: 150 },
  { name: 'Granularité latéritique', unit: 'm³', stock: 500, minimum: 60 },
];

const taskTemplates = [
  { code: '1.1.1', name: 'Décapage et préparation du terrain', unit: 'm²', perArea: 1, ratios: { 'Granularité latéritique': 0.04 } },
  { code: '1.2.1', name: 'Couche de forme compactée', unit: 'm³', perArea: 0.08, ratios: { 'Granularité latéritique': 1.15, Eau: 35 } },
  { code: '2.1.1', name: 'Fouilles en rigoles', unit: 'm³', perArea: 0.12, ratios: {} },
  { code: '2.2.1', name: 'Béton de propreté', unit: 'm³', perArea: 0.0292, ratios: { Ciment: 3, Sable: 0.5, Gravier: 0.8, Eau: 110 } },
  { code: '2.2.2', name: 'Béton armé dosé à 350 kg/m³ — fondations', unit: 'm³', perArea: 0.1905, ratios: { Ciment: 7, Sable: 0.45, Gravier: 0.8, Eau: 170, 'Bois de coffrage': 5, 'Acier HA 10 mm': 35, 'Acier HA 12 mm': 55, 'Fil recuit': 1.2, 'Pointes de coffrage': 0.3 } },
  { code: '2.2.3', name: 'Béton armé — poteaux et poutres', unit: 'm³', perArea: 0.105, ratios: { Ciment: 7, Sable: 0.45, Gravier: 0.8, Eau: 170, 'Bois de coffrage': 8, 'Acier HA 8 mm': 18, 'Acier HA 10 mm': 45, 'Acier HA 12 mm': 70, 'Fil recuit': 1.5, 'Pointes de coffrage': 0.4 } },
  { code: '2.2.4', name: 'Béton armé — dalle pleine', unit: 'm³', perArea: 0.14, ratios: { Ciment: 7, Sable: 0.45, Gravier: 0.8, Eau: 170, 'Bois de coffrage': 7, 'Acier HA 8 mm': 25, 'Acier HA 10 mm': 55, 'Fil recuit': 1.5 } },
  { code: '2.2.5', name: 'Béton armé — escalier', unit: 'm³', perArea: 0.018, ratios: { Ciment: 7, Sable: 0.45, Gravier: 0.8, Eau: 170, 'Bois de coffrage': 10, 'Acier HA 8 mm': 30, 'Acier HA 10 mm': 45, 'Fil recuit': 1.5 } },
  { code: '2.2.6', name: 'Dallage béton sur terre-plein', unit: 'm³', perArea: 0.12, ratios: { Ciment: 3, Sable: 0.5, Gravier: 0.8, Eau: 110, 'Acier HA 8 mm': 8 } },
  { code: '2.2.8', name: 'Maçonnerie en blocs de béton', unit: 'm²', perArea: 0.2011, ratios: { 'Blocs de béton': 13.125, Ciment: 0.1, Sable: 0.018, Eau: 3.5 } },
  { code: '2.2.9', name: 'Maçonnerie en briques creuses', unit: 'm²', perArea: 0.06, ratios: { 'Briques creuses': 16, Ciment: 0.09, Sable: 0.016, Eau: 3 } },
  { code: '2.3.1', name: 'Enduit intérieur', unit: 'm²', perArea: 0.0413, ratios: { Ciment: 0.15, Sable: 0.02, Eau: 3.5 } },
  { code: '2.3.2', name: 'Enduit extérieur', unit: 'm²', perArea: 0.038, ratios: { Ciment: 0.15, Sable: 0.02, Eau: 3.5 } },
  { code: '2.3.3', name: 'Chape de pose', unit: 'm²', perArea: 1, ratios: { Ciment: 0.12, Sable: 0.025, Eau: 4 } },
  { code: '2.3.4', name: 'Pose de carrelage au sol', unit: 'm²', perArea: 0.9, ratios: { 'Carreaux de sol': 1.05, Ciment: 0.12, Sable: 0.02, Eau: 3 } },
  { code: '2.3.5', name: 'Peinture intérieure — deux couches', unit: 'm²', perArea: 1.5, ratios: { 'Peinture acrylique': 0.22 } },
  { code: '3.1.1', name: 'Couverture en tôle bac acier', unit: 'm²', perArea: 0.35, ratios: { 'Tôle bac acier': 1.1, 'Bois de coffrage': 1.5, 'Pointes de coffrage': 0.08 } },
  { code: '4.1.1', name: 'Réseau d’évacuation PVC Ø 100', unit: 'ml', perArea: 0.12, ratios: { 'Conduite PVC Ø 100': 1.05 } },
  { code: '4.1.2', name: 'Réseau d’alimentation PVC Ø 25 mm', unit: 'ml', perArea: 0.16, ratios: { 'Conduite PVC Ø 25 mm': 1.05 } },
  { code: '5.1.1', name: 'Câblage électrique — circuits prises', unit: 'm²', perArea: 1, ratios: { 'Câble électrique 2,5 mm²': 2.8 } },
];

try {
  for (const user of users) {
    await db.execute(
      `INSERT INTO users (full_name, username, access_code_hash, role) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name=VALUES(full_name),access_code_hash=VALUES(access_code_hash),role=VALUES(role),is_active=TRUE`,
      [user.name, user.username, await bcrypt.hash(user.code, 12), user.role],
    );
  }
  const [engineers] = await db.execute<RowDataPacket[]>('SELECT id FROM users WHERE username=?', ['ingenieur']);
  const engineerId = engineers[0].id as number;

  for (const material of materials) {
    await db.execute(
      `INSERT INTO materials (name,unit,current_stock,minimum_stock) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE is_active=TRUE`, [material.name, material.unit, material.stock, material.minimum],
    );
  }

  for (const p of projects) {
    const [found] = await db.execute<RowDataPacket[]>('SELECT id FROM projects WHERE reference_code=? ORDER BY id LIMIT 1', [p.ref]);
    let projectId: number;
    if (found.length) {
      projectId = Number(found[0].id);
      await db.execute(
        `UPDATE projects SET name=?,project_type=?,description=?,location=?,built_area_m2=?,floor_count=?,estimated_budget=?,currency='XOF',is_active=TRUE WHERE id=?`,
        [p.name, p.type, p.desc, p.location, p.area, p.floors, p.budget, projectId],
      );
    } else {
      const [inserted] = await db.execute<import('mysql2/promise').ResultSetHeader>(
        `INSERT INTO projects (name,project_type,description,reference_code,location,built_area_m2,floor_count,estimated_budget,currency,status,created_by)
         VALUES (?,?,?,?,?,?,?,?,'XOF','PLANNING',?)`,
        [p.name, p.type, p.desc, p.ref, p.location, p.area, p.floors, p.budget, engineerId],
      );
      projectId = inserted.insertId;
    }
    for (const task of taskTemplates) {
      const quantity = Number((p.area * task.perArea).toFixed(4));
      const [existing] = await db.execute<RowDataPacket[]>('SELECT id FROM tasks WHERE project_id=? AND code=? ORDER BY id LIMIT 1', [projectId, task.code]);
      let taskId: number;
      if (existing.length) {
        taskId = Number(existing[0].id);
        await db.execute('UPDATE tasks SET name=?,unit=?,planned_quantity=?,is_active=TRUE WHERE id=?', [task.name, task.unit, quantity, taskId]);
      } else {
        const [inserted] = await db.execute<import('mysql2/promise').ResultSetHeader>(
          `INSERT INTO tasks (project_id,code,name,unit,planned_quantity,status,created_by) VALUES (?,?,?,?,?,'READY',?)`,
          [projectId, task.code, task.name, task.unit, quantity, engineerId],
        );
        taskId = inserted.insertId;
      }
      for (const [materialName, ratio] of Object.entries(task.ratios)) {
        const [m] = await db.execute<RowDataPacket[]>('SELECT id FROM materials WHERE name=? ORDER BY id LIMIT 1', [materialName]);
        await db.execute(
          `INSERT INTO task_materials (task_id,material_id,quantity_per_unit) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE quantity_per_unit=VALUES(quantity_per_unit)`, [taskId, m[0].id, ratio],
        );
      }
    }
  }

  const [materialRows] = await db.execute<RowDataPacket[]>('SELECT id,name,current_stock FROM materials');
  const byName = new Map(materialRows.map((row) => [row.name as string, row]));
  for (const material of materials) {
    const row = byName.get(material.name)!;
    const [movement] = await db.execute<RowDataPacket[]>('SELECT id FROM stock_movements WHERE material_id=? AND movement_type=\'OPENING\' LIMIT 1', [row.id]);
    if (!movement.length) await db.execute(
      `INSERT INTO stock_movements (material_id,movement_type,quantity,balance_after,note) VALUES (?,'OPENING',?,?,?)`,
      [row.id, material.stock, material.stock, 'Stock initial de démonstration'],
    );
  }
  console.log(`Données prêtes : 4 comptes, ${projects.length} chantiers, ${projects.length * taskTemplates.length} tâches planifiées et ${materials.length} matériaux.`);
} finally {
  await db.end();
}

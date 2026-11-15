import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { exportFullFirebaseSqlDump } from '../src/db/firebaseMigrationExporter';

async function main() {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('firebase-applet-config.json not found in project root.');
  }

  const firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  const fbApp =
    getApps().find((a) => a.name === 'mahasangh-exporter') ||
    initializeApp(firebaseConfig, 'mahasangh-exporter');
  const db =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? getFirestore(fbApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(fbApp);

  console.log('Reading data from BOTH Firebase accounts (Firestore + RTDB)...');
  const { sql, counts, warnings } = await exportFullFirebaseSqlDump(db);

  const outDir = path.resolve(process.cwd(), 'database');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'mahasangh_full_backup.sql');
  fs.writeFileSync(outPath, sql, 'utf-8');

  console.log('SQL Backup Generated:', outPath);
  console.log('Record Counts:', JSON.stringify(counts, null, 2));
  if (warnings.length > 0) {
    console.warn('Warnings:', warnings);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import config from '../config';

let db: SqlJsDatabase | null = null;
let sqlJsReady: Promise<any> | null = null;

function getSqlJs(): Promise<any> {
  if (!sqlJsReady) {
    sqlJsReady = initSqlJs();
  }
  return sqlJsReady;
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (!db) {
    const SQL = await getSqlJs();
    db = new SQL.Database();
    initializeSchema(db);
  }
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export async function resetDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
  const SQL = await getSqlJs();
  db = new SQL.Database();
  initializeSchema(db);
}

// Wrapper helpers to give a better-sqlite3-like API
export function dbRun(sql: string, params: any[] = []): void {
  const database = getDatabase();
  database.run(sql, params);
}

export function dbGet(sql: string, params: any[] = []): any {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  let result: any = null;
  if (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    result = {} as any;
    columns.forEach((col: string, i: number) => {
      result[col] = values[i];
    });
  }
  stmt.free();
  return result;
}

export function dbAll(sql: string, params: any[] = []): any[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    const row: any = {};
    columns.forEach((col: string, i: number) => {
      row[col] = values[i];
    });
    results.push(row);
  }
  stmt.free();
  return results;
}

export function dbExec(sql: string): void {
  const database = getDatabase();
  database.run(sql);
}

function initializeSchema(database: SqlJsDatabase): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      tier TEXT NOT NULL DEFAULT 'basic',
      loyalty_months INTEGER DEFAULT 0,
      active_services INTEGER DEFAULT 0,
      balance REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS billing_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      amount REAL NOT NULL,
      original_amount REAL NOT NULL,
      discount_applied REAL DEFAULT 0,
      discount_reason TEXT,
      tier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      payment_reference TEXT,
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      service_type TEXT NOT NULL,
      provider_id TEXT,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'scheduled',
      notes TEXT,
      location TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      fallback_channel TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      performed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Seed some test data if tables are empty
  const stmt = database.prepare('SELECT COUNT(*) as count FROM customers');
  stmt.step();
  const count = stmt.get()[0] as number;
  stmt.free();

  if (count === 0) {
    seedData(database);
  }
}

function seedData(database: SqlJsDatabase): void {
  const customers = [
    ['cust_001', 'John', 'Smith', 'john.smith@example.com', '+1-555-0101', 'premium', 24, 3, 0],
    ['cust_002', 'Sarah', 'Johnson', 'sarah.j@example.com', '+1-555-0102', 'standard', 8, 2, 150.50],
    ['cust_003', 'Michael', 'Chen', 'mchen@example.com', '+1-555-0103', 'enterprise', 36, 7, 0],
    ['cust_004', 'Emily', 'Davis', 'emily.davis@example.com', '+1-555-0104', 'basic', 2, 1, 29.99],
    ['cust_005', 'Robert', 'Wilson', 'rwilson@example.com', '+1-555-0105', 'premium', 18, 4, 75.00],
  ];

  for (const c of customers) {
    database.run(
      `INSERT INTO customers (id, first_name, last_name, email, phone, tier, loyalty_months, active_services, balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c
    );
  }
}

export default { getDatabase, initDatabase, closeDatabase, resetDatabase, dbRun, dbGet, dbAll, dbExec };

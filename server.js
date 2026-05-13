const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const xlsx = require("xlsx");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "system.db");
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(dataDir, { recursive: true });

let db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function openDb() {
  db = new sqlite3.Database(dbPath);
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function sessionExpiry(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sanitizeSessionUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role || "administrador",
    active: Number(user.active) !== 0
  };
}

async function usersCount() {
  const row = await get(`SELECT COUNT(*) AS count FROM people WHERE type = 'usuarios'`);
  return Number(row?.count || 0);
}

function readToken(request) {
  const authHeader = String(request.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(request.query.token || "").trim();
}

async function findSessionUser(token) {
  if (!token) return null;
  const session = await get(`
    SELECT auth_sessions.token, auth_sessions.expires_at, people.*
    FROM auth_sessions
    INNER JOIN people ON people.id = auth_sessions.user_id
    WHERE auth_sessions.token = ?
  `, [token]);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await run(`DELETE FROM auth_sessions WHERE token = ?`, [token]);
    return null;
  }
  if (session.type !== "usuarios" || Number(session.active) === 0) return null;
  return session;
}

async function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  await run(
    `INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    [token, userId, sessionExpiry()]
  );
  return token;
}

async function clearSession(token) {
  if (!token) return;
  await run(`DELETE FROM auth_sessions WHERE token = ?`, [token]);
}

function canAccess(user, scope) {
  if (!user) return false;
  const role = user.role || "administrador";
  if (role === "administrador") return true;
  const map = {
    financial: ["financeiro"],
    inventory: ["estoque"],
    pdv: ["vendas"],
    people: ["vendas"],
    system: [],
    reports: ["financeiro", "estoque", "vendas"]
  };
  return (map[scope] || []).includes(role);
}

function isValidPlan(plan) {
  return ["financeiro", "completo"].includes(String(plan || "").trim().toLowerCase());
}

async function getSetting(key, fallback = "") {
  const row = await get(`SELECT value FROM system_settings WHERE key = ?`, [key]);
  return row?.value ?? fallback;
}

async function setSetting(key, value) {
  await run(
    `INSERT INTO system_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? "")]
  );
}

async function getSystemPlan() {
  const value = String(await getSetting("plan", "completo") || "completo").trim().toLowerCase();
  return isValidPlan(value) ? value : "completo";
}

function planAllowsScope(plan, scope) {
  if (plan !== "financeiro") return true;
  return !["inventory", "pdv"].includes(scope);
}

async function authRequired(request, response, next) {
  const user = await findSessionUser(readToken(request));
  if (!user) {
    return response.status(401).json({ error: "Sessao expirada. Entre novamente no sistema." });
  }
  request.user = sanitizeSessionUser(user);
  next();
}

function requireScope(scope) {
  return (request, response, next) => {
    if (!planAllowsScope(request.systemPlan || "completo", scope)) {
      return response.status(403).json({ error: "Esta funcao esta disponivel apenas no plano completo." });
    }
    if (!canAccess(request.user, scope)) {
      return response.status(403).json({ error: "Seu perfil nao tem permissao para esta operacao." });
    }
    next();
  };
}

async function registerAudit({ user, action, entityType, entityId = null, description }) {
  await run(
    `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user?.id || null,
      user?.name || "Sistema",
      action,
      entityType,
      entityId || null,
      description
    ]
  );
}

async function ensureUniqueValue({ table, column, value, ignoreId = null, where = "" }) {
  const text = String(value || "").trim();
  if (!text) return;
  const row = await get(
    `SELECT id FROM ${table} WHERE lower(${column}) = lower(?) ${where ? `AND ${where}` : ""} ${ignoreId ? "AND id <> ?" : ""}`,
    ignoreId ? [text, ignoreId] : [text]
  );
  if (row) {
    throw new Error(`Ja existe um registro com este ${column}.`);
  }
}

async function buildCashClosingSummary(closureDate, openingBalance = 0) {
  const salesTotalRow = await get(`
    SELECT COALESCE(SUM(total), 0) AS total
    FROM sales
    WHERE substr(created_at, 1, 10) = ?
  `, [closureDate]);

  const receivedRow = await get(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance
    WHERE type = 'receber' AND status = 'pago' AND due_date = ?
  `, [closureDate]);

  const paidRow = await get(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance
    WHERE type = 'pagar' AND status = 'pago' AND due_date = ?
  `, [closureDate]);

  const totalSales = Number(salesTotalRow?.total || 0);
  const totalReceived = Number(receivedRow?.total || 0);
  const totalPaid = Number(paidRow?.total || 0);
  const closingBalance = Number((Number(openingBalance || 0) + totalReceived - totalPaid).toFixed(2));

  return {
    totalSales,
    totalReceived,
    totalPaid,
    closingBalance
  };
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      document TEXT,
      phone TEXT,
      email TEXT,
      credit REAL DEFAULT 0,
      notes TEXT DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      person_id INTEGER,
      cost_center_id INTEGER,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      installment_number INTEGER DEFAULT 1,
      installment_total INTEGER DEFAULT 1,
      group_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(person_id) REFERENCES people(id),
      FOREIGN KEY(cost_center_id) REFERENCES cost_centers(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL UNIQUE,
      category_id INTEGER,
      category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      sale_price REAL NOT NULL DEFAULT 0,
      minimum INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(category_id) REFERENCES inventory_categories(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      total REAL NOT NULL,
      payment_status TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_id) REFERENCES people(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES people(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES people(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cash_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      closure_date TEXT NOT NULL UNIQUE,
      opening_balance REAL NOT NULL DEFAULT 0,
      total_sales REAL NOT NULL DEFAULT 0,
      total_received REAL NOT NULL DEFAULT 0,
      total_paid REAL NOT NULL DEFAULT 0,
      closing_balance REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES people(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS historico_tentativas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      data TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      observacao TEXT DEFAULT '',
      resultado TEXT NOT NULL DEFAULT 'Contato realizado',
      FOREIGN KEY(cliente_id) REFERENCES people(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn("inventory", "code", "TEXT");
  await ensureColumn("inventory", "category_id", "INTEGER");
  await ensureColumn("inventory", "category", "TEXT");
  await ensureColumn("inventory", "supplier_id", "INTEGER");
  await ensureColumn("inventory", "sale_price", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("people", "username", "TEXT");
  await ensureColumn("people", "password_hash", "TEXT");
  await ensureColumn("people", "role", "TEXT NOT NULL DEFAULT 'administrador'");
  await ensureColumn("people", "active", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("people", "created_at", "TEXT");
  await ensureColumn("people", "import_source", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("people", "manual_credit", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("people", "earned_credit", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("people", "status", "TEXT DEFAULT 'Lead'");
  await ensureColumn("people", "data_conversao", "TEXT");
  await ensureColumn("people", "preferred_size", "TEXT");
  await ensureColumn("people", "preferred_number", "TEXT");
  await ensureColumn("finance", "cost_center_id", "INTEGER");
  await ensureColumn("finance", "installment_number", "INTEGER DEFAULT 1");
  await ensureColumn("finance", "installment_total", "INTEGER DEFAULT 1");
  await ensureColumn("finance", "group_code", "TEXT");
  await ensureColumn("finance", "created_at", "TEXT");
  await ensureColumn("sales", "discount_value", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("sales", "credit_generated", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("sale_items", "cost_price", "REAL NOT NULL DEFAULT 0");

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_people_username_unique
    ON people(username)
    WHERE username IS NOT NULL AND username <> ''
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_data_hora
    ON audit_logs(created_at)
  `);
  await normalizeInventoryRows();
  await run(`UPDATE people SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL OR created_at = ''`);
  await run(`UPDATE people SET import_source = COALESCE(NULLIF(import_source, ''), 'manual')`);
  await run(`UPDATE people SET status = 'Cliente' WHERE type = 'clientes' AND status IS NULL`);
  await run(`UPDATE people SET status = 'Lead' WHERE type = 'clientes' AND COALESCE(NULLIF(status, ''), '') NOT IN ('Lead', 'Cliente')`);
  await run(`UPDATE people SET status = NULL, data_conversao = NULL WHERE type <> 'clientes'`);
  await normalizePeopleCredits();
  await rebuildEarnedCredits();
  await setSetting("plan", await getSystemPlan());
}

async function seedData() {
  const peopleCount = await get("SELECT COUNT(*) AS count FROM people");
  if (peopleCount.count > 0) return;

  const cat1 = await run(
    `INSERT INTO inventory_categories (name, description) VALUES (?, ?)`,
    ["Vestuario", "Categoria padrao inicial"]
  );
  const center1 = await run(
    `INSERT INTO cost_centers (name, description) VALUES (?, ?)`,
    ["Operacional", "Centro de custo inicial"]
  );
  await run(
    `INSERT INTO people (type, name, document, phone, email, credit, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["clientes", "Maria Souza", "123.456.789-00", "(11) 99999-1000", "maria@cliente.com", 350, "Cliente com limite inicial liberado."]
  );
  await run(
    `INSERT INTO people (type, name, document, phone, email, credit, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["fornecedores", "Distribuidora Alfa", "11.222.333/0001-44", "(11) 4002-8922", "contato@alfa.com", 0, ""]
  );
  await run(
    `INSERT INTO finance (type, description, person_id, amount, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["receber", "Venda de abril", 1, 650, dateOffset(3), "aberto"]
  );
  await run(
    `INSERT INTO finance (type, description, person_id, cost_center_id, amount, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["pagar", "Compra de mercadoria", 2, center1.id, 420, dateOffset(-2), "aberto"]
  );
  await run(
    `INSERT INTO inventory (code, name, category_id, category, quantity, cost, sale_price, minimum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["CAM001", "Camiseta Basica", cat1.id, "Vestuario", 8, 29.9, 59.9, 10]
  );
  await run(
    `INSERT INTO inventory (code, name, category_id, category, quantity, cost, sale_price, minimum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["CAL001", "Calca Jeans", cat1.id, "Vestuario", 22, 79.9, 149.9, 6]
  );
}

async function normalizeInventoryRows() {
  await run("UPDATE inventory SET sale_price = cost WHERE sale_price = 0");
  const categories = await all("SELECT id, name FROM inventory_categories");
  const categoryMap = new Map(categories.map((item) => [item.name.toLowerCase(), item.id]));
  const rows = await all("SELECT id, category, category_id FROM inventory");

  for (const row of rows) {
    const categoryName = String(row.category || "").trim();
    if (!categoryName || row.category_id) continue;

    let categoryId = categoryMap.get(categoryName.toLowerCase());
    if (!categoryId) {
      const created = await run(
        `INSERT INTO inventory_categories (name, description) VALUES (?, ?)`,
        [categoryName, "Categoria criada automaticamente"]
      );
      categoryId = created.id;
      categoryMap.set(categoryName.toLowerCase(), categoryId);
    }

    await run(`UPDATE inventory SET category_id = ? WHERE id = ?`, [categoryId, row.id]);
  }
}

async function normalizePeopleCredits() {
  await run(`
    UPDATE people
    SET manual_credit = credit
    WHERE type = 'clientes'
      AND COALESCE(manual_credit, 0) = 0
      AND COALESCE(earned_credit, 0) = 0
      AND COALESCE(credit, 0) > 0
  `);
  await run(`
    UPDATE people
    SET credit = COALESCE(manual_credit, 0) + COALESCE(earned_credit, 0)
    WHERE type = 'clientes'
  `);
  await run(`
    UPDATE people
    SET manual_credit = 0, earned_credit = 0, credit = 0
    WHERE type <> 'clientes'
  `);
}

async function rebuildEarnedCredits() {
  const paidSales = await all(`
    SELECT sales.id,
           COALESCE(SUM((sale_items.unit_price - COALESCE(NULLIF(sale_items.cost_price, 0), inventory.cost, 0)) * sale_items.quantity), 0) AS gross_profit,
           MAX(sales.discount_value) AS discount_value
    FROM sales
    LEFT JOIN sale_items ON sale_items.sale_id = sales.id
    LEFT JOIN inventory ON inventory.id = sale_items.inventory_id
    WHERE sales.client_id IS NOT NULL
      AND sales.payment_status = 'pago'
    GROUP BY sales.id
  `);

  await run(`UPDATE sales SET credit_generated = 0`);
  for (const sale of paidSales) {
    const creditGenerated = Number((Math.max(0, Number(sale.gross_profit || 0) - Number(sale.discount_value || 0)) / 2).toFixed(2));
    await run(`UPDATE sales SET credit_generated = ? WHERE id = ?`, [creditGenerated, sale.id]);
  }

  await run(`
    UPDATE people
    SET earned_credit = 0
    WHERE type = 'clientes'
  `);

  const rows = await all(`
    SELECT sales.client_id,
           COALESCE(SUM(sales.credit_generated), 0) AS earned_credit
    FROM sales
    WHERE sales.client_id IS NOT NULL
    GROUP BY sales.client_id
  `);

  for (const row of rows) {
    const earnedCredit = Number(row.earned_credit || 0);
    await run(
      `UPDATE people
       SET earned_credit = ?
       WHERE id = ? AND type = 'clientes'`,
      [earnedCredit, row.client_id]
    );
    await recalculatePersonCredit(row.client_id);
  }

  await run(`
    UPDATE people
    SET credit = COALESCE(manual_credit, 0) + COALESCE(earned_credit, 0)
    WHERE type = 'clientes'
  `);
}

function dateOffset(days, baseDate) {
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateValue, months) {
  const date = new Date(dateValue);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

async function recalculatePersonCredit(personId) {
  if (!personId) return;
  await run(
    `UPDATE people
     SET credit = COALESCE(manual_credit, 0) + COALESCE(earned_credit, 0)
     WHERE id = ? AND type = 'clientes'`,
    [personId]
  );
}

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  return Number(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeClientStatus(value) {
  return String(value || "Lead").trim() === "Cliente" ? "Cliente" : "Lead";
}

async function convertLeadToClient(clientId) {
  if (!clientId) return;
  const person = await get(`SELECT id, status FROM people WHERE id = ? AND type = 'clientes'`, [clientId]);
  if (!person || person.status === "Cliente") return;
  await run(
    `UPDATE people
     SET status = 'Cliente',
         data_conversao = COALESCE(data_conversao, CURRENT_TIMESTAMP)
     WHERE id = ? AND type = 'clientes'`,
    [clientId]
  );
}

function decorateFinance(rows) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((row) => ({
    ...row,
    overdue: row.status === "aberto" && row.due_date < today,
    status_label: row.status === "pago" ? "Pago" : row.due_date < today ? "Vencido" : "Aberto"
  }));
}

async function getSummary() {
  const people = await all(`
    SELECT type,
           COUNT(*) AS total,
           COALESCE(SUM(credit), 0) AS credits,
           COALESCE(SUM(manual_credit), 0) AS manual_credits,
           COALESCE(SUM(earned_credit), 0) AS earned_credits
    FROM people
    GROUP BY type
  `);
  const finance = decorateFinance(await all("SELECT * FROM finance"));
  const inventory = await all("SELECT * FROM inventory");
  const sales = await all(`
    SELECT sales.total, sales.payment_status, sales.discount_value,
           COALESCE(SUM((sale_items.unit_price - COALESCE(NULLIF(sale_items.cost_price, 0), inventory.cost, 0)) * sale_items.quantity), 0) AS gross_profit
    FROM sales
    LEFT JOIN sale_items ON sale_items.sale_id = sales.id
    LEFT JOIN inventory ON inventory.id = sale_items.inventory_id
    GROUP BY sales.id
  `);

  const peopleMap = Object.fromEntries(people.map((row) => [row.type, row.total]));
  const clientPeople = people.find((row) => row.type === "clientes") || {};
  const creditLimit = Number(clientPeople.credits || 0);
  const manualCredit = Number(clientPeople.manual_credits || 0);
  const earnedCredit = Number(clientPeople.earned_credits || 0);
  const toReceive = finance.filter((item) => item.type === "receber" && item.status === "aberto").reduce((sum, item) => sum + Number(item.amount), 0);
  const toPay = finance.filter((item) => item.type === "pagar" && item.status === "aberto").reduce((sum, item) => sum + Number(item.amount), 0);
  const received = finance.filter((item) => item.type === "receber" && item.status === "pago").reduce((sum, item) => sum + Number(item.amount), 0);
  const paid = finance.filter((item) => item.type === "pagar" && item.status === "pago").reduce((sum, item) => sum + Number(item.amount), 0);
  const grossValue = inventory.reduce((sum, item) => sum + Number(item.quantity) * Number(item.sale_price || 0), 0);
  const netValue = inventory.reduce((sum, item) => sum + Number(item.quantity) * (Number(item.sale_price || 0) - Number(item.cost || 0)), 0);
  const lowStock = inventory.filter((item) => Number(item.quantity) <= Number(item.minimum)).length;
  const salesTotal = sales.reduce((sum, item) => sum + Number(item.total), 0);
  const salesProfit = sales.reduce((sum, item) => sum + Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)), 0);

  return {
    people: {
      total: people.reduce((sum, row) => sum + Number(row.total), 0),
      clients: Number(peopleMap.clientes || 0),
      employees: Number(peopleMap.funcionarios || 0),
      users: Number(peopleMap.usuarios || 0),
      suppliers: Number(peopleMap.fornecedores || 0),
      creditLimit,
      manualCredit,
      earnedCredit
    },
    finance: {
      totalEntries: finance.length,
      toReceive,
      toPay,
      received,
      paid,
      overdueReceivables: finance.filter((item) => item.type === "receber" && item.overdue).length,
      overduePayables: finance.filter((item) => item.type === "pagar" && item.overdue).length,
      balance: toReceive - toPay,
      operationalResult: received - paid
    },
    inventory: {
      totalItems: inventory.length,
      grossValue,
      netValue,
      lowStock
    },
    pdv: {
      totalSales: sales.length,
      salesTotal,
      paidSales: sales.filter((item) => item.payment_status === "pago").length,
      salesProfit
    }
  };
}

async function ensureCategoryByName(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;

  let category = await get("SELECT * FROM inventory_categories WHERE lower(name) = lower(?)", [cleanName]);
  if (!category) {
    const created = await run(
      `INSERT INTO inventory_categories (name, description) VALUES (?, ?)`,
      [cleanName, "Categoria criada automaticamente"]
    );
    category = await get("SELECT * FROM inventory_categories WHERE id = ?", [created.id]);
  }

  return category;
}

async function ensureSupplier(meta) {
  const supplierName = String(meta.FornecedorNome || "").trim();
  if (!supplierName) return null;

  let supplier = await get(
    `SELECT * FROM people WHERE type = 'fornecedores' AND lower(name) = lower(?)`,
    [supplierName]
  );

  if (!supplier) {
    const created = await run(
      `INSERT INTO people (type, name, phone, notes) VALUES (?, ?, ?, ?)`,
      ["fornecedores", supplierName, String(meta.FornecedorTelefone || "").trim(), `Fornecedor criado pela importacao da nota ${meta.NumeroNota || ""}`.trim()]
    );
    supplier = await get("SELECT * FROM people WHERE id = ?", [created.id]);
  }

  return supplier;
}

async function createFinanceEntries(payload) {
  const installments = Math.max(1, Number(payload.installments || 1));
  const amount = Number(payload.amount || 0);
  const groupCode = `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const intervalType = payload.type === "receber" ? "monthly" : "monthly";

  for (let index = 0; index < installments; index += 1) {
    const dueDate =
      installments === 1
        ? payload.due_date
        : intervalType === "monthly"
          ? addMonths(payload.due_date, index)
          : dateOffset(Number(payload.interval_days || 30) * index, payload.due_date);

    const installmentAmount = Number((amount / installments).toFixed(2));
    const description =
      installments > 1
        ? `${payload.description} - Parcela ${index + 1}/${installments}`
        : payload.description;

    await run(
      `INSERT INTO finance (type, description, person_id, cost_center_id, amount, due_date, status, installment_number, installment_total, group_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.type,
        description,
        payload.person_id || null,
        payload.cost_center_id || null,
        installmentAmount,
        dueDate,
        payload.status || "aberto",
        index + 1,
        installments,
        groupCode
      ]
    );
  }
}

function parseImportSheet(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const normalizedRows = rows.map((row) => row.map((cell) => String(cell).trim()));

  const headerIndex = normalizedRows.findIndex((row) => normalizeText(row[0]) === "categoriaproduto" && normalizeText(row[2]) === "produto");
  if (headerIndex === -1) {
    throw new Error("Nao encontrei a linha de produtos no modelo da planilha.");
  }

  const meta = {};
  for (const row of normalizedRows.slice(0, headerIndex)) {
    if (!row[0]) continue;
    const key = row[0];
    const value = row.slice(1).filter(Boolean).join(" ").trim();
    if (value) meta[key] = value;
  }

  const products = normalizedRows.slice(headerIndex + 1).filter((row) => row.some(Boolean)).map((row) => ({
    category: row[0],
    code: row[1],
    product: row[2],
    quantity: Number(row[3] || 0),
    cost: normalizeNumber(row[4] || 0),
    salePrice: normalizeNumber(row[5] || 0),
    minimum: Number(row[6] || 0)
  })).filter((row) => row.product);

  return { meta, products };
}

function buildTemplateWorkbook() {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["NumeroNota", "NF-1001"],
    ["DataCompra", "", "15/04/2026"],
    ["FornecedorNome", "Fornecedor Exemplo"],
    ["FornecedorTelefone", "(11) 99999-9999"],
    ["VencimentoConta", "", "15/05/2026"],
    ["ValorNota", "480,40"],
    ["Observacoes", "Compra do mes"],
    ["SerieNota", "1"],
    ["CondicaoPagamento", "28 dias"],
    ["Parcelas", "2"],
    [],
    ["CategoriaProduto", "CodigoProduto", "Produto", "Quantidade", "CustoUnit", "PrecoVenda", "EstoqueMinimo"],
    ["Mercearia", "ARZ001", "Arroz 5kg", "20", "18,50", "24,90", "5"],
    ["Bebidas", "REF002", "Refrigerante 2L", "12", "6,20", "8,90", "4"]
  ]);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Entrada");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function buildClientsTemplateWorkbook() {
  const worksheet = xlsx.utils.json_to_sheet([
    {
      Nome: "Gabriel Souza",
      Documento: "13528023669",
      Telefone: "84994782818",
      Email: "gabriel@email.com",
      Observacoes: "Cliente importado",
      Tamanho: "M",
      Numeracao: "38",
      LimiteManual: "150,00",
      Status: "Lead",
      DataConversao: ""
    },
    {
      Nome: "Marcia Lima",
      Documento: "12345678900",
      Telefone: "84999990000",
      Email: "marcia@email.com",
      Observacoes: "Ja comprou antes",
      Tamanho: "GG",
      Numeracao: "46",
      LimiteManual: "300,00",
      Status: "Cliente",
      DataConversao: "11/05/2026"
    }
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Clientes");
  return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function parseClientsSheet(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => ({
      name: String(row.Nome || row.nome || "").trim(),
      document: String(row.Documento || row.documento || "").trim(),
      phone: String(row.Telefone || row.telefone || "").trim(),
      email: String(row.Email || row.email || "").trim(),
      notes: String(row.Observacoes || row.observacoes || "").trim(),
      preferredSize: String(row.Tamanho || row.tamanho || row.Tam || row.tam || "").trim(),
      preferredNumber: String(row.Numeracao || row.numeracao || row.Num || row.num || row.Numero || row.numero || "").trim(),
      manualCredit: normalizeNumber(row.LimiteManual || row.limiteManual || row.Limite || row.limite || 0),
      status: normalizeClientStatus(row.Status || row.status || row.Situacao || row.situacao || "Lead"),
      conversionDate: convertDate(row.DataConversao || row.dataConversao || row.DataConversão || row.dataConversão || row.Conversao || row.conversao || "")
    }))
    .filter((row) => row.name);
}

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/auth/bootstrap", async (request, response) => {
  const user = await findSessionUser(readToken(request));
  const plan = await getSystemPlan();
  const companyName = await getSetting("company_name", "Sistema Exclusividade");
  response.json({
    user: sanitizeSessionUser(user),
    needsSetup: (await usersCount()) === 0,
    settings: { plan, companyName }
  });
});

app.post("/api/auth/setup", async (request, response) => {
  if ((await usersCount()) > 0) {
    return response.status(400).json({ error: "Ja existe um usuario configurado no sistema." });
  }
  const name = String(request.body.name || "").trim();
  const username = String(request.body.username || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  if (!name || !username || !password) {
    return response.status(400).json({ error: "Nome, usuario e senha sao obrigatorios." });
  }
  const created = await run(
    `INSERT INTO people (type, name, username, password_hash, role, active, credit, manual_credit, earned_credit, notes, status, data_conversao, created_at, import_source)
     VALUES ('usuarios', ?, ?, ?, 'administrador', 1, 0, 0, 0, '', NULL, NULL, CURRENT_TIMESTAMP, 'manual')`,
    [name, username, hashPassword(password)]
  );
  const token = await createSession(created.id);
  const user = await get(`SELECT * FROM people WHERE id = ?`, [created.id]);
  await registerAudit({
    user,
    action: "setup",
    entityType: "auth",
    entityId: created.id,
    description: `Acesso inicial criado para ${name}.`
  });
  response.status(201).json({ token, user: sanitizeSessionUser(user) });
});

app.post("/api/auth/login", async (request, response) => {
  const login = String(request.body.username || "").trim().toLowerCase();
  const password = String(request.body.password || "");
  if (!login || !password) {
    return response.status(400).json({ error: "Informe usuario/email e senha para entrar." });
  }
  const user = await get(
    `SELECT * FROM people
     WHERE type = 'usuarios'
       AND (lower(username) = lower(?) OR lower(email) = lower(?))`,
    [login, login]
  );
  if (!user || Number(user.active) === 0 || user.password_hash !== hashPassword(password)) {
    return response.status(401).json({ error: "Usuario/email ou senha invalidos." });
  }
  const token = await createSession(user.id);
  await registerAudit({
    user,
    action: "login",
    entityType: "auth",
    entityId: user.id,
    description: `${user.name} entrou no sistema.`
  });
  response.json({ token, user: sanitizeSessionUser(user) });
});

app.post("/api/auth/logout", async (request, response) => {
  const user = await findSessionUser(readToken(request));
  await clearSession(readToken(request));
  if (user) {
    await registerAudit({
      user,
      action: "logout",
      entityType: "auth",
      entityId: user.id,
      description: `${user.name} saiu do sistema.`
    });
  }
  response.json({ ok: true });
});

app.post("/api/auth/change-password", authRequired, async (request, response) => {
  const currentPassword = String(request.body.currentPassword || "");
  const newPassword = String(request.body.newPassword || "");
  if (!currentPassword || !newPassword) {
    return response.status(400).json({ error: "Informe a senha atual e a nova senha." });
  }
  const user = await get(`SELECT * FROM people WHERE id = ? AND type = 'usuarios'`, [request.user.id]);
  if (!user || user.password_hash !== hashPassword(currentPassword)) {
    return response.status(400).json({ error: "A senha atual nao confere." });
  }
  await run(`UPDATE people SET password_hash = ? WHERE id = ?`, [hashPassword(newPassword), request.user.id]);
  await registerAudit({
    user: request.user,
    action: "password",
    entityType: "auth",
    entityId: request.user.id,
    description: `${request.user.name} alterou a propria senha.`
  });
  response.json({ ok: true });
});

app.use("/api", async (request, response, next) => {
  const publicPrefixes = ["/auth/"];
  if (publicPrefixes.some((prefix) => request.path.startsWith(prefix))) {
    return next();
  }
  return authRequired(request, response, async () => {
    request.systemPlan = await getSystemPlan();
    next();
  });
});

app.get("/api/bootstrap", async (request, response) => {
  const people = await all(`
    SELECT id, type, name, document, phone, email, credit, manual_credit, earned_credit, notes, username, role, active, created_at, import_source, status, data_conversao, preferred_size, preferred_number
    FROM people
    ORDER BY name
  `);
  const categories = await all("SELECT * FROM inventory_categories ORDER BY name");
  const costCenters = await all("SELECT * FROM cost_centers ORDER BY name");
  const finance = decorateFinance(await all(`
    SELECT finance.*, people.name AS person_name, cost_centers.name AS cost_center_name
    FROM finance
    LEFT JOIN people ON people.id = finance.person_id
    LEFT JOIN cost_centers ON cost_centers.id = finance.cost_center_id
    ORDER BY due_date
  `));
  const inventory = await all(`
    SELECT inventory.*,
           COALESCE(inventory_categories.name, inventory.category) AS category_name,
           suppliers.name AS supplier_name
    FROM inventory
    LEFT JOIN inventory_categories ON inventory_categories.id = inventory.category_id
    LEFT JOIN people AS suppliers ON suppliers.id = inventory.supplier_id
    ORDER BY inventory.name
  `);
  const recentSales = await all(`
    SELECT sales.*, people.name AS client_name
    FROM sales
    LEFT JOIN people ON people.id = sales.client_id
    ORDER BY sales.id DESC
    LIMIT 10
  `);
  const sales = await all(`
    SELECT sales.*, people.name AS client_name,
           COALESCE(SUM((sale_items.unit_price - COALESCE(NULLIF(sale_items.cost_price, 0), inventory.cost, 0)) * sale_items.quantity), 0) AS gross_profit
    FROM sales
    LEFT JOIN people ON people.id = sales.client_id
    LEFT JOIN sale_items ON sale_items.sale_id = sales.id
    LEFT JOIN inventory ON inventory.id = sale_items.inventory_id
    GROUP BY sales.id
    ORDER BY sales.id DESC
  `);
  const auditLogs = await all(`
    SELECT id, user_id, user_name, action, entity_type, entity_id, description, created_at
    FROM audit_logs
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 1000
  `);
  const cashClosures = await all(`
    SELECT cash_closures.*, people.name AS created_by_name
    FROM cash_closures
    LEFT JOIN people ON people.id = cash_closures.created_by
    ORDER BY closure_date DESC, id DESC
  `);
  const historicoTentativas = await all(`
    SELECT historico_tentativas.*, people.name AS cliente_nome
    FROM historico_tentativas
    LEFT JOIN people ON people.id = historico_tentativas.cliente_id
    ORDER BY datetime(historico_tentativas.data) DESC, historico_tentativas.id DESC
  `);
  const summary = await getSummary();
  const plan = request.systemPlan || await getSystemPlan();
  const companyName = await getSetting("company_name", "Sistema Exclusividade");

  response.json({
    people,
    categories: plan === "financeiro" ? [] : categories,
    costCenters,
    finance,
    inventory: plan === "financeiro" ? [] : inventory,
    recentSales: plan === "financeiro" ? [] : recentSales,
    sales: plan === "financeiro" ? [] : sales,
    auditLogs,
    cashClosures,
    historicoTentativas,
    summary,
    settings: { plan, companyName }
  });
});

app.get("/api/templates/inventory-model", (_request, response) => {
  const file = buildTemplateWorkbook();
  response.setHeader("Content-Disposition", 'attachment; filename="modelo-entrada-estoque.xlsx"');
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.send(file);
});

app.get("/api/templates/clients-model", (_request, response) => {
  const file = buildClientsTemplateWorkbook();
  response.setHeader("Content-Disposition", 'attachment; filename="modelo-clientes.xlsx"');
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.send(file);
});

app.post("/api/reports/export", requireScope("reports"), async (request, response) => {
  const reportName = String(request.body.reportName || "Relatorio");
  const headers = Array.isArray(request.body.headers) ? request.body.headers : [];
  const rows = Array.isArray(request.body.rows) ? request.body.rows : [];
  if (!headers.length) {
    return response.status(400).json({ error: "Nao ha dados suficientes para exportar o relatorio." });
  }

  const worksheet = xlsx.utils.aoa_to_sheet([[reportName], [], headers, ...rows]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Relatorio");
  const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

  await registerAudit({
    user: request.user,
    action: "export",
    entityType: "report",
    description: `${request.user.name} exportou o relatorio ${reportName}.`
  });

  response.setHeader("Content-Disposition", `attachment; filename="${reportName.replace(/[^\w\-]+/g, "_")}.xlsx"`);
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.send(buffer);
});

app.post("/api/audit/cleanup", requireScope("system"), async (request, response) => {
  const days = String(request.body.days || "").trim();
  if (!days) {
    return response.status(400).json({ error: "Informe o periodo para limpar a auditoria." });
  }

  let deleted = 0;
  if (days === "all") {
    const result = await run(`DELETE FROM audit_logs`);
    deleted = Number(result.changes || 0);
  } else {
    const numericDays = Number(days);
    if (!Number.isFinite(numericDays) || numericDays <= 0) {
      return response.status(400).json({ error: "Periodo invalido para limpeza da auditoria." });
    }
    const result = await run(
      `DELETE FROM audit_logs WHERE datetime(created_at) < datetime('now', ?)`,
      [`-${numericDays} days`]
    );
    deleted = Number(result.changes || 0);
  }

  await registerAudit({
    user: request.user,
    action: "cleanup",
    entityType: "audit",
    description: `${request.user.name} limpou ${deleted} registro(s) da auditoria.`
  });

  response.json({ ok: true, deleted });
});

app.get("/api/cash-closures/summary", requireScope("financial"), async (request, response) => {
  const closureDate = String(request.query.date || "").trim() || new Date().toISOString().slice(0, 10);
  const openingBalance = Number(request.query.opening_balance || 0);
  const summary = await buildCashClosingSummary(closureDate, openingBalance);
  response.json({ date: closureDate, openingBalance, ...summary });
});

app.post("/api/cash-closures", requireScope("financial"), async (request, response) => {
  const closureDate = String(request.body.closure_date || "").trim();
  const openingBalance = Number(request.body.opening_balance || 0);
  const notes = String(request.body.notes || "").trim();
  if (!closureDate) {
    return response.status(400).json({ error: "Informe a data do fechamento." });
  }
  const existing = await get(`SELECT id FROM cash_closures WHERE closure_date = ?`, [closureDate]);
  if (existing) {
    return response.status(400).json({ error: "Ja existe fechamento para esta data." });
  }
  const summary = await buildCashClosingSummary(closureDate, openingBalance);
  const result = await run(
    `INSERT INTO cash_closures (closure_date, opening_balance, total_sales, total_received, total_paid, closing_balance, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      closureDate,
      openingBalance,
      summary.totalSales,
      summary.totalReceived,
      summary.totalPaid,
      summary.closingBalance,
      notes,
      request.user.id
    ]
  );
  await registerAudit({
    user: request.user,
    action: "close",
    entityType: "cash",
    entityId: result.id,
    description: `${request.user.name} fechou o caixa do dia ${closureDate}.`
  });
  response.status(201).json({ id: result.id, ...summary });
});

app.get("/api/system/backup", requireScope("system"), (_request, response) => {
  response.download(dbPath, `backup-sistema-${new Date().toISOString().slice(0, 10)}.db`);
});

app.post("/api/system/restore", requireScope("system"), upload.single("file"), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: "Selecione um arquivo de backup para restaurar." });
  }
  const tempPath = `${dbPath}.restore.tmp`;
  fs.writeFileSync(tempPath, request.file.buffer);
  await closeDb();
  fs.copyFileSync(tempPath, dbPath);
  fs.unlinkSync(tempPath);
  openDb();
  await initDb();
  await registerAudit({
    user: request.user,
    action: "restore",
    entityType: "system",
    description: `${request.user.name} restaurou um backup do sistema.`
  });
  response.json({ ok: true });
});

app.post("/api/system/reset", requireScope("system"), async (_request, response) => {
  await run("DELETE FROM historico_tentativas");
  await run("DELETE FROM sale_items");
  await run("DELETE FROM sales");
  await run("DELETE FROM finance");
  await run("DELETE FROM inventory");
  await run("DELETE FROM inventory_categories");
  await run("DELETE FROM cost_centers");
  await run("DELETE FROM auth_sessions");
  await run("DELETE FROM audit_logs");
  await run("DELETE FROM people");
  await run("DELETE FROM sqlite_sequence WHERE name IN ('historico_tentativas','sale_items','sales','finance','inventory','inventory_categories','cost_centers','people','auth_sessions','audit_logs')");
  response.json({ ok: true });
});

app.put("/api/system/settings", requireScope("system"), async (request, response) => {
  if ((request.user?.role || "") !== "administrador") {
    return response.status(403).json({ error: "Somente administradores podem alterar o plano do sistema." });
  }
  const plan = String(request.body.plan || "").trim().toLowerCase();
  const companyName = String(request.body.company_name || "Sistema Exclusividade").trim() || "Sistema Exclusividade";
  if (!isValidPlan(plan)) {
    return response.status(400).json({ error: "Plano invalido. Use financeiro ou completo." });
  }
  await setSetting("plan", plan);
  await setSetting("company_name", companyName);
  await registerAudit({
    user: request.user,
    action: "settings",
    entityType: "system",
    description: `${request.user.name} alterou as configuracoes do sistema para ${companyName} (${plan}).`
  });
  response.json({ ok: true, settings: { plan, companyName } });
});

app.post("/api/people", requireScope("people"), async (request, response) => {
  const { type, name, document, phone, email, credit, notes, username, password, role, active, status, preferred_size, preferred_number } = request.body;
  if (!type || !name) return response.status(400).json({ error: "Tipo e nome sao obrigatorios." });
  const manualCredit = type === "clientes" ? Number(credit || 0) : 0;
  const normalizedUsername = type === "usuarios" ? String(username || "").trim().toLowerCase() : "";
  if (type === "usuarios" && (!normalizedUsername || !password)) {
    return response.status(400).json({ error: "Usuario e senha sao obrigatorios para cadastros de acesso." });
  }
  await ensureUniqueValue({ table: "people", column: "name", value: name, where: `type = '${type}'` });
  if (document) {
    await ensureUniqueValue({ table: "people", column: "document", value: document });
  }
  if (email) {
    await ensureUniqueValue({ table: "people", column: "email", value: email });
  }
  if (type === "usuarios" && normalizedUsername) {
    await ensureUniqueValue({ table: "people", column: "username", value: normalizedUsername });
  }

  const clientStatus = type === "clientes" ? normalizeClientStatus(status) : null;
  const preferredSize = type === "clientes" ? String(preferred_size || "").trim().toUpperCase() : "";
  const preferredNumber = type === "clientes" ? String(preferred_number || "").trim() : "";
  const result = await run(
    `INSERT INTO people (type, name, document, phone, email, credit, manual_credit, earned_credit, notes, username, password_hash, role, active, status, data_conversao, preferred_size, preferred_number, created_at, import_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'manual')`,
    [
      type,
      name,
      document || "",
      phone || "",
      email || "",
      manualCredit,
      manualCredit,
      0,
      notes || "",
      normalizedUsername || null,
      type === "usuarios" ? hashPassword(password) : null,
      type === "usuarios" ? String(role || "vendas") : "administrador",
      type === "usuarios" ? Number(active ?? 1) : 1,
      clientStatus,
      clientStatus === "Cliente" ? new Date().toISOString() : null,
      preferredSize,
      preferredNumber
    ]
  );

  await registerAudit({
    user: request.user,
    action: "create",
    entityType: "people",
    entityId: result.id,
    description: `${request.user.name} cadastrou ${name} em ${type}.`
  });

  response.status(201).json({ id: result.id });
});

app.put("/api/people/:id", requireScope("people"), async (request, response) => {
  const { type, name, document, phone, email, credit, notes, username, password, role, active, status, preferred_size, preferred_number } = request.body;
  const currentPerson = await get("SELECT * FROM people WHERE id = ?", [request.params.id]);
  if (!currentPerson) {
    return response.status(404).json({ error: "Cadastro nao encontrado." });
  }
  const manualCredit = type === "clientes" ? Number(credit || 0) : 0;
  const earnedCredit = type === "clientes" ? Number(currentPerson?.earned_credit || 0) : 0;
  const normalizedUsername = type === "usuarios" ? String(username || currentPerson?.username || "").trim().toLowerCase() : null;
  const passwordHash = type === "usuarios"
    ? (String(password || "").trim() ? hashPassword(password) : currentPerson?.password_hash || null)
    : null;
  await ensureUniqueValue({ table: "people", column: "name", value: name, ignoreId: Number(request.params.id), where: `type = '${type}'` });
  if (document) {
    await ensureUniqueValue({ table: "people", column: "document", value: document, ignoreId: Number(request.params.id) });
  }
  if (email) {
    await ensureUniqueValue({ table: "people", column: "email", value: email, ignoreId: Number(request.params.id) });
  }
  if (type === "usuarios" && normalizedUsername) {
    await ensureUniqueValue({ table: "people", column: "username", value: normalizedUsername, ignoreId: Number(request.params.id) });
  }
  const clientStatus = type === "clientes" ? normalizeClientStatus(status || currentPerson?.status) : null;
  const conversionDate = clientStatus === "Cliente"
    ? (currentPerson?.status === "Cliente" ? currentPerson?.data_conversao : new Date().toISOString())
    : null;
  const preferredSize = type === "clientes" ? String(preferred_size || "").trim().toUpperCase() : "";
  const preferredNumber = type === "clientes" ? String(preferred_number || "").trim() : "";
  await run(
    `UPDATE people
     SET type = ?, name = ?, document = ?, phone = ?, email = ?, credit = ?, manual_credit = ?, earned_credit = ?, notes = ?, username = ?, password_hash = ?, role = ?, active = ?, status = ?, data_conversao = ?, preferred_size = ?, preferred_number = ?, import_source = COALESCE(import_source, 'manual')
     WHERE id = ?`,
    [
      type,
      name,
      document || "",
      phone || "",
      email || "",
      manualCredit + earnedCredit,
      manualCredit,
      earnedCredit,
      notes || "",
      normalizedUsername,
      passwordHash,
      type === "usuarios" ? String(role || currentPerson?.role || "vendas") : "administrador",
      type === "usuarios" ? Number(active ?? currentPerson?.active ?? 1) : 1,
      clientStatus,
      conversionDate,
      preferredSize,
      preferredNumber,
      request.params.id
    ]
  );

  await registerAudit({
    user: request.user,
    action: "update",
    entityType: "people",
    entityId: Number(request.params.id),
    description: `${request.user.name} atualizou o cadastro de ${name}.`
  });

  response.json({ ok: true });
});

app.put("/api/people/:id/credit", requireScope("financial"), async (request, response) => {
  const person = await get("SELECT * FROM people WHERE id = ? AND type = 'clientes'", [request.params.id]);
  if (!person) {
    return response.status(404).json({ error: "Cliente nao encontrado." });
  }
  const manualCredit = Math.max(0, Number(request.body.manual_credit || 0));
  await run(`UPDATE people SET manual_credit = ? WHERE id = ?`, [manualCredit, request.params.id]);
  await recalculatePersonCredit(request.params.id);
  await registerAudit({
    user: request.user,
    action: "credit",
    entityType: "people",
    entityId: Number(request.params.id),
    description: `${request.user.name} ajustou o limite manual do cliente ${person.name}.`
  });
  response.json({ ok: true });
});

app.delete("/api/people/:id", requireScope("people"), async (request, response) => {
  await run("UPDATE finance SET person_id = NULL WHERE person_id = ?", [request.params.id]);
  await run("DELETE FROM auth_sessions WHERE user_id = ?", [request.params.id]);
  await run("DELETE FROM historico_tentativas WHERE cliente_id = ?", [request.params.id]);
  await run("DELETE FROM people WHERE id = ?", [request.params.id]);
  await registerAudit({
    user: request.user,
    action: "delete",
    entityType: "people",
    entityId: Number(request.params.id),
    description: `${request.user.name} excluiu um cadastro.`
  });
  response.json({ ok: true });
});

app.post("/api/people/:id/historico-tentativas", requireScope("people"), async (request, response) => {
  const person = await get("SELECT * FROM people WHERE id = ? AND type = 'clientes'", [request.params.id]);
  if (!person) {
    return response.status(404).json({ error: "Cliente nao encontrado." });
  }
  const observacao = String(request.body.observacao || "").trim();
  const resultado = String(request.body.resultado || "").trim();
  const data = String(request.body.data || "").trim() || new Date().toISOString();
  if (!observacao || !resultado) {
    return response.status(400).json({ error: "Observacao e resultado sao obrigatorios." });
  }
  const result = await run(
    `INSERT INTO historico_tentativas (cliente_id, data, observacao, resultado)
     VALUES (?, ?, ?, ?)`,
    [request.params.id, data, observacao, resultado]
  );
  if (resultado === "Convertido") {
    await convertLeadToClient(request.params.id);
  }
  await registerAudit({
    user: request.user,
    action: "history",
    entityType: "people",
    entityId: Number(request.params.id),
    description: `${request.user.name} registrou uma tentativa comercial para ${person.name}.`
  });
  response.status(201).json({ id: result.id });
});

app.post("/api/categories", requireScope("inventory"), async (request, response) => {
  const { name, description } = request.body;
  if (!name) return response.status(400).json({ error: "Nome da categoria e obrigatorio." });
  await ensureUniqueValue({ table: "inventory_categories", column: "name", value: name });

  const result = await run(
    `INSERT INTO inventory_categories (name, description) VALUES (?, ?)`,
    [name.trim(), description || ""]
  );

  await registerAudit({
    user: request.user,
    action: "create",
    entityType: "inventory",
    entityId: result.id,
    description: `${request.user.name} cadastrou o produto ${name}.`
  });

  response.status(201).json({ id: result.id });
});

app.post("/api/cost-centers", requireScope("financial"), async (request, response) => {
  const { name, description } = request.body;
  if (!name) return response.status(400).json({ error: "Nome do centro de custo e obrigatorio." });
  await ensureUniqueValue({ table: "cost_centers", column: "name", value: name });
  const result = await run(
    `INSERT INTO cost_centers (name, description) VALUES (?, ?)`,
    [name.trim(), description || ""]
  );
  response.status(201).json({ id: result.id });
});

app.put("/api/cost-centers/:id", requireScope("financial"), async (request, response) => {
  const { name, description } = request.body;
  await ensureUniqueValue({ table: "cost_centers", column: "name", value: name, ignoreId: Number(request.params.id) });
  await run(
    `UPDATE cost_centers SET name = ?, description = ? WHERE id = ?`,
    [name.trim(), description || "", request.params.id]
  );
  await registerAudit({
    user: request.user,
    action: "update",
    entityType: "inventory",
    entityId: Number(request.params.id),
    description: `${request.user.name} atualizou o produto ${name}.`
  });
  response.json({ ok: true });
});

app.delete("/api/cost-centers/:id", requireScope("financial"), async (request, response) => {
  await run(`UPDATE finance SET cost_center_id = NULL WHERE cost_center_id = ?`, [request.params.id]);
  await run(`DELETE FROM cost_centers WHERE id = ?`, [request.params.id]);
  response.json({ ok: true });
});

app.put("/api/categories/:id", requireScope("inventory"), async (request, response) => {
  const { name, description } = request.body;
  await ensureUniqueValue({ table: "inventory_categories", column: "name", value: name, ignoreId: Number(request.params.id) });
  await run(
    `UPDATE inventory_categories SET name = ?, description = ? WHERE id = ?`,
    [name.trim(), description || "", request.params.id]
  );
  response.json({ ok: true });
});

app.delete("/api/categories/:id", requireScope("inventory"), async (request, response) => {
  await run("UPDATE inventory SET category_id = NULL, category = '' WHERE category_id = ?", [request.params.id]);
  await run("DELETE FROM inventory_categories WHERE id = ?", [request.params.id]);
  response.json({ ok: true });
});

app.post("/api/finance", requireScope("financial"), async (request, response) => {
  const { type, description, person_id, cost_center_id, amount, due_date, status, installments, interval_days } = request.body;
  if (!type || !description || !due_date) {
    return response.status(400).json({ error: "Tipo, descricao e vencimento sao obrigatorios." });
  }

  await createFinanceEntries({
    type,
    description,
    person_id,
    cost_center_id,
    amount,
    due_date,
    status,
    installments,
    interval_days
  });

  await registerAudit({
    user: request.user,
    action: "create",
    entityType: "finance",
    description: `${request.user.name} lancou ${description} em ${type}.`
  });

  response.status(201).json({ ok: true });
});

app.put("/api/finance/:id", requireScope("financial"), async (request, response) => {
  const { type, description, person_id, cost_center_id, amount, due_date, status } = request.body;
  await run(
    `UPDATE finance
     SET type = ?, description = ?, person_id = ?, cost_center_id = ?, amount = ?, due_date = ?, status = ?
     WHERE id = ?`,
    [type, description, person_id || null, cost_center_id || null, Number(amount || 0), due_date, status || "aberto", request.params.id]
  );
  await registerAudit({
    user: request.user,
    action: "update",
    entityType: "finance",
    entityId: Number(request.params.id),
    description: `${request.user.name} atualizou o lancamento ${description}.`
  });
  response.json({ ok: true });
});

app.post("/api/finance/:id/payment", requireScope("financial"), async (request, response) => {
  const entry = await get("SELECT * FROM finance WHERE id = ?", [request.params.id]);
  if (!entry) {
    return response.status(404).json({ error: "Lancamento nao encontrado." });
  }
  if (entry.status === "pago") {
    return response.status(400).json({ error: "Este lancamento ja esta quitado." });
  }

  const paymentAmount = Number(request.body.amount || 0);
  if (paymentAmount <= 0) {
    return response.status(400).json({ error: "Informe um valor maior que zero para baixar." });
  }
  if (paymentAmount > Number(entry.amount)) {
    return response.status(400).json({ error: "O valor informado nao pode ser maior que o saldo em aberto." });
  }

  const paidDate = new Date().toISOString().slice(0, 10);
  const remainingAmount = Number((Number(entry.amount) - paymentAmount).toFixed(2));
  const saleMatch = entry.type === "receber" ? String(entry.description || "").match(/Venda PDV #(\d+)/i) : null;

  if (remainingAmount <= 0) {
    await run(`UPDATE finance SET status = 'pago' WHERE id = ?`, [request.params.id]);
    if (saleMatch) {
      const saleId = Number(saleMatch[1]);
      const sale = await get("SELECT * FROM sales WHERE id = ?", [saleId]);
      if (sale) {
        const generatedCredit = Number(sale.credit_generated || 0);
        let creditToGenerate = generatedCredit;
        if (sale.client_id && generatedCredit <= 0) {
          const profitRow = await get(`
            SELECT COALESCE(SUM((sale_items.unit_price - COALESCE(NULLIF(sale_items.cost_price, 0), inventory.cost, 0)) * sale_items.quantity), 0) AS gross_profit
            FROM sale_items
            LEFT JOIN inventory ON inventory.id = sale_items.inventory_id
            WHERE sale_items.sale_id = ?
          `, [saleId]);
          creditToGenerate = Number((Math.max(0, Number(profitRow?.gross_profit || 0) - Number(sale.discount_value || 0)) / 2).toFixed(2));
        }
        await run(`UPDATE sales SET payment_status = 'pago', credit_generated = ? WHERE id = ?`, [creditToGenerate, saleId]);
        if (sale.client_id && creditToGenerate > 0) {
          await rebuildEarnedCredits();
        }
        if (sale.client_id) {
          await convertLeadToClient(sale.client_id);
        }
      }
    }
    await registerAudit({
      user: request.user,
      action: "payment",
      entityType: "finance",
      entityId: Number(request.params.id),
      description: `${request.user.name} baixou integralmente ${entry.description}.`
    });
    return response.json({ ok: true, mode: "full" });
  }

  await run(`UPDATE finance SET amount = ? WHERE id = ?`, [remainingAmount, request.params.id]);
  await run(
    `INSERT INTO finance (type, description, person_id, amount, due_date, status, installment_number, installment_total, group_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.type,
      `${entry.description} - Baixa parcial`,
      entry.person_id || null,
      paymentAmount,
      paidDate,
      "pago",
      entry.installment_number || 1,
      entry.installment_total || 1,
      entry.group_code || null
    ]
  );

  await registerAudit({
    user: request.user,
    action: "payment",
    entityType: "finance",
    entityId: Number(request.params.id),
    description: `${request.user.name} registrou baixa parcial em ${entry.description}.`
  });

  response.json({ ok: true, mode: "partial", remaining: remainingAmount });
});

app.delete("/api/finance/:id", requireScope("financial"), async (request, response) => {
  await run("DELETE FROM finance WHERE id = ?", [request.params.id]);
  await registerAudit({
    user: request.user,
    action: "delete",
    entityType: "finance",
    entityId: Number(request.params.id),
    description: `${request.user.name} excluiu um lancamento financeiro.`
  });
  response.json({ ok: true });
});

app.post("/api/inventory", requireScope("inventory"), async (request, response) => {
  const { code, name, category_id, supplier_id, quantity, cost, sale_price, minimum } = request.body;
  if (!name) return response.status(400).json({ error: "Nome do produto e obrigatorio." });
  await ensureUniqueValue({ table: "inventory", column: "name", value: name });
  if (code) {
    await ensureUniqueValue({ table: "inventory", column: "code", value: code });
  }

  const category = category_id ? await get("SELECT * FROM inventory_categories WHERE id = ?", [category_id]) : null;
  const result = await run(
    `INSERT INTO inventory (code, name, category_id, category, supplier_id, quantity, cost, sale_price, minimum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code || "",
      name.trim(),
      category ? category.id : null,
      category ? category.name : "",
      supplier_id || null,
      Number(quantity || 0),
      Number(cost || 0),
      Number(sale_price || 0),
      Number(minimum || 0)
    ]
  );

  response.status(201).json({ id: result.id });
});

app.put("/api/inventory/:id", requireScope("inventory"), async (request, response) => {
  const { code, name, category_id, supplier_id, quantity, cost, sale_price, minimum } = request.body;
  await ensureUniqueValue({ table: "inventory", column: "name", value: name, ignoreId: Number(request.params.id) });
  if (code) {
    await ensureUniqueValue({ table: "inventory", column: "code", value: code, ignoreId: Number(request.params.id) });
  }
  const category = category_id ? await get("SELECT * FROM inventory_categories WHERE id = ?", [category_id]) : null;
  await run(
    `UPDATE inventory
     SET code = ?, name = ?, category_id = ?, category = ?, supplier_id = ?, quantity = ?, cost = ?, sale_price = ?, minimum = ?
     WHERE id = ?`,
    [
      code || "",
      name.trim(),
      category ? category.id : null,
      category ? category.name : "",
      supplier_id || null,
      Number(quantity || 0),
      Number(cost || 0),
      Number(sale_price || 0),
      Number(minimum || 0),
      request.params.id
    ]
  );
  response.json({ ok: true });
});

app.delete("/api/inventory/:id", requireScope("inventory"), async (request, response) => {
  await run("DELETE FROM inventory WHERE id = ?", [request.params.id]);
  await registerAudit({
    user: request.user,
    action: "delete",
    entityType: "inventory",
    entityId: Number(request.params.id),
    description: `${request.user.name} excluiu um produto do estoque.`
  });
  response.json({ ok: true });
});

app.post("/api/import/inventory", requireScope("inventory"), upload.single("file"), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Arquivo nao enviado." });

  const { meta, products } = parseImportSheet(request.file.buffer);
  const supplier = await ensureSupplier(meta);
  let noteTotal = normalizeNumber(meta.ValorNota || 0);

  for (const item of products) {
    const category = await ensureCategoryByName(item.category);
    const existing = await get("SELECT * FROM inventory WHERE lower(name) = lower(?)", [item.product]);
    if (existing) {
      await run(
        `UPDATE inventory
         SET code = ?, category_id = ?, category = ?, supplier_id = ?, quantity = ?, cost = ?, sale_price = ?, minimum = ?
         WHERE id = ?`,
        [
          item.code || existing.code || "",
          category ? category.id : existing.category_id,
          category ? category.name : existing.category,
          supplier ? supplier.id : existing.supplier_id,
          Number(existing.quantity) + Number(item.quantity || 0),
          item.cost || existing.cost,
          item.salePrice || existing.sale_price,
          item.minimum || existing.minimum,
          existing.id
        ]
      );
    } else {
      await run(
        `INSERT INTO inventory (code, name, category_id, category, supplier_id, quantity, cost, sale_price, minimum)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.code || "",
          item.product,
          category ? category.id : null,
          category ? category.name : "",
          supplier ? supplier.id : null,
          Number(item.quantity || 0),
          Number(item.cost || 0),
          Number(item.salePrice || 0),
          Number(item.minimum || 0)
        ]
      );
    }

    if (!noteTotal) {
      noteTotal += Number(item.quantity || 0) * Number(item.cost || 0);
    }
  }

  if (noteTotal > 0) {
    await createFinanceEntries({
      type: "pagar",
      description: `Nota ${meta.NumeroNota || "sem numero"} - ${meta.FornecedorNome || "Fornecedor"}`.trim(),
      person_id: supplier ? supplier.id : null,
      amount: noteTotal,
      due_date: convertDate(meta.VencimentoConta) || convertDate(meta.DataCompra) || new Date().toISOString().slice(0, 10),
      status: "aberto",
      installments: Number(meta.Parcelas || 1),
      interval_days: 30
    });
  }

  await registerAudit({
    user: request.user,
    action: "import",
    entityType: "inventory",
    description: `${request.user.name} importou ${products.length} item(ns) por planilha de entrada.`
  });

  response.json({ ok: true, imported: products.length });
});

app.post("/api/import/clients", requireScope("people"), upload.single("file"), async (request, response) => {
  if (!request.file) {
    return response.status(400).json({ error: "Arquivo de clientes nao enviado." });
  }

  const clients = parseClientsSheet(request.file.buffer);
  let imported = 0;

  for (const client of clients) {
    const existing = client.document
      ? await get(`SELECT * FROM people WHERE type = 'clientes' AND document = ?`, [client.document])
      : await get(`SELECT * FROM people WHERE type = 'clientes' AND lower(name) = lower(?)`, [client.name]);

    if (existing) {
      const manualCredit = Math.max(Number(existing.manual_credit || 0), Number(client.manualCredit || 0));
      const earnedCredit = Number(existing.earned_credit || 0);
      const clientStatus = normalizeClientStatus(client.status || existing.status || "Lead");
      const conversionDate = clientStatus === "Cliente"
        ? client.conversionDate || existing.data_conversao || new Date().toISOString()
        : null;
      await run(
        `UPDATE people
         SET name = ?, document = ?, phone = ?, email = ?, notes = ?, preferred_size = ?, preferred_number = ?, manual_credit = ?, credit = ?, status = ?, data_conversao = ?, import_source = 'import'
         WHERE id = ?`,
        [
          client.name,
          client.document || existing.document || "",
          client.phone || existing.phone || "",
          client.email || existing.email || "",
          client.notes || existing.notes || "",
          client.preferredSize || existing.preferred_size || "",
          client.preferredNumber || existing.preferred_number || "",
          manualCredit,
          manualCredit + earnedCredit,
          clientStatus,
          conversionDate,
          existing.id
        ]
      );
    } else {
      const clientStatus = normalizeClientStatus(client.status);
      const conversionDate = clientStatus === "Cliente"
        ? client.conversionDate || new Date().toISOString()
        : null;
      await run(
        `INSERT INTO people (type, name, document, phone, email, notes, preferred_size, preferred_number, credit, manual_credit, earned_credit, active, status, data_conversao, created_at, import_source)
         VALUES ('clientes', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, CURRENT_TIMESTAMP, 'import')`,
        [
          client.name,
          client.document || "",
          client.phone || "",
          client.email || "",
          client.notes || "",
          client.preferredSize || "",
          client.preferredNumber || "",
          Number(client.manualCredit || 0),
          Number(client.manualCredit || 0),
          clientStatus,
          conversionDate
        ]
      );
    }
    imported += 1;
  }

  await registerAudit({
    user: request.user,
    action: "import",
    entityType: "people",
    description: `${request.user.name} importou ${imported} cliente(s) por planilha.`
  });

  response.json({ ok: true, imported });
});

app.delete("/api/sales/:id", requireScope("pdv"), async (request, response) => {
  const sale = await get("SELECT * FROM sales WHERE id = ?", [request.params.id]);
  if (!sale) {
    return response.status(404).json({ error: "Venda nao encontrada." });
  }
  const items = await all("SELECT * FROM sale_items WHERE sale_id = ?", [request.params.id]);
  try {
    await run("BEGIN TRANSACTION");
    for (const item of items) {
      await run(
        "UPDATE inventory SET quantity = quantity + ? WHERE id = ?",
        [Number(item.quantity || 0), item.inventory_id]
      );
    }
    await run("DELETE FROM finance WHERE description LIKE ?", [`Venda PDV #${sale.id}%`]);
    await run("DELETE FROM sale_items WHERE sale_id = ?", [request.params.id]);
    await run("DELETE FROM sales WHERE id = ?", [request.params.id]);
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
  if (sale.client_id) {
    await rebuildEarnedCredits();
  }
  await registerAudit({
    user: request.user,
    action: "delete",
    entityType: "pdv",
    entityId: Number(request.params.id),
    description: `${request.user.name} excluiu a venda PDV #${sale.id} e devolveu o estoque.`
  });
  response.json({ ok: true });
});

app.post("/api/pdv/sale", requireScope("pdv"), async (request, response) => {
  const { client_id, payment_status, payment_method, sale_date, due_date, installments, items, discount_value } = request.body;
  if (!items || !items.length) {
    return response.status(400).json({ error: "Inclua pelo menos um item na venda." });
  }
  const allowedMethods = new Set(["dinheiro", "pix", "cartao", "crediario"]);
  if (!allowedMethods.has(payment_method)) {
    return response.status(400).json({ error: "Forma de pagamento invalida." });
  }
  if (payment_method === "crediario" && !client_id) {
    return response.status(400).json({ error: "Selecione um cliente para vender no crediario." });
  }

  let subtotal = 0;
  for (const item of items) {
    const product = await get("SELECT * FROM inventory WHERE id = ?", [item.inventory_id]);
    if (!product) {
      return response.status(400).json({ error: "Produto nao encontrado no estoque." });
    }
    if (Number(item.quantity) <= 0) {
      return response.status(400).json({ error: `Quantidade invalida para ${product.name}.` });
    }
    if (Number(item.unit_price) <= 0) {
      return response.status(400).json({ error: `Preco invalido para ${product.name}.` });
    }
    if (Number(product.quantity) < Number(item.quantity)) {
      return response.status(400).json({ error: `Estoque insuficiente para ${product.name}.` });
    }
    subtotal += Number(item.quantity) * Number(item.unit_price);
  }

  const discount = Math.max(0, Number(discount_value || 0));
  if (discount > subtotal) {
    return response.status(400).json({ error: "O desconto nao pode ser maior que o subtotal da venda." });
  }
  const total = Math.max(0, Number((subtotal - discount).toFixed(2)));
  if (total <= 0) {
    return response.status(400).json({ error: "O total da venda precisa ser maior que zero." });
  }
  let grossProfit = 0;
  const saleDate = convertDate(sale_date) || new Date().toISOString().slice(0, 10);
  const createdAt = `${saleDate} ${new Date().toTimeString().slice(0, 8)}`;
  const resolvedStatus = payment_method === "crediario" ? "aberto" : payment_status || "pago";
  const resolvedDueDate =
    payment_method === "crediario"
      ? due_date || addMonths(new Date().toISOString().slice(0, 10), 1)
      : due_date || new Date().toISOString().slice(0, 10);
  let creditGenerated = 0;

  let sale;
  try {
    await run("BEGIN TRANSACTION");
    sale = await run(
      `INSERT INTO sales (client_id, total, payment_status, payment_method, discount_value, credit_generated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [client_id || null, total, resolvedStatus, payment_method || "dinheiro", discount, creditGenerated, createdAt]
    );

    for (const item of items) {
      const product = await get("SELECT * FROM inventory WHERE id = ?", [item.inventory_id]);
      const lineTotal = Number(item.quantity) * Number(item.unit_price);
      const lineCost = Number(item.quantity) * Number(product.cost || 0);
      grossProfit += Math.max(0, lineTotal - lineCost);
      await run(
        `INSERT INTO sale_items (sale_id, inventory_id, quantity, unit_price, total, cost_price) VALUES (?, ?, ?, ?, ?, ?)`,
        [sale.id, item.inventory_id, Number(item.quantity), Number(item.unit_price), lineTotal, Number(product.cost || 0)]
      );
      await run(
        `UPDATE inventory SET quantity = quantity - ? WHERE id = ?`,
        [Number(item.quantity), item.inventory_id]
      );
    }

    await createFinanceEntries({
      type: "receber",
      description: `Venda PDV #${sale.id}${discount > 0 ? ` com desconto ${discount.toFixed(2)}` : ""}`,
      person_id: client_id || null,
      amount: total,
      due_date: resolvedDueDate,
      status: resolvedStatus,
      installments: Number(installments || 1),
      interval_days: 30
    });
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }

  if (client_id && resolvedStatus === "pago") {
    creditGenerated = Number((Math.max(0, grossProfit - discount) / 2).toFixed(2));
    await run(`UPDATE sales SET credit_generated = ? WHERE id = ?`, [creditGenerated, sale.id]);
    await convertLeadToClient(client_id);
  }

  if (client_id && creditGenerated > 0) {
    await run(
      `UPDATE people
       SET earned_credit = COALESCE(earned_credit, 0) + ?
       WHERE id = ? AND type = 'clientes'`,
      [creditGenerated, client_id]
    );
    await recalculatePersonCredit(client_id);
  }

  await registerAudit({
    user: request.user,
    action: "sale",
    entityType: "pdv",
    entityId: sale.id,
    description: `${request.user.name} finalizou a venda PDV #${sale.id} no valor de ${total.toFixed(2)}.`
  });

  response.status(201).json({ id: sale.id });
});

function convertDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split(/[\/-]/);
  if (parts.length !== 3) return "";
  const [day, month, year] = parts;
  if (!year) return "";
  return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

app.use((error, _request, response, _next) => {
  const isUniqueError = String(error.message || "").includes("UNIQUE constraint failed");
  response.status(500).json({
    error: isUniqueError ? "Ja existe um registro com esse nome ou codigo." : error.message || "Ocorreu um erro ao processar a operacao."
  });
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    app: "Sistema Exclusividade",
    mode: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Servidor iniciado na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar o banco:", error);
    process.exit(1);
  });

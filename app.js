const state = {
  currentView: "dashboard",
  sessionUser: null,
  companyId: null,
  member: null,
  authReady: false,
  settings: { plan: "completo" },
  people: [],
  categories: [],
  costCenters: [],
  finance: [],
  inventory: [],
  sales: [],
  saleItems: [],
  recentSales: [],
  auditLogs: [],
  cashClosures: [],
  historicoTentativas: [],
  summary: null,
  auditPage: 1,
  auditPageSize: 10,
  auditPeriod: "today",
  auditMonth: new Date().toISOString().slice(0, 7),
  pdvCart: [],
  pdvSearch: "",
  pdvSelectedIndex: -1,
  pdvTab: "sales",
  launchChecks: [],
  currentReportConfig: null,
  pdvLastScanAt: 0
};

const AUTH_TOKEN_KEY = "sistema_local_token";
const LOCAL_CACHE_KEYS = [
  AUTH_TOKEN_KEY,
  "reciclagem_pro_state",
  "reciclagemProState",
  "reciclagem_pro_cache",
  "estoque",
  "compras",
  "vendas",
  "financeiro",
  "saldo"
];

let supabaseClient = null;
let realtimeChannel = null;

function isSupabaseConfigured() {
  const config = window.SUPABASE_CONFIG || {};
  return Boolean(
    window.supabase &&
    config.url &&
    config.anonKey &&
    !String(config.url).includes("SEU-PROJETO") &&
    !String(config.anonKey).includes("SUA_CHAVE")
  );
}

function useSupabase() {
  return isSupabaseConfigured();
}

function getSupabase() {
  if (!useSupabase()) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
  }
  return supabaseClient;
}

function clearLegacyCache() {
  LOCAL_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function sameId(left, right) {
  return String(left || "") === String(right || "");
}

function requireCompanyId() {
  if (!state.companyId) {
    throw new Error("Empresa nao carregada. Entre novamente no sistema.");
  }
  return state.companyId;
}

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const viewTitles = {
  dashboard: "Dashboard",
  clients: "Clientes",
  employees: "Funcionarios",
  users: "Usuarios",
  suppliers: "Fornecedores",
  receivable: "Contas a Receber",
  payable: "Contas a Pagar",
  creditLimits: "Limite de Credito",
  costCenters: "Centro de Custo",
  cashClosing: "Fechamento de Caixa",
  inventoryCategories: "Categorias",
  inventoryProducts: "Cadastro de Produtos",
  inventoryImport: "Entrada por Planilha",
  inventoryList: "Lista de Produtos",
  pdvSales: "Vendas",
  pdvHistory: "Historico de Vendas",
  reportsClients: "Relatorio de Clientes",
  reportsDecision: "Tomada de Decisao",
  reportsReceivables: "Relatorio de Recebimentos",
  reportsExpenses: "Relatorio de Despesas",
  reportsSales: "Relatorio de Vendas",
  reportsProfit: "Demonstrativo de Lucro",
  reportsAudit: "Auditoria"
};

const groupByView = {
  clients: "people",
  employees: "people",
  users: "people",
  suppliers: "people",
  receivable: "financial",
  payable: "financial",
  creditLimits: "financial",
  costCenters: "financial",
  cashClosing: "financial",
  inventoryCategories: "inventory",
  inventoryProducts: "inventory",
  inventoryImport: "inventory",
  inventoryList: "inventory",
  pdvSales: "pdv",
  pdvHistory: "pdv",
  reportsClients: "reports",
  reportsDecision: "reports",
  reportsReceivables: "reports",
  reportsExpenses: "reports",
  reportsSales: "reports",
  reportsProfit: "reports",
  reportsAudit: "reports"
};

const personTypeByView = {
  clients: "clientes",
  employees: "funcionarios",
  users: "usuarios",
  suppliers: "fornecedores"
};

const financeTypeByView = {
  receivable: "receber",
  payable: "pagar"
};

const dom = {
  pageTitle: document.getElementById("page-title"),
  sessionCompany: document.getElementById("session-company"),
  sessionRoleLabel: document.getElementById("session-role-label"),
  sessionUserName: document.getElementById("session-user-name"),
  topbarHelper: document.getElementById("topbar-helper"),
  dashboardCards: document.getElementById("dashboard-cards"),
  alertsList: document.getElementById("alerts-list"),
  personSectionTitle: document.getElementById("person-section-title"),
  personSectionSubtitle: document.getElementById("person-section-subtitle"),
  personCreditLabel: document.getElementById("person-credit-label"),
  personStatusLabel: document.getElementById("person-status-label"),
  personSizeLabel: document.getElementById("person-size-label"),
  personNumberLabel: document.getElementById("person-number-label"),
  clientsStatusFilterPanel: document.getElementById("clients-status-filter-panel"),
  clientsStatusFilter: document.getElementById("clients-status-filter"),
  clientsDateFrom: document.getElementById("clients-date-from"),
  clientsDateTo: document.getElementById("clients-date-to"),
  clientHistoryPanel: document.getElementById("client-history-panel"),
  clientHistoryTitle: document.getElementById("client-history-title"),
  clientHistoryTable: document.getElementById("client-history-table"),
  userUsernameLabel: document.getElementById("user-username-label"),
  userPasswordLabel: document.getElementById("user-password-label"),
  userRoleLabel: document.getElementById("user-role-label"),
  userActiveLabel: document.getElementById("user-active-label"),
  peopleTable: document.getElementById("people-table"),
  clientsImportPanel: document.getElementById("clients-import-panel"),
  financeSectionTitle: document.getElementById("finance-section-title"),
  financeSectionSubtitle: document.getElementById("finance-section-subtitle"),
  financePerson: document.getElementById("finance-person"),
  financeInstallmentsBox: document.getElementById("finance-installments-box"),
  financeTable: document.getElementById("finance-table"),
  financeEntryPanel: document.getElementById("finance-entry-panel"),
  financeTablePanel: document.getElementById("finance-table-panel"),
  creditLimitPanel: document.getElementById("credit-limit-panel"),
  creditClient: document.getElementById("credit-client"),
  creditManual: document.getElementById("credit-manual"),
  creditEarned: document.getElementById("credit-earned"),
  creditTotal: document.getElementById("credit-total"),
  creditLimitsTable: document.getElementById("credit-limits-table"),
  financeCostCenterBox: document.getElementById("finance-cost-center-box"),
  financeCostCenter: document.getElementById("finance-cost-center"),
  costCenterPanel: document.getElementById("cost-center-panel"),
  costCentersTable: document.getElementById("cost-centers-table"),
  cashClosingPanel: document.getElementById("cash-closing-panel"),
  cashClosingSummary: document.getElementById("cash-closing-summary"),
  cashClosuresTable: document.getElementById("cash-closures-table"),
  inventorySectionTitle: document.getElementById("inventory-section-title"),
  inventorySectionSubtitle: document.getElementById("inventory-section-subtitle"),
  inventorySummary: document.getElementById("inventory-summary"),
  inventoryCategoriesPanel: document.getElementById("inventory-categories-panel"),
  inventoryFormPanel: document.getElementById("inventory-form-panel"),
  inventoryImportPanel: document.getElementById("inventory-import-panel"),
  inventoryListPanel: document.getElementById("inventory-list-panel"),
  categoriesTable: document.getElementById("categories-table"),
  inventoryCategory: document.getElementById("inventory-category"),
  inventorySupplier: document.getElementById("inventory-supplier"),
  inventoryTable: document.getElementById("inventory-table"),
  inventoryProductsTable: document.getElementById("inventory-products-table"),
  reportsSectionTitle: document.getElementById("reports-section-title"),
  reportsSectionSubtitle: document.getElementById("reports-section-subtitle"),
  reportsHighlights: document.getElementById("reports-highlights"),
  reportsGrid: document.getElementById("reports-grid"),
  reportsTableTitle: document.getElementById("reports-table-title"),
  reportsTable: document.getElementById("reports-table"),
  reportsChart: document.getElementById("reports-chart"),
  pdvClient: document.getElementById("pdv-client"),
  pdvProduct: document.getElementById("pdv-product"),
  pdvTable: document.getElementById("pdv-table"),
  pdvTotal: document.getElementById("pdv-total"),
  pdvRecentSales: document.getElementById("pdv-recent-sales"),
  pdvSearch: document.getElementById("pdv-search"),
  pdvStock: document.getElementById("pdv-stock"),
  pdvUnitValue: document.getElementById("pdv-unit-value"),
  pdvSeller: document.getElementById("pdv-seller"),
  pdvSaleDate: document.getElementById("pdv-sale-date"),
  toastStack: document.getElementById("toast-stack"),
  dialogBackdrop: document.getElementById("app-dialog-backdrop"),
  dialogTitle: document.getElementById("app-dialog-title"),
  dialogMessage: document.getElementById("app-dialog-message"),
  dialogActions: document.getElementById("app-dialog-actions"),
  paymentBackdrop: document.getElementById("payment-dialog-backdrop"),
  paymentTitle: document.getElementById("payment-dialog-title"),
  paymentMessage: document.getElementById("payment-dialog-message"),
  reportsDateFrom: document.getElementById("reports-date-from"),
  reportsDateTo: document.getElementById("reports-date-to"),
  reportsPeriodMode: document.getElementById("reports-period-mode"),
  auditPeriodLabel: document.getElementById("audit-period-label"),
  auditPeriodFilter: document.getElementById("audit-period-filter"),
  auditMonthLabel: document.getElementById("audit-month-label"),
  auditMonthFilter: document.getElementById("audit-month-filter"),
  auditPageSizeLabel: document.getElementById("audit-page-size-label"),
  auditPageSize: document.getElementById("audit-page-size"),
  auditPagination: document.getElementById("audit-pagination"),
  auditPrevPage: document.getElementById("audit-prev-page"),
  auditNextPage: document.getElementById("audit-next-page"),
  auditPageLabel: document.getElementById("audit-page-label"),
  reportsExportExcel: document.getElementById("reports-export-excel"),
  reportsExportCsv: document.getElementById("reports-export-csv"),
  reportsExportPdf: document.getElementById("reports-export-pdf"),
  auditCleanupDays: document.getElementById("audit-cleanup-days"),
  auditCleanupButton: document.getElementById("audit-cleanup-button"),
  systemPlan: document.getElementById("system-plan"),
  systemCompanyName: document.getElementById("system-company-name"),
  systemPlanSave: document.getElementById("system-plan-save"),
  systemPlanBadge: document.getElementById("system-plan-badge"),
  changePasswordBackdrop: document.getElementById("change-password-backdrop"),
  authOverlay: document.getElementById("auth-overlay"),
  authTitle: document.getElementById("auth-title"),
  authSubtitle: document.getElementById("auth-subtitle"),
  loginForm: document.getElementById("login-form"),
  setupForm: document.getElementById("setup-form")
};

document.querySelectorAll(".menu-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-group-toggle]").forEach((button) => {
  button.addEventListener("click", () => toggleGroup(button.dataset.groupToggle));
});

document.getElementById("person-form").addEventListener("submit", handlePersonSubmit);
document.getElementById("person-cancel").addEventListener("click", resetPersonForm);
dom.clientsStatusFilter.addEventListener("change", renderPeopleSection);
dom.clientsDateFrom.addEventListener("change", renderPeopleSection);
dom.clientsDateTo.addEventListener("change", renderPeopleSection);
dom.peopleTable.addEventListener("click", handlePeopleTableClick);
document.getElementById("client-history-form").addEventListener("submit", handleClientHistorySubmit);
document.getElementById("client-history-close").addEventListener("click", closeClientHistoryPanel);
document.getElementById("person-document").addEventListener("input", (event) => {
  event.target.value = formatDocument(event.target.value);
});
document.getElementById("person-phone").addEventListener("input", (event) => {
  event.target.value = formatPhone(event.target.value);
});
document.getElementById("finance-form").addEventListener("submit", handleFinanceSubmit);
document.getElementById("finance-cancel").addEventListener("click", resetFinanceForm);
document.getElementById("credit-limit-form").addEventListener("submit", handleCreditLimitSubmit);
document.getElementById("credit-limit-cancel").addEventListener("click", resetCreditLimitForm);
document.getElementById("credit-client").addEventListener("change", syncCreditLimitForm);
document.getElementById("cost-center-form").addEventListener("submit", handleCostCenterSubmit);
document.getElementById("cost-center-cancel").addEventListener("click", resetCostCenterForm);
document.getElementById("category-form").addEventListener("submit", handleCategorySubmit);
document.getElementById("category-cancel").addEventListener("click", resetCategoryForm);
document.getElementById("inventory-form").addEventListener("submit", handleInventorySubmit);
document.getElementById("inventory-cancel").addEventListener("click", resetInventoryForm);
document.getElementById("inventory-import").addEventListener("click", handleInventoryImport);
document.getElementById("inventory-template").addEventListener("click", () => downloadProtectedFile("/api/templates/inventory-model"));
document.getElementById("clients-template").addEventListener("click", () => downloadProtectedFile("/api/templates/clients-model"));
document.getElementById("clients-import").addEventListener("click", handleClientsImport);
document.getElementById("pdv-add-item").addEventListener("click", addPdvItem);
document.getElementById("pdv-finish").addEventListener("click", finishPdvSale);
document.getElementById("pdv-print").addEventListener("click", printPdvReceipt);
document.getElementById("pdv-search").addEventListener("input", (event) => {
  state.pdvSearch = event.target.value.trim().toLowerCase();
  renderPdv();
});
document.getElementById("pdv-search").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addPdvItemFromSearch();
});
document.getElementById("pdv-search").addEventListener("keyup", () => {
  const search = state.pdvSearch.trim();
  const now = Date.now();
  if (!search || search.length < 4) return;
  const exactCodeMatch = state.inventory.find((item) => String(item.code || "").toLowerCase() === search);
  if (!exactCodeMatch) return;
  if (now - state.pdvLastScanAt < 300) return;
  state.pdvLastScanAt = now;
  document.getElementById("pdv-product").value = String(exactCodeMatch.id);
  dom.pdvStock.value = `${exactCodeMatch.quantity} un`;
  dom.pdvUnitValue.value = currency.format(Number(exactCodeMatch.sale_price || 0));
});
document.getElementById("pdv-discount").addEventListener("input", () => {
  renderPdv();
});
document.getElementById("pdv-remove-selected").addEventListener("click", removeSelectedPdvItem);
document.getElementById("pdv-product").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addPdvItem();
});
document.getElementById("pdv-quantity").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addPdvItem();
});
document.getElementById("pdv-method").addEventListener("change", () => {
  syncPdvCreditSale(true);
});
document.getElementById("pdv-new-sale").addEventListener("click", resetPdvSale);
document.querySelectorAll("[data-pdv-tab]").forEach((button) => {
  button.addEventListener("click", () => switchPdvTab(button.dataset.pdvTab));
});
document.addEventListener("keydown", handlePdvShortcuts);
document.getElementById("payment-cancel").addEventListener("click", closePaymentDialog);
document.getElementById("payment-form").addEventListener("submit", submitFinancePayment);
document.getElementById("system-backup").addEventListener("click", handleSystemBackup);
document.getElementById("system-restore").addEventListener("click", () => document.getElementById("system-restore-file").click());
document.getElementById("system-restore-file").addEventListener("change", handleSystemRestore);
document.getElementById("system-reset").addEventListener("click", handleSystemReset);
dom.systemPlanSave.addEventListener("click", handleSystemPlanSave);
document.getElementById("change-password-button").addEventListener("click", openChangePasswordDialog);
document.getElementById("change-password-cancel").addEventListener("click", closeChangePasswordDialog);
document.getElementById("change-password-form").addEventListener("submit", handleChangePasswordSubmit);
document.getElementById("cash-preview-button").addEventListener("click", refreshCashClosingSummary);
document.getElementById("cash-closing-form").addEventListener("submit", handleCashClosingSubmit);
document.getElementById("logout-button").addEventListener("click", handleLogout);
dom.loginForm.addEventListener("submit", handleLoginSubmit);
dom.setupForm.addEventListener("submit", handleSetupSubmit);
dom.reportsExportExcel.addEventListener("click", handleReportExportExcel);
dom.reportsExportCsv.addEventListener("click", handleReportExportCsv);
dom.reportsExportPdf.addEventListener("click", handleReportExportPdf);
dom.auditCleanupButton.addEventListener("click", handleAuditCleanup);
document.getElementById("reports-date-from").addEventListener("change", renderReportsSection);
document.getElementById("reports-date-to").addEventListener("change", renderReportsSection);
dom.reportsPeriodMode.addEventListener("change", renderReportsSection);
dom.auditPeriodFilter.addEventListener("change", () => {
  state.auditPeriod = dom.auditPeriodFilter.value || "today";
  state.auditPage = 1;
  renderReportsSection();
});
dom.auditMonthFilter.addEventListener("change", () => {
  state.auditMonth = dom.auditMonthFilter.value || new Date().toISOString().slice(0, 7);
  state.auditPage = 1;
  renderReportsSection();
});
dom.auditPageSize.addEventListener("change", () => {
  state.auditPageSize = Number(dom.auditPageSize.value || 10);
  state.auditPage = 1;
  renderReportsSection();
});
dom.auditPrevPage.addEventListener("click", () => {
  state.auditPage = Math.max(1, state.auditPage - 1);
  renderReportsSection();
});
dom.auditNextPage.addEventListener("click", () => {
  state.auditPage += 1;
  renderReportsSection();
});
document.getElementById("reports-date-from").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  renderReportsSection();
});
document.getElementById("reports-date-to").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  renderReportsSection();
});

async function supabaseRequest(path, options = {}) {
  const body = parseRequestBody(options.body);
  const method = String(options.method || "GET").toUpperCase();
  const route = path.split("?")[0];
  const params = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "");

  if (route === "/api/bootstrap") return loadSupabaseBootstrap();
  if (route === "/api/auth/logout") return supabaseLogout();
  if (route === "/api/system/settings" && method === "PUT") return updateSupabaseSettings(body);
  if (route === "/api/system/reset" && method === "POST") return resetSupabaseCompany();
  if (route === "/api/auth/change-password" && method === "POST") return changeSupabasePassword(body);
  if (route === "/api/cash-closures/summary") return buildCashClosingSummaryFromState(params);
  if (route === "/api/cash-closures" && method === "POST") return createSupabaseCashClosure(body);
  if (route === "/api/pdv/sale" && method === "POST") return createSupabaseSale(body);
  if (route === "/api/finance" && method === "POST") return createSupabaseFinance(body);
  const historyMatch = route.match(/^\/api\/people\/([^/]+)\/historico-tentativas$/);
  if (historyMatch && method === "POST") return createSupabaseClientHistory(historyMatch[1], body);

  const dynamic = route.match(/^\/api\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (!dynamic) {
    throw new Error("Esta funcao ainda precisa ser migrada para Supabase.");
  }

  const [, resource, id, action] = dynamic;
  if (resource === "people" && action === "credit" && method === "PUT") return updateSupabasePeopleCredit(id, body);
  if (resource === "finance" && action === "payment" && method === "POST") return paySupabaseFinance(id, body);
  if (resource === "sales" && method === "DELETE") return deleteSupabaseSale(id);

  const tableMap = {
    people: "people",
    finance: "finance",
    "cost-centers": "cost_centers",
    categories: "inventory_categories",
    inventory: "inventory"
  };
  const table = tableMap[resource];
  if (!table) throw new Error("Esta funcao ainda precisa ser migrada para Supabase.");
  if (method === "POST") return insertSupabaseRow(table, body);
  if (method === "PUT") return updateSupabaseRow(table, id, body);
  if (method === "DELETE") return deleteSupabaseRow(table, id);
  throw new Error("Operacao nao suportada no Supabase.");
}

function parseRequestBody(body) {
  if (!body) return {};
  if (body instanceof FormData) {
    throw new Error("Importacao por planilha sera migrada depois da publicacao inicial no Supabase.");
  }
  if (typeof body === "string") return JSON.parse(body || "{}");
  return body;
}

async function getCurrentSupabaseUser() {
  const client = getSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  return data.user;
}

async function loadSupabaseSessionContext() {
  const client = getSupabase();
  const user = await getCurrentSupabaseUser();
  if (!user) return null;
  const { data: memberships, error } = await client
    .from("company_members")
    .select("id, company_id, name, role, active, companies(id, name, plan)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1);
  if (error) throw error;
  const member = memberships?.[0];
  if (!member) return { user, member: null };
  state.companyId = member.company_id;
  state.member = member;
  state.sessionUser = {
    id: user.id,
    name: member.name || user.email,
    username: user.email,
    role: member.role || "administrador",
    active: member.active !== false
  };
  state.settings = {
    plan: member.companies?.plan || "completo",
    companyName: member.companies?.name || "Sistema Exclusividade"
  };
  return { user, member };
}

async function loadSupabaseBootstrap() {
  const client = getSupabase();
  const context = await loadSupabaseSessionContext();
  if (!context?.member) {
    throw new Error("Este usuario ainda nao esta vinculado a uma empresa.");
  }
  const companyId = requireCompanyId();
  const [
    peopleResult,
    categoriesResult,
    costCentersResult,
    financeResult,
    inventoryResult,
    salesResult,
    saleItemsResult,
    cashClosuresResult,
    historyResult,
    auditResult
  ] = await Promise.all([
    client.from("people").select("*").eq("company_id", companyId).order("name"),
    client.from("inventory_categories").select("*").eq("company_id", companyId).order("name"),
    client.from("cost_centers").select("*").eq("company_id", companyId).order("name"),
    client.from("finance").select("*").eq("company_id", companyId).order("due_date"),
    client.from("inventory").select("*").eq("company_id", companyId).order("name"),
    client.from("sales").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    client.from("sale_items").select("*").eq("company_id", companyId),
    client.from("cash_closures").select("*").eq("company_id", companyId).order("closure_date", { ascending: false }),
    client.from("historico_tentativas").select("*").eq("company_id", companyId).order("data", { ascending: false }),
    client.from("audit_logs").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(1000)
  ]);
  [peopleResult, categoriesResult, costCentersResult, financeResult, inventoryResult, salesResult, saleItemsResult, cashClosuresResult, historyResult, auditResult].forEach(throwSupabaseError);

  const people = peopleResult.data || [];
  const categories = categoriesResult.data || [];
  const costCenters = costCentersResult.data || [];
  const inventory = decorateSupabaseInventory(inventoryResult.data || [], categories, people);
  const saleItems = saleItemsResult.data || [];
  const sales = decorateSupabaseSales(salesResult.data || [], people, saleItems, inventory);
  const finance = decorateFinance(decorateSupabaseFinance(financeResult.data || [], people, costCenters));
  const cashClosures = (cashClosuresResult.data || []).map((item) => ({
    ...item,
    created_by_name: state.sessionUser?.name || "Sistema"
  }));

  ensureSupabaseRealtime();
  return {
    people,
    categories: state.settings.plan === "financeiro" ? [] : categories,
    costCenters,
    finance,
    inventory: state.settings.plan === "financeiro" ? [] : inventory,
    recentSales: state.settings.plan === "financeiro" ? [] : sales.slice(0, 10),
    sales: state.settings.plan === "financeiro" ? [] : sales,
    saleItems: state.settings.plan === "financeiro" ? [] : saleItems,
    auditLogs: auditResult.data || [],
    cashClosures,
    historicoTentativas: historyResult.data || [],
    summary: buildSummaryFromRows({ people, finance, inventory, sales }),
    settings: state.settings
  };
}

function throwSupabaseError(result) {
  if (result.error) throw result.error;
}

function decorateSupabaseInventory(rows, categories, people) {
  return rows.map((item) => {
    const category = categories.find((categoryItem) => sameId(categoryItem.id, item.category_id));
    const supplier = people.find((person) => sameId(person.id, item.supplier_id));
    return {
      ...item,
      category_name: category?.name || item.category || "",
      supplier_name: supplier?.name || ""
    };
  });
}

function decorateSupabaseFinance(rows, people, costCenters) {
  return rows.map((item) => {
    const person = people.find((personItem) => sameId(personItem.id, item.person_id));
    const center = costCenters.find((centerItem) => sameId(centerItem.id, item.cost_center_id));
    return {
      ...item,
      person_name: person?.name || "",
      cost_center_name: center?.name || ""
    };
  });
}

function decorateSupabaseSales(rows, people, saleItems, inventory) {
  return rows.map((sale) => {
    const client = people.find((person) => sameId(person.id, sale.client_id));
    const items = saleItems.filter((item) => sameId(item.sale_id, sale.id));
    const grossProfit = items.reduce((sum, item) => {
      const product = inventory.find((stockItem) => sameId(stockItem.id, item.inventory_id));
      const cost = Number(item.cost_price || product?.cost || 0);
      return sum + (Number(item.unit_price || 0) - cost) * Number(item.quantity || 0);
    }, 0);
    return {
      ...sale,
      client_name: client?.name || "",
      gross_profit: grossProfit
    };
  });
}

function buildSummaryFromRows({ people, finance, inventory, sales }) {
  const peopleByType = people.reduce((acc, person) => {
    acc[person.type] = (acc[person.type] || 0) + 1;
    return acc;
  }, {});
  const clientPeople = people.filter((person) => person.type === "clientes");
  const manualCredit = clientPeople.reduce((sum, person) => sum + Number(person.manual_credit || 0), 0);
  const earnedCredit = clientPeople.reduce((sum, person) => sum + Number(person.earned_credit || 0), 0);
  const creditLimit = clientPeople.reduce((sum, person) => sum + Number(person.credit || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const toReceive = finance.filter((item) => item.type === "receber" && item.status === "aberto").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const toPay = finance.filter((item) => item.type === "pagar" && item.status === "aberto").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const received = finance.filter((item) => item.type === "receber" && item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = finance.filter((item) => item.type === "pagar" && item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const grossValue = inventory.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.sale_price || 0), 0);
  const netValue = inventory.reduce((sum, item) => sum + Number(item.quantity || 0) * (Number(item.sale_price || 0) - Number(item.cost || 0)), 0);
  const lowStock = inventory.filter((item) => Number(item.quantity || 0) <= Number(item.minimum || 0)).length;
  const salesTotal = sales.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const salesProfit = sales.reduce((sum, item) => sum + Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)), 0);
  return {
    people: {
      total: people.length,
      clients: Number(peopleByType.clientes || 0),
      employees: Number(peopleByType.funcionarios || 0),
      users: Number(peopleByType.usuarios || 0),
      suppliers: Number(peopleByType.fornecedores || 0),
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
      overdueReceivables: finance.filter((item) => item.type === "receber" && item.status === "aberto" && item.due_date < today).length,
      overduePayables: finance.filter((item) => item.type === "pagar" && item.status === "aberto" && item.due_date < today).length,
      balance: toReceive - toPay,
      operationalResult: received - paid
    },
    inventory: { totalItems: inventory.length, grossValue, netValue, lowStock },
    pdv: {
      totalSales: sales.length,
      salesTotal,
      paidSales: sales.filter((item) => item.payment_status === "pago").length,
      salesProfit
    }
  };
}

function ensureSupabaseRealtime() {
  const client = getSupabase();
  if (!client || realtimeChannel || !state.companyId) return;
  const tables = ["people", "inventory_categories", "cost_centers", "inventory", "finance", "sales", "sale_items", "cash_closures", "historico_tentativas", "audit_logs"];
  realtimeChannel = client.channel(`company-${state.companyId}`);
  tables.forEach((table) => {
    realtimeChannel.on("postgres_changes", { event: "*", schema: "public", table, filter: `company_id=eq.${state.companyId}` }, async () => {
      if (!state.sessionUser) return;
      await loadData();
    });
  });
  realtimeChannel.subscribe();
}

async function insertSupabaseRow(table, payload) {
  const client = getSupabase();
  const cleanPayload = normalizePayloadForTable(table, payload);
  const { data, error } = await client.from(table).insert({ ...cleanPayload, company_id: requireCompanyId() }).select("id").single();
  if (error) throw error;
  return { id: data.id };
}

async function updateSupabaseRow(table, id, payload) {
  const client = getSupabase();
  const cleanPayload = normalizePayloadForTable(table, payload);
  const { error } = await client.from(table).update(cleanPayload).eq("id", id).eq("company_id", requireCompanyId());
  if (error) throw error;
  return { ok: true };
}

async function deleteSupabaseRow(table, id) {
  const client = getSupabase();
  const { error } = await client.from(table).delete().eq("id", id).eq("company_id", requireCompanyId());
  if (error) throw error;
  return { ok: true };
}

async function deleteSupabaseSale(id) {
  const client = getSupabase();
  const saleItems = await client.from("sale_items").select("*").eq("sale_id", id).eq("company_id", requireCompanyId());
  throwSupabaseError(saleItems);
  for (const item of saleItems.data || []) {
    const product = state.inventory.find((stockItem) => sameId(stockItem.id, item.inventory_id));
    if (!product) continue;
    const { error } = await client
      .from("inventory")
      .update({ quantity: Number(product.quantity || 0) + Number(item.quantity || 0) })
      .eq("id", item.inventory_id)
      .eq("company_id", requireCompanyId());
    if (error) throw error;
  }
  await client.from("finance").delete().eq("company_id", requireCompanyId()).ilike("description", `%Venda PDV #${String(id).slice(0, 8)}%`);
  const deleteItems = await client.from("sale_items").delete().eq("sale_id", id).eq("company_id", requireCompanyId());
  throwSupabaseError(deleteItems);
  const deleteSale = await client.from("sales").delete().eq("id", id).eq("company_id", requireCompanyId());
  throwSupabaseError(deleteSale);
  return { ok: true };
}

function normalizePayloadForTable(table, payload) {
  const data = { ...payload };
  if (table === "people") {
    delete data.password;
    data.active = Number(data.active ?? 1) !== 0;
    if (data.type === "clientes") {
      data.status = data.status === "Cliente" ? "Cliente" : "Lead";
      data.data_conversao = data.status === "Cliente" ? data.data_conversao || new Date().toISOString() : null;
      data.preferred_size = String(data.preferred_size || "").trim().toUpperCase();
      data.preferred_number = String(data.preferred_number || "").trim();
    } else {
      data.status = null;
      data.data_conversao = null;
      data.preferred_size = "";
      data.preferred_number = "";
    }
  }
  if (table === "inventory") {
    data.category_id = data.category_id || null;
    data.supplier_id = data.supplier_id || null;
  }
  if (table === "finance") {
    data.person_id = data.person_id || null;
    data.cost_center_id = data.cost_center_id || null;
  }
  return data;
}

async function createSupabaseFinance(payload) {
  const client = getSupabase();
  const installments = Math.max(1, Number(payload.installments || 1));
  const amount = Number(payload.amount || 0);
  const groupCode = `GRP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const rows = Array.from({ length: installments }, (_, index) => ({
    company_id: requireCompanyId(),
    type: payload.type,
    person_id: payload.person_id || null,
    cost_center_id: payload.cost_center_id || null,
    description: installments > 1 ? `${payload.description} - Parcela ${index + 1}/${installments}` : payload.description,
    amount: Number((amount / installments).toFixed(2)),
    due_date: installments === 1 ? payload.due_date : addMonthsToDate(payload.due_date, index),
    status: payload.status || "aberto",
    installment_number: index + 1,
    installment_total: installments,
    group_code: groupCode
  }));
  const { error } = await client.from("finance").insert(rows);
  if (error) throw error;
  return { ok: true };
}

async function updateSupabasePeopleCredit(id, payload) {
  return updateSupabaseRow("people", id, { manual_credit: Number(payload.manual_credit || 0) });
}

async function convertSupabaseLeadToClient(clientId) {
  if (!clientId) return;
  const person = state.people.find((item) => sameId(item.id, clientId));
  if (!person || person.status === "Cliente") return;
  const client = getSupabase();
  const { error } = await client
    .from("people")
    .update({ status: "Cliente", data_conversao: person.data_conversao || new Date().toISOString() })
    .eq("id", clientId)
    .eq("company_id", requireCompanyId());
  if (error) throw error;
}

async function createSupabaseClientHistory(clientId, payload) {
  const result = await insertSupabaseRow("historico_tentativas", {
    cliente_id: clientId,
    data: payload.data || new Date().toISOString(),
    observacao: payload.observacao || "",
    resultado: payload.resultado || "Contato realizado"
  });
  if (payload.resultado === "Convertido") {
    await convertSupabaseLeadToClient(clientId);
  }
  return result;
}

async function paySupabaseFinance(id, payload) {
  const client = getSupabase();
  const entry = state.finance.find((item) => sameId(item.id, id));
  if (!entry) throw new Error("Lancamento nao encontrado.");
  const paymentAmount = Number(payload.amount || 0);
  const remaining = Number((Number(entry.amount || 0) - paymentAmount).toFixed(2));
  if (remaining <= 0) {
    const { error } = await client.from("finance").update({ status: "pago", amount: Number(entry.amount || 0) }).eq("id", id).eq("company_id", requireCompanyId());
    if (error) throw error;
    if (entry.person_id) await convertSupabaseLeadToClient(entry.person_id);
    return { ok: true, mode: "full" };
  }
  const { error } = await client.from("finance").update({ amount: remaining }).eq("id", id).eq("company_id", requireCompanyId());
  if (error) throw error;
  return { ok: true, mode: "partial" };
}

async function createSupabaseSale(payload) {
  const client = getSupabase();
  const items = payload.items || [];
  const allowedMethods = new Set(["dinheiro", "pix", "cartao", "crediario"]);
  if (!allowedMethods.has(payload.payment_method)) throw new Error("Forma de pagamento invalida.");
  for (const item of items) {
    const product = state.inventory.find((stockItem) => sameId(stockItem.id, item.inventory_id));
    if (!product) throw new Error("Produto nao encontrado no estoque.");
    if (Number(product.quantity || 0) < Number(item.quantity || 0)) throw new Error(`Estoque insuficiente para ${product.name}.`);
  }
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const discount = Math.max(0, Number(payload.discount_value || 0));
  if (discount > subtotal) throw new Error("O desconto nao pode ser maior que o subtotal da venda.");
  const total = Math.max(0, Number((subtotal - discount).toFixed(2)));
  if (total <= 0) throw new Error("O total da venda precisa ser maior que zero.");
  const paymentStatus = payload.payment_method === "crediario" ? "aberto" : payload.payment_status || "pago";
  const dueDate = payload.due_date || new Date().toISOString().slice(0, 10);
  const saleDate = payload.sale_date || new Date().toISOString().slice(0, 10);
  const { data: sale, error: saleError } = await client.from("sales").insert({
    company_id: requireCompanyId(),
    client_id: payload.client_id || null,
    total,
    payment_status: paymentStatus,
    payment_method: payload.payment_method,
    discount_value: discount,
    created_at: `${saleDate}T${new Date().toTimeString().slice(0, 8)}`
  }).select("id").single();
  if (saleError) throw saleError;
  const saleItems = items.map((item) => {
    const product = state.inventory.find((stockItem) => sameId(stockItem.id, item.inventory_id));
    return {
      company_id: requireCompanyId(),
      sale_id: sale.id,
      inventory_id: item.inventory_id,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      total: Number(item.quantity || 0) * Number(item.unit_price || 0),
      cost_price: Number(product?.cost || 0)
    };
  });
  const { error: itemError } = await client.from("sale_items").insert(saleItems);
  if (itemError) throw itemError;
  for (const item of items) {
    const product = state.inventory.find((stockItem) => sameId(stockItem.id, item.inventory_id));
    const { error } = await client.from("inventory").update({ quantity: Number(product.quantity || 0) - Number(item.quantity || 0) }).eq("id", item.inventory_id).eq("company_id", requireCompanyId());
    if (error) throw error;
  }
  await createSupabaseFinance({
    type: "receber",
    description: `Venda PDV #${String(sale.id).slice(0, 8)}${discount > 0 ? ` com desconto ${discount.toFixed(2)}` : ""}`,
    person_id: payload.client_id || null,
    amount: total,
    due_date: dueDate,
    status: paymentStatus,
    installments: Number(payload.installments || 1)
  });
  if (payload.client_id && paymentStatus === "pago") {
    await convertSupabaseLeadToClient(payload.client_id);
  }
  return { id: sale.id };
}

function buildCashClosingSummaryFromState(params) {
  const date = params.get("date") || new Date().toISOString().slice(0, 10);
  const openingBalance = Number(params.get("opening_balance") || 0);
  const totalSales = state.sales.filter((sale) => String(sale.created_at || "").slice(0, 10) === date).reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalReceived = state.finance.filter((item) => item.type === "receber" && item.status === "pago" && item.due_date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalPaid = state.finance.filter((item) => item.type === "pagar" && item.status === "pago" && item.due_date === date).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return { totalSales, totalReceived, totalPaid, closingBalance: openingBalance + totalReceived - totalPaid };
}

async function createSupabaseCashClosure(payload) {
  const client = getSupabase();
  const summary = buildCashClosingSummaryFromState(new URLSearchParams({ date: payload.closure_date, opening_balance: String(payload.opening_balance || 0) }));
  const { error } = await client.from("cash_closures").upsert({
    company_id: requireCompanyId(),
    closure_date: payload.closure_date,
    opening_balance: Number(payload.opening_balance || 0),
    total_sales: summary.totalSales,
    total_received: summary.totalReceived,
    total_paid: summary.totalPaid,
    closing_balance: summary.closingBalance,
    notes: payload.notes || ""
  }, { onConflict: "company_id,closure_date" });
  if (error) throw error;
  return { ok: true };
}

async function updateSupabaseSettings(payload) {
  const client = getSupabase();
  const name = String(payload.company_name || "Sistema Exclusividade").trim() || "Sistema Exclusividade";
  const plan = ["financeiro", "completo"].includes(payload.plan) ? payload.plan : "completo";
  const { error } = await client.from("companies").update({ name, plan }).eq("id", requireCompanyId());
  if (error) throw error;
  state.settings = { companyName: name, plan };
  return { ok: true, settings: state.settings };
}

async function resetSupabaseCompany() {
  const client = getSupabase();
  const companyId = requireCompanyId();
  for (const table of ["sale_items", "sales", "finance", "inventory", "inventory_categories", "cost_centers", "cash_closures", "historico_tentativas", "audit_logs", "people"]) {
    const { error } = await client.from(table).delete().eq("company_id", companyId);
    if (error) throw error;
  }
  return { ok: true };
}

async function changeSupabasePassword(payload) {
  const client = getSupabase();
  const { error } = await client.auth.updateUser({ password: payload.newPassword });
  if (error) throw error;
  return { ok: true };
}

async function supabaseLogout() {
  const client = getSupabase();
  if (realtimeChannel) {
    await client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  const { error } = await client.auth.signOut();
  if (error) throw error;
  return { ok: true };
}

async function api(path, options = {}) {
  if (useSupabase()) {
    return supabaseRequest(path, options);
  }
  const isFormData = options.body instanceof FormData;
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(isFormData ? options.headers || {} : { "Content-Type": "application/json", ...(options.headers || {}) });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Falha ao processar a requisicao." }));
    if (response.status === 401) {
      clearSession();
      await bootAuth();
    }
    throw new Error(payload.error || "Falha ao processar a requisicao.");
  }

  return response.json();
}

function clearSession() {
  if (useSupabase()) {
    clearLegacyCache();
    state.companyId = null;
    state.member = null;
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  state.sessionUser = null;
  renderSession();
}

function storeSession(token, user) {
  if (useSupabase()) {
    clearLegacyCache();
  } else {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
  state.sessionUser = user;
  renderSession();
}

function authTokenQuery() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

async function downloadProtectedFile(path) {
  if (useSupabase()) {
    showMessage("Funcao em migracao", "No modo Supabase, os modelos e backups serao exportados pelo navegador em uma proxima etapa.", "warning");
    return;
  }
  window.location.href = `${path}${authTokenQuery()}`;
}

function renderSession() {
  const role = state.sessionUser?.role || "visitante";
  const plan = state.settings?.plan || "completo";
  const companyName = state.settings?.companyName || "Sistema Exclusividade";
  dom.sessionUserName.textContent = state.sessionUser ? `${state.sessionUser.name} (${state.sessionUser.username})` : "Sem sessao";
  dom.sessionRoleLabel.textContent = `Nivel: ${capitalize(role)}`;
  dom.sessionCompany.textContent = `${companyName} • ${planLabel(plan)}`;
  dom.topbarHelper.textContent = plan === "financeiro"
    ? "Controle local com foco em pessoas, financeiro e relatorios."
    : "Controle local com financeiro, estoque, PDV e relatorios integrados.";
  dom.systemPlan.value = plan;
  dom.systemCompanyName.value = companyName;
  dom.systemPlanBadge.textContent = planLabel(plan);
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function showAuthOverlay(mode) {
  dom.authOverlay.classList.remove("hidden-panel");
  dom.loginForm.classList.toggle("hidden-panel", mode !== "login");
  dom.setupForm.classList.toggle("hidden-panel", mode !== "setup");
  dom.authTitle.textContent = mode === "setup" ? "Configurar acesso inicial" : "Entrar no sistema";
  dom.authSubtitle.textContent = mode === "setup"
    ? "Crie o primeiro administrador para liberar o uso do sistema."
    : "Use um usuario ou email cadastrado para acessar o Sistema Exclusividade.";
}

function hideAuthOverlay() {
  dom.authOverlay.classList.add("hidden-panel");
}

async function bootAuth() {
  if (useSupabase()) {
    clearLegacyCache();
    const client = getSupabase();
    const { data } = await client.auth.getSession();
    if (!data.session) {
      state.settings = { plan: "completo", companyName: "Sistema Exclusividade" };
      clearSession();
      showAuthOverlay("login");
      applyPermissions();
      document.body.classList.add("app-ready");
      return false;
    }
    const context = await loadSupabaseSessionContext();
    if (!context?.member) {
      showAuthOverlay("setup");
      applyPermissions();
      document.body.classList.add("app-ready");
      return false;
    }
    renderSession();
    hideAuthOverlay();
    applyPermissions();
    return true;
  }
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch("/api/auth/bootstrap", { headers });
  const payload = await response.json();
  state.settings = payload.settings || { plan: "completo" };
  if (payload.user) {
    state.sessionUser = payload.user;
    renderSession();
    hideAuthOverlay();
    applyPermissions();
    return true;
  }
  clearSession();
  showAuthOverlay(payload.needsSetup ? "setup" : "login");
  applyPermissions();
  document.body.classList.add("app-ready");
  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function actionId(id) {
  return JSON.stringify(String(id || ""));
}

function showToast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast-item ${type}`;
  item.textContent = message;
  dom.toastStack.appendChild(item);
  requestAnimationFrame(() => item.classList.add("visible"));
  setTimeout(() => {
    item.classList.remove("visible");
    setTimeout(() => item.remove(), 220);
  }, 2800);
}

function showDialog({ title, message, actions }) {
  dom.dialogTitle.textContent = title;
  dom.dialogMessage.textContent = message;
  dom.dialogActions.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.variant === "primary" ? "primary" : "ghost";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      dom.dialogBackdrop.classList.add("hidden-panel");
      if (action.onClick) action.onClick();
    });
    dom.dialogActions.appendChild(button);
  });
  dom.dialogBackdrop.classList.remove("hidden-panel");
}

function showMessage(title, message, type = "info") {
  showToast(message, type);
  showDialog({
    title,
    message,
    actions: [{ label: "Fechar", variant: "primary" }]
  });
}

function confirmDialog(title, message) {
  return new Promise((resolve) => {
    showDialog({
      title,
      message,
      actions: [
        { label: "Cancelar", variant: "ghost", onClick: () => resolve(false) },
        { label: "Confirmar", variant: "primary", onClick: () => resolve(true) }
      ]
    });
  });
}

function formatDocument(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
      .slice(0, 14);
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/g, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/g, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

async function loadData() {
  const payload = await api("/api/bootstrap");
  state.settings = payload.settings || { plan: "completo" };
  state.people = payload.people;
  state.categories = payload.categories;
  state.costCenters = payload.costCenters;
  state.finance = payload.finance;
  state.inventory = payload.inventory;
  state.sales = payload.sales;
  state.saleItems = payload.saleItems || [];
  state.recentSales = payload.recentSales;
  state.auditLogs = payload.auditLogs || [];
  state.cashClosures = payload.cashClosures || [];
  state.historicoTentativas = payload.historicoTentativas || [];
  state.summary = payload.summary;
  state.launchChecks = buildLaunchChecks();
  renderSession();
  applyPermissions();
  renderAll();
}

function buildLaunchChecks() {
  const users = state.people.filter((item) => item.type === "usuarios" && Number(item.active) !== 0);
  const clients = state.people.filter((item) => item.type === "clientes");
  const products = state.inventory.length;
  const centers = state.costCenters.length;
  const categories = state.categories.length;
  return [
    { label: "Acesso do sistema", value: users.length ? `${users.length} usuario(s) ativo(s)` : "Criar usuario", ok: users.length > 0, detail: "Defina quem vai entrar no sistema e com qual perfil." },
    { label: "Base de clientes", value: clients.length ? `${clients.length} cliente(s)` : "Importar clientes", ok: clients.length > 0, detail: "Vale revisar a base comercial antes de iniciar as vendas." },
    { label: "Cadastro de produtos", value: products ? `${products} item(ns)` : "Cadastrar estoque", ok: products > 0, detail: "Produtos, custos e preco de venda precisam estar revisados." },
    { label: "Categorias e centros", value: `${categories} categoria(s) / ${centers} centro(s)`, ok: categories > 0 && centers > 0, detail: "Ajuda a organizar estoque e despesas logo no comeco." },
    { label: "Financeiro e backup", value: "Fazer teste de baixa e backup", ok: state.finance.length > 0, detail: "Antes de lancar, teste ao menos um recebimento, uma despesa e um backup." }
  ];
}

function renderAll() {
  renderDashboard();
  renderPeopleSection();
  renderFinanceSection();
  renderInventorySection();
  renderReportsSection();
  renderPdv();
}

function switchView(view) {
  const allowedViews = allowedViewsForRole(state.sessionUser?.role || "");
  if (view !== "dashboard" && !allowedViews.has(view)) {
    showToast("Essa area nao esta liberada no plano ou no perfil atual.", "warning");
    view = "dashboard";
  }
  state.currentView = view;
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });

  syncOpenGroups(view);
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));

  if (["clients", "employees", "users", "suppliers"].includes(view)) {
    document.getElementById("people-view").classList.add("active");
  } else if (["receivable", "payable", "creditLimits", "costCenters", "cashClosing"].includes(view)) {
    document.getElementById("financial-view").classList.add("active");
  } else if (["inventoryCategories", "inventoryProducts", "inventoryImport", "inventoryList"].includes(view)) {
    document.getElementById("inventory-view").classList.add("active");
  } else if (["pdvSales", "pdvHistory"].includes(view)) {
    document.getElementById("pdv-view").classList.add("active");
  } else if (["reportsClients", "reportsDecision", "reportsReceivables", "reportsExpenses", "reportsSales", "reportsProfit", "reportsAudit"].includes(view)) {
    document.getElementById("reports-view").classList.add("active");
  } else {
    document.getElementById("dashboard-view").classList.add("active");
  }

  dom.pageTitle.textContent = viewTitles[view];
  document.body.classList.toggle("pdv-active", ["pdvSales", "pdvHistory"].includes(view));
  renderPeopleSection();
  renderFinanceSection();
  renderInventorySection();
  renderReportsSection();
  renderPdv();
  if (["pdvSales", "pdvHistory"].includes(view)) {
    switchPdvTab(view === "pdvHistory" ? "history" : "sales");
    setTimeout(focusPdvSearch, 0);
  }
}

function switchPdvTab(tab) {
  state.pdvTab = tab;
  document.getElementById("pdv-sales-panel").classList.toggle("active", tab === "sales");
  document.getElementById("pdv-history-panel").classList.toggle("active", tab === "history");
}

function toggleGroup(groupName) {
  const target = document.querySelector(`[data-group="${groupName}"]`);
  if (!target) return;
  const shouldOpen = !target.classList.contains("open");
  document.querySelectorAll(".menu-group.collapsible").forEach((group) => {
    group.classList.remove("open");
  });
  if (shouldOpen) target.classList.add("open");
}

function syncOpenGroups(view) {
  document.querySelectorAll(".menu-group.collapsible").forEach((group) => {
    group.classList.remove("open");
  });
  const groupName = groupByView[view];
  if (!groupName) return;
  const target = document.querySelector(`[data-group="${groupName}"]`);
  if (target) target.classList.add("open");
}

function allowedViewsForRole(role) {
  const map = {
    administrador: Object.keys(viewTitles).concat("dashboard"),
    financeiro: ["dashboard", "receivable", "payable", "creditLimits", "costCenters", "cashClosing", "reportsClients", "reportsDecision", "reportsReceivables", "reportsExpenses", "reportsSales", "reportsProfit", "reportsAudit"],
    estoque: ["dashboard", "inventoryCategories", "inventoryProducts", "inventoryImport", "inventoryList", "reportsProfit"],
    vendas: ["dashboard", "clients", "pdvSales", "pdvHistory", "reportsClients", "reportsDecision", "reportsSales"]
  };
  const roleViews = new Set(map[role || ""] || ["dashboard"]);
  const planViews = allowedViewsForPlan(state.settings?.plan || "completo");
  return new Set([...roleViews].filter((view) => planViews.has(view)));
}

function allowedViewsForPlan(plan) {
  if (plan === "financeiro") {
    return new Set([
      "dashboard",
      "clients",
      "employees",
      "users",
      "suppliers",
      "receivable",
      "payable",
      "creditLimits",
      "costCenters",
      "cashClosing",
      "reportsClients",
      "reportsDecision",
      "reportsReceivables",
      "reportsExpenses",
      "reportsAudit"
    ]);
  }
  return new Set(Object.keys(viewTitles).concat("dashboard"));
}

function planLabel(plan) {
  return plan === "financeiro" ? "Plano Financeiro" : "Plano Completo";
}

function applyPermissions() {
  const allowedViews = allowedViewsForRole(state.sessionUser?.role || "");
  document.querySelectorAll(".menu-item[data-view]").forEach((item) => {
    const isAllowed = allowedViews.has(item.dataset.view);
    item.classList.toggle("restricted", !isAllowed);
    item.classList.toggle("hidden-panel", !isAllowed);
  });
  document.querySelectorAll(".menu-group.collapsible").forEach((group) => {
    const children = [...group.querySelectorAll(".menu-item[data-view]")];
    const hasAnyAllowed = children.some((item) => allowedViews.has(item.dataset.view));
    group.querySelector(".menu-toggle")?.classList.toggle("restricted", !hasAnyAllowed);
    group.classList.toggle("hidden-panel", !hasAnyAllowed);
  });
  document.getElementById("logout-button").classList.toggle("hidden-panel", !state.sessionUser);
  document.getElementById("change-password-button").classList.toggle("hidden-panel", !state.sessionUser);
  document.getElementById("system-backup").classList.toggle("hidden-panel", !canUseSystemTools());
  document.getElementById("system-restore").classList.toggle("hidden-panel", !canUseSystemTools());
  document.getElementById("system-reset").classList.toggle("hidden-panel", !canUseSystemTools());
  dom.systemPlan.classList.toggle("hidden-panel", !canManagePlan());
  dom.systemCompanyName.classList.toggle("hidden-panel", !canManagePlan());
  dom.systemPlanSave.classList.toggle("hidden-panel", !canManagePlan());
  dom.systemPlanBadge.classList.toggle("hidden-panel", !state.sessionUser);
  if (state.sessionUser && !allowedViews.has(state.currentView) && state.currentView !== "dashboard") {
    switchView("dashboard");
  }
}

function canUseSystemTools() {
  return state.sessionUser?.role === "administrador";
}

function canManagePlan() {
  return state.sessionUser?.role === "administrador";
}

function renderDashboard() {
  if (!state.summary) return;
  const cards = state.settings?.plan === "financeiro"
    ? [
      { label: "Clientes ativos", value: state.summary.people.clients, icon: "people", tone: "positive" },
      { label: "A receber", value: currency.format(state.summary.finance.toReceive), icon: "wallet", tone: "positive" },
      { label: "A pagar", value: currency.format(state.summary.finance.toPay), icon: "bill", tone: "negative" },
      { label: "Limite de credito", value: currency.format(state.summary.people.creditLimit), icon: "card", tone: "positive" }
    ]
    : [
      { label: "Clientes ativos", value: state.summary.people.clients, icon: "people", tone: "positive" },
      { label: "A receber", value: currency.format(state.summary.finance.toReceive), icon: "wallet", tone: "positive" },
      { label: "A pagar", value: currency.format(state.summary.finance.toPay), icon: "bill", tone: "negative" },
      { label: "Estoque baixo", value: state.summary.inventory.lowStock, icon: "box", tone: "warning" },
      { label: "Limite de credito", value: currency.format(state.summary.people.creditLimit), icon: "card", tone: "positive" },
      { label: "Vendas PDV", value: currency.format(state.summary.pdv.salesTotal), icon: "cart", tone: "info" }
    ];

  dom.dashboardCards.innerHTML = cards.map((card) => `
    <article class="metric-card ${card.tone}">
      <div class="icon-bubble">${dashboardIcon(card.icon)}</div>
      <strong>${card.value}</strong>
      <span>${card.label}</span>
    </article>
  `).join("");

  const alerts = [];
  if (state.settings?.plan !== "financeiro" && state.summary.inventory.lowStock > 0) {
    alerts.push({ kind: "warning", text: `${state.summary.inventory.lowStock} produto(s) com estoque minimo atingido.`, action: "Abrir lista de produtos", view: "inventoryList" });
  }
  if (state.summary.finance.overdueReceivables > 0) {
    alerts.push({ kind: "danger", text: `${state.summary.finance.overdueReceivables} recebimento(s) vencido(s).`, action: "Ir para contas a receber", view: "receivable" });
  }
  if (state.summary.finance.overduePayables > 0) {
    alerts.push({ kind: "danger", text: `${state.summary.finance.overduePayables} despesa(s) vencida(s).`, action: "Ir para contas a pagar", view: "payable" });
  }
  if (state.summary.people.creditLimit > 0) {
    alerts.push({ kind: "success", text: `Limite total de credito dos clientes em ${currency.format(state.summary.people.creditLimit)}.`, action: "Abrir limite de credito", view: "creditLimits" });
  }
  if (!alerts.length) alerts.push({ kind: "success", text: "Sem alertas criticos no momento.", action: "Permanecer no dashboard", view: "dashboard" });

  dom.alertsList.innerHTML = alerts.map((alert) => `
    <button type="button" class="alert-item clickable" data-kind="${alert.kind}" onclick="goToAlert('${alert.view}')">
      <strong>${alert.text}</strong>
      <span class="alert-item-action">${alert.action}</span>
    </button>
  `).join("");

}

function renderPeopleSection() {
  const type = personTypeByView[state.currentView] || "clientes";
  const config = {
    clientes: ["Cadastro de clientes", "Dados comerciais, contato e limite de credito individual"],
    funcionarios: ["Cadastro de funcionarios", "Equipe interna com dados para gestao operacional"],
    usuarios: ["Cadastro de usuarios", "Usuarios habilitados para acessar o sistema"],
    fornecedores: ["Cadastro de fornecedores", "Parceiros de compra e abastecimento"]
  }[type];

  dom.personSectionTitle.textContent = config[0];
  dom.personSectionSubtitle.textContent = config[1];
  dom.personCreditLabel.classList.toggle("hidden-panel", type !== "clientes");
  dom.personStatusLabel.classList.toggle("hidden-panel", type !== "clientes");
  dom.personSizeLabel.classList.toggle("hidden-panel", type !== "clientes");
  dom.personNumberLabel.classList.toggle("hidden-panel", type !== "clientes");
  dom.userUsernameLabel.classList.toggle("hidden-panel", type !== "usuarios");
  dom.userPasswordLabel.classList.toggle("hidden-panel", type !== "usuarios");
  dom.userRoleLabel.classList.toggle("hidden-panel", type !== "usuarios");
  dom.userActiveLabel.classList.toggle("hidden-panel", type !== "usuarios");
  dom.clientsImportPanel.classList.toggle("hidden-panel", type !== "clientes");
  dom.clientsStatusFilterPanel.classList.toggle("hidden-panel", type !== "clientes");
  if (type !== "clientes") closeClientHistoryPanel();

  const statusFilter = dom.clientsStatusFilter.value || "todos";
  const dateFrom = dom.clientsDateFrom.value || "";
  const dateTo = dom.clientsDateTo.value || "";
  const rows = state.people.filter((item) => {
    if (item.type !== type) return false;
    if (type !== "clientes" || statusFilter === "todos") return true;
    return (item.status || "Lead") === statusFilter;
  }).filter((item) => {
    if (type !== "clientes" || (!dateFrom && !dateTo)) return true;
    const dateValue = clientFilterDate(item);
    if (!dateValue) return false;
    if (dateFrom && dateValue < dateFrom) return false;
    if (dateTo && dateValue > dateTo) return false;
    return true;
  });
  dom.peopleTable.innerHTML = rows.map((person) => `
    <tr>
      <td>${person.name}</td>
      <td>${type === "usuarios" ? `${person.username || "-"}${person.role ? ` • ${capitalize(person.role)}` : ""}` : (person.phone || person.email || "-")}</td>
      <td>${person.document || "-"}</td>
      <td>${type === "clientes" ? `<span class="badge ${clientStatusClass(person.status)}">${person.status || "Lead"}</span> ${currency.format(Number(person.credit || 0))}` : (type === "usuarios" ? (Number(person.active) !== 0 ? "Ativo" : "Inativo") : "-")}</td>
      <td>${type === "clientes" ? escapeHtml(person.preferred_size || "-") : "-"}</td>
      <td>${type === "clientes" ? escapeHtml(person.preferred_number || "-") : "-"}</td>
      <td>
        <div class="action-row">
          <button type="button" class="mini-btn edit" data-people-action="edit" data-id="${escapeHtml(person.id)}">Editar</button>
          ${type === "clientes" ? `<button type="button" class="mini-btn primary-soft" data-people-action="history" data-id="${escapeHtml(person.id)}">Historico</button>` : ""}
          <button type="button" class="mini-btn delete" data-people-action="delete" data-id="${escapeHtml(person.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="7">Nenhum cadastro encontrado para os filtros selecionados.</td></tr>`;
}

function clientFilterDate(person) {
  const preferredDate = (person.status || "Lead") === "Cliente"
    ? person.data_conversao || person.created_at
    : person.created_at;
  return String(preferredDate || "").slice(0, 10);
}

async function handlePeopleTableClick(event) {
  const button = event.target.closest("[data-people-action]");
  if (!button) return;
  const id = button.dataset.id || "";
  const action = button.dataset.peopleAction;
  if (action === "edit") {
    window.editPerson(id);
    return;
  }
  if (action === "history") {
    window.openClientHistory(id);
    return;
  }
  if (action === "delete") {
    await window.deletePerson(id);
  }
}

function clientStatusClass(status) {
  return status === "Cliente" ? "cliente" : "lead";
}

function renderClientHistory(clientId) {
  const client = state.people.find((item) => sameId(item.id, clientId));
  if (!client) return;
  document.getElementById("client-history-client-id").value = client.id;
  dom.clientHistoryTitle.textContent = `Historico de vendas - ${client.name}`;
  const rows = state.historicoTentativas.filter((item) => sameId(item.cliente_id, client.id));
  dom.clientHistoryTable.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${formatDateTime(item.data)}</td>
      <td>${escapeHtml(item.resultado || "-")}</td>
      <td>${escapeHtml(item.observacao || "-")}</td>
    </tr>
  `).join("") : `<tr><td colspan="3">Nenhum historico registrado para este contato.</td></tr>`;
}

function openClientHistoryPanel(clientId) {
  const client = state.people.find((item) => sameId(item.id, clientId));
  if (!client) return;
  dom.clientHistoryPanel.classList.remove("hidden-panel");
  document.getElementById("client-history-form").reset();
  document.getElementById("client-history-date").value = toDatetimeLocalValue(new Date());
  renderClientHistory(client.id);
}

function closeClientHistoryPanel() {
  if (!dom.clientHistoryPanel) return;
  dom.clientHistoryPanel.classList.add("hidden-panel");
  document.getElementById("client-history-client-id").value = "";
}

function renderFinanceSection() {
  if (state.currentView === "creditLimits") {
    dom.financeSectionTitle.textContent = "Limite de credito";
    dom.financeSectionSubtitle.textContent = "Controle manual + acumulado automatico por venda";
    dom.financeEntryPanel.classList.add("hidden-panel");
    dom.financeTablePanel.classList.add("hidden-panel");
    dom.creditLimitPanel.classList.remove("hidden-panel");
    dom.costCenterPanel.classList.add("hidden-panel");
    renderCreditLimits();
    return;
  }

  if (state.currentView === "costCenters") {
    dom.financeSectionTitle.textContent = "Centro de custo";
    dom.financeSectionSubtitle.textContent = "Cadastre e organize os grupos das despesas";
    dom.financeEntryPanel.classList.add("hidden-panel");
    dom.financeTablePanel.classList.add("hidden-panel");
    dom.creditLimitPanel.classList.add("hidden-panel");
    dom.costCenterPanel.classList.remove("hidden-panel");
    renderCostCenters();
    return;
  }

  if (state.currentView === "cashClosing") {
    dom.financeSectionTitle.textContent = "Fechamento de caixa";
    dom.financeSectionSubtitle.textContent = "Resumo diario do movimento financeiro e das vendas";
    dom.financeEntryPanel.classList.add("hidden-panel");
    dom.financeTablePanel.classList.add("hidden-panel");
    dom.creditLimitPanel.classList.add("hidden-panel");
    dom.costCenterPanel.classList.add("hidden-panel");
    dom.cashClosingPanel.classList.remove("hidden-panel");
    renderCashClosings();
    return;
  }

  const type = financeTypeByView[state.currentView] || "receber";
  const config = {
    receber: ["Contas a receber", "Recebimentos com opcao de parcelamento"],
    pagar: ["Contas a pagar", "Despesas, fornecedores e obrigacoes financeiras"]
  }[type];
  dom.financeSectionTitle.textContent = config[0];
  dom.financeSectionSubtitle.textContent = config[1];
  dom.financeInstallmentsBox.classList.toggle("hidden-panel", type !== "receber");
  dom.financeCostCenterBox.classList.toggle("hidden-panel", type !== "pagar");
  dom.financeEntryPanel.classList.remove("hidden-panel");
  dom.financeTablePanel.classList.remove("hidden-panel");
  dom.creditLimitPanel.classList.add("hidden-panel");
  dom.costCenterPanel.classList.add("hidden-panel");
  dom.cashClosingPanel.classList.add("hidden-panel");

  const availablePeople = state.people.filter((item) => (type === "receber" ? item.type === "clientes" : item.type === "fornecedores"));
  dom.financePerson.innerHTML = `<option value="">Sem vinculo</option>` + availablePeople.map((person) => `<option value="${person.id}">${person.name}</option>`).join("");
  dom.financeCostCenter.innerHTML = `<option value="">Sem centro</option>` + state.costCenters.map((center) => `<option value="${center.id}">${center.name}</option>`).join("");

  const items = state.finance.filter((item) => item.type === type);
  dom.financeTable.innerHTML = items.map((entry) => `
    <tr>
      <td>${entry.description}</td>
      <td>${entry.person_name || "-"}</td>
      <td>${entry.cost_center_name || "-"}</td>
      <td>${currency.format(Number(entry.amount))}</td>
      <td>${formatDate(entry.due_date)}</td>
      <td><span class="badge ${entry.status} ${entry.overdue ? "overdue" : ""}">${entry.status_label}</span></td>
      <td>
        <div class="action-row">
          ${entry.status !== "pago" ? `<button class="mini-btn primary-soft" onclick="openFinancePayment(${actionId(entry.id)})">Pagar</button>` : ""}
          <button class="mini-btn edit" onclick="editFinance(${actionId(entry.id)})">Editar</button>
          <button class="mini-btn delete" onclick="deleteFinance(${actionId(entry.id)})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderCashClosings(summaryOverride = null) {
  const dateField = document.getElementById("cash-closing-date");
  if (!dateField.value) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }
  const openingBalance = Number(document.getElementById("cash-opening-balance").value || 0);
  const summary = summaryOverride || {
    totalSales: state.sales.filter((item) => String(item.created_at || "").slice(0, 10) === dateField.value)
      .reduce((sum, item) => sum + Number(item.total || 0), 0),
    totalReceived: state.finance.filter((item) => item.type === "receber" && item.status === "pago" && item.due_date === dateField.value)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    totalPaid: state.finance.filter((item) => item.type === "pagar" && item.status === "pago" && item.due_date === dateField.value)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    closingBalance: openingBalance
      + state.finance.filter((item) => item.type === "receber" && item.status === "pago" && item.due_date === dateField.value).reduce((sum, item) => sum + Number(item.amount || 0), 0)
      - state.finance.filter((item) => item.type === "pagar" && item.status === "pago" && item.due_date === dateField.value).reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };

  dom.cashClosingSummary.innerHTML = `
    <article class="summary-item"><span>Vendas do dia</span><strong>${currency.format(Number(summary.totalSales || 0))}</strong></article>
    <article class="summary-item"><span>Entradas recebidas</span><strong>${currency.format(Number(summary.totalReceived || 0))}</strong></article>
    <article class="summary-item"><span>Saidas pagas</span><strong>${currency.format(Number(summary.totalPaid || 0))}</strong></article>
    <article class="summary-item"><span>Saldo final</span><strong>${currency.format(Number(summary.closingBalance || 0))}</strong></article>
  `;

  dom.cashClosuresTable.innerHTML = state.cashClosures.map((item) => `
    <tr>
      <td>${formatDate(item.closure_date)}</td>
      <td>${currency.format(Number(item.opening_balance || 0))}</td>
      <td>${currency.format(Number(item.total_received || 0))}</td>
      <td>${currency.format(Number(item.total_paid || 0))}</td>
      <td>${currency.format(Number(item.closing_balance || 0))}</td>
      <td>${escapeHtml(item.notes || "-")}</td>
    </tr>
  `).join("");
}

function renderCostCenters() {
  dom.costCentersTable.innerHTML = state.costCenters.map((center) => `
    <tr>
      <td>${escapeHtml(center.name)}</td>
      <td>${escapeHtml(center.description || "-")}</td>
      <td>
        <div class="action-row">
          <button class="mini-btn edit" onclick="editCostCenter(${actionId(center.id)})">Editar</button>
          <button class="mini-btn delete" onclick="deleteCostCenter(${actionId(center.id)})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderCreditLimits() {
  const clients = state.people.filter((item) => item.type === "clientes");
  const currentSelection = dom.creditClient.value;
  dom.creditClient.innerHTML = `<option value="">Selecione um cliente</option>` + clients.map((client) => `<option value="${client.id}">${client.name}</option>`).join("");
  if (currentSelection && clients.some((client) => String(client.id) === currentSelection)) {
    dom.creditClient.value = currentSelection;
  } else if (clients.length) {
    dom.creditClient.value = String(clients[0].id);
  }
  syncCreditLimitForm();
  dom.creditLimitsTable.innerHTML = clients.map((client) => `
    <tr>
      <td>${escapeHtml(client.name)}</td>
      <td>${currency.format(Number(client.manual_credit || 0))}</td>
      <td>${currency.format(Number(client.earned_credit || 0))}</td>
      <td>${currency.format(Number(client.credit || 0))}</td>
      <td>
        <div class="action-row">
          <button class="mini-btn edit" onclick="editCreditLimit(${actionId(client.id)})">Ajustar</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderInventorySection() {
  const current = state.currentView;
  const configs = {
    inventoryCategories: ["Categorias de estoque", "Agrupe produtos por categoria comercial"],
    inventoryProducts: ["Cadastro de produtos", "Defina codigo, fornecedor, custo, venda e estoque minimo"],
    inventoryImport: ["Entrada por planilha", "Importe nota com fornecedor, parcelas e lista de produtos"],
    inventoryList: ["Lista de produtos", "Acompanhe quantidade total, valor bruto e valor liquido por item"]
  };
  const currentConfig = configs[current] || configs.inventoryCategories;
  dom.inventorySectionTitle.textContent = currentConfig[0];
  dom.inventorySectionSubtitle.textContent = currentConfig[1];

  dom.inventoryCategoriesPanel.classList.toggle("hidden-panel", current !== "inventoryCategories");
  dom.inventoryFormPanel.classList.toggle("hidden-panel", current !== "inventoryProducts");
  dom.inventoryImportPanel.classList.toggle("hidden-panel", current !== "inventoryImport");
  dom.inventoryListPanel.classList.toggle("hidden-panel", current !== "inventoryList");

  if (state.summary) {
    const totalUnits = state.inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    dom.inventorySummary.innerHTML = `
      <article class="summary-item"><span>Quantidade em itens</span><strong>${totalUnits}</strong></article>
      <article class="summary-item"><span>Valor bruto estimado</span><strong>${currency.format(state.summary.inventory.grossValue)}</strong></article>
      <article class="summary-item"><span>Valor liquido estimado</span><strong>${currency.format(state.summary.inventory.netValue)}</strong></article>
      <article class="summary-item"><span>Produtos com alerta</span><strong>${state.summary.inventory.lowStock}</strong></article>
    `;
  }

  const suppliers = state.people.filter((item) => item.type === "fornecedores");
  dom.inventoryCategory.innerHTML =
    `<option value="">Selecione</option>` +
    state.categories.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  dom.inventorySupplier.innerHTML =
    `<option value="">Sem fornecedor</option>` +
    suppliers.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");

  dom.categoriesTable.innerHTML = state.categories.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.description || "-"}</td>
      <td>
        <div class="action-row">
          <button class="mini-btn edit" onclick="editCategory(${actionId(item.id)})">Editar</button>
          <button class="mini-btn delete" onclick="deleteCategory(${actionId(item.id)})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  dom.inventoryTable.innerHTML = state.inventory.map((item) => {
    const gross = Number(item.quantity) * Number(item.sale_price || 0);
    const net = Number(item.quantity) * (Number(item.sale_price || 0) - Number(item.cost || 0));
    return `
      <tr>
        <td>${item.code || "-"}</td>
        <td>${item.name}</td>
        <td>${item.supplier_name || "-"}</td>
        <td>${item.category_name || "-"}</td>
        <td>${item.quantity}</td>
        <td>${currency.format(Number(item.cost || 0))}</td>
        <td>${currency.format(Number(item.sale_price || 0))}</td>
        <td>${currency.format(gross)}</td>
        <td>${currency.format(net)}</td>
        <td>
          <div class="action-row">
            <button class="mini-btn edit" onclick="editInventory(${actionId(item.id)})">Editar</button>
            <button class="mini-btn delete" onclick="deleteInventory(${actionId(item.id)})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  dom.inventoryProductsTable.innerHTML = state.inventory.map((item) => `
    <tr>
      <td>${item.code || "-"}</td>
      <td>${item.name}</td>
      <td>${item.supplier_name || "-"}</td>
      <td>${item.quantity}</td>
      <td>${currency.format(Number(item.sale_price || 0))}</td>
      <td>
        <div class="action-row">
          <button class="mini-btn edit" onclick="editInventory(${actionId(item.id)})">Editar</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderReportsSection() {
  if (!state.summary) return;
  const config = reportConfig(state.currentView);
  state.currentReportConfig = config;
  const isAuditView = state.currentView === "reportsAudit";
  dom.reportsSectionTitle.textContent = config.title;
  dom.reportsSectionSubtitle.textContent = config.subtitle;
  dom.reportsTableTitle.textContent = config.tableTitle;
  dom.auditCleanupDays.classList.toggle("hidden-panel", !isAuditView);
  dom.auditCleanupButton.classList.toggle("hidden-panel", !isAuditView);
  dom.auditPeriodLabel.classList.toggle("hidden-panel", !isAuditView);
  dom.auditMonthLabel.classList.toggle("hidden-panel", !isAuditView || state.auditPeriod !== "month");
  dom.auditPageSizeLabel.classList.toggle("hidden-panel", !isAuditView);
  dom.auditPagination.classList.toggle("hidden-panel", !isAuditView);
  dom.reportsDateFrom.closest("label").classList.toggle("hidden-panel", isAuditView);
  dom.reportsDateTo.closest("label").classList.toggle("hidden-panel", isAuditView);
  dom.reportsPeriodMode.closest("label").classList.toggle("hidden-panel", isAuditView);
  if (isAuditView) {
    dom.auditPeriodFilter.value = state.auditPeriod;
    dom.auditMonthFilter.value = state.auditMonth;
    dom.auditPageSize.value = String(state.auditPageSize);
    dom.auditPageLabel.textContent = config.paginationLabel || "Pagina 1 de 1";
    dom.auditPrevPage.disabled = state.auditPage <= 1;
    dom.auditNextPage.disabled = state.auditPage >= (config.totalPages || 1);
  }
  dom.reportsChart.innerHTML = renderReportChart(config.chart || null);
  dom.reportsHighlights.innerHTML = config.highlights.map(card => `
    <article class="highlight-card">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <p>${card.detail}</p>
    </article>
  `).join("");
  dom.reportsGrid.innerHTML = config.insights.map(card => `
    <article class="report-card refined">
      <span>${card.label}</span>
      <strong>${card.value}</strong>
      <p>${card.detail}</p>
    </article>
  `).join("");
  dom.reportsTable.innerHTML = makeTable(config.headers, config.rows, config.emptyMessage);
}

function renderReportChart(chart) {
  if (!chart || !chart.labels?.length) {
    if (chart?.type === "pie-group" && chart.charts?.length) {
      return `
        <div class="pie-chart-group">
          ${chart.charts.map((item) => renderPieChart(item)).join("")}
        </div>
      `;
    }
    return `<div class="chart-empty">Sem dados graficos para o periodo selecionado.</div>`;
  }
  if (chart.type === "pie") {
    return renderPieChart(chart);
  }
  const maxValue = Math.max(...chart.values.map((item) => Number(item || 0)), 1);
  return `
    <div class="mini-chart">
      ${chart.labels.map((label, index) => {
        const value = Number(chart.values[index] || 0);
        const height = Math.max(12, Math.round((value / maxValue) * 140));
        return `
          <div class="mini-chart-column">
            <span class="mini-chart-value">${chart.formatter ? chart.formatter(value) : value}</span>
            <div class="mini-chart-bar-wrap">
              <div class="mini-chart-bar" style="height:${height}px"></div>
            </div>
            <strong>${escapeHtml(label)}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderPieChart(chart) {
  if (!chart || !chart.labels?.length) {
    return `<div class="chart-empty">Sem dados graficos para o periodo selecionado.</div>`;
  }
  const total = chart.values.reduce((sum, item) => sum + Number(item || 0), 0);
  if (!total) return `<div class="chart-empty">Sem dados graficos para o periodo selecionado.</div>`;
  const colors = ["#ef9714", "#2f855a", "#2563eb", "#c2410c", "#7c3aed", "#0f766e", "#be123c", "#64748b"];
  let cursor = 0;
  const labels = [];
  const segments = chart.values.map((item, index) => {
    const value = Number(item || 0);
    const start = cursor;
    cursor += (value / total) * 100;
    const end = cursor;
    const middle = ((start + end) / 2) * 3.6;
    const radians = (middle - 90) * (Math.PI / 180);
    const distance = 34;
    const left = 50 + Math.cos(radians) * distance;
    const top = 50 + Math.sin(radians) * distance;
    const share = total ? Math.round((value / total) * 100) : 0;
    if (share >= 8) {
      labels.push({
        label: chart.labels[index],
        value,
        share,
        left,
        top
      });
    }
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return `
    <div class="pie-chart-box">
      ${chart.title ? `<h3>${escapeHtml(chart.title)}</h3>` : ""}
      <div class="pie-chart">
        <div class="pie-chart-visual" style="background: conic-gradient(${segments.join(", ")})">
          ${labels.map((item) => `
            <span class="pie-slice-label" style="left:${item.left}%; top:${item.top}%">
              <strong>${escapeHtml(item.label)}</strong>
              <small>${item.value} - ${item.share}%</small>
            </span>
          `).join("")}
        </div>
        <div class="pie-chart-legend">
          ${chart.labels.map((label, index) => {
            const value = Number(chart.values[index] || 0);
            const share = total ? Math.round((value / total) * 100) : 0;
            return `
              <div class="pie-chart-item">
                <span class="pie-dot" style="background:${colors[index % colors.length]}"></span>
                <strong>${escapeHtml(label)}</strong>
                <span>${chart.formatter ? chart.formatter(value, share) : `${value} (${share}%)`}</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function reportConfig(view) {
  const clients = state.people.filter((item) => item.type === "clientes");
  const conversion = calculateConversionRate(clients);
  const decisionReport = clientDecisionReport(clients);
  const receivables = filterByDate(state.finance.filter((item) => item.type === "receber"), (item) => item.due_date);
  const payables = filterByDate(state.finance.filter((item) => item.type === "pagar"), (item) => item.due_date);
  const sales = filterByDate(state.sales || [], (item) => String(item.created_at || "").slice(0, 10));

  if (view === "reportsReceivables") {
    return {
      title: "Relatorio de recebimentos",
      subtitle: "Titulos a receber e desempenho da cobranca",
      tableTitle: "Titulos a receber",
      highlights: [
        { label: "Em aberto", value: currency.format(state.summary.finance.toReceive), detail: "Carteira atual de recebimentos" },
        { label: "Recebido", value: currency.format(state.summary.finance.received), detail: "Titulos com status pago" },
        { label: "Vencidos", value: state.summary.finance.overdueReceivables, detail: "Recebimentos pendentes vencidos" }
      ],
      insights: [
        { label: "Quantidade de titulos", value: receivables.length, detail: "Total de registros a receber" },
        { label: "Ticket medio", value: currency.format(average(receivables.map((item) => item.amount))), detail: "Media por titulo emitido" },
        { label: "Quitacao", value: percent(receivables.filter((item) => item.status === "pago").length, receivables.length), detail: "Percentual quitado" }
      ],
      chart: {
        labels: ["Em aberto", "Recebido", "Vencidos"],
        values: [state.summary.finance.toReceive, state.summary.finance.received, state.summary.finance.overdueReceivables],
        formatter: (value) => currency.format(value)
      },
      headers: ["Descricao", "Cliente", "Vencimento", "Valor", "Status"],
      rows: receivables.map((item) => [item.description, item.person_name || "-", formatDate(item.due_date), currency.format(Number(item.amount)), item.status_label])
    };
  }

  if (view === "reportsExpenses") {
    return {
      title: "Relatorio de despesas",
      subtitle: "Acompanhamento profissional das contas a pagar",
      tableTitle: "Titulos a pagar",
      highlights: [
        { label: "Em aberto", value: currency.format(state.summary.finance.toPay), detail: "Compromissos pendentes" },
        { label: "Pago", value: currency.format(state.summary.finance.paid), detail: "Despesas ja liquidadas" },
        { label: "Vencidos", value: state.summary.finance.overduePayables, detail: "Titulos em atraso" }
      ],
      insights: [
        { label: "Quantidade de titulos", value: payables.length, detail: "Total de registros a pagar" },
        { label: "Despesa media", value: currency.format(average(payables.map((item) => item.amount))), detail: "Media por titulo" },
        { label: "Liquidacao", value: percent(payables.filter((item) => item.status === "pago").length, payables.length), detail: "Percentual quitado" }
      ],
      chart: {
        labels: ["Em aberto", "Pago", "Vencidos"],
        values: [state.summary.finance.toPay, state.summary.finance.paid, state.summary.finance.overduePayables],
        formatter: (value) => currency.format(value)
      },
      headers: ["Descricao", "Fornecedor", "Vencimento", "Valor", "Status"],
      rows: payables.map((item) => [item.description, item.person_name || "-", formatDate(item.due_date), currency.format(Number(item.amount)), item.status_label])
    };
  }

  if (view === "reportsProfit") {
    const liquidProfit = sales.reduce((sum, item) => sum + Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)), 0)
      - payables.filter((item) => item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return {
      title: "Demonstrativo de lucro",
      subtitle: "Leitura do resultado operacional e da margem do estoque",
      tableTitle: "Indicadores de resultado",
      highlights: [
        { label: "Resultado operacional", value: currency.format(state.summary.finance.operationalResult), detail: "Recebido menos pago" },
        { label: "Lucro potencial do estoque", value: currency.format(state.summary.inventory.netValue), detail: "Margem estimada do estoque atual" },
        { label: "Vendas no PDV", value: currency.format(state.summary.pdv.salesTotal), detail: "Total vendido via PDV" }
      ],
      insights: [
        { label: "Lucro do periodo", value: currency.format(sales.reduce((sum, item) => sum + Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)), 0)), detail: "Lucro bruto das vendas filtradas" },
        { label: "Lucro liquido", value: currency.format(liquidProfit), detail: "Lucro menos despesas pagas no periodo" },
        { label: "Vendas realizadas", value: sales.length, detail: "Quantidade de vendas registradas no periodo" }
      ],
      chart: {
        labels: ["Receitas", "Despesas", "Lucro liquido"],
        values: [
          receivables.filter((item) => item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0),
          payables.filter((item) => item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0),
          liquidProfit
        ],
        formatter: (value) => currency.format(value)
      },
      headers: ["Indicador", "Valor", "Observacao"],
      rows: [
        ["Receitas recebidas", currency.format(receivables.filter((item) => item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0)), "Titulos financeiros marcados como pagos no periodo"],
        ["Despesas pagas", currency.format(payables.filter((item) => item.status === "pago").reduce((sum, item) => sum + Number(item.amount || 0), 0)), "Saidas financeiras liquidadas no periodo"],
        ["Lucro bruto", currency.format(sales.reduce((sum, item) => sum + Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)), 0)), "Lucro antes das despesas"],
        ["Lucro liquido", currency.format(liquidProfit), "Lucro bruto menos despesas pagas"],
        ["Total vendido PDV", currency.format(sales.reduce((sum, item) => sum + Number(item.total || 0), 0)), "Faturamento registrado pelo PDV no periodo"]
      ]
    };
  }

  if (view === "reportsSales") {
    return {
      title: "Relatorio de vendas",
      subtitle: "Historico comercial do PDV com faturamento e lucro estimado",
      tableTitle: "Vendas registradas",
      highlights: [
        { label: "Total vendido", value: currency.format(state.summary.pdv.salesTotal), detail: "Faturamento bruto do PDV" },
        { label: "Lucro estimado", value: currency.format(state.summary.pdv.salesProfit), detail: "Soma da margem por venda menos descontos" },
        { label: "Vendas pagas", value: state.summary.pdv.paidSales, detail: "Operacoes quitadas na origem" }
      ],
      insights: [
        { label: "Quantidade de vendas", value: sales.length, detail: "Total de vendas registradas" },
        { label: "Ticket medio", value: currency.format(average(sales.map((item) => item.total))), detail: "Media por venda" },
        { label: "Clientes atendidos", value: `${new Set(sales.map((item) => item.client_id).filter(Boolean)).size} clientes`, detail: "Base atendida no PDV" }
      ],
      chart: {
        ...monthlySalesChart(sales),
        formatter: (value) => currency.format(value)
      },
      headers: ["Venda", "Data", "Cliente", "Pagamento", "Total", "Lucro estimado"],
      rows: sales.map((item) => [
        `#${item.id}`,
        formatDate(String(item.created_at || "").slice(0, 10)),
        item.client_name || "Consumidor final",
        item.payment_method || "-",
        currency.format(Number(item.total || 0)),
        currency.format(Math.max(0, Number(item.gross_profit || 0) - Number(item.discount_value || 0)))
      ])
    };
  }

  if (view === "reportsDecision") {
    return {
      title: "Tomada de Decisao",
      subtitle: "Distribuicao de tamanhos e numeracoes entre clientes e leads",
      tableTitle: "Divisao por tamanho e numeracao",
      highlights: [
        { label: "Tamanhos informados", value: decisionReport.sizeTotal, detail: "Soma de clientes e leads com tamanho preenchido" },
        { label: "Numeracoes informadas", value: decisionReport.numberTotal, detail: "Soma de clientes e leads com numeracao preenchida" },
        { label: "Maior demanda", value: decisionReport.topLabel || "-", detail: decisionReport.topDetail || "Sem dados suficientes no periodo" }
      ],
      insights: [
        { label: "Opcoes de tamanho", value: decisionReport.sizes.labels.length, detail: "Tamanhos diferentes cadastrados" },
        { label: "Opcoes de numeracao", value: decisionReport.numbers.labels.length, detail: "Numeracoes diferentes cadastradas" },
        { label: "Base analisada", value: `${decisionReport.baseTotal} contato(s)`, detail: "Clientes e leads dentro do filtro de periodo" }
      ],
      chart: {
        type: "pie-group",
        charts: [
          {
            type: "pie",
            title: `Tamanhos (${decisionReport.sizeTotal})`,
            labels: decisionReport.sizes.labels,
            values: decisionReport.sizes.values,
            formatter: (value, share) => `${value} cliente(s) - ${share}%`
          },
          {
            type: "pie",
            title: `Numeracoes (${decisionReport.numberTotal})`,
            labels: decisionReport.numbers.labels,
            values: decisionReport.numbers.values,
            formatter: (value, share) => `${value} cliente(s) - ${share}%`
          }
        ]
      },
      headers: ["Tipo", "Opcao", "Total", "Participacao"],
      rows: decisionReport.rows,
      emptyMessage: "Nenhum tamanho ou numeracao encontrado para o periodo selecionado."
    };
  }

  if (view === "reportsAudit") {
    const filteredLogs = filterAuditLogs(state.auditLogs);
    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / state.auditPageSize));
    state.auditPage = Math.min(Math.max(1, state.auditPage), totalPages);
    const start = (state.auditPage - 1) * state.auditPageSize;
    const logs = filteredLogs.slice(start, start + state.auditPageSize);
    return {
      title: "Auditoria",
      subtitle: "Historico de acessos e movimentacoes registradas no sistema",
      tableTitle: "Movimentacoes recentes",
      totalPages,
      paginationLabel: `Pagina ${state.auditPage} de ${totalPages} - ${filteredLogs.length} registro(s)`,
      highlights: [
        { label: "Eventos filtrados", value: filteredLogs.length, detail: auditPeriodLabel() },
        { label: "Ultimo evento", value: filteredLogs[0] ? formatDateTime(filteredLogs[0].created_at) : "-", detail: "Momento mais recente registrado" },
        { label: "Usuarios ativos", value: `${state.people.filter((item) => item.type === "usuarios" && Number(item.active) !== 0).length} usuario(s)`, detail: "Base de acesso atualmente habilitada" }
      ],
      insights: [
        { label: "Logins no filtro", value: filteredLogs.filter((item) => item.action === "login").length, detail: "Entradas registradas no sistema" },
        { label: "Movimentos de venda", value: filteredLogs.filter((item) => item.entity_type === "pdv").length, detail: "Eventos ligados ao PDV" },
        { label: "Mudancas financeiras", value: filteredLogs.filter((item) => item.entity_type === "finance").length, detail: "Lancamentos, baixas e exclusoes financeiras" }
      ],
      chart: {
        labels: ["Login", "PDV", "Financeiro", "Cadastros"],
        values: [
          filteredLogs.filter((item) => item.action === "login").length,
          filteredLogs.filter((item) => item.entity_type === "pdv").length,
          filteredLogs.filter((item) => item.entity_type === "finance").length,
          filteredLogs.filter((item) => item.entity_type === "people").length
        ],
        formatter: (value) => String(value)
      },
      headers: ["Data/Hora", "Usuario", "Acao", "Area", "Descricao"],
      rows: logs.map((item) => [
        formatDateTime(item.created_at),
        item.user_name || "Sistema",
        item.action || "-",
        item.entity_type || "-",
        item.description || "-"
      ]),
      emptyMessage: "Nenhum registro de auditoria encontrado para o filtro selecionado."
    };
  }

  return {
    title: "Relatorio de clientes",
    subtitle: "Base comercial, contato e limite de credito concedido",
    tableTitle: "Clientes cadastrados",
    highlights: [
      { label: "Leads", value: conversion.leads, detail: "Contatos ainda em prospeccao" },
      { label: "Clientes", value: conversion.converted, detail: "Leads convertidos em clientes" },
      { label: "Taxa de conversao", value: conversion.rate, detail: `Visualizacao ${conversion.modeLabel.toLowerCase()}` }
    ],
    insights: [
      { label: "Maior limite", value: topClient(clients).value, detail: topClient(clients).detail },
      { label: "Com tamanho", value: `${clients.filter((item) => item.preferred_size).length} registros`, detail: "Clientes e leads com tamanho informado" },
      { label: "Com numeracao", value: `${clients.filter((item) => item.preferred_number).length} registros`, detail: "Clientes e leads com numeracao informada" }
    ],
    chart: {
      ...conversion.chart,
      formatter: (value) => `${value}%`
    },
    headers: ["Contato", "Status", "Tamanho", "Numeracao", "Conversao", "Telefone/Email", "Limite de credito"],
    rows: clients.map((item) => [item.name, item.status || "Lead", item.preferred_size || "-", item.preferred_number || "-", item.data_conversao ? formatDate(String(item.data_conversao).slice(0, 10)) : "-", item.phone || item.email || "-", currency.format(Number(item.credit || 0))])
  };
}

function clientDecisionReport(clients) {
  const filtered = filterByDate(clients, (item) => String(item.data_conversao || item.created_at || "").slice(0, 10));
  const sizeCounts = new Map();
  const numberCounts = new Map();
  filtered.forEach((item) => {
    const size = String(item.preferred_size || "").trim().toUpperCase();
    const number = String(item.preferred_number || "").trim();
    if (size) sizeCounts.set(size, Number(sizeCounts.get(size) || 0) + 1);
    if (number) numberCounts.set(number, Number(numberCounts.get(number) || 0) + 1);
  });
  const sortEntries = (entries) => [...entries].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true }));
  const sizes = sortEntries(sizeCounts.entries());
  const numbers = sortEntries(numberCounts.entries());
  const sizeTotal = sizes.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const numberTotal = numbers.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const rows = [
    ...sizes.map(([label, value]) => ["Tamanho", label, value, `${percent(value, sizeTotal)} dos tamanhos`]),
    ...numbers.map(([label, value]) => ["Numeracao", label, value, `${percent(value, numberTotal)} das numeracoes`])
  ];
  const top = sortEntries([
    ...sizes.map(([label, value]) => [`Tam ${label}`, value]),
    ...numbers.map(([label, value]) => [`Num ${label}`, value])
  ])[0];
  return {
    baseTotal: filtered.length,
    sizeTotal,
    numberTotal,
    topLabel: top?.[0] || "",
    topDetail: top ? `${top[1]} cliente(s) ou lead(s) nessa opcao` : "",
    sizes: {
      labels: sizes.map(([label]) => label),
      values: sizes.map(([, value]) => value)
    },
    numbers: {
      labels: numbers.map(([label]) => label),
      values: numbers.map(([, value]) => value)
    },
    rows
  };
}

function calculateConversionRate(clients) {
  const filtered = filterByDate(clients, (item) => String(item.data_conversao || item.created_at || "").slice(0, 10));
  const leads = filtered.filter((item) => (item.status || "Lead") === "Lead").length;
  const converted = filtered.filter((item) => (item.status || "Lead") === "Cliente").length;
  const total = leads + converted;
  const mode = dom.reportsPeriodMode?.value || "mensal";
  return {
    leads,
    converted,
    rate: percent(converted, total),
    modeLabel: mode === "diaria" ? "Diaria" : "Mensal",
    chart: conversionChart(filtered, mode)
  };
}

function conversionChart(clients, mode) {
  const convertedByPeriod = new Map();
  const totalsByPeriod = new Map();
  clients.forEach((item) => {
    const baseDate = String(item.data_conversao || item.created_at || "").slice(0, 10);
    if (!baseDate) return;
    const key = mode === "diaria" ? baseDate : baseDate.slice(0, 7);
    totalsByPeriod.set(key, Number(totalsByPeriod.get(key) || 0) + 1);
    if ((item.status || "Lead") === "Cliente") {
      convertedByPeriod.set(key, Number(convertedByPeriod.get(key) || 0) + 1);
    }
  });
  const ordered = [...totalsByPeriod.keys()].sort((a, b) => a.localeCompare(b)).slice(-6);
  return {
    labels: ordered.map((key) => mode === "diaria" ? formatDate(key) : monthShortLabel(key)),
    values: ordered.map((key) => {
      const total = Number(totalsByPeriod.get(key) || 0);
      return total ? Math.round((Number(convertedByPeriod.get(key) || 0) / total) * 100) : 0;
    })
  };
}

function filterAuditLogs(logs) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.auditPeriod === "all") return [...logs];
  if (state.auditPeriod === "month") {
    const month = state.auditMonth || today.slice(0, 7);
    return logs.filter((item) => String(item.created_at || "").slice(0, 7) === month);
  }
  if (state.auditPeriod === "7days") {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const startKey = start.toISOString().slice(0, 10);
    return logs.filter((item) => {
      const key = String(item.created_at || "").slice(0, 10);
      return key >= startKey && key <= today;
    });
  }
  return logs.filter((item) => String(item.created_at || "").slice(0, 10) === today);
}

function auditPeriodLabel() {
  if (state.auditPeriod === "all") return "Todos os registros carregados";
  if (state.auditPeriod === "month") return `Mes ${monthShortLabel(state.auditMonth)}`;
  if (state.auditPeriod === "7days") return "Ultimos 7 dias";
  return "Historico de hoje";
}

function newClientsChart(clients) {
  const monthMap = new Map();
  clients.forEach((item) => {
    const dateText = String(item.created_at || "").slice(0, 10);
    if (!dateText) return;
    const [year, month] = dateText.split("-");
    if (!year || !month) return;
    const key = `${year}-${month}`;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });
  const ordered = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  return {
    labels: ordered.map(([key]) => monthShortLabel(key)),
    values: ordered.map(([, value]) => value)
  };
}

function monthShortLabel(key) {
  const [year, month] = String(key || "").split("-");
  const date = new Date(`${year}-${month}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function monthlySalesChart(sales) {
  const monthMap = new Map();
  sales.forEach((item) => {
    const dateText = String(item.created_at || "").slice(0, 10);
    if (!dateText) return;
    const [year, month] = dateText.split("-");
    if (!year || !month) return;
    const key = `${year}-${month}`;
    monthMap.set(key, Number(monthMap.get(key) || 0) + Number(item.total || 0));
  });
  const ordered = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  return {
    labels: ordered.map(([key]) => monthShortLabel(key)),
    values: ordered.map(([, value]) => Number(value || 0))
  };
}

function renderPdv() {
  const clients = state.people.filter((item) => item.type === "clientes");
  dom.pdvClient.innerHTML = `<option value="">Consumidor final</option>` + clients.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  const sellers = state.people.filter((item) => item.type === "funcionarios" || item.type === "usuarios");
  dom.pdvSeller.innerHTML = `<option value="">(Nenhum)</option>` + sellers.map((item) => `<option value="${item.id}">${item.name}</option>`).join("");
  const filteredInventory = state.inventory.filter((item) => {
    if (!state.pdvSearch) return true;
    const haystack = `${item.name} ${item.code || ""} ${item.category_name || ""}`.toLowerCase();
    return haystack.includes(state.pdvSearch);
  });
  const exactMatch = state.pdvSearch
    ? filteredInventory.find((item) => {
        const code = String(item.code || "").toLowerCase();
        const name = String(item.name || "").toLowerCase();
        return code === state.pdvSearch || name === state.pdvSearch;
      })
    : null;

  if (exactMatch) {
    document.getElementById("pdv-product").value = String(exactMatch.id);
    dom.pdvStock.value = `${exactMatch.quantity} un`;
    dom.pdvUnitValue.value = currency.format(Number(exactMatch.sale_price || 0));
  } else {
    dom.pdvStock.value = "";
    dom.pdvUnitValue.value = "";
  }

  dom.pdvTable.innerHTML = state.pdvCart.map((item, index) => `
    <tr class="${state.pdvSelectedIndex === index ? "selected" : ""}" onclick="selectPdvItem(${index})">
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>UN</td>
      <td>${currency.format(Number(item.unit_price))}</td>
      <td>${currency.format(Number(item.total))}</td>
    </tr>
  `).join("");
  const subtotal = state.pdvCart.reduce((sum, item) => sum + Number(item.total), 0);
  const discount = Number(document.getElementById("pdv-discount").value || 0);
  const total = Math.max(0, subtotal - discount);
  dom.pdvTotal.textContent = `Subtotal: ${currency.format(subtotal)} | Desconto: ${currency.format(discount)} | Total: ${currency.format(total)}`;
  dom.pdvRecentSales.innerHTML = state.recentSales.length
    ? state.recentSales.map((sale) => `
        <article class="recent-sale-card">
          <strong>Venda #${sale.id}</strong>
          <span>${sale.client_name || "Consumidor final"}</span>
          <span>${currency.format(Number(sale.total || 0))}</span>
          <button class="mini-btn delete" onclick="deleteSale(${actionId(sale.id)})">Excluir</button>
        </article>
      `).join("")
    : `<div class="recent-sale-empty">Nenhuma venda recente registrada.</div>`;

  if (!dom.pdvSaleDate.value) {
    dom.pdvSaleDate.value = new Date().toISOString().slice(0, 10);
  }

  syncPdvCreditSale();
}

function focusPdvSearch() {
  dom.pdvSearch.focus();
  dom.pdvSearch.select();
}

function handlePdvShortcuts(event) {
  if (!["pdvSales", "pdvHistory"].includes(state.currentView)) return;
  const tagName = document.activeElement?.tagName;
  const isTypingContext = ["INPUT", "TEXTAREA", "SELECT"].includes(tagName);

  if (event.key === "F2") {
    event.preventDefault();
    focusPdvSearch();
    return;
  }

  if (event.key === "F4") {
    event.preventDefault();
    addPdvItem();
    return;
  }

  if (event.key === "F8") {
    event.preventDefault();
    finishPdvSale();
    return;
  }

  if (event.key === "F9") {
    event.preventDefault();
    printPdvReceipt();
    return;
  }

  if (event.key === "Escape" && isTypingContext) {
    event.preventDefault();
    dom.pdvSearch.value = "";
    state.pdvSearch = "";
    renderPdv();
    focusPdvSearch();
  }
}

function addPdvItemFromSearch() {
  const search = state.pdvSearch.trim();
  if (!search) {
    addPdvItem();
    return;
  }

  const match = state.inventory.find((item) => {
    const code = String(item.code || "").toLowerCase();
    const name = String(item.name || "").toLowerCase();
    return code === search || name === search;
  });

  if (!match) {
    addPdvItem();
    return;
  }

  document.getElementById("pdv-product").value = String(match.id);
  dom.pdvStock.value = `${match.quantity} un`;
  dom.pdvUnitValue.value = currency.format(Number(match.sale_price || 0));
  addPdvItem();
}

function makeTable(headers, rows, emptyMessage = "Nenhum dado encontrado.") {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
        <tbody>
          ${
            rows.length
              ? rows.map((row) => `<tr>${row.map((item) => `<td>${item}</td>`).join("")}</tr>`).join("")
              : `<tr><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, item) => sum + Number(item || 0), 0) / values.length;
}

function percent(part, total) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function topClient(clients) {
  if (!clients.length) return { value: currency.format(0), detail: "Sem clientes com limite configurado" };
  const best = [...clients].sort((a, b) => Number(b.credit || 0) - Number(a.credit || 0))[0];
  return { value: currency.format(Number(best.credit || 0)), detail: best.name };
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

function toDatetimeLocalValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function filterByDate(items, resolver) {
  const from = dom.reportsDateFrom?.value || "";
  const to = dom.reportsDateTo?.value || "";
  if (!from && !to) return items;
  return items.filter((item) => {
    const value = resolver(item);
    if (!value) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });
}

function syncCreditLimitForm() {
  const client = state.people.find((item) => sameId(item.id, dom.creditClient.value));
  dom.creditManual.value = client ? Number(client.manual_credit || 0) : 0;
  dom.creditEarned.value = client ? currency.format(Number(client.earned_credit || 0)) : currency.format(0);
  dom.creditTotal.value = client ? currency.format(Number(client.credit || 0)) : currency.format(0);
}

function addMonthsToDate(dateValue, months) {
  const base = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}

function syncPdvCreditSale(force = false) {
  const methodField = document.getElementById("pdv-method");
  const dueDateField = document.getElementById("pdv-due-date");
  const installmentsField = document.getElementById("pdv-installments");
  const isCrediario = methodField.value === "crediario";

  if (isCrediario) {
    if (force || !dueDateField.value) {
      dueDateField.value = addMonthsToDate(dom.pdvSaleDate.value || new Date().toISOString().slice(0, 10), 1);
    }
    installmentsField.value = String(Math.max(1, Number(installmentsField.value || 1)));
    return;
  }

  if (force) {
    dueDateField.value = "";
  }
  installmentsField.value = "1";
}

function openPaymentDialog(entryId) {
  const entry = state.finance.find((item) => sameId(item.id, entryId));
  if (!entry) return;
  document.getElementById("payment-entry-id").value = entry.id;
  document.getElementById("payment-open-amount").value = currency.format(Number(entry.amount || 0));
  document.getElementById("payment-amount").value = Number(entry.amount || 0).toFixed(2);
  dom.paymentTitle.textContent = entry.type === "receber" ? "Receber titulo" : "Pagar titulo";
  dom.paymentMessage.textContent = `${entry.description} - ${entry.person_name || "Sem vinculo"}`;
  dom.paymentBackdrop.classList.remove("hidden-panel");
}

function closePaymentDialog() {
  dom.paymentBackdrop.classList.add("hidden-panel");
  document.getElementById("payment-form").reset();
  document.getElementById("payment-entry-id").value = "";
}

function openChangePasswordDialog() {
  dom.changePasswordBackdrop.classList.remove("hidden-panel");
}

function closeChangePasswordDialog() {
  dom.changePasswordBackdrop.classList.add("hidden-panel");
  document.getElementById("change-password-form").reset();
}

async function handlePersonSubmit(event) {
  event.preventDefault();
  const type = personTypeByView[state.currentView] || "clientes";
  const payload = {
    type,
    name: document.getElementById("person-name").value.trim(),
    document: document.getElementById("person-document").value.trim(),
    phone: document.getElementById("person-phone").value.trim(),
    email: document.getElementById("person-email").value.trim(),
    username: document.getElementById("person-username").value.trim(),
    password: document.getElementById("person-password").value.trim(),
    role: document.getElementById("person-role").value,
    active: Number(document.getElementById("person-active").value || 1),
    credit: type === "clientes" ? Number(document.getElementById("person-credit").value || 0) : 0,
    status: type === "clientes" ? document.getElementById("person-status").value : null,
    preferred_size: type === "clientes" ? document.getElementById("person-size").value.trim().toUpperCase() : "",
    preferred_number: type === "clientes" ? document.getElementById("person-number").value.trim() : "",
    notes: document.getElementById("person-notes").value.trim()
  };
  const id = document.getElementById("person-id").value;
  await api(id ? `/api/people/${id}` : "/api/people", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetPersonForm();
  await loadData();
  showToast("Cadastro salvo com sucesso.", "success");
}

function resetPersonForm() {
  document.getElementById("person-form").reset();
  document.getElementById("person-id").value = "";
  document.getElementById("person-credit").value = "0";
  document.getElementById("person-status").value = "Lead";
  document.getElementById("person-size").value = "";
  document.getElementById("person-number").value = "";
  document.getElementById("person-active").value = "1";
}

async function handleClientHistorySubmit(event) {
  event.preventDefault();
  const clientId = document.getElementById("client-history-client-id").value || "";
  if (!clientId) {
    showMessage("Historico", "Selecione um contato para registrar o historico.", "warning");
    return;
  }
  const payload = {
    data: document.getElementById("client-history-date").value,
    resultado: document.getElementById("client-history-result").value,
    observacao: document.getElementById("client-history-note").value.trim()
  };
  await api(`/api/people/${clientId}/historico-tentativas`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadData();
  openClientHistoryPanel(clientId);
  showToast("Historico comercial registrado com sucesso.", "success");
}

async function handleFinanceSubmit(event) {
  event.preventDefault();
  const type = financeTypeByView[state.currentView] || "receber";
  const payload = {
    type,
    person_id: document.getElementById("finance-person").value || null,
    cost_center_id: document.getElementById("finance-cost-center").value || null,
    description: document.getElementById("finance-description").value.trim(),
    amount: Number(document.getElementById("finance-amount").value || 0),
    due_date: document.getElementById("finance-date").value,
    status: document.getElementById("finance-status").value,
    installments: type === "receber" ? Number(document.getElementById("finance-installments").value || 1) : 1
  };
  const id = document.getElementById("finance-id").value;
  await api(id ? `/api/finance/${id}` : "/api/finance", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetFinanceForm();
  await loadData();
  showToast("Lancamento salvo com sucesso.", "success");
}

function resetFinanceForm() {
  document.getElementById("finance-form").reset();
  document.getElementById("finance-id").value = "";
  document.getElementById("finance-installments").value = "1";
  document.getElementById("finance-cost-center").value = "";
}

async function handleCreditLimitSubmit(event) {
  event.preventDefault();
  const clientId = dom.creditClient.value || "";
  if (!clientId) {
    showMessage("Limite de credito", "Selecione um cliente para ajustar o limite manual.", "warning");
    return;
  }
  await api(`/api/people/${clientId}/credit`, {
    method: "PUT",
    body: JSON.stringify({ manual_credit: Number(dom.creditManual.value || 0) })
  });
  await loadData();
  dom.creditClient.value = String(clientId);
  syncCreditLimitForm();
  showToast("Limite manual atualizado com sucesso.", "success");
}

async function handleCostCenterSubmit(event) {
  event.preventDefault();
  const id = document.getElementById("cost-center-id").value;
  const payload = {
    name: document.getElementById("cost-center-name").value.trim(),
    description: document.getElementById("cost-center-description").value.trim()
  };
  await api(id ? `/api/cost-centers/${id}` : "/api/cost-centers", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetCostCenterForm();
  await loadData();
  showToast("Centro de custo salvo com sucesso.", "success");
}

function resetCostCenterForm() {
  document.getElementById("cost-center-form").reset();
  document.getElementById("cost-center-id").value = "";
}

function resetCreditLimitForm() {
  dom.creditClient.value = "";
  dom.creditManual.value = "0";
  dom.creditEarned.value = currency.format(0);
  dom.creditTotal.value = currency.format(0);
}

async function submitFinancePayment(event) {
  event.preventDefault();
  const entryId = document.getElementById("payment-entry-id").value || "";
  const amount = Number(document.getElementById("payment-amount").value || 0);
  await api(`/api/finance/${entryId}/payment`, {
    method: "POST",
    body: JSON.stringify({ amount })
  });
  closePaymentDialog();
  await loadData();
  showToast("Baixa financeira registrada com sucesso.", "success");
}

function handleSystemBackup() {
  if (useSupabase()) {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "Sistema Exclusividade",
      settings: state.settings,
      people: state.people,
      categories: state.categories,
      costCenters: state.costCenters,
      finance: state.finance,
      inventory: state.inventory,
      sales: state.sales,
      saleItems: state.saleItems,
      cashClosures: state.cashClosures,
      historicoTentativas: state.historicoTentativas
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `backup-sistema-exclusividade-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Backup JSON da empresa baixado com sucesso.", "success");
    return;
  }
  downloadProtectedFile("/api/system/backup");
  showToast("Backup iniciado. O download do banco deve comecar em seguida.", "info");
}

async function handleSystemRestore(event) {
  const file = event.target.files[0];
  if (!file) return;
  const confirmed = await confirmDialog(
    "Restaurar backup",
    "Isso vai substituir os dados atuais pelos dados do arquivo selecionado. Deseja continuar?"
  );
  if (!confirmed) {
    event.target.value = "";
    return;
  }
  const data = new FormData();
  data.append("file", file);
  if (useSupabase()) {
    await restoreSupabaseJsonBackup(file);
    event.target.value = "";
    await loadData();
    switchView("dashboard");
    showToast("Backup Supabase restaurado com sucesso.", "success");
    return;
  }
  await api("/api/system/restore", { method: "POST", body: data });
  event.target.value = "";
  await loadData();
  switchView("dashboard");
  showToast("Backup restaurado com sucesso.", "success");
}

async function restoreSupabaseJsonBackup(file) {
  const client = getSupabase();
  const text = await file.text();
  const payload = JSON.parse(text);
  await resetSupabaseCompany();
  const companyId = requireCompanyId();
  const cleanRows = (rows = []) => rows.map(({ company_id, category_name, supplier_name, person_name, cost_center_name, gross_profit, status_label, overdue, created_by_name, ...row }) => ({
    ...row,
    company_id: companyId
  }));
  const inserts = [
    ["people", cleanRows(payload.people)],
    ["inventory_categories", cleanRows(payload.categories)],
    ["cost_centers", cleanRows(payload.costCenters)],
    ["inventory", cleanRows(payload.inventory)],
    ["finance", cleanRows(payload.finance)],
    ["sales", cleanRows(payload.sales)],
    ["sale_items", cleanRows(payload.saleItems)],
    ["cash_closures", cleanRows(payload.cashClosures)],
    ["historico_tentativas", cleanRows(payload.historicoTentativas)]
  ];
  for (const [table, rows] of inserts) {
    if (!rows.length) continue;
    const { error } = await client.from(table).insert(rows);
    if (error) throw error;
  }
}

async function handleSystemReset() {
  const confirmed = await confirmDialog(
    "Limpar sistema",
    "Isso vai apagar os dados atuais e voltar o sistema para a base inicial local. Deseja continuar?"
  );
  if (!confirmed) return;
  await api("/api/system/reset", { method: "POST" });
  if (useSupabase()) {
    await loadData();
    switchView("dashboard");
    showToast("Dados da empresa limpos com sucesso no Supabase.", "success");
    return;
  }
  clearSession();
  await bootAuth();
  showToast("Sistema limpo com sucesso. Configure o acesso inicial novamente.", "success");
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  const id = document.getElementById("category-id").value;
  const payload = {
    name: document.getElementById("category-name").value.trim(),
    description: document.getElementById("category-description").value.trim()
  };
  await api(id ? `/api/categories/${id}` : "/api/categories", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetCategoryForm();
  await loadData();
  showToast("Categoria salva com sucesso.", "success");
}

function resetCategoryForm() {
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value = "";
}

async function handleInventorySubmit(event) {
  event.preventDefault();
  const payload = {
    code: document.getElementById("inventory-code").value.trim(),
    category_id: document.getElementById("inventory-category").value || null,
    supplier_id: document.getElementById("inventory-supplier").value || null,
    name: document.getElementById("inventory-name").value.trim(),
    quantity: Number(document.getElementById("inventory-quantity").value || 0),
    cost: Number(document.getElementById("inventory-cost").value || 0),
    sale_price: Number(document.getElementById("inventory-sale-price").value || 0),
    minimum: Number(document.getElementById("inventory-minimum").value || 0)
  };
  const id = document.getElementById("inventory-id").value;
  await api(id ? `/api/inventory/${id}` : "/api/inventory", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  resetInventoryForm();
  await loadData();
  switchView("inventoryList");
  showToast("Produto salvo com sucesso.", "success");
}

function resetInventoryForm() {
  document.getElementById("inventory-form").reset();
  document.getElementById("inventory-id").value = "";
  document.getElementById("inventory-cost").value = "0";
  document.getElementById("inventory-sale-price").value = "0";
  document.getElementById("inventory-minimum").value = "0";
  document.getElementById("inventory-supplier").value = "";
}

async function handleInventoryImport() {
  const file = document.getElementById("inventory-file").files[0];
  if (!file) {
    showMessage("Entrada por planilha", "Selecione a planilha da nota para continuar.", "warning");
    return;
  }
  const data = new FormData();
  data.append("file", file);
  await api("/api/import/inventory", { method: "POST", body: data });
  document.getElementById("inventory-file").value = "";
  await loadData();
  switchView("inventoryList");
  showToast("Entrada por planilha concluida com sucesso.", "success");
}

async function handleClientsImport() {
  const file = document.getElementById("clients-file").files[0];
  if (!file) {
    showMessage("Clientes", "Selecione a planilha de clientes para continuar.", "warning");
    return;
  }
  const data = new FormData();
  data.append("file", file);
  const result = await api("/api/import/clients", { method: "POST", body: data });
  document.getElementById("clients-file").value = "";
  await loadData();
  switchView("clients");
  showToast(`${result.imported} cliente(s) importado(s) com sucesso.`, "success");
}

async function handleChangePasswordSubmit(event) {
  event.preventDefault();
  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;
  if (newPassword.length < 4) {
    showMessage("Senha", "A nova senha precisa ter pelo menos 4 caracteres.", "warning");
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage("Senha", "A confirmacao da senha nao confere.", "warning");
    return;
  }
  await api("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
  closeChangePasswordDialog();
  showToast("Senha alterada com sucesso.", "success");
}

async function refreshCashClosingSummary() {
  const date = document.getElementById("cash-closing-date").value || new Date().toISOString().slice(0, 10);
  const openingBalance = Number(document.getElementById("cash-opening-balance").value || 0);
  const query = `/api/cash-closures/summary?date=${encodeURIComponent(date)}&opening_balance=${encodeURIComponent(openingBalance)}`;
  const summary = await api(query);
  renderCashClosings(summary);
}

async function handleCashClosingSubmit(event) {
  event.preventDefault();
  const payload = {
    closure_date: document.getElementById("cash-closing-date").value,
    opening_balance: Number(document.getElementById("cash-opening-balance").value || 0),
    notes: document.getElementById("cash-closing-notes").value.trim()
  };
  await api("/api/cash-closures", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  document.getElementById("cash-closing-notes").value = "";
  await loadData();
  switchView("cashClosing");
  showToast("Fechamento de caixa registrado com sucesso.", "success");
}

async function handleReportExportExcel() {
  const config = state.currentReportConfig;
  if (!config) {
    showMessage("Relatorios", "Abra um relatorio antes de exportar.", "warning");
    return;
  }
  if (useSupabase()) {
    handleReportExportCsv();
    showToast("No modo Supabase, o relatorio foi exportado em CSV compativel com Excel.", "info");
    return;
  }
  const response = await fetch("/api/reports/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY) || ""}`
    },
    body: JSON.stringify({
      reportName: config.title,
      headers: config.headers,
      rows: config.rows.map((row) => row.map((item) => String(item ?? "")))
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Falha ao exportar o relatorio." }));
    throw new Error(payload.error || "Falha ao exportar o relatorio.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${config.title.replace(/[^\w\-]+/g, "_")}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Relatorio exportado em Excel com sucesso.", "success");
}

function handleReportExportCsv() {
  const config = state.currentReportConfig;
  if (!config) {
    showMessage("Relatorios", "Abra um relatorio antes de exportar.", "warning");
    return;
  }
  const csvRows = [config.headers, ...config.rows].map((row) =>
    row.map((item) => `"${String(item ?? "").replace(/"/g, '""')}"`).join(";")
  );
  const blob = new Blob([`\uFEFF${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${config.title.replace(/[^\w\-]+/g, "_")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Relatorio exportado em CSV com sucesso.", "success");
}

function handleReportExportPdf() {
  const config = state.currentReportConfig;
  if (!config) {
    showMessage("Relatorios", "Abra um relatorio antes de exportar.", "warning");
    return;
  }
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) {
    showMessage("Relatorios", "O navegador bloqueou a janela de impressao.", "warning");
    return;
  }
  const period = `${dom.reportsDateFrom.value ? formatDate(dom.reportsDateFrom.value) : "Inicio"} ate ${dom.reportsDateTo.value ? formatDate(dom.reportsDateTo.value) : "Hoje"}`;
  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(config.title)}</title>
        <style>
          body { font-family: "Segoe UI", Tahoma, sans-serif; padding: 24px; color: #203040; }
          h1, h2, h3, p { margin: 0; }
          .meta { margin: 12px 0 20px; color: #5f7285; }
          .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
          .card { border: 1px solid #d8e1e8; border-radius: 14px; padding: 12px; }
          .card span { display: block; color: #6e7f90; margin-bottom: 6px; }
          .card strong { font-size: 18px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d8e1e8; padding: 10px; text-align: left; }
          th { background: #eef3f7; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(config.title)}</h1>
        <div class="meta">Periodo: ${escapeHtml(period)}</div>
        <div class="grid">
          ${config.highlights.map((item) => `<div class="card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join("")}
        </div>
        <div class="grid">
          ${config.insights.map((item) => `<div class="card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join("")}
        </div>
        ${makeTable(config.headers, config.rows)}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  showToast("Relatorio preparado para exportar em PDF.", "success");
}

async function handleAuditCleanup() {
  if (state.currentView !== "reportsAudit") return;
  const selected = dom.auditCleanupDays.value || "30";
  const label = dom.auditCleanupDays.options[dom.auditCleanupDays.selectedIndex]?.text || "periodo selecionado";
  const confirmed = await confirmDialog(
    "Limpar auditoria",
    `Deseja apagar os registros de auditoria do periodo "${label}"?`
  );
  if (!confirmed) return;
  const result = await api("/api/audit/cleanup", {
    method: "POST",
    body: JSON.stringify({ days: selected })
  });
  await loadData();
  switchView("reportsAudit");
  showToast(`${result.deleted} registro(s) de auditoria removido(s).`, "success");
}

async function handleSystemPlanSave() {
  if (!canManagePlan()) return;
  const nextPlan = dom.systemPlan.value || "completo";
  const nextCompanyName = dom.systemCompanyName.value.trim() || "Sistema Exclusividade";
  if (nextPlan === (state.settings?.plan || "completo") && nextCompanyName === (state.settings?.companyName || "Sistema Exclusividade")) {
    showToast("As configuracoes selecionadas ja estao ativas.", "info");
    return;
  }
  const confirmed = await confirmDialog(
    "Aplicar plano do sistema",
    `Deseja mudar o sistema para ${planLabel(nextPlan)}? Os dados permanecem na mesma base, apenas os modulos liberados mudam.`
  );
  if (!confirmed) {
    dom.systemPlan.value = state.settings?.plan || "completo";
    return;
  }
  await api("/api/system/settings", {
    method: "PUT",
    body: JSON.stringify({ plan: nextPlan, company_name: nextCompanyName })
  });
  await loadData();
  switchView("dashboard");
  showToast(`Sistema ajustado para ${planLabel(nextPlan)}.`, "success");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (useSupabase()) {
    const client = getSupabase();
    const email = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || "Falha ao entrar no sistema.");
    await loadSupabaseSessionContext();
    hideAuthOverlay();
    await loadData();
    switchView("dashboard");
    showToast("Sessao iniciada com sucesso.", "success");
    return;
  }
  const payload = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: document.getElementById("login-username").value.trim(),
      password: document.getElementById("login-password").value
    })
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao entrar no sistema.");
    return data;
  });
  storeSession(payload.token, payload.user);
  hideAuthOverlay();
  await loadData();
  switchView("dashboard");
  showToast("Sessao iniciada com sucesso.", "success");
}

async function handleSetupSubmit(event) {
  event.preventDefault();
  if (useSupabase()) {
    const client = getSupabase();
    const name = document.getElementById("setup-name").value.trim();
    const email = document.getElementById("setup-username").value.trim();
    const password = document.getElementById("setup-password").value;
    const { error: signUpError } = await client.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });
    if (signUpError) throw new Error(signUpError.message || "Falha ao criar o acesso inicial.");
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(signInError.message || "A conta foi criada. Confirme o email no Supabase e entre novamente.");
    const { error: rpcError } = await client.rpc("create_company_for_current_user", {
      company_name: "Sistema Exclusividade",
      member_name: name || email
    });
    if (rpcError) throw new Error(rpcError.message || "Falha ao criar empresa no Supabase.");
    await loadSupabaseSessionContext();
    hideAuthOverlay();
    await loadData();
    switchView("dashboard");
    showToast("Acesso inicial criado com sucesso.", "success");
    return;
  }
  const payload = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("setup-name").value.trim(),
      username: document.getElementById("setup-username").value.trim(),
      password: document.getElementById("setup-password").value
    })
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao criar o acesso inicial.");
    return data;
  });
  storeSession(payload.token, payload.user);
  hideAuthOverlay();
  await loadData();
  switchView("dashboard");
  showToast("Acesso inicial criado com sucesso.", "success");
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (_error) {
    // Ignora falhas de logout remoto para limpar a sessao local.
  }
  clearSession();
  await bootAuth();
}

function addPdvItem() {
  const productId = document.getElementById("pdv-product").value || "";
  const quantity = Number(document.getElementById("pdv-quantity").value || 1);
  const product = state.inventory.find((item) => sameId(item.id, productId));
  if (!product) {
    showMessage("PDV", "Selecione um produto para incluir no PDV.", "warning");
    return;
  }
  if (quantity <= 0) {
    showMessage("PDV", "A quantidade precisa ser maior que zero.", "warning");
    return;
  }
  if (quantity > Number(product.quantity)) {
    showMessage("PDV", "A quantidade informada e maior que o estoque disponivel.", "warning");
    return;
  }
  state.pdvCart.push({
    inventory_id: product.id,
    code: product.code || "",
    name: product.name,
    quantity,
    unit_price: Number(product.sale_price || 0),
    total: Number(product.sale_price || 0) * quantity
  });
  state.pdvSelectedIndex = state.pdvCart.length - 1;
  document.getElementById("pdv-search").value = "";
  state.pdvSearch = "";
  document.getElementById("pdv-product").value = "";
  dom.pdvStock.value = "";
  dom.pdvUnitValue.value = "";
  document.getElementById("pdv-quantity").value = "1";
  renderPdv();
  focusPdvSearch();
}

function removeSelectedPdvItem() {
  if (state.pdvSelectedIndex < 0 || state.pdvSelectedIndex >= state.pdvCart.length) {
    showMessage("PDV", "Selecione um item da grade para excluir.", "warning");
    return;
  }
  state.pdvCart.splice(state.pdvSelectedIndex, 1);
  state.pdvSelectedIndex = Math.min(state.pdvSelectedIndex, state.pdvCart.length - 1);
  renderPdv();
  focusPdvSearch();
}

async function finishPdvSale() {
  if (!state.pdvCart.length) {
    showMessage("PDV", "Adicione itens ao PDV antes de finalizar.", "warning");
    return;
  }
  const method = document.getElementById("pdv-method").value;
  const clientId = document.getElementById("pdv-client").value || null;
  const isCrediario = method === "crediario";
  const dueDate = document.getElementById("pdv-due-date").value || (isCrediario ? addMonthsToDate(dom.pdvSaleDate.value, 1) : dom.pdvSaleDate.value);
  if (isCrediario && !clientId) {
    showMessage("Crediario", "Selecione um cliente para lancar a venda no crediario.", "warning");
    return;
  }
  const discount = Number(document.getElementById("pdv-discount").value || 0);
  const subtotal = state.pdvCart.reduce((sum, item) => sum + Number(item.total || 0), 0);
  if (discount < 0) {
    showMessage("PDV", "O desconto nao pode ser negativo.", "warning");
    return;
  }
  if (discount > subtotal) {
    showMessage("PDV", "O desconto nao pode ser maior que o subtotal da venda.", "warning");
    return;
  }
  await api("/api/pdv/sale", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      payment_status: isCrediario ? "aberto" : "pago",
      payment_method: method,
      sale_date: dom.pdvSaleDate.value || new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      installments: Number(document.getElementById("pdv-installments").value || 1),
      discount_value: discount,
      items: state.pdvCart
    })
  });
  resetPdvSale();
  await loadData();
  renderPdv();
  showToast("Venda finalizada com sucesso.", "success");
  focusPdvSearch();
}

function resetPdvSale() {
  state.pdvCart = [];
  state.pdvSelectedIndex = -1;
  state.pdvSearch = "";
  document.getElementById("pdv-search").value = "";
  document.getElementById("pdv-product").value = "";
  document.getElementById("pdv-quantity").value = "1";
  document.getElementById("pdv-discount").value = "0";
  document.getElementById("pdv-document-number").value = "";
  document.getElementById("pdv-notes").value = "";
  document.getElementById("pdv-installments").value = "1";
  document.getElementById("pdv-method").value = "dinheiro";
  document.getElementById("pdv-due-date").value = "";
  dom.pdvStock.value = "";
  dom.pdvUnitValue.value = "";
  syncPdvCreditSale(true);
  renderPdv();
}

function printPdvReceipt() {
  if (!state.pdvCart.length) {
    showMessage("Impressao", "Adicione itens ao PDV para imprimir o cupom.", "warning");
    return;
  }

  const clientName = dom.pdvClient.options[dom.pdvClient.selectedIndex]?.text || "Consumidor final";
  const paymentMethod = document.getElementById("pdv-method").options[document.getElementById("pdv-method").selectedIndex]?.text || "-";
  const subtotal = state.pdvCart.reduce((sum, item) => sum + Number(item.total), 0);
  const discount = Number(document.getElementById("pdv-discount").value || 0);
  const total = Math.max(0, subtotal - discount);
  const content = `
    <html>
      <head>
        <title>Cupom PDV</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: "Courier New", monospace; padding: 16px; color: #111; width: 320px; margin: 0 auto; }
          .receipt { border: 1px dashed #222; padding: 16px; }
          h1 { margin: 0; font-size: 18px; text-align: center; letter-spacing: 0.06em; }
          .sub { margin: 4px 0 12px; text-align: center; font-size: 12px; }
          .meta { font-size: 12px; line-height: 1.55; margin-bottom: 12px; }
          .divider { border-top: 1px dashed #222; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 4px 0; text-align: left; vertical-align: top; }
          th:last-child, td:last-child { text-align: right; }
          .item-code { color: #555; font-size: 11px; }
          .totals { margin-top: 10px; font-size: 12px; }
          .totals-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .totals-row.grand { font-size: 15px; font-weight: 700; margin-top: 6px; }
          .footer { margin-top: 14px; text-align: center; font-size: 11px; line-height: 1.5; }
          @media print {
            body { width: auto; padding: 0; }
            .receipt { border: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h1>CUPOM NAO FISCAL</h1>
          <div class="sub">Sistema Exclusividade</div>
          <div class="meta">
            <div>Data: ${new Date().toLocaleString("pt-BR")}</div>
            <div>Cliente: ${clientName}</div>
            <div>Pagamento: ${paymentMethod}</div>
          </div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr><th>Item</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${state.pdvCart.map((item) => `
                <tr>
                  <td>
                    <div>${item.name}</div>
                    <div class="item-code">${item.code ? `Cod: ${item.code} | ` : ""}${item.quantity} x ${currency.format(item.unit_price)}</div>
                  </td>
                  <td>${currency.format(item.total)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <div class="divider"></div>
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><span>${currency.format(subtotal)}</span></div>
            <div class="totals-row"><span>Desconto</span><span>${currency.format(discount)}</span></div>
            <div class="totals-row grand"><span>Total</span><span>${currency.format(total)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="footer">
            Obrigado pela preferencia<br />
            Este comprovante foi gerado pelo PDV local
          </div>
        </div>
      </body>
    </html>
  `;

  const receiptWindow = window.open("", "_blank", "width=720,height=800");
  if (!receiptWindow) {
    showMessage("Impressao", "O navegador bloqueou a janela de impressao.", "warning");
    return;
  }
  receiptWindow.document.write(content);
  receiptWindow.document.close();
  receiptWindow.focus();
  receiptWindow.print();
}

function dashboardIcon(type) {
  const icons = {
    people: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4ZM8 14c-.29 0-.62.02-.97.05C5.08 14.22 2 15.1 2 18v2h6v-2c0-1.24.48-2.27 1.28-3.08A6.72 6.72 0 0 0 8 14Z"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h12v3H5v10h14v-4h2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm14 2h4v6h-4a3 3 0 0 1 0-6Zm1 3a1 1 0 1 0 1-1 1 1 0 0 0-1 1Z"/></svg>`,
    bill: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Zm3 5h6v2H9Zm0 4h6v2H9Zm0 4h4v2H9Z"/></svg>`,
    box: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Zm9 .8L6.2 11.1v5.5L12 19.4l5.8-2.8v-5.5Z"/></svg>`,
    card: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm2 0v2h14V6Zm0 6v6h14v-6Zm2 3h4v2H7Z"/></svg>`,
    cart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4H3v2h2l2.6 9.6A2 2 0 0 0 9.5 17H18v-2H9.5l-.3-1H18a2 2 0 0 0 1.9-1.4L22 6H8.1Zm3 15a2 2 0 1 0 2 2 2 2 0 0 0-2-2Zm8 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z"/></svg>`
  };
  return icons[type] || "";
}

window.removePdvItem = function removePdvItem(index) {
  state.pdvCart.splice(index, 1);
  state.pdvSelectedIndex = Math.min(index, state.pdvCart.length - 1);
  renderPdv();
};

window.selectPdvItem = function selectPdvItem(index) {
  state.pdvSelectedIndex = index;
  renderPdv();
};

window.goToAlert = function goToAlert(view) {
  const allowedViews = allowedViewsForRole(state.sessionUser?.role || "");
  if (!allowedViews.has(view) && view !== "dashboard") {
    showMessage("Permissao", "Seu perfil nao tem acesso direto a esse alerta.", "warning");
    return;
  }
  switchView(view || "dashboard");
};

window.editPerson = function editPerson(id) {
  const person = state.people.find((item) => sameId(item.id, id));
  if (!person) return;
  switchView(viewByPersonType(person.type));
  document.getElementById("person-id").value = person.id;
  document.getElementById("person-name").value = person.name;
  document.getElementById("person-document").value = formatDocument(person.document || "");
  document.getElementById("person-phone").value = formatPhone(person.phone || "");
  document.getElementById("person-email").value = person.email || "";
  document.getElementById("person-username").value = person.username || "";
  document.getElementById("person-password").value = "";
  document.getElementById("person-role").value = person.role || "administrador";
  document.getElementById("person-active").value = String(Number(person.active ?? 1));
  document.getElementById("person-credit").value = person.manual_credit ?? person.credit ?? 0;
  document.getElementById("person-status").value = person.status || "Lead";
  document.getElementById("person-size").value = person.preferred_size || "";
  document.getElementById("person-number").value = person.preferred_number || "";
  document.getElementById("person-notes").value = person.notes || "";
  if (person.type === "clientes") openClientHistoryPanel(person.id);
};

window.openClientHistory = function openClientHistory(id) {
  const person = state.people.find((item) => sameId(item.id, id));
  if (!person) return;
  switchView("clients");
  openClientHistoryPanel(person.id);
};

window.deletePerson = async function deletePerson(id) {
  if (!(await confirmDialog("Excluir cadastro", "Deseja excluir este cadastro?"))) return;
  await api(`/api/people/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Cadastro excluido com sucesso.", "success");
};

window.editFinance = function editFinance(id) {
  const entry = state.finance.find((item) => sameId(item.id, id));
  if (!entry) return;
  switchView(viewByFinanceType(entry.type));
  document.getElementById("finance-id").value = entry.id;
  document.getElementById("finance-description").value = entry.description;
  document.getElementById("finance-person").value = entry.person_id || "";
  document.getElementById("finance-cost-center").value = entry.cost_center_id || "";
  document.getElementById("finance-amount").value = entry.amount;
  document.getElementById("finance-date").value = entry.due_date;
  document.getElementById("finance-status").value = entry.status;
  document.getElementById("finance-installments").value = entry.installment_total || 1;
};

window.openFinancePayment = function openFinancePaymentAction(id) {
  openPaymentDialog(id);
};

window.editCreditLimit = function editCreditLimit(id) {
  switchView("creditLimits");
  dom.creditClient.value = String(id);
  syncCreditLimitForm();
};

window.deleteFinance = async function deleteFinance(id) {
  if (!(await confirmDialog("Excluir lancamento", "Deseja excluir este lancamento?"))) return;
  await api(`/api/finance/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Lancamento excluido com sucesso.", "success");
};

window.deleteSale = async function deleteSale(id) {
  if (!(await confirmDialog("Excluir venda", "Deseja excluir esta venda? O estoque sera devolvido e o financeiro sera recalculado."))) return;
  await api(`/api/sales/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Venda excluida com sucesso.", "success");
};

window.editCostCenter = function editCostCenter(id) {
  const center = state.costCenters.find((item) => sameId(item.id, id));
  if (!center) return;
  switchView("costCenters");
  document.getElementById("cost-center-id").value = center.id;
  document.getElementById("cost-center-name").value = center.name;
  document.getElementById("cost-center-description").value = center.description || "";
};

window.deleteCostCenter = async function deleteCostCenter(id) {
  if (!(await confirmDialog("Excluir centro", "Deseja excluir este centro de custo?"))) return;
  await api(`/api/cost-centers/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Centro de custo excluido com sucesso.", "success");
};

window.editCategory = function editCategory(id) {
  const category = state.categories.find((item) => sameId(item.id, id));
  if (!category) return;
  switchView("inventoryCategories");
  document.getElementById("category-id").value = category.id;
  document.getElementById("category-name").value = category.name;
  document.getElementById("category-description").value = category.description || "";
};

window.deleteCategory = async function deleteCategory(id) {
  if (!(await confirmDialog("Excluir categoria", "Deseja excluir esta categoria?"))) return;
  await api(`/api/categories/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Categoria excluida com sucesso.", "success");
};

window.editInventory = function editInventory(id) {
  const item = state.inventory.find((entry) => sameId(entry.id, id));
  if (!item) return;
  switchView("inventoryProducts");
  document.getElementById("inventory-id").value = item.id;
  document.getElementById("inventory-code").value = item.code || "";
  document.getElementById("inventory-category").value = item.category_id || "";
  document.getElementById("inventory-supplier").value = item.supplier_id || "";
  document.getElementById("inventory-name").value = item.name;
  document.getElementById("inventory-quantity").value = item.quantity;
  document.getElementById("inventory-cost").value = item.cost;
  document.getElementById("inventory-sale-price").value = item.sale_price;
  document.getElementById("inventory-minimum").value = item.minimum;
};

window.deleteInventory = async function deleteInventory(id) {
  if (!(await confirmDialog("Excluir produto", "Deseja excluir este produto?"))) return;
  await api(`/api/inventory/${id}`, { method: "DELETE" });
  await loadData();
  showToast("Produto excluido com sucesso.", "success");
};

function viewByPersonType(type) {
  return {
    clientes: "clients",
    funcionarios: "employees",
    usuarios: "users",
    fornecedores: "suppliers"
  }[type];
}

function viewByFinanceType(type) {
  return {
    receber: "receivable",
    pagar: "payable"
  }[type];
}

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  const message = event.reason?.message || "Ocorreu um erro ao processar a operacao.";
  showMessage("Atencao", message, "danger");
});

bootAuth()
  .then(async (authenticated) => {
    if (!authenticated) return;
    await loadData();
    switchView("dashboard");
    document.body.classList.add("app-ready");
  })
  .catch((error) => {
    const title = useSupabase() ? "Supabase" : "Servidor local";
    const helper = useSupabase()
      ? "Verifique a URL, a anon key e se o SQL foi executado no painel do Supabase."
      : "Verifique se o servidor local foi iniciado.";
    showMessage(title, `${error.message} ${helper}`, "danger");
    document.body.classList.add("app-ready");
  });

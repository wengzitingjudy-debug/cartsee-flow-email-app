const EXCHANGE_RATES = {
  US: 7.17,
  Global: 7.17,
  JP: 0.05,
  DE: 8.34,
  AU: 9.7,
  UK: 4.68,
  CA: 4.93,
  EU: 7.59,
};

const SITE_ORDER = ["US", "EU", "DE", "AU", "UK", "JP", "CA", "Global"];

const REQUIRED_COLUMNS = [
  "营销流程名称",
  "FLOW ID",
  "统计周期",
  "策略器id",
  "策略器名称",
  "策略器类型",
  "已发送数",
  "送达数",
  "打开数",
  "点击数",
  "CartSee订单数",
  "CartSee销售额",
  "退订数",
  "source_file",
];

const state = {
  batches: [],
  selectedFlowKey: null,
  selectedEmailKey: null,
  selectedMonth: null,
  memoryStore: [],
};

const els = {
  fileInput: document.getElementById("fileInput"),
  loadSample: document.getElementById("loadSample"),
  clearData: document.getElementById("clearData"),
  status: document.getElementById("status"),
  monthFilter: document.getElementById("monthFilter"),
  siteFilter: document.getElementById("siteFilter"),
  flowTypeFilter: document.getElementById("flowTypeFilter"),
  kpiStrip: document.getElementById("kpiStrip"),
  flowTable: document.getElementById("flowTable"),
  emailPanel: document.getElementById("emailPanel"),
  emailPanelTitle: document.getElementById("emailPanelTitle"),
  emailTable: document.getElementById("emailTable"),
  historyPanel: document.getElementById("historyPanel"),
  historyPanelTitle: document.getElementById("historyPanelTitle"),
  historyTable: document.getElementById("historyTable"),
  sitePanel: document.getElementById("sitePanel"),
  sitePanelTitle: document.getElementById("sitePanelTitle"),
  siteTable: document.getElementById("siteTable"),
};

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.className = tone;
}

function asNumber(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim().replaceAll(",", "").replace("%", "");
  if (!text || text === "/" || text === "-" || text.toLowerCase() === "nan") return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
}

function siteRank(site) {
  const rank = SITE_ORDER.findIndex((item) => item.toLowerCase() === String(site || "").toLowerCase());
  return rank === -1 ? SITE_ORDER.length : rank;
}

function canonicalFlowName(row) {
  return String(row?.flow || "");
}

function flowOrderRank(flow) {
  const text = String(flow || "").toLowerCase();
  if (text.includes("订阅") && text.includes("sms")) return 0.5;
  if (text.includes("订阅")) return 0;
  if (text.includes("注册")) return 1;
  if (text.includes("弃浏") || text.includes("浏览") || text.includes("browse")) return 2;
  if (text.includes("弃购") || text.includes("购物车") || text.includes("cart")) return 3;
  if (text.includes("弃单") || text.includes("checkout") || text.includes("结账")) return 4;
  if (text.includes("90天") || text.includes("90")) return 5;
  if (text.includes("winback")) return 6;
  return 999;
}

function emailSequenceRank(name) {
  const text = String(name || "");
  const cnMap = [
    ["第一", 1],
    ["第二", 2],
    ["第三", 3],
    ["第四", 4],
    ["第五", 5],
    ["第六", 6],
    ["第七", 7],
    ["第八", 8],
    ["第九", 9],
    ["第十", 10],
  ];
  for (const [mark, value] of cnMap) {
    if (text.includes(mark)) return value;
  }
  const emailMatch = text.match(/email\s*#?\s*(\d+)/i);
  if (emailMatch) return Number(emailMatch[1]);
  const numberMatch = text.match(/(?:^|[^0-9])(\d+)(?:封|$)/);
  if (numberMatch) return Number(numberMatch[1]);
  return 999;
}

function shortText(value, length = 42) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function fmtInt(value) {
  return Math.round(value || 0).toLocaleString("zh-CN");
}

function fmtMoney(value) {
  return Math.round(value || 0).toLocaleString("zh-CN");
}

function fmtRate(value) {
  return `${((value || 0) * 100).toFixed(2)}%`;
}

function fmtExchangeRate(value) {
  return value === null || value === undefined ? "混合" : Number(value).toFixed(2).replace(/\.00$/, "");
}

function siteFromSource(value) {
  const text = String(value || "");
  const sites = ["Global", "US", "JP", "DE", "AU", "UK", "CA", "EU"];
  return sites.find((site) => new RegExp(`(^|[^A-Za-z])${site}([^A-Za-z]|$)`, "i").test(text)) || "Unknown";
}

function monthFromPeriod(value) {
  const match = String(value || "").match(/(20\d{2})-(\d{2})-\d{2}/);
  return match ? `${match[1]}-${match[2]}` : "Unknown";
}

function classifyFlow(name) {
  const text = String(name || "").toLowerCase();
  if (["弃购", "购物车", "cart"].some((key) => text.includes(key))) return "弃购/购物车挽回";
  if (["弃单", "checkout", "结账"].some((key) => text.includes(key))) return "弃单/结账挽回";
  if (["弃浏", "browse", "浏览"].some((key) => text.includes(key))) return "弃浏/浏览召回";
  if (["winback", "未下单", "召回", "复购", "90天", "180"].some((key) => text.includes(key))) return "沉睡/复购召回";
  if (["订阅", "welcome", "注册", "新客", "新用户"].some((key) => text.includes(key))) return "订阅欢迎/新用户";
  return "其他";
}

function makeFlowKey(row) {
  return `${row.flowType}||${canonicalFlowName(row)}`;
}

function makeEmailKey(row) {
  return `${makeFlowKey(row)}||${row.strategyName || ""}`;
}

function normalizeRawRow(row, kind, sourceName) {
  const site = row.site || siteFromSource(row.source_file);
  const rate = EXCHANGE_RATES[site] || 1;
  const revenueOriginal = asNumber(row["CartSee销售额"] ?? row.revenueOriginal);
  const sent = asNumber(row["已发送数"] ?? row.sent);
  const delivered = asNumber(row["送达数"] ?? row.delivered);
  const opens = asNumber(row["打开数"] ?? row.opens);
  const clicks = asNumber(row["点击数"] ?? row.clicks);
  const orders = asNumber(row["CartSee订单数"] ?? row.orders);
  const unsubs = asNumber(row["退订数"] ?? row.unsubs);
  const flow = String(row["营销流程名称"] ?? row.flow ?? "").trim();
  const period = String(row["统计周期"] ?? row.period ?? "").trim();

  return {
    kind,
    sourceName,
    site,
    month: row.month || monthFromPeriod(period),
    flow,
    flowId: String(row["FLOW ID"] ?? row.flowId ?? "").trim(),
    flowType: row.flowType || classifyFlow(flow),
    status: String(row["流程状态"] ?? row.status ?? "").trim(),
    period,
    strategyId: String(row["策略器id"] ?? row.strategyId ?? "").trim(),
    strategyName: String(row["策略器名称"] ?? row.strategyName ?? "").trim(),
    strategyType: String(row["策略器类型"] ?? row.strategyType ?? "").trim(),
    subject: String(row["邮件标题"] ?? row.subject ?? "").trim(),
    sent,
    delivered,
    opens,
    clicks,
    orders,
    unsubs,
    revenueOriginal,
    revenueRmb: row.revenueRmb !== undefined ? asNumber(row.revenueRmb) : revenueOriginal * rate,
    exchangeRate: row.exchangeRate !== undefined ? asNumber(row.exchangeRate) : rate,
  };
}

function normalizePayload(payload, sourceName = "uploaded") {
  if (!payload) throw new Error("文件内容为空。");

  if (Array.isArray(payload)) {
    const missing = REQUIRED_COLUMNS.filter((column) => !Object.prototype.hasOwnProperty.call(payload[0] || {}, column));
    if (missing.length) throw new Error(`缺少必要列：${missing.join("、")}`);
    const flowRows = payload
      .filter((row) => String(row["策略器id"] || "").toLowerCase() === "sum")
      .map((row) => normalizeRawRow(row, "flow", sourceName));
    const emailRows = payload
      .filter((row) => String(row["策略器类型"] || "").toLowerCase() === "email" && String(row["策略器id"] || "").toLowerCase() !== "sum")
      .map((row) => normalizeRawRow(row, "email", sourceName));
    const smsRows = payload
      .filter((row) => String(row["策略器类型"] || "").toLowerCase() === "sms" && String(row["策略器id"] || "").toLowerCase() !== "sum")
      .map((row) => normalizeRawRow(row, "sms", sourceName));
    if (!flowRows.length || !emailRows.length) throw new Error("没有识别到 Flow 总行或 Email 明细行。");
    return buildBatch(flowRows, emailRows, smsRows, sourceName);
  }

  if (payload.flowRows && payload.emailRows) {
    const flowRows = payload.flowRows.map((row) => normalizeRawRow(row, "flow", sourceName));
    const emailRows = payload.emailRows.map((row) => normalizeRawRow(row, "email", sourceName));
    const smsRows = (payload.smsRows || []).map((row) => normalizeRawRow(row, "sms", sourceName));
    return buildBatch(flowRows, emailRows, smsRows, sourceName, payload.meta);
  }

  if (payload.batches && Array.isArray(payload.batches)) {
    return payload.batches[0];
  }

  throw new Error("暂不支持这个文件结构。请上传 Cartsee Flow Excel，或 dashboard_data.json。");
}

function buildBatch(flowRows, emailRows, smsRows = [], sourceName, meta = {}) {
  const months = unique([...flowRows, ...emailRows, ...smsRows].map((row) => row.month));
  const sites = unique([...flowRows, ...emailRows, ...smsRows].map((row) => row.site));
  const idSeed = `${sourceName}::${months.join(",")}::${sites.join(",")}`;
  return {
    id: encodeURIComponent(idSeed).slice(0, 180),
    sourceName,
    importedAt: new Date().toISOString(),
    months,
    sites,
    flowRows,
    emailRows,
    smsRows,
    meta,
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open("cartsee-flow-static-app", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("batches", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBatch(batch) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("batches", "readwrite");
      tx.objectStore("batches").put(batch);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    state.memoryStore = [batch, ...state.memoryStore.filter((item) => item.id !== batch.id)];
  }
}

async function loadBatches() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("batches", "readonly");
      const request = tx.objectStore("batches").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return state.memoryStore;
  }
}

async function clearBatches() {
  state.memoryStore = [];
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("batches", "readwrite");
      tx.objectStore("batches").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // In-memory fallback is already cleared.
  }
}

function allFlowRows() {
  return state.batches.flatMap((batch) => batch.flowRows || []);
}

function allEmailRows() {
  return state.batches.flatMap((batch) => batch.emailRows || []);
}

function allSmsRows() {
  return state.batches.flatMap((batch) => batch.smsRows || []);
}

function allMessageRows() {
  return [...allEmailRows(), ...allSmsRows()];
}

function filterRows(rows) {
  const month = els.monthFilter.value;
  const site = els.siteFilter.value;
  return rows.filter((row) => (
    (!month || row.month === month)
    && (!site || row.site === site)
  ));
}

function aggregateRows(rows) {
  const metric = rows.reduce((acc, row) => {
    acc.sent += asNumber(row.sent);
    acc.delivered += asNumber(row.delivered);
    acc.opens += asNumber(row.opens);
    acc.clicks += asNumber(row.clicks);
    acc.orders += asNumber(row.orders);
    acc.unsubs += asNumber(row.unsubs);
    acc.revenueOriginal += asNumber(row.revenueOriginal);
    acc.revenueRmb += asNumber(row.revenueRmb);
    acc.exchangeRates.add(asNumber(row.exchangeRate));
    return acc;
  }, {
    sent: 0,
    delivered: 0,
    opens: 0,
    clicks: 0,
    orders: 0,
    unsubs: 0,
    revenueOriginal: 0,
    revenueRmb: 0,
    exchangeRates: new Set(),
  });
  metric.openRate = metric.delivered ? metric.opens / metric.delivered : 0;
  metric.clickRate = metric.delivered ? metric.clicks / metric.delivered : 0;
  metric.ctor = metric.opens ? metric.clicks / metric.opens : 0;
  metric.conversionRate = metric.sent ? metric.orders / metric.sent : 0;
  metric.unsubscribeRate = metric.sent ? metric.unsubs / metric.sent : 0;
  metric.exchangeRate = metric.exchangeRates.size === 1 ? [...metric.exchangeRates][0] : null;
  delete metric.exchangeRates;
  return metric;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.entries()].map(([key, groupedRows]) => ({ key, rows: groupedRows, metrics: aggregateRows(groupedRows) }));
}

function getFlowSummaryRows() {
  const emailRows = filterRows(allEmailRows());
  const smsRows = filterRows(allSmsRows());
  return groupBy(filterRows(allFlowRows()), makeFlowKey)
    .map((group) => {
      const ref = group.rows[0] || {};
      const emailCount = groupBy(emailRows.filter((row) => makeFlowKey(row) === group.key), makeEmailKey).length;
      const smsCount = groupBy(smsRows.filter((row) => makeFlowKey(row) === group.key), (row) => `${row.strategyId}||${row.strategyName}`).length;
      return {
        key: group.key,
        flow: canonicalFlowName(ref),
        flowType: ref.flowType,
        monthCount: unique(group.rows.map((row) => row.month)).length,
        emailCount,
        smsCount,
        metrics: group.metrics,
      };
    })
    .sort((a, b) => (
      flowOrderRank(a.flow) - flowOrderRank(b.flow)
      || a.flow.localeCompare(b.flow, "zh-CN")
      || b.metrics.revenueRmb - a.metrics.revenueRmb
    ));
}

function getEmailRowsForFlow(flowKey) {
  return groupBy(filterRows(allMessageRows()).filter((row) => makeFlowKey(row) === flowKey), makeEmailKey)
    .map((group) => {
      const ref = group.rows[0] || {};
      const isSms = group.rows.some((row) => String(row.strategyType || row.kind || "").toLowerCase() === "sms");
      return {
        key: group.key,
        strategyName: ref.strategyName || "未命名邮件",
        subject: ref.subject,
        flow: canonicalFlowName(ref),
        isSms,
        monthCount: unique(group.rows.map((row) => row.month)).length,
        siteCount: unique(group.rows.map((row) => row.site)).length,
        metrics: group.metrics,
      };
    })
    .sort((a, b) => (
      emailSequenceRank(a.strategyName) - emailSequenceRank(b.strategyName)
      || a.strategyName.localeCompare(b.strategyName, "zh-CN")
      || b.metrics.revenueRmb - a.metrics.revenueRmb
    ));
}

function getEmailHistoryRows(emailKey) {
  return groupBy(filterRows(allMessageRows()).filter((row) => makeEmailKey(row) === emailKey), (row) => row.month)
    .map((group) => ({
      key: group.key,
      month: group.key,
      siteCount: unique(group.rows.map((row) => row.site)).length,
      metrics: group.metrics,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function getSiteRows(emailKey, month) {
  return groupBy(filterRows(allMessageRows()).filter((row) => makeEmailKey(row) === emailKey && row.month === month), (row) => row.site)
    .map((group) => ({
      key: group.key,
      site: group.key,
      subject: group.rows[0]?.subject || "",
      exchangeRate: group.rows[0]?.exchangeRate || EXCHANGE_RATES[group.key] || 1,
      metrics: group.metrics,
    }))
    .sort((a, b) => siteRank(a.site) - siteRank(b.site) || a.site.localeCompare(b.site));
}

function metricCells(metrics) {
  return `
    <td class="num">${fmtInt(metrics.sent)}</td>
    <td class="num">${fmtInt(metrics.opens)}</td>
    <td class="num">${fmtRate(metrics.openRate)}</td>
    <td class="num">${fmtInt(metrics.clicks)}</td>
    <td class="num">${fmtRate(metrics.clickRate)}</td>
    <td class="num">${fmtRate(metrics.ctor)}</td>
    <td class="num">${fmtInt(metrics.orders)}</td>
    <td class="num">${fmtMoney(metrics.revenueOriginal)}</td>
    <td class="num">${fmtExchangeRate(metrics.exchangeRate)}</td>
    <td class="num">${fmtMoney(metrics.revenueRmb)}</td>
    <td class="num">${fmtRate(metrics.conversionRate)}</td>
    <td class="num">${fmtRate(metrics.unsubscribeRate)}</td>
  `;
}

function tableHeader(extra = "") {
  return `
    <thead>
      <tr>
        ${extra}
        <th class="num">发送量</th>
        <th class="num">打开人数</th>
        <th class="num">打开率</th>
        <th class="num">点击人数</th>
        <th class="num">点击率</th>
        <th class="num">CTOR</th>
        <th class="num">订单数</th>
        <th class="num">原币种销售额</th>
        <th class="num">汇率</th>
        <th class="num">人民币销售额</th>
        <th class="num">转化率</th>
        <th class="num">退订率</th>
      </tr>
    </thead>
  `;
}

function siteMetricCells(metrics) {
  return `
    <td class="num">${fmtInt(metrics.sent)}</td>
    <td class="num">${fmtInt(metrics.opens)}</td>
    <td class="num">${fmtRate(metrics.openRate)}</td>
    <td class="num">${fmtInt(metrics.clicks)}</td>
    <td class="num">${fmtRate(metrics.clickRate)}</td>
    <td class="num">${fmtRate(metrics.ctor)}</td>
    <td class="num">${fmtInt(metrics.orders)}</td>
    <td class="num">${fmtRate(metrics.conversionRate)}</td>
    <td class="num">${fmtRate(metrics.unsubscribeRate)}</td>
    <td class="num">${fmtMoney(metrics.revenueOriginal)}</td>
    <td class="num">${fmtExchangeRate(metrics.exchangeRate)}</td>
    <td class="num">${fmtMoney(metrics.revenueRmb)}</td>
  `;
}

function siteTableHeader(extra = "") {
  return `
    <thead>
      <tr>
        ${extra}
        <th class="num">发送量</th>
        <th class="num">打开人数</th>
        <th class="num">打开率</th>
        <th class="num">点击人数</th>
        <th class="num">点击率</th>
        <th class="num">CTOR</th>
        <th class="num">订单数</th>
        <th class="num">转化率</th>
        <th class="num">退订率</th>
        <th class="num">原币种销售额</th>
        <th class="num">汇率</th>
        <th class="num">人民币销售额</th>
      </tr>
    </thead>
  `;
}

function renderKpis() {
  const metrics = aggregateRows(filterRows(allFlowRows()));
  const items = [
    ["发送量", fmtInt(metrics.sent)],
    ["打开率", fmtRate(metrics.openRate)],
    ["点击率", fmtRate(metrics.clickRate)],
    ["CTOR", fmtRate(metrics.ctor)],
    ["订单数", fmtInt(metrics.orders)],
    ["人民币销售额", fmtMoney(metrics.revenueRmb)],
  ];
  els.kpiStrip.innerHTML = items.map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderFilters() {
  const flows = allFlowRows();
  fillSelect(els.monthFilter, unique(flows.map((row) => row.month)), "全部月份");
  fillSelect(els.siteFilter, unique(flows.map((row) => row.site)).sort((a, b) => siteRank(a) - siteRank(b) || a.localeCompare(b)), "全部站点");
  els.flowTypeFilter.closest("label").hidden = true;
}

function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
  if (values.includes(current)) select.value = current;
}

function renderFlowTable() {
  const rows = getFlowSummaryRows();
  if (!rows.length) {
    els.flowTable.innerHTML = `<div class="empty">当前筛选下没有 Flow 数据。</div>`;
    return;
  }
  els.flowTable.innerHTML = `
    <table>
      ${tableHeader(`
        <th>Flow</th>
        <th class="num">月份数</th>
        <th class="num">邮件数</th>
        <th class="num">SMS数</th>
      `)}
      <tbody>
        ${rows.map((row) => `
          <tr class="clickable ${row.key === state.selectedFlowKey ? "selected" : ""}" data-flow-key="${escapeHtml(row.key)}">
            <td><div class="primary-cell full-text" title="${escapeHtml(row.flow)}">${escapeHtml(row.flow)}</div></td>
            <td class="num">${row.monthCount}</td>
            <td class="num">${row.emailCount}</td>
            <td class="num">${row.smsCount}</td>
            ${metricCells(row.metrics)}
          </tr>
          ${row.key === state.selectedFlowKey ? renderInlineEmailRows(row.key) : ""}
        `).join("")}
      </tbody>
    </table>
  `;
  els.flowTable.querySelectorAll("[data-flow-key]").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.selectedFlowKey = state.selectedFlowKey === tr.dataset.flowKey ? null : tr.dataset.flowKey;
      state.selectedEmailKey = null;
      state.selectedMonth = null;
      renderAll();
    });
  });
  els.flowTable.querySelectorAll("[data-email-key]").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedEmailKey = state.selectedEmailKey === tr.dataset.emailKey ? null : tr.dataset.emailKey;
      state.selectedMonth = null;
      renderAll();
    });
  });
  els.flowTable.querySelectorAll("[data-history-month]").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedMonth = state.selectedMonth === tr.dataset.historyMonth ? null : tr.dataset.historyMonth;
      renderAll();
    });
  });
}

function renderInlineEmailRows(flowKey) {
  const rows = getEmailRowsForFlow(flowKey);
  if (!rows.length) {
    return `<tr class="drill-row"><td colspan="16"><div class="inline-drill empty">这条 Flow 当前筛选下没有 Email 明细。</div></td></tr>`;
  }
  return `
    <tr class="drill-row">
      <td colspan="16">
        <div class="inline-drill">
          <div class="inline-title">邮件表现</div>
          <table class="nested-table">
            ${tableHeader(`
              <th>策略器名称</th>
              <th class="num">月份数</th>
              <th class="num">站点数</th>
            `)}
            <tbody>
              ${rows.map((row) => `
                <tr class="clickable nested-row ${row.key === state.selectedEmailKey ? "selected" : ""}" data-email-key="${escapeHtml(row.key)}">
                  <td><div class="primary-cell full-text strategy-name" title="${escapeHtml(row.strategyName)}">${escapeHtml(row.strategyName)}${row.isSms ? '<span class="sms-badge">SMS</span>' : ""}</div></td>
                  <td class="num">${row.monthCount}</td>
                  <td class="num">${row.siteCount}</td>
                  ${metricCells(row.metrics)}
                </tr>
                ${row.key === state.selectedEmailKey ? renderInlineHistoryRows(row.key) : ""}
              `).join("")}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function renderInlineHistoryRows(emailKey) {
  const rows = getEmailHistoryRows(emailKey);
  if (!rows.length) {
    return `<tr class="drill-row"><td colspan="15"><div class="inline-drill empty">当前筛选下没有这封邮件的历史数据。</div></td></tr>`;
  }
  return `
    <tr class="drill-row">
      <td colspan="15">
        <div class="inline-drill second-level">
          <div class="inline-title">单封邮件历史数据</div>
          <table class="nested-table">
            ${tableHeader(`
              <th>月份</th>
              <th class="num">站点数</th>
            `)}
            <tbody>
              ${rows.map((row) => `
                <tr class="clickable nested-row ${row.month === state.selectedMonth ? "selected" : ""}" data-history-month="${escapeHtml(row.month)}">
                  <td><div class="primary-cell">${escapeHtml(row.month)}</div></td>
                  <td class="num">${row.siteCount}</td>
                  ${metricCells(row.metrics)}
                </tr>
                ${row.month === state.selectedMonth ? renderInlineSiteRows(emailKey, row.month) : ""}
              `).join("")}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function renderInlineSiteRows(emailKey, month) {
  const rows = getSiteRows(emailKey, month);
  if (!rows.length) {
    return `<tr class="drill-row"><td colspan="14"><div class="inline-drill empty">这个月份下没有站点数据。</div></td></tr>`;
  }
  return `
    <tr class="drill-row">
      <td colspan="14">
        <div class="inline-drill third-level">
          <div class="inline-title">${escapeHtml(month)} 国家 / 站点表现</div>
          <table class="nested-table site-breakdown-table">
            ${siteTableHeader(`
              <th>站点</th>
            `)}
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td><div class="primary-cell">${escapeHtml(row.site)}</div></td>
                  ${siteMetricCells(row.metrics)}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function renderEmailTable() {
  if (!state.selectedFlowKey) {
    els.emailPanel.hidden = true;
    return;
  }
  const rows = getEmailRowsForFlow(state.selectedFlowKey);
  els.emailPanel.hidden = false;
  els.emailPanelTitle.textContent = `${state.selectedFlowKey.split("||")[1]}：邮件下钻`;
  if (!rows.length) {
    els.emailTable.innerHTML = `<div class="empty">这条 Flow 当前筛选下没有 Email 明细。</div>`;
    return;
  }
  els.emailTable.innerHTML = `
    <table>
      ${tableHeader(`
        <th>邮件</th>
        <th>主题</th>
        <th class="num">月份数</th>
        <th class="num">站点数</th>
      `)}
      <tbody>
        ${rows.map((row) => `
          <tr class="clickable ${row.key === state.selectedEmailKey ? "selected" : ""}" data-email-key="${escapeHtml(row.key)}">
            <td><div class="primary-cell full-text strategy-name" title="${escapeHtml(row.strategyName)}">${escapeHtml(row.strategyName)}${row.isSms ? '<span class="sms-badge">SMS</span>' : ""}</div></td>
            <td><div class="subject-text" title="${escapeHtml(row.subject)}">${escapeHtml(row.subject)}</div></td>
            <td class="num">${row.monthCount}</td>
            <td class="num">${row.siteCount}</td>
            ${metricCells(row.metrics)}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  els.emailTable.querySelectorAll("[data-email-key]").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.selectedEmailKey = tr.dataset.emailKey;
      state.selectedMonth = null;
      renderAll();
      els.historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderHistoryTable() {
  if (!state.selectedEmailKey) {
    els.historyPanel.hidden = true;
    return;
  }
  const rows = getEmailHistoryRows(state.selectedEmailKey);
  els.historyPanel.hidden = false;
  els.historyPanelTitle.textContent = "单封邮件历史数据";
  if (!rows.length) {
    els.historyTable.innerHTML = `<div class="empty">当前筛选下没有这封邮件的历史数据。</div>`;
    return;
  }
  els.historyTable.innerHTML = `
    <table>
      ${tableHeader(`
        <th>月份</th>
        <th class="num">站点数</th>
      `)}
      <tbody>
        ${rows.map((row) => `
          <tr class="clickable ${row.month === state.selectedMonth ? "selected" : ""}" data-month="${escapeHtml(row.month)}">
            <td><div class="primary-cell">${escapeHtml(row.month)}</div></td>
            <td class="num">${row.siteCount}</td>
            ${metricCells(row.metrics)}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  els.historyTable.querySelectorAll("[data-month]").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.selectedMonth = tr.dataset.month;
      renderAll();
      els.sitePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderSiteTable() {
  if (!state.selectedEmailKey || !state.selectedMonth) {
    els.sitePanel.hidden = true;
    return;
  }
  const rows = getSiteRows(state.selectedEmailKey, state.selectedMonth);
  els.sitePanel.hidden = false;
  els.sitePanelTitle.textContent = `${state.selectedMonth} 国家 / 站点下钻`;
  if (!rows.length) {
    els.siteTable.innerHTML = `<div class="empty">这个月份下没有站点数据。</div>`;
    return;
  }
  els.siteTable.innerHTML = `
    <table>
      ${tableHeader(`
        <th>站点</th>
        <th class="num">汇率</th>
      `)}
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><div class="primary-cell">${escapeHtml(row.site)}</div></td>
            <td class="num">${row.exchangeRate}</td>
            ${metricCells(row.metrics)}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderAll() {
  renderKpis();
  renderFlowTable();
  els.emailPanel.hidden = true;
  els.historyPanel.hidden = true;
  els.sitePanel.hidden = true;
}

async function applyBatch(batch, save = true) {
  if (save) await saveBatch(batch);
  state.batches = await loadBatches();
  renderFilters();
  state.selectedFlowKey = null;
  state.selectedEmailKey = null;
  state.selectedMonth = null;
  renderAll();
  const totals = aggregateRows(filterRows(allFlowRows()));
  setStatus(`已载入 ${state.batches.length} 个上传批次，当前筛选发送量 ${fmtInt(totals.sent)}，人民币销售额 ${fmtMoney(totals.revenueRmb)}。`);
}

async function loadSampleData() {
  const response = await fetch("./sample-data.json");
  if (!response.ok) {
    throw new Error("线上版本未包含示例数据，请上传 Cartsee Flow Excel/JSON 使用。");
  }
  const payload = await response.json();
  const batch = normalizePayload(payload, "2026-05 示例数据");
  await applyBatch(batch, true);
}

async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

async function readExcelFile(file) {
  if (!window.XLSX) {
    throw new Error("Excel 解析库未加载。请确认网络可访问 jsDelivr，或先上传 dashboard_data.json。");
  }
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames.includes("MergedData") ? "MergedData" : workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}

async function handleUpload(file) {
  if (!file) return;
  try {
    setStatus(`正在读取 ${file.name}...`);
    const lower = file.name.toLowerCase();
    const payload = lower.endsWith(".json") ? await readJsonFile(file) : await readExcelFile(file);
    const batch = normalizePayload(payload, file.name);
    await applyBatch(batch, true);
  } catch (error) {
    setStatus(error.message || "数据读取失败。", "error");
  }
}

async function init() {
  state.batches = await loadBatches();
  if (!state.batches.length) {
    try {
      await loadSampleData();
    } catch (error) {
      renderFilters();
      renderAll();
      setStatus(error.message || "请上传 Cartsee Flow Excel/JSON 使用。");
    }
  } else {
    renderFilters();
    state.selectedFlowKey = null;
    state.selectedEmailKey = null;
    state.selectedMonth = null;
    renderAll();
    setStatus(`已恢复 ${state.batches.length} 个本地上传批次。`);
  }
}

els.fileInput.addEventListener("change", () => handleUpload(els.fileInput.files?.[0]));
els.loadSample.addEventListener("click", loadSampleData);
els.clearData.addEventListener("click", async () => {
  await clearBatches();
  state.batches = [];
  state.selectedFlowKey = null;
  state.selectedEmailKey = null;
  state.selectedMonth = null;
  renderFilters();
  renderAll();
  setStatus("本地数据已清空。可重新上传数据或载入示例。");
});

[els.monthFilter, els.siteFilter, els.flowTypeFilter].forEach((select) => {
  select.addEventListener("change", () => {
    state.selectedFlowKey = null;
    state.selectedEmailKey = null;
    state.selectedMonth = null;
    renderAll();
  });
});

init();

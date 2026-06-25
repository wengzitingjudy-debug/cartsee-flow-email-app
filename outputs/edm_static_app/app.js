(function () {
  const state = {
    rows: [],
    market: "all",
    selectedType: null,
    selectedMonths: [],
    selectedCampaignKeys: [],
    overviewMonth: "all",
    overviewSite: "all",
    overviewType: "all",
    workbook: null,
    fileName: null,
  };

  const els = {
    fileInput: document.getElementById("fileInput"),
    sheetSelect: document.getElementById("sheetSelect"),
    loadSample: document.getElementById("loadSample"),
    status: document.getElementById("status"),
    overviewMonth: document.getElementById("overviewMonth"),
    overviewSite: document.getElementById("overviewSite"),
    overviewType: document.getElementById("overviewType"),
    overviewCards: document.getElementById("overviewCards"),
    typeTable: document.getElementById("typeTable"),
  };

  function cleanHeader(value) {
    return String(value == null ? "" : value).trim().replace("\ufeff", "").replace(/，/g, "");
  }

  function findField(row, candidates) {
    const keys = Object.keys(row || {});
    const normalized = new Map(keys.map((key) => [cleanHeader(key).toLowerCase(), key]));
    for (const candidate of candidates) {
      const key = normalized.get(cleanHeader(candidate).toLowerCase());
      if (key) return key;
    }
    return keys.find((key) => candidates.some((candidate) => cleanHeader(key).toLowerCase().includes(cleanHeader(candidate).toLowerCase())));
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const number = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function dateToParts(value) {
    let date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()) && typeof value === "number") {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      date = new Date(excelEpoch.getTime() + value * 86400000);
    }
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return { date: `${year}-${month}-${day}`, month: `${year}-${month}` };
  }

  function campaignBase(sourceName) {
    return String(sourceName == null ? "" : sourceName).trim().replace(/_(US|UK|DE|EU|AU|JP|CA|Global)$/i, "");
  }

  function siteCode(companyName) {
    const text = String(companyName == null ? "" : companyName);
    for (const code of ["US", "UK", "DE", "EU", "AU", "JP", "CA"]) {
      if (new RegExp(`(^|[-\\s])${code}($|[-\\s])`, "i").test(text)) return code;
    }
    if (/Global/i.test(text)) return "GLOBAL";
    return text.replace(/SmallRig/gi, "").replace(/^[-\s]+|[-\s]+$/g, "") || "Other";
  }

  function marketTier(site) {
    return ["US", "UK", "DE", "EU", "AU", "CA", "GLOBAL"].includes(site) ? "Core" : "Non-core";
  }

  const SITE_ORDER = ["US", "EU", "DE", "AU", "UK", "JP", "GLOBAL", "CA"];

  const EXCHANGE_RATES_TO_CNY = {
    US: 7.17,
    GLOBAL: 7.17,
    JP: 0.05,
    DE: 8.34,
    AU: 9.7,
    UK: 4.68,
    CA: 4.93,
    EU: 7.59,
  };

  function exchangeRateForSite(site) {
    return EXCHANGE_RATES_TO_CNY[site] || 1;
  }

  function siteSortValue(site) {
    const index = SITE_ORDER.indexOf(site);
    return index >= 0 ? index : SITE_ORDER.length;
  }

  function normalizeRows(rawRows) {
    return rawRows.flatMap((raw) => {
      const typeField = findField(raw, ["type"]);
      if (typeField && String(raw[typeField]).toLowerCase() !== "email") return [];

      const dateField = findField(raw, ["发送时间", "send date", "date"]);
      const contentField = findField(raw, ["邮件内容类型", "email type", "content type"]);
      const sourceField = findField(raw, ["source_name", "campaign", "campaign name"]);
      const companyField = findField(raw, ["company_name", "site", "站点", "国家"]);
      const previewField = findField(raw, ["预览文本", "preview text", "preview_text", "preheader"]);
      const audienceField = findField(raw, ["include_fenqun_names", "发送用户群", "用户群", "fenqun"]);
      const excludedAudienceField = findField(raw, ["exclude_fenqun_names", "排除用户群", "排除人群", "exclude_fenqun"]);
      if (!dateField || !contentField || !sourceField || !companyField) return [];

      const parts = dateToParts(raw[dateField]);
      if (!parts) return [];

      const site = siteCode(raw[companyField]);
      const get = (names) => {
        const field = findField(raw, names);
        return field ? toNumber(raw[field]) : 0;
      };
      const revenue = get(["Cartsee销售额", "销售额", "revenue"]);

      return [{
        date: parts.date,
        month: parts.month,
        emailType: String(raw[contentField] || "未分类").trim() || "未分类",
        campaign: campaignBase(raw[sourceField]),
        sourceName: String(raw[sourceField] || ""),
        previewText: previewField ? String(raw[previewField] || "") : "",
        site,
        marketTier: marketTier(site),
        companyName: String(raw[companyField] || ""),
        audienceGroup: audienceField ? String(raw[audienceField] || "").trim() : "",
        excludedAudienceGroup: excludedAudienceField ? String(raw[excludedAudienceField] || "").trim() : "",
        sent: get(["发送数", "sent"]),
        delivered: get(["送达数", "delivered"]),
        opens: get(["打开数", "opens"]),
        clicks: get(["点击数", "clicks"]),
        orders: get(["Cartsee订单数", "订单数", "orders"]),
        revenue,
        revenueCny: round(revenue * exchangeRateForSite(site)),
        unsubs: get(["退订数", "unsubs", "unsubscribe"]),
        complaints: get(["投诉数", "complaints"]),
      }];
    });
  }

  function round(value) {
    return Number.isFinite(value) ? Math.round(value * 1000000) / 1000000 : 0;
  }

  function div(num, den) {
    return den ? round(num / den) : 0;
  }

  function aggregateRows(rows) {
    const metrics = rows.reduce((acc, row) => {
      for (const key of ["sent", "delivered", "opens", "clicks", "orders", "revenue", "revenueCny", "unsubs", "complaints"]) {
        acc[key] += Number(row[key] || 0);
      }
      return acc;
    }, { sent: 0, delivered: 0, opens: 0, clicks: 0, orders: 0, revenue: 0, revenueCny: 0, unsubs: 0, complaints: 0 });
    metrics.openRate = div(metrics.opens, metrics.delivered);
    metrics.deliveryRate = div(metrics.delivered, metrics.sent);
    metrics.ctr = div(metrics.clicks, metrics.delivered);
    metrics.ctor = div(metrics.clicks, metrics.opens);
    metrics.orderCvr = div(metrics.orders, metrics.clicks);
    metrics.revenuePer1k = metrics.sent ? round((metrics.revenue / metrics.sent) * 1000) : 0;
    metrics.aov = div(metrics.revenue, metrics.orders);
    metrics.unsubRate = div(metrics.unsubs, metrics.sent);
    metrics.complaintRate = div(metrics.complaints, metrics.sent);
    return metrics;
  }

  function filterRowsByMarket(rows, market) {
    if (market === "core") return rows.filter((row) => row.marketTier === "Core");
    if (market === "noncore") return rows.filter((row) => row.marketTier !== "Core");
    return rows;
  }

  function unique(values) {
    return [...new Set(values)].filter(Boolean);
  }

  function campaignKey(month, campaign) {
    return `${month}::${campaign}`;
  }

  function sortedSites(rows) {
    return unique(rows.map((row) => row.site)).sort((a, b) => siteSortValue(a) - siteSortValue(b) || String(a || "").localeCompare(String(b || "")));
  }

  function dashboardRows() {
    return filterRowsByMarket(state.rows, state.market).filter((row) =>
      (state.overviewMonth === "all" || row.month === state.overviewMonth) &&
      (state.overviewSite === "all" || row.site === state.overviewSite) &&
      (state.overviewType === "all" || row.emailType === state.overviewType)
    );
  }

  function syncExpandedRows(rows) {
    const validTypes = unique(rows.map((row) => row.emailType));
    if (state.selectedType && !validTypes.includes(state.selectedType)) {
      state.selectedType = null;
      state.selectedMonths = [];
      state.selectedCampaignKeys = [];
      return;
    }
    if (!state.selectedType) return;
    const validMonths = summarizeMonths(rows, state.selectedType, "all").map((row) => row.month);
    state.selectedMonths = state.selectedMonths.filter((month) => validMonths.includes(month));
    const validCampaignKeys = state.selectedMonths.flatMap((month) =>
      summarizeCampaigns(rows, state.selectedType, month, "all").map((row) => campaignKey(month, row.campaign))
    );
    state.selectedCampaignKeys = state.selectedCampaignKeys.filter((key) => validCampaignKeys.includes(key));
  }

  function summarizeContentTypes(rows, market) {
    const filtered = filterRowsByMarket(rows, market);
    return unique(filtered.map((row) => row.emailType)).map((emailType) => {
      const typeRows = filtered.filter((row) => row.emailType === emailType);
      return {
        emailType,
        monthCount: unique(typeRows.map((row) => row.month)).length,
        campaignCount: unique(typeRows.map((row) => campaignKey(row.month, row.campaign))).length,
        metrics: aggregateRows(typeRows),
      };
    }).sort((a, b) => b.metrics.revenuePer1k - a.metrics.revenuePer1k);
  }

  function summarizeMonths(rows, emailType, market) {
    const filtered = filterRowsByMarket(rows.filter((row) => row.emailType === emailType), market);
    return unique(filtered.map((row) => row.month)).sort().map((month) => {
      const monthRows = filtered.filter((row) => row.month === month);
      return {
        month,
        campaignCount: unique(monthRows.map((row) => row.campaign)).length,
        metrics: aggregateRows(monthRows),
      };
    });
  }

  function summarizeCampaigns(rows, emailType, month, market) {
    const filtered = filterRowsByMarket(rows.filter((row) => row.emailType === emailType && row.month === month), market);
    return unique(filtered.map((row) => row.campaign)).map((campaign) => {
      const campaignRows = filtered.filter((row) => row.campaign === campaign);
      return {
        campaign,
        date: campaignRows.map((row) => row.date).sort()[0] || "",
        previewText: (campaignRows.find((row) => row.previewText) || {}).previewText || "",
        siteCount: unique(campaignRows.map((row) => row.site)).length,
        metrics: aggregateRows(campaignRows),
      };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign));
  }

  function summarizeSites(rows, emailType, month, campaign, market) {
    const filtered = filterRowsByMarket(rows.filter((row) =>
      row.emailType === emailType &&
      row.month === month &&
      row.campaign === campaign
    ), market);
    return unique(filtered.map((row) => JSON.stringify([row.site, row.audienceGroup || ""]))).map((key) => {
      const [site, audienceGroup] = JSON.parse(key);
      const siteRows = filtered.filter((row) => row.site === site && (row.audienceGroup || "") === audienceGroup);
      const first = siteRows[0] || {};
      return {
        site,
        companyName: first.companyName || "",
        marketTier: first.marketTier || "",
        audienceGroup: audienceGroup || "-",
        excludedAudienceGroup: unique(siteRows.map((row) => row.excludedAudienceGroup)).join("；") || "-",
        metrics: aggregateRows(siteRows),
      };
    }).sort((a, b) => siteSortValue(a.site) - siteSortValue(b.site) || String(a.site || "").localeCompare(String(b.site || "")) || String(a.audienceGroup || "").localeCompare(String(b.audienceGroup || "")));
  }

  function fmtNum(value) {
    return Math.round(value || 0).toLocaleString();
  }

  function fmtMoney(value) {
    return Math.round(value || 0).toLocaleString();
  }

  function fmtRate(value) {
    return `${((value || 0) * 100).toFixed(1)}%`;
  }

  function fmtSmallRate(value) {
    return `${((value || 0) * 100).toFixed(3)}%`;
  }

  function metricExportHeaders() {
    return ["发送量", "触达率", "打开人数", "打开率", "点击人数", "点击率", "CTOR", "订单数", "原币种销售额", "汇率", "人民币销售额", "转化率", "退订率"];
  }

  function metricExportValues(metrics, exchangeRate) {
    return [
      fmtNum(metrics.sent),
      fmtRate(metrics.deliveryRate),
      fmtNum(metrics.opens),
      fmtRate(metrics.openRate),
      fmtNum(metrics.clicks),
      fmtRate(metrics.ctr),
      fmtRate(metrics.ctor),
      fmtNum(metrics.orders),
      fmtMoney(metrics.revenue),
      exchangeRate || "混合",
      fmtMoney(metrics.revenueCny),
      fmtRate(metrics.orderCvr),
      fmtSmallRate(metrics.unsubRate),
    ];
  }

  function toTsv(headers, rows) {
    const cleanCell = (value) => String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    return [headers, ...rows].map((row) => row.map(cleanCell).join("\t")).join("\n");
  }

  async function copyText(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setStatus(`已复制${label}，可直接粘贴到表格。`);
    } catch (error) {
      setStatus(`复制失败：${error.message}`, true);
    }
  }

  function copyButton(scope, label, attrs) {
    const dataAttrs = Object.entries(attrs || {}).map(([key, value]) => `data-${key}="${escapeHtml(value)}"`).join(" ");
    return `<button type="button" class="copy-btn" data-copy-scope="${scope}" ${dataAttrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg></button>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function setStatus(message, isError) {
    els.status.textContent = message;
    els.status.classList.toggle("error", Boolean(isError));
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted && char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (!quoted && char === ",") {
        row.push(cell);
        cell = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(cell);
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    const headers = rows.shift() || [];
    return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  function applyRawRows(rawRows, sourceName) {
    state.rows = normalizeRows(rawRows);
    state.selectedType = null;
    state.selectedMonths = [];
    state.selectedCampaignKeys = [];
    state.overviewMonth = "all";
    state.overviewSite = "all";
    state.overviewType = "all";
    if (!state.rows.length) {
      setStatus("没有识别到可用 Email 数据。请检查字段名是否包含发送时间、邮件内容类型、source_name、company_name。", true);
    } else {
      const months = unique(state.rows.map((row) => row.month)).sort();
      setStatus(`已载入 ${sourceName}：${state.rows.length} 行 Email 数据，覆盖 ${months.join(", ")}。`);
    }
    render();
  }

  function summaryMetricCells(metrics, options) {
    const opts = options || {};
    return `
      <td class="num">${fmtNum(metrics.sent)}</td>
      <td class="num">${fmtRate(metrics.deliveryRate)}</td>
      <td class="num">${fmtNum(metrics.opens)}</td>
      <td class="num">${fmtRate(metrics.openRate)}</td>
      <td class="num">${fmtNum(metrics.clicks)}</td>
      <td class="num">${fmtRate(metrics.ctr)}</td>
      <td class="num">${fmtRate(metrics.ctor)}</td>
      <td class="num">${fmtNum(metrics.orders)}</td>
      <td class="num">${fmtMoney(metrics.revenue)}</td>
      <td class="num">${escapeHtml(opts.exchangeRate || "混合")}</td>
      <td class="num">${fmtMoney(metrics.revenueCny)}</td>
      <td class="num">${fmtRate(metrics.orderCvr)}</td>
      <td class="num">${fmtSmallRate(metrics.unsubRate)}</td>
    `;
  }

  function campaignMetricCells(metrics, options) {
    const opts = options || {};
    return `
      <td class="num">${fmtNum(metrics.sent)}</td>
      <td class="num">${fmtRate(metrics.deliveryRate)}</td>
      <td class="num">${fmtNum(metrics.opens)}</td>
      <td class="num">${fmtRate(metrics.openRate)}</td>
      <td class="num">${fmtNum(metrics.clicks)}</td>
      <td class="num">${fmtRate(metrics.ctr)}</td>
      <td class="num">${fmtRate(metrics.ctor)}</td>
      <td class="num">${fmtNum(metrics.orders)}</td>
      <td class="num">${fmtMoney(metrics.revenue)}</td>
      <td class="num">${escapeHtml(opts.exchangeRate || "混合")}</td>
      <td class="num">${fmtMoney(metrics.revenueCny)}</td>
      <td class="num">${fmtRate(metrics.orderCvr)}</td>
      <td class="num">${fmtSmallRate(metrics.unsubRate)}</td>
    `;
  }

  function summaryHeaders(firstColumnLabel) {
    return `
      <tr>
        <th>${firstColumnLabel}</th>
        <th class="num">发送量</th><th class="num">触达率</th><th class="num">打开人数</th><th class="num">打开率</th>
        <th class="num">点击人数</th><th class="num">点击率</th><th class="num">CTOR</th><th class="num">订单数</th>
        <th class="num">原币种销售额</th><th class="num">汇率</th><th class="num">人民币销售额</th>
        <th class="num">转化率</th><th class="num">退订率</th>
      </tr>
    `;
  }

  function siteHeaders() {
    return `
      <tr>
        <th>国家站点</th><th>发送用户群</th>
        <th class="num">发送量</th><th class="num">触达率</th><th class="num">打开人数</th><th class="num">打开率</th>
        <th class="num">点击人数</th><th class="num">点击率</th><th class="num">CTOR</th><th class="num">订单数</th>
        <th class="num">原币种销售额</th><th class="num">汇率</th><th class="num">人民币销售额</th>
        <th class="num">转化率</th><th class="num">退订率</th><th>排除用户群</th>
      </tr>
    `;
  }

  function selectOptions(values, selectedValue, allLabel) {
    const options = [{ value: "all", label: allLabel }, ...values.map((value) => ({ value, label: value }))];
    return options.map((option) => `
      <option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("");
  }

  function renderOverview() {
    const marketRows = filterRowsByMarket(state.rows, state.market);
    const months = unique(marketRows.map((row) => row.month)).sort();
    const sites = sortedSites(marketRows);
    const types = unique(marketRows.map((row) => row.emailType)).sort((a, b) => a.localeCompare(b));

    if (!months.includes(state.overviewMonth)) state.overviewMonth = "all";
    if (!sites.includes(state.overviewSite)) state.overviewSite = "all";
    if (!types.includes(state.overviewType)) state.overviewType = "all";

    els.overviewMonth.innerHTML = selectOptions(months, state.overviewMonth, "全部月份");
    els.overviewSite.innerHTML = selectOptions(sites, state.overviewSite, "全部站点");
    els.overviewType.innerHTML = selectOptions(types, state.overviewType, "全部内容类型");

    const disabled = !marketRows.length;
    els.overviewMonth.disabled = disabled;
    els.overviewSite.disabled = disabled;
    els.overviewType.disabled = disabled;

    const filtered = dashboardRows();
    const metrics = aggregateRows(filtered);
    const cards = [
      ["发送量", fmtNum(metrics.sent)],
      ["打开率", fmtRate(metrics.openRate)],
      ["点击率", fmtRate(metrics.ctr)],
      ["CTOR", fmtRate(metrics.ctor)],
      ["订单数", fmtNum(metrics.orders)],
      ["人民币销售额", fmtMoney(metrics.revenueCny)],
    ];

    els.overviewCards.innerHTML = cards.map(([label, value]) => `
      <div class="overview-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }

  function renderTypeTable() {
    const sourceRows = dashboardRows();
    syncExpandedRows(sourceRows);
    const rows = summarizeContentTypes(sourceRows, "all");
    if (!rows.length) {
      els.typeTable.innerHTML = `<div class="empty">${state.rows.length ? "当前筛选下没有匹配的邮件数据。" : "请上传数据，或点击“载入示例数据”。"}</div>`;
      return;
    }
    els.typeTable.innerHTML = `
      <table>
        <thead>
          ${summaryHeaders("邮件内容类型")}
        </thead>
        <tbody>
          ${rows.map((row) => renderTypeRow(row)).join("")}
        </tbody>
      </table>`;
    els.typeTable.querySelectorAll("[data-type]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-copy-scope]")) return;
        if (state.selectedType === row.dataset.type) {
          state.selectedType = null;
          state.selectedMonths = [];
          state.selectedCampaignKeys = [];
        } else {
          state.selectedType = row.dataset.type;
          state.selectedMonths = [];
          state.selectedCampaignKeys = [];
        }
        render();
      });
    });
    els.typeTable.querySelectorAll("[data-month]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-copy-scope]")) return;
        const month = row.dataset.month;
        if (state.selectedMonths.includes(month)) {
          state.selectedMonths = state.selectedMonths.filter((value) => value !== month);
          state.selectedCampaignKeys = state.selectedCampaignKeys.filter((key) => !key.startsWith(`${month}::`));
        } else {
          state.selectedMonths = [...state.selectedMonths, month].sort();
        }
        render();
      });
    });
    els.typeTable.querySelectorAll("[data-campaign-key]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-copy-scope]")) return;
        const key = row.dataset.campaignKey;
        state.selectedCampaignKeys = state.selectedCampaignKeys.includes(key)
          ? state.selectedCampaignKeys.filter((value) => value !== key)
          : [...state.selectedCampaignKeys, key];
        render();
      });
    });
    els.typeTable.querySelectorAll("[data-copy-scope]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleCopy(button.dataset);
      });
    });
  }

  function handleCopy(data) {
    const sourceRows = dashboardRows();
    if (data.copyScope === "type") {
      const months = summarizeMonths(sourceRows, data.type, "all");
      const headers = ["邮件内容类型", "月份", ...metricExportHeaders()];
      const rows = months.map((row) => [data.type, row.month, ...metricExportValues(row.metrics, "混合")]);
      copyText(toTsv(headers, rows), `「${data.type}」月份汇总`);
      return;
    }
    if (data.copyScope === "month") {
      const campaigns = summarizeCampaigns(sourceRows, data.type, data.month, "all");
      const headers = ["邮件内容类型", "月份", "Campaign", "发送日期", ...metricExportHeaders()];
      const rows = campaigns.map((row) => [data.type, data.month, row.campaign, row.date, ...metricExportValues(row.metrics, "混合")]);
      copyText(toTsv(headers, rows), `「${data.month}」Campaign 明细`);
      return;
    }
    if (data.copyScope === "campaign") {
      const sites = summarizeSites(sourceRows, data.type, data.month, data.campaign, "all");
      const headers = ["邮件内容类型", "月份", "Campaign", "国家站点", "发送用户群", ...metricExportHeaders(), "排除用户群"];
      const rows = sites.map((row) => [
        data.type,
        data.month,
        data.campaign,
        row.site,
        row.audienceGroup,
        ...metricExportValues(row.metrics, exchangeRateForSite(row.site)),
        row.excludedAudienceGroup,
      ]);
      copyText(toTsv(headers, rows), `「${data.campaign}」国家站点明细`);
      return;
    }
  }

  function renderTypeRow(row) {
    const expanded = row.emailType === state.selectedType;
    const sourceRows = dashboardRows();
    const months = expanded ? summarizeMonths(sourceRows, row.emailType, "all") : [];
    return `
      <tr class="clickable level-type ${expanded ? "selected" : ""}" data-type="${escapeHtml(row.emailType)}">
        <td><span class="toggle">${expanded ? "▾" : "▸"}</span><span class="primary">${escapeHtml(row.emailType)}</span>${copyButton("type", "复制", { type: row.emailType })}<div class="subtext">${row.monthCount} 个月份</div></td>
        ${summaryMetricCells(row.metrics, { exchangeRate: "混合" })}
      </tr>
      ${months.map((month) => renderMonthRow(row.emailType, month)).join("")}
    `;
  }

  function renderMonthRow(emailType, row) {
    const expanded = state.selectedType === emailType && state.selectedMonths.includes(row.month);
    const sourceRows = dashboardRows();
    const campaigns = expanded ? summarizeCampaigns(sourceRows, emailType, row.month, "all") : [];
    return `
      <tr class="clickable level-month ${expanded ? "selected" : ""}" data-month="${row.month}">
        <td><span class="indent indent-1"></span><span class="toggle">${expanded ? "▾" : "▸"}</span><span class="primary">${row.month}</span>${copyButton("month", "复制", { type: emailType, month: row.month })}</td>
        ${summaryMetricCells(row.metrics, { exchangeRate: "混合" })}
      </tr>
      ${expanded ? renderCampaignPanel(emailType, row.month, campaigns) : ""}
    `;
  }

  function renderCampaignPanel(emailType, month, campaigns) {
    return `
      <tr class="nested-row">
        <td colspan="14">
          <div class="nested-panel">
            <span class="section-pill">邮件表现</span>
            <table class="nested-table campaign-table">
              <thead>${summaryHeaders("Campaign")}</thead>
              <tbody>${campaigns.map((campaign) => renderCampaignBlock(emailType, month, campaign)).join("")}</tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  }

  function renderCampaignBlock(emailType, month, row) {
    const key = campaignKey(month, row.campaign);
    const expanded = state.selectedType === emailType && state.selectedMonths.includes(month) && state.selectedCampaignKeys.includes(key);
    const sourceRows = dashboardRows();
    const sites = expanded ? summarizeSites(sourceRows, emailType, month, row.campaign, "all") : [];
    return `
      <tr class="clickable level-campaign ${expanded ? "selected" : ""}" data-campaign-key="${escapeHtml(key)}">
        <td><span class="toggle">${expanded ? "▾" : "▸"}</span><span class="primary">${escapeHtml(row.campaign)}</span>${copyButton("campaign", "复制", { type: emailType, month, campaign: row.campaign })}</td>
        ${summaryMetricCells(row.metrics, { exchangeRate: "混合" })}
      </tr>
      ${expanded ? renderSitePanel(sites, emailType, month, row.campaign) : ""}
    `;
  }

  function renderSitePanel(sites, emailType, month, campaign) {
    return `
      <tr class="nested-row site-nested-row">
        <td colspan="14">
          <div class="site-panel">
            <span class="section-pill site-pill">国家站点表现</span>
          <table class="nested-table site-table">
            <thead>${siteHeaders()}</thead>
            <tbody>${sites.map((site) => renderSiteRow(site)).join("")}</tbody>
          </table>
          </div>
        </td>
      </tr>
    `;
  }

  function renderSiteRow(row) {
    const audienceGroup = escapeHtml(row.audienceGroup);
    const excludedAudienceGroup = escapeHtml(row.excludedAudienceGroup);
    return `
      <tr class="level-site">
        <td><span class="primary">${escapeHtml(row.site)}</span></td>
        <td class="audience-cell" title="${audienceGroup}"><span class="audience-preview">${audienceGroup}</span></td>
        ${summaryMetricCells(row.metrics, { exchangeRate: exchangeRateForSite(row.site) })}
        <td class="audience-cell excluded-audience-cell" title="${excludedAudienceGroup}"><span class="audience-preview">${excludedAudienceGroup}</span></td>
      </tr>
    `;
  }

  function render() {
    renderOverview();
    renderTypeTable();
    document.querySelectorAll("[data-market]").forEach((button) => {
      button.classList.toggle("active", button.dataset.market === state.market);
    });
  }

  function workbookToRows(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: "", cellDates: true });
  }

  async function handleFile(file) {
    const lower = file.name.toLowerCase();
    setStatus(`正在读取 ${file.name}...`);
    try {
      if (lower.endsWith(".csv")) {
        els.sheetSelect.hidden = true;
        state.workbook = null;
        applyRawRows(parseCsv(await file.text()), file.name);
        return;
      }
      if (!window.XLSX) {
        setStatus("Excel 解析库没有加载成功。若是本地离线打开，请先联网，或部署到 Vercel 后再上传 Excel。CSV 不依赖该库。", true);
        return;
      }
      const data = await file.arrayBuffer();
      state.workbook = XLSX.read(data, { type: "array", cellDates: true });
      state.fileName = file.name;
      els.sheetSelect.innerHTML = state.workbook.SheetNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
      els.sheetSelect.hidden = false;
      applyRawRows(workbookToRows(state.workbook, state.workbook.SheetNames[0]), `${file.name} / ${state.workbook.SheetNames[0]}`);
    } catch (error) {
      setStatus(`读取失败：${error.message}`, true);
    }
  }

  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (file) await handleFile(file);
  });

  els.sheetSelect.addEventListener("change", () => {
    if (!state.workbook) return;
    applyRawRows(workbookToRows(state.workbook, els.sheetSelect.value), `${state.fileName} / ${els.sheetSelect.value}`);
  });

  els.loadSample.addEventListener("click", () => {
    applyRawRows(window.EDM_SAMPLE_ROWS || [], "4-5月示例数据");
  });

  els.overviewMonth.addEventListener("change", () => {
    state.overviewMonth = els.overviewMonth.value;
    render();
  });

  els.overviewSite.addEventListener("change", () => {
    state.overviewSite = els.overviewSite.value;
    render();
  });

  els.overviewType.addEventListener("change", () => {
    state.overviewType = els.overviewType.value;
    render();
  });

  document.querySelectorAll("[data-market]").forEach((button) => {
    button.addEventListener("click", () => {
      state.market = button.dataset.market;
      render();
    });
  });

  render();
})();

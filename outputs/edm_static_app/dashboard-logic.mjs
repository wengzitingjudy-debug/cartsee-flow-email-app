export function cleanHeader(value) {
  return String(value ?? "").trim().replace("\ufeff", "").replace(/，/g, "");
}

export function findField(row, candidates) {
  const keys = Object.keys(row || {});
  const normalized = new Map(keys.map((key) => [cleanHeader(key).toLowerCase(), key]));
  for (const candidate of candidates) {
    const key = normalized.get(cleanHeader(candidate).toLowerCase());
    if (key) return key;
  }
  return keys.find((key) => candidates.some((candidate) => cleanHeader(key).toLowerCase().includes(cleanHeader(candidate).toLowerCase())));
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

export function dateToParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
  };
}

export function campaignBase(sourceName) {
  return String(sourceName ?? "").trim().replace(/_(US|UK|DE|EU|AU|JP|CA|Global)$/i, "");
}

export function siteCode(companyName) {
  const text = String(companyName ?? "");
  for (const code of ["US", "UK", "DE", "EU", "AU", "JP", "CA"]) {
    if (new RegExp(`(^|[-\\s])${code}($|[-\\s])`, "i").test(text)) return code;
  }
  if (/Global/i.test(text)) return "GLOBAL";
  return text.replace(/SmallRig/gi, "").replace(/^[-\s]+|[-\s]+$/g, "") || "Other";
}

export function marketTier(site) {
  return ["US", "UK", "DE", "EU", "AU", "CA", "GLOBAL"].includes(site) ? "Core" : "Non-core";
}

export const SITE_ORDER = ["US", "EU", "DE", "AU", "UK", "JP", "GLOBAL", "CA"];

export const EXCHANGE_RATES_TO_CNY = {
  US: 7.17,
  GLOBAL: 7.17,
  JP: 0.05,
  DE: 8.34,
  AU: 9.7,
  UK: 4.68,
  CA: 4.93,
  EU: 7.59,
};

export function exchangeRateForSite(site) {
  return EXCHANGE_RATES_TO_CNY[site] ?? 1;
}

export function siteSortValue(site) {
  const index = SITE_ORDER.indexOf(site);
  return index >= 0 ? index : SITE_ORDER.length;
}

export function normalizeRows(rawRows) {
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

export function aggregateRows(rows) {
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

export function filterRowsByMarket(rows, market) {
  if (market === "core") return rows.filter((row) => row.marketTier === "Core");
  if (market === "noncore") return rows.filter((row) => row.marketTier !== "Core");
  return rows;
}

export function unique(values) {
  return [...new Set(values)].filter(Boolean);
}

export function campaignKey(month, campaign) {
  return `${month}::${campaign}`;
}

export function summarizeContentTypes(rows, market = "all") {
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

export function summarizeMonths(rows, emailType, market = "all") {
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

export function summarizeCampaigns(rows, emailType, month, market = "all") {
  const filtered = filterRowsByMarket(rows.filter((row) => row.emailType === emailType && row.month === month), market);
  return unique(filtered.map((row) => row.campaign)).map((campaign) => {
    const campaignRows = filtered.filter((row) => row.campaign === campaign);
    return {
      campaign,
      date: campaignRows.map((row) => row.date).sort()[0] || "",
      previewText: campaignRows.find((row) => row.previewText)?.previewText || "",
      siteCount: unique(campaignRows.map((row) => row.site)).length,
      metrics: aggregateRows(campaignRows),
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign));
}

export function summarizeSites(rows, emailType, month, campaign, market = "all") {
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

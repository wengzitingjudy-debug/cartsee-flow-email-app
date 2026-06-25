import assert from "node:assert/strict";
import {
  aggregateRows,
  campaignBase,
  normalizeRows,
  summarizeContentTypes,
  summarizeCampaigns,
  summarizeMonths,
  summarizeSites,
} from "../dashboard-logic.mjs";

const raw = [
  {
    "发送时间": "2026-05-28",
    type: "Email",
    source_name: "[场景]: 5.28_森林婚礼拍摄_US",
    "邮件内容类型，": "场景",
    company_name: "SmallRig US",
    include_fenqun_names: "US 活跃用户",
    exclude_fenqun_names: "US 已购买用户",
    "发送数": 1000,
    "送达数": 950,
    "打开数": 500,
    "点击数": 100,
    "Cartsee订单数": 10,
    "Cartsee销售额": 2000,
    "退订数": 2,
    "投诉数": 1,
  },
  {
    "发送时间": "2026-05-28",
    type: "Email",
    source_name: "[场景]: 5.28_森林婚礼拍摄_DE",
    "邮件内容类型，": "场景",
    company_name: "SmallRig-DE",
    include_fenqun_names: "DE 活跃用户",
    exclude_fenqun_names: "DE 已购买用户",
    "发送数": 500,
    "送达数": 480,
    "打开数": 240,
    "点击数": 60,
    "Cartsee订单数": 3,
    "Cartsee销售额": 300,
    "退订数": 1,
    "投诉数": 0,
  },
  {
    "发送时间": "2026-05-28",
    type: "Email",
    source_name: "[场景]: 5.28_森林婚礼拍摄_EU",
    "邮件内容类型，": "场景",
    company_name: "SmallRig EU",
    include_fenqun_names: "EU 活跃用户",
    exclude_fenqun_names: "EU 已购买用户",
    "发送数": 200,
    "送达数": 200,
    "打开数": 100,
    "点击数": 20,
    "Cartsee订单数": 1,
    "Cartsee销售额": 100,
    "退订数": 0,
    "投诉数": 0,
  },
  {
    "发送时间": "2026-05-28",
    type: "Email",
    source_name: "[场景]: 5.28_森林婚礼拍摄_JP",
    "邮件内容类型，": "场景",
    company_name: "",
    include_fenqun_names: "",
    exclude_fenqun_names: "",
    "发送数": 100,
    "送达数": 100,
    "打开数": 50,
    "点击数": 10,
    "Cartsee订单数": 1,
    "Cartsee销售额": 10,
    "退订数": 0,
    "投诉数": 0,
  },
  {
    "发送时间": "2026-05-29",
    type: "Sms",
    source_name: "SMS-US",
    "邮件内容类型，": "促销",
    company_name: "SmallRig US",
    "发送数": 100,
  },
];

assert.equal(campaignBase("[场景]: 5.28_森林婚礼拍摄_US"), "[场景]: 5.28_森林婚礼拍摄");

const rows = normalizeRows(raw);
assert.equal(rows.length, 4);
assert.equal(rows[0].month, "2026-05");
assert.equal(rows[0].site, "US");
assert.equal(rows[1].site, "DE");
assert.equal(rows[0].campaign, rows[1].campaign);

const metrics = aggregateRows(rows);
assert.equal(metrics.sent, 1800);
assert.equal(metrics.orders, 15);
assert.equal(metrics.revenue, 2410);
assert.equal(metrics.revenueCny, 17611);
assert.equal(metrics.deliveryRate, 0.961111);
assert.equal(metrics.ctor, 0.213483);

const typeRows = summarizeContentTypes(rows, "all");
assert.equal(typeRows.length, 1);
assert.equal(typeRows[0].emailType, "场景");
assert.equal(typeRows[0].campaignCount, 1);

const months = summarizeMonths(rows, "场景", "all");
assert.equal(months.length, 1);
assert.equal(months[0].month, "2026-05");

const campaigns = summarizeCampaigns(rows, "场景", "2026-05", "all");
assert.equal(campaigns.length, 1);
assert.equal(campaigns[0].campaign, "[场景]: 5.28_森林婚礼拍摄");

const sites = summarizeSites(rows, "场景", "2026-05", "[场景]: 5.28_森林婚礼拍摄", "all");
assert.deepEqual(sites.map((site) => site.site), ["US", "EU", "DE", "Other"]);
assert.equal(sites[0].audienceGroup, "US 活跃用户");
assert.equal(sites[0].excludedAudienceGroup, "US 已购买用户");
assert.equal(sites[1].audienceGroup, "EU 活跃用户");
assert.equal(sites[1].excludedAudienceGroup, "EU 已购买用户");
assert.equal(sites[3].audienceGroup, "-");
assert.equal(sites[3].excludedAudienceGroup, "-");

console.log("dashboard logic tests passed");

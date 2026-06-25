# EDM 内容类型下钻看板

这是一个纯前端静态 App，可以直接部署到 GitHub Pages、Vercel 或 Netlify。

## 使用方式

1. 打开 `index.html`。
2. 上传 `.xlsx`、`.xls` 或 `.csv` 文件。
3. 如果是 Excel，选择要读取的 Sheet。
4. 点击内容类型总表中的一行，依次下钻：

```text
邮件内容类型 -> 月份 -> Campaign -> 国家站点
```

## 字段要求

推荐上传数据包含以下字段：

```text
发送时间
type
source_name
邮件内容类型
company_name
发送数
送达数
打开数
点击数
Cartsee订单数
Cartsee销售额
退订数
投诉数
```

`type` 不等于 `Email` 的行会被自动排除。

## 部署

把本目录上传到 GitHub，然后在 Vercel 选择该目录作为静态站点部署即可。

Excel 解析使用浏览器端 SheetJS CDN：

```html
https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
```

CSV 解析和所有指标计算都在本地浏览器中完成。

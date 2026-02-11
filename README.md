# @claw-dev/data-cleaner

> 数据清洗工具 - 快速清洗和转换数据文件

## 🚀 功能

- **去除空行**：过滤掉空数据
- **去重**：基于字段或整行去重
- **去除空格**：trim 字符串字段
- **大小写转换**：upper/lower/title
- **列选择**：只保留指定列
- **数据过滤**：基于条件的过滤
- **排序**：按列排序
- **格式转换**：JSON ↔ CSV
- **统计信息**：查看数据概况

## 📦 安装

```bash
npx @claw-dev/data-cleaner
```

## 📖 快速开始

### 1. 查看统计

```bash
data-cleaner stats data.csv
```

输出：

```
📊 数据统计

类型: array
总数: 1523

字段:
  - name
  - email
  - age

空值数量: 45
空字符串数量: 23
```

### 2. 去除空行和空格

```bash
data-cleaner clean data.csv cleaned.csv --remove-empty --trim
```

### 3. 去重

```bash
data-cleaner clean data.csv cleaned.csv --deduplicate
```

基于特定字段去重：

```bash
data-cleaner clean data.csv cleaned.csv --deduplicate --key email
```

### 4. 列选择

```bash
data-cleaner clean data.csv cleaned.csv --columns "name,email"
```

### 5. 数据过滤

```bash
# 年龄大于 18
data-cleaner clean data.csv cleaned.csv -F "age:gt:18"

# 邮件包含 @gmail.com
data-cleaner clean data.csv cleaned.csv -F "email:contains:@gmail.com"

# 等于特定值
data-cleaner clean data.csv cleaned.csv -F "status:eq:active"
```

### 6. 排序

```bash
# 按年龄升序
data-cleaner clean data.csv cleaned.csv -S age

# 按年龄降序
data-cleaner clean data.csv cleaned.csv -S age --order desc
```

### 7. 大小写转换

```bash
# 全部大写
data-cleaner clean data.csv cleaned.csv --case upper

# 全部小写
data-cleaner clean data.csv cleaned.csv --case lower

# 首字母大写
data-cleaner clean data.csv cleaned.csv --case title
```

### 8. 格式转换

```bash
# CSV 转 JSON
data-cleaner clean data.csv output.json -f json

# JSON 转 CSV
data-cleaner clean data.json output.csv -f csv
```

## 📋 过滤操作

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `eq` | 等于 | `status:eq:active` |
| `neq` | 不等于 | `status:neq:deleted` |
| `gt` | 大于 | `age:gt:18` |
| `lt` | 小于 | `age:lt:65` |
| `gte` | 大于等于 | `age:gte:18` |
| `lte` | 小于等于 | `age:lte:65` |
| `contains` | 包含 | `email:contains:@gmail.com` |
| `startsWith` | 以...开头 | `name:startsWith:A` |
| `endsWith` | 以...结尾 | `email:endsWith:.com` |

## 🎯 使用场景

### 1. 清洗用户数据

```bash
data-cleaner clean users.csv users_cleaned.csv \
  --remove-empty \
  --deduplicate --key email \
  --trim \
  -F "status:eq:active"
```

去除空行、基于邮箱去重、去除空格、只保留活跃用户。

### 2. 提取特定列

```bash
data-cleaner clean products.csv products_simple.csv \
  --columns "id,name,price"
```

只保留产品 ID、名称和价格。

### 3. 格式转换

```bash
data-cleaner clean data.json data.csv -f csv
data-cleaner clean data.csv data.json -f json
```

在 JSON 和 CSV 之间转换。

### 4. 排序和限制

```bash
data-cleaner clean products.csv top10.csv \
  -S price --order desc \
  --limit 10
```

按价格降序，只保留前 10 个。

### 5. 数据标准化

```bash
data-cleaner clean emails.csv emails_cleaned.csv \
  --trim \
  --case lower
```

去除空格并转换为小写。

## 💡 组合使用

多个选项可以组合使用：

```bash
data-cleaner clean data.csv cleaned.csv \
  --remove-empty \
  --deduplicate --key id \
  --trim \
  --case lower \
  -F "status:eq:active" \
  -S created_at --order desc \
  --limit 1000
```

这会：
1. 去除空行
2. 基于 ID 去重
3. 去除空格
4. 转换为小写
5. 只保留状态为 active 的记录
6. 按创建时间降序排序
7. 只保留前 1000 条

## 📊 统计信息

使用 `--stats` 查看清洗前后的对比：

```bash
data-cleaner clean data.csv cleaned.csv --stats
```

输出：

```
🔧 清洗数据

输入: data.csv
输出: cleaned.csv

原始数据:
📊 数据统计

类型: array
总数: 1523

字段:
  - id
  - name
  - email
  - age
  - status

空值数量: 45
空字符串数量: 23

清洗后数据:
📊 数据统计

类型: array
总数: 1456

字段:
  - id
  - name
  - email
  - age
  - status

✅ 已保存到: cleaned.csv
   从 1523 行减少到 1456 行
```

## 🔧 高级功能

### 1. 转换为大写并去除空值

```bash
data-cleaner clean data.csv cleaned.csv \
  --remove-empty \
  --trim \
  --case upper
```

### 2. 多步清洗

可以链式调用，逐步清洗：

```bash
# 第一步：去重
data-cleaner clean data.csv step1.csv --deduplicate --key id

# 第二步：过滤
data-cleaner clean step1.csv step2.csv -F "age:gte:18"

# 第三步：排序
data-cleaner clean step2.csv final.csv -S created_at --order desc
```

### 3. 批量处理

使用 shell 脚本批量处理：

```bash
#!/bin/bash

for file in data/*.csv; do
    output="cleaned/$(basename $file)"
    data-cleaner clean "$file" "$output" --remove-empty --trim
done
```

## 🚧 待实现

- [ ] 支持更多文件格式（Excel、SQL）
- [ ] 自定义转换函数
- [ ] 正则表达式替换
- [ ] 数据验证规则
- [ ] 合并多个文件
- [ ] 分组统计

## 🤝 贡献

欢迎提交 Issue 和 PR！

## 📄 许可证

MIT © 梦心

---

Made with 🌙 by 梦心

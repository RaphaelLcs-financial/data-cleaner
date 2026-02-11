#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

// 读取文件
function readFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf-8');
  
  if (ext === '.json') {
    return JSON.parse(content);
  } else if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      parse(content, { columns: true }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
  
  return content;
}

// 写入文件
function writeFile(filePath, data, format) {
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  if (format === 'json') {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } else if (format === 'csv') {
    return new Promise((resolve, reject) => {
      stringify(data, { header: true }, (err, output) => {
        if (err) reject(err);
        else {
          fs.writeFileSync(filePath, output, 'utf-8');
          resolve();
        }
      });
    });
  } else {
    fs.writeFileSync(filePath, data, 'utf-8');
  }
}

// 清洗数据
function cleanData(data, options) {
  let cleaned = data;
  
  // 去除空行
  if (options.removeEmpty) {
    if (Array.isArray(cleaned)) {
      cleaned = cleaned.filter(item => {
        if (typeof item === 'string') return item.trim() !== '';
        if (typeof item === 'object' && item !== null) {
          return Object.values(item).some(v => v !== null && v !== undefined && v !== '');
        }
        return true;
      });
    }
  }
  
  // 去重
  if (options.deduplicate) {
    if (Array.isArray(cleaned)) {
      const seen = new Set();
      cleaned = cleaned.filter(item => {
        const key = options.key ? item[options.key] : JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
  
  // 去除空格
  if (options.trim) {
    if (Array.isArray(cleaned)) {
      cleaned = cleaned.map(item => {
        if (typeof item === 'object' && item !== null) {
          const result = {};
          for (const [key, value] of Object.entries(item)) {
            result[key] = typeof value === 'string' ? value.trim() : value;
          }
          return result;
        }
        return item;
      });
    }
  }
  
  // 大小写转换
  if (options.case) {
    if (Array.isArray(cleaned)) {
      cleaned = cleaned.map(item => {
        if (typeof item === 'object' && item !== null) {
          const result = {};
          for (const [key, value] of Object.entries(item)) {
            if (typeof value === 'string') {
              switch (options.case) {
                case 'upper':
                  result[key] = value.toUpperCase();
                  break;
                case 'lower':
                  result[key] = value.toLowerCase();
                  break;
                case 'title':
                  result[key] = value.replace(/\w\S*/g, txt => 
                    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
                  );
                  break;
              }
            } else {
              result[key] = value;
            }
          }
          return result;
        }
        return item;
      });
    }
  }
  
  // 列选择
  if (options.columns) {
    if (Array.isArray(cleaned)) {
      cleaned = cleaned.map(item => {
        if (typeof item === 'object' && item !== null) {
          const result = {};
          for (const col of options.columns) {
            if (col in item) {
              result[col] = item[col];
            }
          }
          return result;
        }
        return item;
      });
    }
  }
  
  // 过滤
  if (options.filter) {
    if (Array.isArray(cleaned)) {
      const { column, operator, value } = options.filter;
      cleaned = cleaned.filter(item => {
        const itemValue = item[column];
        switch (operator) {
          case 'eq':
            return itemValue == value;
          case 'neq':
            return itemValue != value;
          case 'gt':
            return itemValue > value;
          case 'lt':
            return itemValue < value;
          case 'gte':
            return itemValue >= value;
          case 'lte':
            return itemValue <= value;
          case 'contains':
            return String(itemValue).includes(value);
          case 'startsWith':
            return String(itemValue).startsWith(value);
          case 'endsWith':
            return String(itemValue).endsWith(value);
          default:
            return true;
        }
      });
    }
  }
  
  // 排序
  if (options.sort) {
    if (Array.isArray(cleaned)) {
      const { column, order = 'asc' } = options.sort;
      cleaned = cleaned.sort((a, b) => {
        const aVal = a[column];
        const bVal = b[column];
        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }
  }
  
  // 限制数量
  if (options.limit) {
    if (Array.isArray(cleaned)) {
      cleaned = cleaned.slice(0, options.limit);
    }
  }
  
  return cleaned;
}

// 统计数据
function getStats(data) {
  if (!Array.isArray(data)) {
    return {
      type: typeof data,
      count: 1
    };
  }
  
  const stats = {
    type: 'array',
    count: data.length,
    fields: [],
    nullCount: 0,
    emptyCount: 0
  };
  
  if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
    stats.fields = Object.keys(data[0]);
    
    for (const item of data) {
      for (const [key, value] of Object.entries(item)) {
        if (value === null || value === undefined) {
          stats.nullCount++;
        } else if (value === '') {
          stats.emptyCount++;
        }
      }
    }
  }
  
  return stats;
}

// 打印统计
function printStats(stats) {
  console.log(chalk.cyan('\n📊 数据统计\n'));
  console.log(chalk.gray(`类型: ${stats.type}`));
  console.log(chalk.gray(`总数: ${stats.count}`));
  
  if (stats.fields && stats.fields.length > 0) {
    console.log(chalk.cyan('\n字段:'));
    for (const field of stats.fields) {
      console.log(chalk.gray(`  - ${field}`));
    }
  }
  
  if (stats.nullCount > 0) {
    console.log(chalk.yellow(`\n空值数量: ${stats.nullCount}`));
  }
  
  if (stats.emptyCount > 0) {
    console.log(chalk.yellow(`空字符串数量: ${stats.emptyCount}`));
  }
  
  console.log();
}

// CLI 配置
program
  .name('data-cleaner')
  .description('数据清洗工具 - 快速清洗和转换数据文件')
  .version('1.0.0');

program
  .command('stats <file>')
  .description('显示文件统计信息')
  .action(async (file) => {
    if (!fs.existsSync(file)) {
      console.log(chalk.red(`文件不存在: ${file}`));
      process.exit(1);
    }
    
    const data = await readFile(file);
    const stats = getStats(data);
    printStats(stats);
  });

program
  .command('clean <input> [output]')
  .option('-f, --format <type>', '输出格式（json/csv）')
  .option('--remove-empty', '去除空行')
  .option('--deduplicate', '去重')
  .option('-k, --key <field>', '去重时使用的字段')
  .option('--trim', '去除空格')
  .option('--case <type>', '大小写转换（upper/lower/title）')
  .option('-c, --columns <items>', '选择列（逗号分隔）')
  .option('-F, --filter <expr>', '过滤表达式（column:operator:value）')
  .option('-S, --sort <column>', '按列排序')
  .option('--order <dir>', '排序方向（asc/desc）', 'asc')
  .option('-l, --limit <number>', '限制输出数量', parseInt)
  .option('--stats', '显示统计信息')
  .description('清洗数据文件')
  .action(async (input, output, options) => {
    if (!fs.existsSync(input)) {
      console.log(chalk.red(`文件不存在: ${input}`));
      process.exit(1);
    }
    
    const ext = path.extname(input).toLowerCase();
    const outputFormat = options.format || (ext === '.json' ? 'json' : 'csv');
    const outputFile = output || input.replace(/\.[^.]+$/, `.cleaned.${outputFormat}`);
    
    console.log(chalk.cyan(`\n🔧 清洗数据\n`));
    console.log(chalk.gray(`输入: ${input}`));
    console.log(chalk.gray(`输出: ${outputFile}\n`));
    
    const data = await readFile(input);
    
    // 显示原始统计
    if (options.stats) {
      console.log(chalk.cyan('原始数据:'));
      printStats(getStats(data));
    }
    
    // 解析过滤表达式
    if (options.filter) {
      const parts = options.filter.split(':');
      if (parts.length === 3) {
        options.filter = {
          column: parts[0],
          operator: parts[1],
          value: parts[2]
        };
      }
    }
    
    // 解析列
    if (options.columns) {
      options.columns = options.columns.split(',');
    }
    
    // 清洗数据
    const cleaned = cleanData(data, options);
    
    // 显示清洗后统计
    if (options.stats) {
      console.log(chalk.cyan('清洗后数据:'));
      printStats(getStats(cleaned));
    }
    
    // 写入文件
    await writeFile(outputFile, cleaned, outputFormat);
    
    console.log(chalk.green(`✅ 已保存到: ${outputFile}`));
    
    // 显示差异
    const originalCount = Array.isArray(data) ? data.length : 1;
    const cleanedCount = Array.isArray(cleaned) ? cleaned.length : 1;
    if (originalCount !== cleanedCount) {
      console.log(chalk.yellow(`   从 ${originalCount} 行减少到 ${cleanedCount} 行`));
    }
    
    console.log();
  });

program.parse();

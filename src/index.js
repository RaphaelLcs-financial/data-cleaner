#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const {
  DataValidator,
  createValidatorFromConfig
} = require('./validator.js');
const {
  groupAndAggregate,
  groupByTime,
  getGroupStats,
  pivotTable,
  printGroupStats
} = require('./grouper.js');

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
          case 'regex':
            return new RegExp(value).test(String(itemValue));
          default:
            return true;
        }
      });
    }
  }

// 数据转换
  if (options.transform) {
    if (Array.isArray(cleaned)) {
      const { column, transform: transformFn } = options.transform;
      cleaned = cleaned.map(item => {
        if (column && item[column] !== undefined) {
          switch (transformFn) {
            case 'uppercase':
              item[column] = String(item[column]).toUpperCase();
              break;
            case 'lowercase':
              item[column] = String(item[column]).toLowerCase();
              break;
            case 'capitalize':
              item[column] = String(item[column]).charAt(0).toUpperCase() + String(item[column]).slice(1).toLowerCase();
              break;
            case 'trim':
              item[column] = String(item[column]).trim();
              break;
            case 'number':
              item[column] = Number(item[column]);
              break;
            case 'string':
              item[column] = String(item[column]);
              break;
            default:
              if (transformFn.startsWith('replace:')) {
                const [from, to] = transformFn.split(':')[1].split(',');
                item[column] = String(item[column]).split(from).join(to);
              } else if (transformFn.startsWith('multiply:')) {
                const factor = Number(transformFn.split(':')[1]);
                item[column] = Number(item[column]) * factor;
              } else if (transformFn.startsWith('divide:')) {
                const divisor = Number(transformFn.split(':')[1]);
                item[column] = Number(item[column]) / divisor;
              }
          }
        }
        return item;
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
  .option('--transform <expr>', '转换表达式（column:transform[:args]）')
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

    // 解析转换表达式
    if (options.transform) {
      const parts = options.transform.split(':');
      if (parts.length >= 2) {
        options.transform = {
          column: parts[0],
          transform: parts[1]
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

// 验证命令
program
  .command('validate <input>')
  .option('-c, --config <path>', '验证规则配置文件（JSON）')
  .option('-o, --output <path>', '输出错误报告到文件')
  .option('--format <type>', '输出格式（json/csv）', 'json')
  .description('验证数据')
  .action(async (input, options) => {
    if (!fs.existsSync(input)) {
      console.log(chalk.red(`文件不存在: ${input}`));
      process.exit(1);
    }

    const data = await readFile(input);

    if (!Array.isArray(data)) {
      console.log(chalk.red('数据必须是数组格式'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n✅ 验证数据\n`));

    let validator;

    // 从配置文件加载规则
    if (options.config) {
      if (!fs.existsSync(options.config)) {
        console.log(chalk.red(`配置文件不存在: ${options.config}`));
        process.exit(1);
      }
      const configContent = fs.readFileSync(options.config, 'utf-8');
      const config = JSON.parse(configContent);
      validator = createValidatorFromConfig(config);
      console.log(chalk.gray(`从配置文件加载规则: ${options.config}`));
    } else {
      // 没有配置，提示用户
      console.log(chalk.yellow('未提供验证规则配置，跳过验证'));
      console.log(chalk.gray('使用 --config 指定验证规则文件\n'));
      process.exit(0);
    }

    console.log(chalk.gray(`规则数量: ${validator.getRuleCount()}`));
    console.log();

    // 执行验证
    const errors = validator.getErrors(data);

    if (errors.length === 0) {
      console.log(chalk.green('✓ 所有数据验证通过！\n'));
    } else {
      console.log(chalk.red(`✗ 发现 ${errors.length} 个验证错误:\n`));

      // 显示前 20 个错误
      const displayErrors = errors.slice(0, 20);
      for (const error of displayErrors) {
        console.log(chalk.red(`  [行 ${error.row}] ${error.field}`));
        console.log(chalk.gray(`    规则: ${error.rule}`));
        console.log(chalk.gray(`    值: ${error.value}`));
        console.log(chalk.gray(`    消息: ${error.message}\n`));
      }

      if (errors.length > 20) {
        console.log(chalk.yellow(`... 还有 ${errors.length - 20} 个错误\n`));
      }
    }

    // 输出错误报告
    if (options.output && errors.length > 0) {
      if (options.format === 'csv') {
        const headers = ['row', 'field', 'rule', 'value', 'message'];
        const rows = errors.map(e => [
          e.row, e.field, e.rule,
          `"${String(e.value).replace(/"/g, '""')}"`,
          `"${e.message.replace(/"/g, '""')}"`
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        fs.writeFileSync(options.output, csv, 'utf-8');
      } else {
        fs.writeFileSync(options.output, JSON.stringify(errors, null, 2), 'utf-8');
      }
      console.log(chalk.green(`✓ 错误报告已保存到: ${options.output}\n`));
    }

    process.exit(errors.length === 0 ? 0 : 1);
  });

// 分组命令
program
  .command('group <input>')
  .option('-g, --group-by <field>', '分组字段（支持多个，逗号分隔）')
  .option('-a, --aggregate <expr>', '聚合表达式（field:aggType，逗号分隔）')
  .option('-t, --time-field <field>', '时间字段（用于时间分组）')
  .option('-i, --interval <type>', '时间间隔（minute/hour/day/week/month/year）', 'day')
  .option('-o, --output <path>', '输出文件')
  .option('-f, --format <type>', '输出格式（json/csv）', 'json')
  .option('--stats', '显示统计信息')
  .description('分组和聚合数据')
  .action(async (input, options) => {
    if (!fs.existsSync(input)) {
      console.log(chalk.red(`文件不存在: ${input}`));
      process.exit(1);
    }

    const data = await readFile(input);

    if (!Array.isArray(data)) {
      console.log(chalk.red('数据必须是数组格式'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n📊 分组和聚合\n`));

    let result;

    // 时间分组
    if (options.timeField) {
      const groups = groupByTime(data, options.timeField, options.interval);
      console.log(chalk.gray(`时间字段: ${options.timeField}`));
      console.log(chalk.gray(`时间间隔: ${options.interval}`));
      console.log(chalk.gray(`分组数量: ${Object.keys(groups).length}\n`));

      if (options.stats && options.aggregate) {
        const aggParts = options.aggregate.split(',');
        const aggregations = {};
        for (const part of aggParts) {
          const [field, aggType] = part.split(':');
          aggregations[field] = aggType;
        }

        const stats = getGroupStats(groups, Object.keys(aggregations)[0]);
        printGroupStats(stats);

        // 转换为数组输出
        result = groupAndAggregate(data, options.timeField, aggregations);
      } else {
        result = groups;
      }
    } else if (options.groupBy) {
      // 字段分组
      const groupByFields = options.groupBy.split(',');
      const aggregations = {};

      if (options.aggregate) {
        const aggParts = options.aggregate.split(',');
        for (const part of aggParts) {
          const [field, aggType] = part.split(':');
          aggregations[field] = aggType;
        }
      }

      console.log(chalk.gray(`分组字段: ${groupByFields.join(', ')}`));
      console.log(chalk.gray(`聚合规则: ${Object.keys(aggregations).join(', ') || '无'}\n`));

      result = groupAndAggregate(data, groupByFields, aggregations);

      // 显示结果
      if (options.stats) {
        for (const item of result) {
          console.log(chalk.cyan(`  ${item._group}`));
          console.log(chalk.gray(`    数量: ${item._count}`));
          for (const [key, value] of Object.entries(item)) {
            if (!key.startsWith('_')) {
              console.log(chalk.gray(`    ${key}: ${typeof value === 'number' ? value.toFixed(2) : value}`));
            }
          }
          console.log();
        }
      }
    } else {
      console.log(chalk.red('必须指定 --group-by 或 --time-field'));
      process.exit(1);
    }

    // 输出文件
    if (options.output) {
      if (options.format === 'csv') {
        await writeFile(options.output, result, 'csv');
      } else {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2), 'utf-8');
      }
      console.log(chalk.green(`✓ 已保存到: ${options.output}\n`));
    }
  });

// 透视表命令
program
  .command('pivot <input>')
  .option('-r, --rows <field>', '行字段')
  .option('-c, --columns <field>', '列字段')
  .option('-v, --values <field>', '值字段')
  .option('-a, --agg <func>', '聚合函数（sum/avg/count/min/max）', 'sum')
  .option('-o, --output <path>', '输出文件')
  .description('创建数据透视表')
  .action(async (input, options) => {
    if (!fs.existsSync(input)) {
      console.log(chalk.red(`文件不存在: ${input}`));
      process.exit(1);
    }

    if (!options.rows || !options.columns || !options.values) {
      console.log(chalk.red('必须指定 --rows, --columns 和 --values'));
      process.exit(1);
    }

    const data = await readFile(input);

    if (!Array.isArray(data)) {
      console.log(chalk.red('数据必须是数组格式'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\n📊 数据透视表\n`));
    console.log(chalk.gray(`行: ${options.rows}`));
    console.log(chalk.gray(`列: ${options.columns}`));
    console.log(chalk.gray(`值: ${options.values}`));
    console.log(chalk.gray(`聚合: ${options.agg}\n`));

    const pivot = pivotTable(data, options.rows, options.columns, options.values, options.agg);

    // 打印透视表
    console.log(chalk.cyan(`    ${pivot.columns.join('        ')}`));
    for (const row of pivot.rows) {
      const rowData = [row];
      for (const col of pivot.columns) {
        const value = pivot.data[row][col];
        rowData.push((typeof value === 'number' ? value.toFixed(2) : value).padStart(12));
      }
      console.log(chalk.cyan(rowData.join('  ')));
    }
    console.log();

    // 输出文件
    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(pivot, null, 2), 'utf-8');
      console.log(chalk.green(`✓ 已保存到: ${options.output}\n`));
    }
  });

program.parse();

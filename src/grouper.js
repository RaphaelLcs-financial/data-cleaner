// 分组统计模块

/**
 * 按字段分组
 * @param {Array} data - 数据数组
 * @param {string} groupByField - 分组字段
 * @returns {Object} 分组结果
 */
function groupBy(data, groupByField) {
  const groups = {};

  for (const item of data) {
    const key = item[groupByField];
    if (groups[key] === undefined) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

/**
 * 按多个字段分组
 * @param {Array} data - 数据数组
 * @param {Array<string>} groupByFields - 分组字段数组
 * @returns {Object} 分组结果
 */
function groupByMultiple(data, groupByFields) {
  const groups = {};

  for (const item of data) {
    const keyParts = groupByFields.map(field => {
      const value = item[field];
      return value !== undefined && value !== null ? String(value) : '__null__';
    });
    const key = keyParts.join('|');

    if (groups[key] === undefined) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

/**
 * 计算组的统计信息
 * @param {Array} group - 组数据
 * @param {Object} aggregations - 聚合规则
 * @returns {Object} 统计结果
 */
function aggregateGroup(group, aggregations) {
  const result = {};

  for (const [fieldName, aggType] of Object.entries(aggregations)) {
    const values = group
      .map(item => item[fieldName])
      .filter(v => v !== null && v !== undefined && v !== '');

    switch (aggType) {
      case 'sum':
        result[fieldName] = values.reduce((sum, v) => sum + (Number(v) || 0), 0);
        break;

      case 'avg':
        result[fieldName] = values.length > 0
          ? values.reduce((sum, v) => sum + (Number(v) || 0), 0) / values.length
          : 0;
        break;

      case 'min':
        result[fieldName] = Math.min(...values.map(v => Number(v) || Infinity));
        break;

      case 'max':
        result[fieldName] = Math.max(...values.map(v => Number(v) || -Infinity));
        break;

      case 'count':
        result[fieldName] = values.length;
        break;

      case 'count_distinct':
        result[fieldName] = new Set(values).size;
        break;

      case 'first':
        result[fieldName] = values[0];
        break;

      case 'last':
        result[fieldName] = values[values.length - 1];
        break;

      case 'concat':
        result[fieldName] = values.join(', ');
        break;

      case 'array':
        result[fieldName] = values;
        break;

      default:
        if (aggType.startsWith('percentile:')) {
          const p = parseInt(aggType.split(':')[1]);
          result[fieldName] = calculatePercentile(values.map(v => Number(v)), p);
        }
    }
  }

  return result;
}

/**
 * 计算百分位数
 * @param {Array<number>} values - 数值数组
 * @param {number} percentile - 百分位数（0-100）
 * @returns {number}
 */
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);

  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= sorted.length) {
    return sorted[sorted.length - 1];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * 分组并聚合
 * @param {Array} data - 数据数组
 * @param {string|Array<string>} groupBy - 分组字段
 * @param {Object} aggregations - 聚合规则
 * @returns {Array} 分组聚合结果
 */
function groupAndAggregate(data, groupBy, aggregations) {
  const groupByFields = Array.isArray(groupBy) ? groupBy : [groupBy];
  const groups = groupByMultiple(data, groupByFields);

  const result = [];

  for (const [key, group] of Object.entries(groups)) {
    const keyParts = key.split('|');

    const groupResult = {
      _group: key,
      _count: group.length
    };

    // 添加分组字段
    groupByFields.forEach((field, index) => {
      groupResult[field] = keyParts[index] === '__null__' ? null : keyParts[index];
    });

    // 添加聚合结果
    const aggResults = aggregateGroup(group, aggregations);
    Object.assign(groupResult, aggResults);

    result.push(groupResult);
  }

  return result;
}

/**
 * 按时间分组
 * @param {Array} data - 数据数组
 * @param {string} dateField - 日期字段
 * @param {string} interval - 时间间隔（day/week/month/year/hour/minute）
 * @returns {Object} 分组结果
 */
function groupByTime(data, dateField, interval = 'day') {
  const groups = {};

  for (const item of data) {
    const date = new Date(item[dateField]);
    if (isNaN(date.getTime())) continue;

    let key;
    switch (interval) {
      case 'minute':
        key = date.toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
        break;
      case 'hour':
        key = date.toISOString().substring(0, 13); // YYYY-MM-DDTHH
        break;
      case 'day':
        key = date.toISOString().substring(0, 10); // YYYY-MM-DD
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().substring(0, 10);
        break;
      case 'month':
        key = date.toISOString().substring(0, 7); // YYYY-MM
        break;
      case 'year':
        key = date.toISOString().substring(0, 4); // YYYY
        break;
      default:
        key = date.toISOString().substring(0, 10);
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

/**
 * 计算分组统计信息
 * @param {Object} groups - 分组结果
 * @param {string} statField - 统计字段
 * @returns {Array} 统计信息
 */
function getGroupStats(groups, statField) {
  const stats = [];

  for (const [key, group] of Object.entries(groups)) {
    const values = group
      .map(item => Number(item[statField]))
      .filter(v => !isNaN(v));

    if (values.length === 0) {
      stats.push({
        group: key,
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0
      });
      continue;
    }

    stats.push({
      group: key,
      count: values.length,
      sum: values.reduce((sum, v) => sum + v, 0),
      avg: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    });
  }

  return stats.sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * 数据透视表
 * @param {Array} data - 数据数组
 * @param {string} rowField - 行字段
 * @param {string} columnField - 列字段
 * @param {string} valueField - 值字段
 * @param {string} aggFunction - 聚合函数（sum/avg/count/min/max）
 * @returns {Object} 透视表
 */
function pivotTable(data, rowField, columnField, valueField, aggFunction = 'sum') {
  const rows = new Set();
  const columns = new Set();
  const values = {};

  // 收集行、列和值
  for (const item of data) {
    const rowKey = item[rowField];
    const colKey = item[columnField];
    const val = Number(item[valueField]) || 0;

    rows.add(rowKey);
    columns.add(colKey);

    const key = `${rowKey}::${colKey}`;
    if (!values[key]) {
      values[key] = [];
    }
    values[key].push(val);
  }

  // 计算聚合值
  const pivot = {};

  for (const row of rows) {
    pivot[row] = {};
    for (const col of columns) {
      const key = `${row}::${col}`;
      const vals = values[key] || [];

      let aggValue;
      switch (aggFunction) {
        case 'sum':
          aggValue = vals.reduce((sum, v) => sum + v, 0);
          break;
        case 'avg':
          aggValue = vals.length > 0 ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0;
          break;
        case 'count':
          aggValue = vals.length;
          break;
        case 'min':
          aggValue = vals.length > 0 ? Math.min(...vals) : 0;
          break;
        case 'max':
          aggValue = vals.length > 0 ? Math.max(...vals) : 0;
          break;
        default:
          aggValue = vals.reduce((sum, v) => sum + v, 0);
      }

      pivot[row][col] = aggValue;
    }
  }

  return {
    rows: Array.from(rows).sort(),
    columns: Array.from(columns).sort(),
    data: pivot
  };
}

/**
 * 打印分组统计
 * @param {Array} stats - 统计信息
 */
function printGroupStats(stats) {
  console.log('\n📊 分组统计\n');

  for (const stat of stats) {
    console.log(`${stat.group}:`);
    console.log(`  数量: ${stat.count}`);
    console.log(`  总和: ${stat.sum.toFixed(2)}`);
    console.log(`  平均: ${stat.avg.toFixed(2)}`);
    console.log(`  最小: ${stat.min.toFixed(2)}`);
    console.log(`  最大: ${stat.max.toFixed(2)}`);
    console.log();
  }
}

module.exports = {
  groupBy,
  groupByMultiple,
  groupAndAggregate,
  groupByTime,
  getGroupStats,
  pivotTable,
  printGroupStats
};

// 数据验证模块

/**
 * 验证规则类
 */
class ValidationRule {
  constructor(name, validator, errorMessage) {
    this.name = name;
    this.validator = validator;
    this.errorMessage = errorMessage;
  }
}

/**
 * 内置验证规则
 */
const BUILT_IN_RULES = {
  required: (value) => {
    return value !== null && value !== undefined && value !== '';
  },
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  },
  url: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  number: (value) => {
    return !isNaN(parseFloat(value)) && isFinite(value);
  },
  integer: (value) => {
    return Number.isInteger(Number(value));
  },
  positive: (value) => {
    return Number(value) > 0;
  },
  negative: (value) => {
    return Number(value) < 0;
  },
  min: (value, min) => {
    return Number(value) >= min;
  },
  max: (value, max) => {
    return Number(value) <= max;
  },
  minLength: (value, min) => {
    return String(value).length >= min;
  },
  maxLength: (value, max) => {
    return String(value).length <= max;
  },
  pattern: (value, pattern) => {
    return new RegExp(pattern).test(value);
  },
  enum: (value, values) => {
    return values.includes(value);
  },
  date: (value) => {
    return !isNaN(Date.parse(value));
  },
  future: (value) => {
    return new Date(value) > new Date();
  },
  past: (value) => {
    return new Date(value) < new Date();
  },
  phone: (value) => {
    // 简单的电话号码验证（国际）
    const phoneRegex = /^\+?[\d\s-()]+$/;
    return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10;
  }
};

/**
 * 数据验证器
 */
class DataValidator {
  constructor() {
    this.rules = new Map(); // fieldName -> ValidationRule[]
    this.customRules = new Map();
  }

  /**
   * 添加内置规则
   * @param {string} fieldName - 字段名
   * @param {string} ruleName - 规则名
   * @param {*} args - 规则参数
   * @param {string} errorMessage - 自定义错误信息
   */
  addRule(fieldName, ruleName, args, errorMessage) {
    if (!this.rules.has(fieldName)) {
      this.rules.set(fieldName, []);
    }

    const validator = (value) => {
      const ruleFn = BUILT_IN_RULES[ruleName];
      if (!ruleFn) {
        throw new Error(`未知规则: ${ruleName}`);
      }

      // 规则参数
      if (args !== undefined && args !== null) {
        return ruleFn(value, args);
      }

      return ruleFn(value);
    };

    this.rules.get(fieldName).push(new ValidationRule(
      ruleName,
      validator,
      errorMessage
    ));
  }

  /**
   * 添加自定义规则
   * @param {string} ruleName - 规则名
   * @param {Function} validator - 验证函数
   */
  addCustomRule(ruleName, validator) {
    this.customRules.set(ruleName, validator);
  }

  /**
   * 添加正则规则
   * @param {string} fieldName - 字段名
   * @param {string} pattern - 正则表达式
   * @param {string} errorMessage - 错误信息
   */
  addPatternRule(fieldName, pattern, errorMessage) {
    this.addRule(fieldName, 'pattern', pattern, errorMessage);
  }

  /**
   * 验证单个字段
   * @param {string} fieldName - 字段名
   * @param {*} value - 字段值
   * @returns {Object} 验证结果 { valid: boolean, errors: Array }
   */
  validateField(fieldName, value) {
    const errors = [];
    const rules = this.rules.get(fieldName) || [];

    for (const rule of rules) {
      try {
        const isValid = rule.validator(value);
        if (!isValid) {
          errors.push({
            rule: rule.name,
            message: rule.errorMessage || `${fieldName} 验证失败: ${rule.name}`
          });
        }
      } catch (error) {
        errors.push({
          rule: rule.name,
          message: `${fieldName} 验证错误: ${error.message}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证整个数据对象
   * @param {Object} data - 数据对象
   * @returns {Object} 验证结果 { valid: boolean, fieldResults: Object }
   */
  validate(data) {
    const fieldResults = {};
    let isValid = true;

    for (const [fieldName] of this.rules) {
      const result = this.validateField(fieldName, data[fieldName]);
      fieldResults[fieldName] = result;
      if (!result.valid) {
        isValid = false;
      }
    }

    return {
      valid: isValid,
      fieldResults
    };
  }

  /**
   * 验证数据数组
   * @param {Array} dataArray - 数据数组
   * @returns {Array} 验证结果数组
   */
  validateArray(dataArray) {
    return dataArray.map((data, index) => ({
      index,
      ...this.validate(data)
    }));
  }

  /**
   * 批量验证并返回错误记录
   * @param {Array} dataArray - 数据数组
   * @returns {Array} 错误记录
   */
  getErrors(dataArray) {
    const errors = [];

    for (let i = 0; i < dataArray.length; i++) {
      const validation = this.validate(dataArray[i]);
      if (!validation.valid) {
        for (const [fieldName, result] of Object.entries(validation.fieldResults)) {
          if (!result.valid) {
            for (const error of result.errors) {
              errors.push({
                row: i,
                field: fieldName,
                rule: error.rule,
                message: error.message,
                value: dataArray[i][fieldName]
              });
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * 清除所有规则
   */
  clear() {
    this.rules.clear();
  }

  /**
   * 获取规则数量
   * @returns {number}
   */
  getRuleCount() {
    let count = 0;
    for (const rules of this.rules.values()) {
      count += rules.length;
    }
    return count;
  }
}

/**
 * 从配置创建验证器
 * @param {Object} config - 验证配置
 * @returns {DataValidator}
 */
function createValidatorFromConfig(config) {
  const validator = new DataValidator();

  for (const [fieldName, fieldRules] of Object.entries(config)) {
    if (Array.isArray(fieldRules)) {
      for (const rule of fieldRules) {
        if (typeof rule === 'string') {
          // 简单规则名
          validator.addRule(fieldName, rule);
        } else if (typeof rule === 'object') {
          // 带参数的规则
          const args = rule.value !== undefined ? rule.value :
                      rule.arg !== undefined ? rule.arg :
                      rule.params;
          const errorMessage = rule.message;

          validator.addRule(
            fieldName,
            rule.name || rule.type || rule.rule,
            args,
            errorMessage
          );
        }
      }
    }
  }

  return validator;
}

module.exports = {
  DataValidator,
  ValidationRule,
  BUILT_IN_RULES,
  createValidatorFromConfig
};

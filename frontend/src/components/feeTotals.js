export const tradeFeeTotal = row => Number(row.tradingFee || 0) + Number(row.financingFee || 0);
export const sumFees = (rows, field) => rows.reduce((sum, row) => sum + Math.round((field ? Number(row[field] || 0) : tradeFeeTotal(row)) * 100), 0) / 100;

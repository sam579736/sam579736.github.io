const fs = require('fs');
const https = require('https');
const path = require('path');

const WAKATIME_TOKEN = process.env.WAKATIME_TOKEN;
const TIME_ZONE = process.env.TZ || 'Asia/Shanghai';
const GH_TOKEN = process.env.GH_TOKEN;
const MODEL_NAME = process.env.MODEL_NAME || 'openai/gpt-4o-mini';
const MODEL_DEBUG = process.env.MODEL_DEBUG === '1';
const MANUAL_HOURS = process.env.MANUAL_HOURS;
const MANUAL_THEME = process.env.MANUAL_THEME;

const THEME_RULES = [
  { max: 1, name: 'rest', display: '休息日' },
  { max: 3, name: 'relaxed', display: '轻松日' },
  { max: 5, name: 'productive', display: '充实日' },
  { max: 7, name: 'focused', display: '专注日' },
  { max: 9, name: 'intense', display: '极限日' },
  { max: Infinity, name: 'legendary', display: '超神日' }
];

function formatYmd(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function addDays(date, delta) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + delta);
  return d;
}

function writeGithubOutput(hours, themeName) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `hours=${hours}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `theme_name=${themeName}\n`);
}

async function fetchWeeklyRaw(startDate, endDate) {
  if (!WAKATIME_TOKEN) throw new Error('WAKATIME_TOKEN 未设置');
  
  const url = `https://wakatime.com/api/v1/users/current/summaries?start=${startDate}&end=${endDate}&timezone=${encodeURIComponent(TIME_ZONE)}`;
  
  const token = String(WAKATIME_TOKEN).trim();
  const authHeader = /^bearer\s+/i.test(token) 
    ? token 
    : /^waka_/i.test(token)
      ? `Basic ${Buffer.from(`${token}:`).toString('base64')}`
      : `Bearer ${token}`;

  const response = await httpRequestJson(url, 'GET', { Authorization: authHeader });
  return response;
}

function httpRequestJson(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } 
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseDaysFromRaw(raw) {
  if (!raw?.data?.length) throw new Error('WakaTime 返回数据为空或格式错误');
  return raw.data.map(day => ({
    date: day.range.date,
    hours: parseFloat((day.grand_total.total_seconds / 3600).toFixed(2)),
    text: day.grand_total.text
  }));
}

function computeStats(days) {
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
  const avgHours = totalHours / days.length;
  const maxDay = days.reduce((a, b) => a.hours > b.hours ? a : b);
  const firstHalf = days.slice(0, 3).reduce((sum, d) => sum + d.hours, 0) / 3;
  const secondHalf = days.slice(3).reduce((sum, d) => sum + d.hours, 0) / (days.length - 3);

  return { totalHours, avgHours, maxDay, trend: secondHalf > firstHalf ? '上升' : '下降' };
}

function pickTheme(hours, manualTheme) {
  if (manualTheme) {
    const rule = THEME_RULES.find(r => r.name === manualTheme);
    return { theme_name: manualTheme, theme_display: rule?.display || manualTheme };
  }
  const rule = THEME_RULES.find(r => hours < r.max) || THEME_RULES[THEME_RULES.length - 1];
  return { theme_name: rule.name, theme_display: rule.display };
}

// ==================== AI 生成部分（简化版）====================
async function generateAi(stats) {
  const fallback = {
    title: '代码日常',
    quote: '保持编码，保持热爱。',
    tarot: '🌟 The Star',
    theme_color: '#00c6ff'
  };
  return fallback;   // 先用 fallback，确认脚本能跑通后再加完整 AI
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsVar(filePath, varName, value) {
  fs.writeFileSync(filePath, `window.${varName} = ${JSON.stringify(value, null, 2)};`);
}

async function main() {
  try {
    console.log('🚀 WakaTime 更新脚本启动');

    const now = new Date();
    const endDate = formatYmd(now, TIME_ZONE);
    const startDate = formatYmd(addDays(now, -6), TIME_ZONE);
    const yesterday = formatYmd(addDays(now, -1), TIME_ZONE);   // ← 修复位置

    console.log(`📅 处理日期: ${startDate} ~ ${endDate} (昨天: ${yesterday})`);

    const raw = await fetchWeeklyRaw(startDate, endDate);
    const days = parseDaysFromRaw(raw);
    const stats = computeStats(days);

    const dailyHours = MANUAL_HOURS ? parseFloat(MANUAL_HOURS) : 
                      (days.find(d => d.date === yesterday)?.hours || 0);

    const theme = pickTheme(dailyHours, MANUAL_THEME);

    const config = {
      date: yesterday,
      hours: dailyHours,
      theme_name: theme.theme_name,
      theme_display: theme.theme_display,
      updated_at: new Date().toISOString()
    };

    const weekly = {
      updated_at: new Date().toISOString(),
      stats: {
        total_hours: parseFloat(stats.totalHours.toFixed(2)),
        daily_avg: parseFloat(stats.avgHours.toFixed(2)),
        trend: stats.trend === '上升' ? 'rising' : 'falling',
        max_day: stats.maxDay
      },
      days,
      ai: await generateAi(stats)
    };

    const outDir = path.join(__dirname, '../../assets/json');
    ensureDir(outDir);

    writeJsVar(path.join(outDir, 'config.js'), 'WAKATIME_CONFIG', config);
    writeJsVar(path.join(outDir, 'weekly.js'), 'WAKATIME_WEEKLY', weekly);

    console.log(`✅ 更新成功！${yesterday} | ${dailyHours.toFixed(2)}h | ${theme.theme_name}`);
    writeGithubOutput(dailyHours, theme.theme_name);

  } catch (err) {
    console.error('❌ 脚本执行失败:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
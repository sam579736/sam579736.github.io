const fs = require('fs');
const https = require('https');
const path = require('path');

const WAKATIME_TOKEN = process.env.WAKATIME_TOKEN;
const TIME_ZONE = process.env.TZ || 'Asia/Shanghai';
const GH_TOKEN = process.env.GH_TOKEN;
const MODEL_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'openai/gpt-4o-mini';   // ← 修改
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

function httpRequestJson(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      res.setEncoding('utf8');
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchWeeklyRaw(startDate, endDate) {
  if (!WAKATIME_TOKEN) throw new Error('WAKATIME_TOKEN is required.');

  const url = `https://wakatime.com/api/v1/users/current/summaries?start=${startDate}&end=${endDate}&timezone=${encodeURIComponent(TIME_ZONE)}`;
  
  const token = String(WAKATIME_TOKEN).trim();
  let authHeader = /^bearer\s+/i.test(token) 
    ? token 
    : /^waka_/i.test(token)
      ? `Basic ${Buffer.from(`${token}:`, 'utf8').toString('base64')}`
      : `Bearer ${token}`;

  return httpRequestJson(url, 'GET', { Authorization: authHeader });
}

function parseDaysFromRaw(raw) {
  if (!raw?.data?.length) throw new Error('Invalid WakaTime data');
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
  
  return {
    totalHours,
    avgHours,
    maxDay,
    trend: secondHalf > firstHalf ? '上升' : '下降'
  };
}

function pickTheme(hours, manualTheme) {
  if (manualTheme) {
    const rule = THEME_RULES.find(r => r.name === manualTheme);
    return { theme_name: manualTheme, theme_display: rule?.display || manualTheme };
  }
  const rule = THEME_RULES.find(r => hours < r.max) || THEME_RULES[THEME_RULES.length - 1];
  return { theme_name: rule.name, theme_display: rule.display };
}

// ...（normalizeAiResult、truncateByCodePoints、isHexColor 函数保持不变）

async function generateAi(days, stats) {
  // Fallback 数据保持不变（你的原代码很好）
  const FALLBACK_SCENARIOS = [ /* ... 你的原 fallback 内容 ... */ ];

  const fallbackData = FALLBACK_SCENARIOS.find(s => stats.avgHours < s.max).data;
  let aiResult = { ...fallbackData };

  if (!GH_TOKEN) {
    console.log('⚠️ GH_TOKEN not set, using fallback AI content.');
    return normalizeAiResult(aiResult, fallbackData);
  }

  const prompt = `...你的 prompt...`;   // 保持你的 prompt

  try {
    let response = await callModel(prompt, MODEL_NAME);
    
    // 如果主要模型失败，自动降级到 gpt-4o-mini
    if (response?.error) {
      console.log(`Model ${MODEL_NAME} failed, trying gpt-4o-mini...`);
      response = await callModel(prompt, 'openai/gpt-4o-mini');
    }

    const content = response?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/```json|```/gi, '').trim();
    
    if (cleaned) {
      const candidate = JSON.parse(cleaned);
      aiResult = normalizeAiResult(candidate, fallbackData);
    }
  } catch (err) {
    console.error('AI generation failed, using fallback:', err.message);
  }

  return normalizeAiResult(aiResult, fallbackData);
}

// 保持 writeJsVar、ensureDir 等函数不变

async function main() {
  try {
    const now = new Date();
    const endDate = formatYmd(now, TIME_ZONE);
    const startDate = formatYmd(addDays(now, -6), TIME_ZONE);
    const yesterday = formatYmd(addDays(now, -1), TIME_ZONE);

    const raw = await fetchWeeklyRaw(startDate, endDate);
    const days = parseDaysFromRaw(raw);
    const stats = computeStats(days);

    const dailyHours = MANUAL_HOURS 
      ? parseFloat(MANUAL_HOURS) 
      : (days.find(d => d.date === yesterday)?.hours || 0);

    const theme = pickTheme(dailyHours, MANUAL_THEME);
    const config = { /* ... */ };
    const weekly = { /* ... */ };

    const outDir = path.join(__dirname, '../../assets/json');
    ensureDir(outDir);

    writeJsVar(path.join(outDir, 'config.js'), 'WAKATIME_CONFIG', config);
    writeJsVar(path.join(outDir, 'weekly.js'), 'WAKATIME_WEEKLY', weekly);

    console.log(`✅ Success: ${yesterday} | ${dailyHours}h | ${theme.theme_name}`);
    writeGithubOutput(dailyHours, theme.theme_name);
  } catch (err) {
    console.error('❌ WakaTime update failed:', err.message);
    process.exit(1);
  }
}

main();
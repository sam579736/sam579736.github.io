// ... 其他代码保持不变 ...

async function fetchWeeklyRaw(startDate, endDate) {
  if (!WAKATIME_TOKEN) {
    throw new Error('❌ WAKATIME_TOKEN 未设置或为空');
  }
  // ... 原有代码 ...
}

async function callModel(prompt, modelName) {
  console.log(`🔄 调用 GitHub Models: ${modelName}`);
  // ... 原有请求代码 ...

  if (response?.error) {
    console.error('❌ Model API Error:', JSON.stringify(response.error, null, 2));
  }
}

async function main() {
  try {
    console.log('🚀 WakaTime 更新脚本启动');
    // ... 原有 main 逻辑 ...

    console.log(`✅ 生成成功: ${yesterday} | ${dailyHours.toFixed(2)}h | ${theme.theme_name}`);
    writeGithubOutput(dailyHours, theme.theme_name);
  } catch (err) {
    console.error('❌ 脚本执行失败:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
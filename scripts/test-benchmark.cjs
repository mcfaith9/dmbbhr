/**
 * Standalone Performance Benchmark for 10K, 50K, 90K, 100K+ Biometric Records
 */

function getManilaDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function processEmployeeDayPunches(bioId, logs, selectedDate) {
  logs.sort((a, b) => a.timeMs - b.timeMs);
  const thresholdMs = 30 * 1000;
  const validPunches = [];

  let lastValidMs = -Infinity;
  for (let i = 0; i < logs.length; i++) {
    const p = logs[i];
    if (i > 0 && (p.timeMs - lastValidMs) <= thresholdMs) {
      // duplicate punch
    } else {
      validPunches.push(p);
      lastValidMs = p.timeMs;
    }
  }

  const validCount = validPunches.length;
  let status = 'Regular Day';
  if (validCount === 1) {
    status = 'Awaiting OUT';
  } else if (validCount >= 2) {
    const diffHours = (validPunches[validCount - 1].timeMs - validPunches[0].timeMs) / 3600000;
    status = diffHours >= 0.5 ? 'Regular Day' : 'Awaiting OUT';
  }

  return {
    bioId,
    rawCount: logs.length,
    validCount,
    status
  };
}

function runBenchmark(count) {
  console.log(`\n========================================================`);
  console.log(`BENCHMARK RUN: ${count.toLocaleString()} RAW BIOMETRIC RECORDS`);
  console.log(`========================================================`);

  const genStart = Date.now();
  const logs = [];
  const todayStr = getManilaDateString(new Date());

  for (let i = 0; i < count; i++) {
    const isToday = i < Math.round(count * 0.05);
    const dayOffset = isToday ? 0 : 1 + (i % 180);
    const hour = 7 + (i % 12);
    const min = i % 60;
    const sec = (i * 7) % 60;
    const timeMs = Date.now() - (dayOffset * 86400000) + (hour * 3600000) + (min * 60000);
    const dateStr = isToday ? todayStr : `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`;

    logs.push({
      id: `log-${i}`,
      user_id: String(50000 + (i % 150)),
      dateStr,
      timeMs
    });
  }
  console.log(`1. Dataset Generation:     ${Date.now() - genStart} ms`);

  // Indexing by date
  const indexStart = Date.now();
  const dateMap = new Map();
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    if (!dateMap.has(l.dateStr)) {
      dateMap.set(l.dateStr, []);
    }
    dateMap.get(l.dateStr).push(l);
  }
  console.log(`2. Date Partition Index:   ${Date.now() - indexStart} ms (Indexed into ${dateMap.size} distinct days)`);

  // Single Day O(1) Lookup
  const lookupStart = Date.now();
  const todayPunches = dateMap.get(todayStr) || [];
  console.log(`3. Single Day O(1) Lookup: ${Date.now() - lookupStart} ms (Retrieved ${todayPunches.length} punches out of ${count.toLocaleString()})`);

  // Daily Attendance Processing with Duplicate Collapsing
  const engineStart = Date.now();
  const userGroups = new Map();
  for (let i = 0; i < todayPunches.length; i++) {
    const p = todayPunches[i];
    if (!userGroups.has(p.user_id)) {
      userGroups.set(p.user_id, []);
    }
    userGroups.get(p.user_id).push(p);
  }

  const dailyRecords = [];
  for (const [uid, userPunches] of userGroups.entries()) {
    dailyRecords.push(processEmployeeDayPunches(uid, userPunches, todayStr));
  }
  console.log(`4. Daily Attendance Engine: ${Date.now() - engineStart} ms (Processed ${dailyRecords.length} employees)`);

  // Pagination Slice
  const pageStart = Date.now();
  const paged = logs.slice(1000, 1025);
  console.log(`5. Data Layer Pagination:  ${Date.now() - pageStart} ms (Sliced 25 items)`);
  console.log(`========================================================\n`);
}

runBenchmark(10000);
runBenchmark(50000);
runBenchmark(90000);
runBenchmark(100000);

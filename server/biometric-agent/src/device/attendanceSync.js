/**
 * Historical Attendance Sync & Exporter for BISMAC BISBIO B-29b
 * Implements incremental synchronization to avoid re-pulling 24,000+ logs on every start.
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CURSOR_FILE = path.join(__dirname, '../../sync_cursor.json');

function loadSyncCursor() {
  try {
    if (fs.existsSync(CURSOR_FILE)) {
      const content = fs.readFileSync(CURSOR_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    // fallback
  }
  return { lastSerialNumber: 0, lastSyncTime: null, totalImported: 0 };
}

function saveSyncCursor(cursor) {
  try {
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2), 'utf8');
  } catch (e) {
    console.error('[Sync] Failed to save cursor:', e.message);
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Fetches users and attendances from B-29b with user mapping and incremental filter
 */
async function syncHistoricalAttendance(device, config, options = { exportFiles: false }) {
  console.log(`[DMBBHR Sync] Reading users from B-29b...`);
  const usersResult = await device.getUsers();
  const users = Array.isArray(usersResult)
    ? usersResult
    : (usersResult && Array.isArray(usersResult.data) ? usersResult.data : []);

  console.log(`[DMBBHR Sync] Users found on device: ${users.length}`);

  const userMap = new Map();
  for (const user of users) {
    userMap.set(String(user.userId), user.name || "");
  }

  console.log(`[DMBBHR Sync] Reading attendance logs from B-29b memory...`);
  const attendanceResult = await device.getAttendances();
  const rawAttendance = Array.isArray(attendanceResult)
    ? attendanceResult
    : (attendanceResult && Array.isArray(attendanceResult.data) ? attendanceResult.data : []);

  console.log(`[DMBBHR Sync] Total device attendance records: ${rawAttendance.length}`);

  const cursor = loadSyncCursor();
  console.log(`[DMBBHR Sync] Last synced serial cursor: ${cursor.lastSerialNumber}`);

  const mappedRows = [];
  let maxSerial = cursor.lastSerialNumber;

  for (const record of rawAttendance) {
    const userId = String(record.user_id ?? "");
    const name = userMap.get(userId) || "";
    const serial = Number(record.sn ?? record.serial ?? 0);

    mappedRows.push({
      userId: userId,
      name: name,
      dateTime: record.record_time ?? "",
      type: record.type ?? "",
      state: record.state ?? "",
      serial: serial,
      ip: config.ip,
      location: config.location
    });

    if (serial > maxSerial) {
      maxSerial = serial;
    }
  }

  // Filter only records that are newer than cursor if cursor exists
  const newRecords = cursor.lastSerialNumber > 0
    ? mappedRows.filter(r => r.serial > cursor.lastSerialNumber)
    : mappedRows;

  console.log(`[DMBBHR Sync] New incremental records to process: ${newRecords.length}`);

  // Optional export to CSV & XLSX if requested
  if (options.exportFiles && mappedRows.length > 0) {
    // 1. Export CSV
    const header = ["User ID", "Name", "Date/Time", "Type", "State", "Serial", "IP"];
    const csvLines = [header.map(csvEscape).join(",")];
    for (const row of mappedRows) {
      csvLines.push([
        csvEscape(row.userId),
        csvEscape(row.name),
        csvEscape(row.dateTime),
        csvEscape(row.type),
        csvEscape(row.state),
        csvEscape(row.serial),
        csvEscape(row.ip)
      ].join(","));
    }
    const csvFilename = path.join(__dirname, '../../B29B_Attendance.csv');
    fs.writeFileSync(csvFilename, csvLines.join("\n"), "utf8");
    console.log(`[DMBBHR Sync] CSV file generated: ${csvFilename}`);

    // 2. Export XLSX
    const excelRows = mappedRows.map(r => ({
      "User ID": r.userId,
      "Name": r.name,
      "Date/Time": r.dateTime,
      "Type": r.type,
      "State": r.state,
      "Serial": r.serial,
      "IP": r.ip
    }));
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet["!cols"] = [
      { wch: 15 }, { wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 18 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    const excelFilename = path.join(__dirname, '../../B29B_Attendance.xlsx');
    XLSX.writeFile(workbook, excelFilename);
    console.log(`[DMBBHR Sync] Excel file generated: ${excelFilename}`);
  }

  // Update cursor
  cursor.lastSerialNumber = maxSerial;
  cursor.lastSyncTime = new Date().toISOString();
  cursor.totalImported = (cursor.totalImported || 0) + newRecords.length;
  saveSyncCursor(cursor);

  return {
    usersCount: users.length,
    totalRecords: mappedRows.length,
    newRecordsCount: newRecords.length,
    newRecords,
    allRecords: mappedRows,
    cursor
  };
}

module.exports = {
  syncHistoricalAttendance,
  loadSyncCursor,
  saveSyncCursor
};

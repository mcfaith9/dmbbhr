/**
 * Standalone export script for historical attendance logs and user lists from BISBIO B-29b
 * Run with: node server/biometric-agent/export.js
 */
const { createDeviceInstance } = require('./src/device/deviceClient');
const { syncHistoricalAttendance } = require('./src/device/attendanceSync');

async function main() {
  const { device, config } = createDeviceInstance();
  let connected = false;

  try {
    console.log("================================");
    console.log("BISBIO B-29-B ATTENDANCE EXPORT");
    console.log("Device IP:   ", config.ip);
    console.log("Device Port: ", config.port);
    console.log("Serial:      ", config.serial);
    console.log("Location:    ", config.location);
    console.log("================================");

    console.log("\nConnecting to BISBIO B-29-B...");
    await device.createSocket();
    connected = true;
    console.log("Connected successfully!");

    const result = await syncHistoricalAttendance(device, config, { exportFiles: true });

    console.log("\n================================");
    console.log("EXPORT COMPLETE");
    console.log("================================");
    console.log(`Users:               ${result.usersCount}`);
    console.log(`Attendance records:  ${result.totalRecords}`);
    console.log(`New sync records:    ${result.newRecordsCount}`);
    console.log(`Cursor last SN:      ${result.cursor.lastSerialNumber}`);
    console.log("\nFirst 10 records:");
    console.table(result.allRecords.slice(0, 10));

  } catch (error) {
    console.error("\n================================");
    console.error("EXPORT ERROR");
    console.error("================================");
    console.error(error.message || error);
  } finally {
    if (connected) {
      try {
        await device.disconnect();
        console.log("\nDisconnected safely.");
      } catch (e) {
        console.error("Disconnect error:", e.message);
      }
    }
  }
}

if (require.main === module) {
  main();
}

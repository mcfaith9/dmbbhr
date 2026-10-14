const ZKLib = require('zkteco-js');

async function main() {
  const device = new ZKLib('192.168.1.201', 4370, 10000, 4000);

  try {
    await device.createSocket();
    console.log('Connected to BISBIO B-29b');

    const result = await device.getFaceOn();
    console.log('Face Function Status:', result);
  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    try {
      await device.disconnect();
    } catch {}
  }
}

main();
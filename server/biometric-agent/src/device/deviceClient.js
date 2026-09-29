/**
 * Device Client configuration and lifecycle manager for BISMAC BISBIO B-29b
 */
const ZKLib = require('zkteco-js');

const DEFAULT_CONFIG = {
  name: 'BISMAC BISBIO B-29b',
  ip: process.env.DEVICE_IP || '192.168.1.201',
  port: parseInt(process.env.DEVICE_PORT || '4370', 10),
  timeout: 10000,
  inactivityTimeout: 4000,
  subnet: '255.255.255.0',
  gateway: '0.0.0.0',
  serial: '0476141400046',
  mac: '00:17:61:10:0c:a3',
  firmware: '6.5.4 Build 142',
  location: 'DBB Cebu',
  location_id: 'loc-cebu'
};

function createDeviceInstance(customConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  const device = new ZKLib(
    config.ip,
    config.port,
    config.timeout,
    config.inactivityTimeout
  );
  return { device, config };
}

module.exports = {
  DEFAULT_CONFIG,
  createDeviceInstance
};

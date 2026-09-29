/**
 * Laravel API client for dispatching attendance events and batch records.
 * Uses HMAC/Bearer or X-Agent-Key header to authenticate the local device agent.
 */
const axios = require('axios');

class LaravelClient {
  constructor(baseUrl, agentSecret) {
    this.baseUrl = baseUrl || process.env.LARAVEL_API_URL || 'http://127.0.0.1:8000/api';
    this.agentSecret = agentSecret || process.env.AGENT_SECRET_KEY || 'dmbbhr-secret-agent-key';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Agent-Key': this.agentSecret
    };
  }

  /**
   * Dispatches a single real-time attendance event to POST /api/attendance/device-event
   */
  async sendDeviceEvent(eventPayload) {
    const url = `${this.baseUrl}/attendance/device-event`;
    try {
      const response = await axios.post(url, eventPayload, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      const msg = error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message;
      throw new Error(`Failed to send event to Laravel (${url}): ${msg}`);
    }
  }

  /**
   * Dispatches a batch of historical synced records to POST /api/attendance/batch-sync
   */
  async sendBatchSync(records) {
    const url = `${this.baseUrl}/attendance/batch-sync`;
    try {
      const response = await axios.post(url, { records }, {
        headers: this.getHeaders(),
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      const msg = error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message;
      throw new Error(`Failed to send batch to Laravel (${url}): ${msg}`);
    }
  }

  /**
   * Updates biometric device heartbeat/online status in Laravel
   */
  async sendHeartbeat(deviceInfo) {
    const url = `${this.baseUrl}/devices/heartbeat`;
    try {
      const response = await axios.post(url, deviceInfo, {
        headers: this.getHeaders(),
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      // Non-fatal
      console.warn(`[Laravel Heartbeat] Heartbeat warning:`, error.message);
    }
  }
}

module.exports = {
  LaravelClient
};

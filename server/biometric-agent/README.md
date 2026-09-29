# DMBBHR Biometric Device Agent Setup Guide

## Hardware Specifications
- **Device Model:** BISMAC BISBIO B-29b
- **Default IP:** `192.168.1.201`
- **Default Port:** `4370` (UDP / TCP)
- **Serial Number:** `0476141400046`
- **Branch Location:** DBB Cebu (Future expansion: DBB Negros, DBB Iloilo)

## How to Run the Local Node.js Agent on the Office Server

1. Open a terminal on the machine on the local `192.168.1.x` subnet.
2. Navigate to this directory:
   ```bash
   cd server/biometric-agent
   npm install
   ```
3. Set your environment variables (or leave defaults):
   ```bash
   export DEVICE_IP="192.168.1.201"
   export DEVICE_PORT="4370"
   export LARAVEL_API_URL="http://192.168.1.100:8000/api/biometric/logs"
   ```
4. Start the listener:
   ```bash
   npm start
   ```

## Workflow
1. Employee scans fingerprint/face on BISMAC BISBIO B-29b.
2. `getRealTimeLogs` receives `{ userId, attTime }`.
3. Agent normalizes Philippine Standard Time, preserves raw values and serial.
4. Detects immediate duplicate scans (< 10 seconds).
5. Forwards to Laravel backend endpoint `/api/biometric/logs`.
6. Vue 3 frontend displays real-time updates and auditable historical records.

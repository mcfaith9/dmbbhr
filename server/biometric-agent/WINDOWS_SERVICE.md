# DMBBHR Biometric Agent - Windows Service Guide

The Node.js biometric agent connects to the **BISMAC BISBIO B-29b** (192.168.1.201:4370) via TCP/IP and broadcasts real-time attendance scans to the Vue Web Application over WebSocket (`ws://0.0.0.0:5174`).

It runs completely independently of whether the web browser is open.

---

## 1. Quick Development Execution (Single Command)

To run both the Vue Web App and the Biometric Agent simultaneously in one terminal:
```bash
npm run dev:all
```

To run the agent standalone in its own terminal or background shell:
```bash
npm run biometric-agent
```

---

## 2. Running as a Native Windows Background Service

To keep the biometric agent running permanently on the office server/laptop in the background (even across user logouts and reboots):

### Option A: Using `pm2` (Recommended & Simplest)

1. Install `pm2` globally:
   ```cmd
   npm install -g pm2
   npm install -g pm2-windows-service
   ```
2. Start the biometric agent:
   ```cmd
   pm2 start server/biometric-agent/index.js --name "dmbbhr-biometric-agent"
   ```
3. Save the process list to automatically start on Windows boot:
   ```cmd
   pm2 save
   pm2-service-install -n "DMBBHR-Biometric"
   ```
4. Check live status or logs at any time:
   ```cmd
   pm2 status
   pm2 logs dmbbhr-biometric-agent
   ```

---

### Option B: Using `node-windows` Service Wrapper

A dedicated Windows service script `scripts/windows-service.js` is provided:

1. Install `node-windows`:
   ```cmd
   npm install node-windows
   ```
2. Register and start the Windows Service (Run PowerShell as Administrator):
   ```cmd
   node scripts/windows-service.js --install
   ```
3. To uninstall the service later:
   ```cmd
   node scripts/windows-service.js --uninstall
   ```

The service will appear in the Windows Services manager (`services.msc`) under **"DMBBHR Biometric Attendance Agent"** and will automatically restart if interrupted.

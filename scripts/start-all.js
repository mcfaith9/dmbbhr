/**
 * Unified Development Runner: Starts Vite Dev Server and Biometric Node.js Agent concurrently.
 * Fully compatible with Windows paths containing spaces (e.g. C:\Users\User\Documents\ML Cabigas\dmbbhr).
 * Uses process.execPath without shell: true to prevent space-splitting and shell injection issues.
 */

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('================================================================');
console.log(' Starting DMBBHR Unified Dev Environment');
console.log(' - Vite Web Server (Port 3000)');
console.log(' - Biometric Node.js Agent for BISMAC BISBIO B-29b (192.168.1.201:4370)');
console.log('================================================================\n');

// 1. Resolve Vite executable
// Instead of spawning npm.cmd / npx.cmd with shell: true (which breaks paths with spaces in cmd.exe),
// we directly spawn the Node.js executable running the vite CLI entry script.
const viteCliPath = path.resolve(rootDir, 'node_modules/vite/bin/vite.js')
const agentScriptPath = path.resolve(rootDir, 'server/biometric-agent/index.js')

console.log('Starting Vite...');
let viteProcess;

if (fs.existsSync(viteCliPath)) {
  // Directly invoke Node on vite CLI entrypoint - zero shell parsing, safe with spaces
  viteProcess = spawn(process.execPath, [viteCliPath, '--port', '3000', '--host', '0.0.0.0'], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false
  })
} else {
  // Fallback to npx without shell if vite binary was relocated
  const isWindows = process.platform === 'win32'
  viteProcess = spawn(isWindows ? 'npx.cmd' : 'npx', ['vite', '--port', '3000', '--host', '0.0.0.0'], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false
  })
}

viteProcess.on('error', (err) => {
  console.error('\n[Vite Server Launch Error]:', err.message);
})

// 2. Start Biometric Agent Process with Auto-Restart Supervisor
// Uses process.execPath with agentScriptPath directly - NO shell: true!
let isCleaningUp = false
let agentProcess = null
let agentRestartTimer = null

function spawnBiometricAgent() {
  if (isCleaningUp) return

  console.log('[Supervisor] Spawning Biometric Agent process...\n')
  agentProcess = spawn(process.execPath, [agentScriptPath], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false
  })

  agentProcess.on('error', (err) => {
    console.error('\n[Biometric Agent Launch Error]:', err.message)
  })

  agentProcess.on('exit', (code, signal) => {
    if (isCleaningUp) return

    if (code !== null && code !== 0) {
      console.warn(`\n[Supervisor] Biometric Agent process exited unexpectedly with code ${code}.`)
    } else if (signal) {
      console.warn(`\n[Supervisor] Biometric Agent process terminated with signal ${signal}.`)
    } else {
      console.warn(`\n[Supervisor] Biometric Agent stopped unexpectedly.`)
    }

    console.log('[Supervisor] Auto-restarting Biometric Agent in 5 seconds to maintain shift continuity...')
    agentRestartTimer = setTimeout(() => {
      agentRestartTimer = null
      spawnBiometricAgent()
    }, 5000)
  })
}

spawnBiometricAgent()

// 3. Clean termination handling
function cleanup() {
  if (isCleaningUp) return
  isCleaningUp = true
  console.log('\n[DMBBHR] Shutting down Vite and Biometric Agent...')

  if (agentRestartTimer) {
    clearTimeout(agentRestartTimer)
    agentRestartTimer = null
  }

  if (agentProcess && !agentProcess.killed) {
    try { agentProcess.kill('SIGINT') } catch {}
  }
  if (viteProcess && !viteProcess.killed) {
    try { viteProcess.kill('SIGINT') } catch {}
  }

  setTimeout(() => {
    try { if (agentProcess && !agentProcess.killed) agentProcess.kill('SIGKILL') } catch {}
    try { if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGKILL') } catch {}
    process.exit(0)
  }, 1000)
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Unified Development Runner: Starts Vite Dev Server and Biometric Node.js Agent concurrently.
 * All logs and connection errors from both processes are streamed with clean prefixes.
 */

import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

console.log('================================================================');
console.log(' Starting DMBBHR Unified Dev Environment');
console.log(' - Vite Web Server (Port 3000)');
console.log(' - Biometric Node.js Agent for BISMAC BISBIO B-29b (192.168.1.201:4370)');
console.log('================================================================\n');

// 1. Start Vite development server
const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'
const npxCmd = isWindows ? 'npx.cmd' : 'npx'

const viteProcess = spawn(npxCmd, ['vite', '--port', '3000', '--host', '0.0.0.0'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows
})

// 2. Start Biometric Agent Process
const agentScript = path.resolve(rootDir, 'server/biometric-agent/index.js')
const agentProcess = spawn('node', [agentScript], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows
})

agentProcess.on('error', (err) => {
  console.error('\n[Biometric Agent Launch Error]:', err.message);
})

function cleanup() {
  console.log('\n[DMBBHR] Shutting down Vite and Biometric Agent...');
  try { viteProcess.kill(); } catch {}
  try { agentProcess.kill(); } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

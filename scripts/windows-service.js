/**
 * Windows Service Installer & Uninstaller for DMBBHR Biometric Agent
 * Usage:
 *   node scripts/windows-service.js --install
 *   node scripts/windows-service.js --uninstall
 */

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const action = process.argv[2]

async function handleService() {
  try {
    // Dynamic import to avoid build errors if node-windows is not pre-installed
    const { Service } = await import('node-windows')

    const svc = new Service({
      name: 'DMBBHR Biometric Attendance Agent',
      description: 'Background TCP/IP listener for BISMAC BISBIO B-29b biometric hardware at DBB Cebu.',
      script: path.resolve(__dirname, '../server/biometric-agent/index.js'),
      nodeOptions: [
        '--harmony',
        '--max_old_space_size=512'
      ]
    })

    if (action === '--install') {
      svc.on('install', () => {
        console.log('[Windows Service] DMBBHR Biometric Agent installed successfully.')
        svc.start()
        console.log('[Windows Service] Service started.')
      })
      svc.on('alreadyinstalled', () => {
        console.log('[Windows Service] Service is already installed.')
      })
      svc.install()
    } else if (action === '--uninstall') {
      svc.on('uninstall', () => {
        console.log('[Windows Service] DMBBHR Biometric Agent uninstalled successfully.')
      })
      svc.uninstall()
    } else {
      console.log('Usage: node scripts/windows-service.js [--install | --uninstall]')
    }
  } catch (e) {
    console.error('[Windows Service] Notice: `node-windows` is not installed.')
    console.log('To install the Windows background service wrapper:')
    console.log('  npm install node-windows')
    console.log('  node scripts/windows-service.js --install')
  }
}

handleService()

import path from 'node:path'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'

const require = createRequire(import.meta.url)
const { handleEmployeePhotoUploadRequest } = require('./server/photoStorage.cjs')

function employeePhotoUploadPlugin(): Plugin {
  const projectRoot = path.resolve(import.meta.dirname)
  return {
    name: 'dmbbhr-employee-photo-upload',
    configureServer(server) {
      server.middlewares.use('/api/employee-photos', (req, res, next) => {
        if (req.method === 'POST') {
          handleEmployeePhotoUploadRequest(req, res, projectRoot)
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), employeePhotoUploadPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
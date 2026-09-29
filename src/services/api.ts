import { authService } from './auth'

/**
 * Dedicated API communication client for communication with the Laravel backend.
 * Uses environment variable VITE_API_URL or defaults to local network Laravel backend.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.100:8000/api'

export const apiClient = {
  getHeaders() {
    const token = authService.getToken()
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  },

  async get<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${API_BASE_URL}${endpoint}`)
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        url.searchParams.append(k, String(params[k]))
      }
    })

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders()
    })

    if (!res.ok) {
      throw new Error(`API GET ${endpoint} failed: ${res.statusText}`)
    }
    return res.json()
  },

  async post<T>(endpoint: string, data: any): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    })

    if (!res.ok) {
      throw new Error(`API POST ${endpoint} failed: ${res.statusText}`)
    }
    return res.json()
  }
}

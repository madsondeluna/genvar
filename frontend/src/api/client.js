import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const client = axios.create({
  baseURL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail
    const status = error.response?.status
    const message =
      detail ||
      (status === 404 ? 'Not found' : status === 422 ? 'Invalid input' : 'Request failed')
    return Promise.reject(new Error(message))
  }
)

export const fetchGene = async (symbol) => {
  const { data } = await client.get(`/gene/${symbol}`)
  return data
}

export const fetchVariant = async (rsid) => {
  const { data } = await client.get(`/variant/${rsid}`)
  return data
}

export default client

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

export const fetchGenePhenotypes = async (symbol) => {
  // include_associated do Ensembl é pesado; a primeira carga pode passar de 60 s
  const { data } = await client.get(`/gene/${symbol}/phenotypes`, { timeout: 120000 })
  return data
}

export const fetchVariant = async (rsid) => {
  const { data } = await client.get(`/variant/${rsid}`)
  return data
}

export const fetchDiseases = async () => {
  const { data } = await client.get('/disease')
  return data
}

export const fetchDisease = async (id) => {
  // O detalhe enriquece genes causais ao vivo (constraint gnomAD); a 1a carga
  // pode ser mais lenta, por isso a folga no timeout.
  const { data } = await client.get(`/disease/${id}`, { timeout: 90000 })
  return data
}

export const fetchDiseaseVariants = async (id) => {
  // Busca variantes patogenicas de varios genes causais no Ensembl; carga
  // separada do detalhe e pode passar de 60 s na primeira vez.
  const { data } = await client.get(`/disease/${id}/variants`, { timeout: 120000 })
  return data
}

export const fetchSourcesHealth = async () => {
  // Pinga as 7 fontes externas; pode demorar ate os timeouts das sondas.
  const { data } = await client.get('/health/sources', { timeout: 30000 })
  return data
}

export default client

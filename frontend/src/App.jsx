import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HomePage from './pages/HomePage'
import GenePage from './pages/GenePage'
import VariantPage from './pages/VariantPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/gene/:symbol" element={<GenePage />} />
          <Route path="/variant/:rsid" element={<VariantPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

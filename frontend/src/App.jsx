import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HomePage from './pages/HomePage'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'

// Gene e variante carregam Plotly e NGL, que respondem por quase todo o peso do
// bundle. A home não usa nenhum dos dois, então as rotas entram sob demanda.
const GenePage = lazy(() => import('./pages/GenePage'))
const VariantPage = lazy(() => import('./pages/VariantPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 60,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/gene/:symbol" element={<GenePage />} />
              <Route path="/variant/:rsid" element={<VariantPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

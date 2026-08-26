import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HomePage from './pages/HomePage'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingSpinner from './components/LoadingSpinner'
import MedicalDisclaimer from './components/MedicalDisclaimer'

// Gene e variante carregam Plotly e NGL, que respondem por quase todo o peso do
// bundle. A home não usa nenhum dos dois, então as rotas entram sob demanda.
const GenePage = lazy(() => import('./pages/GenePage'))
const VariantPage = lazy(() => import('./pages/VariantPage'))
const DiseasesPage = lazy(() => import('./pages/DiseasesPage'))
const DiseasePage = lazy(() => import('./pages/DiseasePage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const PanelsPage = lazy(() => import('./pages/PanelsPage'))
const PanelPage = lazy(() => import('./pages/PanelPage'))
const PolygenicPage = lazy(() => import('./pages/PolygenicPage'))
const PlansPage = lazy(() => import('./pages/PlansPage'))
const AssociationPage = lazy(() => import('./pages/AssociationPage'))
const StatusPage = lazy(() => import('./pages/StatusPage'))

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
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/gene/:symbol" element={<GenePage />} />
              <Route path="/variant/:rsid" element={<VariantPage />} />
              <Route path="/doencas" element={<DiseasesPage />} />
              <Route path="/doenca/:id" element={<DiseasePage />} />
              <Route path="/paineis" element={<PanelsPage />} />
              <Route path="/painel/:id" element={<PanelPage />} />
              <Route path="/poligenico" element={<PolygenicPage />} />
              <Route path="/produtos" element={<ProductsPage />} />
              <Route path="/planos" element={<PlansPage />} />
              <Route path="/associacao" element={<AssociationPage />} />
              <Route path="/status" element={<StatusPage />} />
            </Routes>
          </Suspense>
          <MedicalDisclaimer />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Self-hosted typefaces (Fontsource) — no runtime Google/network loading.
// Inter: UI/body · Space Grotesk Variable: display/numerals · IBM Plex Mono: field codes & data.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import App from './App.tsx'

// Keep one TanStack Query client for the whole app. Feature pages then share the same data cache,
// so changing the URL hash does not create a separate cache for each page.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

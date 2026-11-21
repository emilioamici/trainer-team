import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig } from 'framer-motion'
import App from './App'
import { StoreProvider } from './state/store'
import { getTheme, applyTheme } from './lib/theme'
import './index.css'

applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={() => import('./motionFeatures').then((r) => r.default)}>
      <MotionConfig reducedMotion="user">
        <StoreProvider>
          <App />
        </StoreProvider>
      </MotionConfig>
    </LazyMotion>
  </StrictMode>,
)

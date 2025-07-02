import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DEFAULT_LOCALE, LocaleContext } from './hooks/locale.ts'

createRoot(document.getElementById('root')!).render(
  <Root />
)

function Root() {
  const [locale, setLocale] = useState(DEFAULT_LOCALE)
  
  return (
    <StrictMode>
      <LocaleContext.Provider value={{ locale, setLocale }}>
        <App />
      </LocaleContext.Provider>
    </StrictMode>
  )
}

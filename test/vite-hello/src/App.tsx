import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { DEFAULT_LOCALE, LocaleContext, type LocaleType } from './hooks/locale'
import { T, useT } from './nix-locale/helper'

function App() {
  const [count, setCount] = useState(0)
  const [locale, setLocale] = useState(DEFAULT_LOCALE)

  return (
    <LocaleContext.Provider value={locale}>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          <T
            it={({ count }) => <>Il contatore è {count}</>}
            en={({ count }) => <>The counter is {count}</>}
            arg={{ count }}
          />
          <br />
          <UseT_asComponent count={count} />
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
      <select
        name="locale"
        value={locale}
        onChange={(ev) => setLocale(ev.target.value as LocaleType)}
      >
        <option value="it">IT</option>
        <option value="en">EN</option>
      </select>
    </LocaleContext.Provider>
  )
}

function UseT_asComponent({ count }: { count: number }) {
  return <>
    {useT({
      it: (count) => <>Il contatore è {count}</>,
      en: (count) => <>The counter is {count}</>
    }, count)}
  </>
}

export default App

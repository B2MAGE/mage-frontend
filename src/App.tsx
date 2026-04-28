import './App.css'
import './theme/theme.css'
import { AppProviders, AppRoutes } from '@app/index'

function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}

export default App

import './App.css'
import './theme/theme.css'
import './shared/ui/pagePrimitives.css'
import { AppProviders, AppRoutes } from '@app/index'

function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}

export default App

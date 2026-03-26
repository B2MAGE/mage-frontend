import './App.css'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RegisterPage } from './pages/RegisterPage'

const placeholderRoutes = [
  {
    path: '/login',
    title: 'Login is coming soon.',
    description: 'Frontend routing is in place. This placeholder will become the sign-in experience.',
  },
]

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        {placeholderRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              <PlaceholderPage
                eyebrow="Placeholder"
                title={route.title}
                description={route.description}
                action={
                  <Link className="demo-link" to="/">
                    Back to Home
                  </Link>
                }
                footnote="This page exists to verify client-side routing while the real UI is still in development."
              />
            }
          />
        ))}
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App

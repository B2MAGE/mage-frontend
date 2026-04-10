import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MyPresetsPage } from './pages/MyPresetsPage'
import { PresetDetailPage } from './pages/PresetDetailPage'
import { RegisterPage } from './pages/RegisterPage'
import { CreatePresetPage } from './pages/CreatePresetPage'


function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-presets" element={<MyPresetsPage />} />
          <Route path="/presets/:id" element={<PresetDetailPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/create-preset" element={<CreatePresetPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}

export default App

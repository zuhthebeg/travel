import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { MainPage } from './pages/MainPage'
import { MyPlansPage } from './pages/MyPlansPage'
import { CreatePlanPage } from './pages/CreatePlanPage'
import { PlanDetailPage } from './pages/PlanDetailPage'
import { AssistantPage } from './pages/AssistantPage'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/my" element={<MyPlansPage />} />
          <Route path="/plan/new" element={<CreatePlanPage />} />
          <Route path="/plan/:id" element={<PlanDetailPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}

export default App

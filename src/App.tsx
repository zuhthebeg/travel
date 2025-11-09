import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { MainPage } from './pages/MainPage'
import { MyPlansPage } from './pages/MyPlansPage'
import { CreatePlanPage } from './pages/CreatePlanPage'
import { PlanDetailPage } from './pages/PlanDetailPage'
import { AssistantPage } from './pages/AssistantPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/my" element={<MyPlansPage />} />
        <Route path="/plan/new" element={<CreatePlanPage />} />
        <Route path="/plan/:id" element={<PlanDetailPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

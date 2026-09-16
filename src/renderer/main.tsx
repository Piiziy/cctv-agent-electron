import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { App } from './App'
import { ComponentGallery } from './screens/dev/ComponentGallery'
import './index.css'

/**
 * HashRouter 를 쓰는 이유: 배포된 Electron 은 렌더러를 file:// 로 불러오는데
 * history API 라우팅은 그 위에서 새로고침·딥링크가 깨진다.
 */
const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HashRouter>
        <Routes>
          {/* 제품 화면이 아니라 컴포넌트 확인용. 디자인 HTML 과 나란히 비교한다. */}
          <Route path="/dev/components" element={<ComponentGallery />} />
          <Route path="*" element={<App />} />
        </Routes>
      </HashRouter>
    </StrictMode>,
  )
}

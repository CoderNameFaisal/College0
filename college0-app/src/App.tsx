import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { ShellLayout } from './components/ShellLayout'
import { RegistrarLayout } from './components/RegistrarLayout'
import { RequireAuth, RequireRole } from './components/RequireRole'
import { PublicDashboard } from './pages/PublicDashboard'
import { PublicClassLocationsPage } from './pages/PublicClassLocationsPage'
import { LoginPage } from './pages/LoginPage'
import { FirstLoginPage } from './pages/FirstLoginPage'
import { RegistrarHome } from './pages/registrar/RegistrarHome'
import { RegistrarSemestersPage } from './pages/registrar/RegistrarSemestersPage'
import { RegistrarClassesPage } from './pages/registrar/RegistrarClassesPage'
import { RegistrarApplicationsPage } from './pages/registrar/RegistrarApplicationsPage'
import { RegistrarStudentsPage } from './pages/registrar/RegistrarStudentsPage'
import { RegistrarStudentDetailPage } from './pages/registrar/RegistrarStudentDetailPage'
import { RegistrarInstructorsPage } from './pages/registrar/RegistrarInstructorsPage'
import { RegistrarInstructorDetailPage } from './pages/registrar/RegistrarInstructorDetailPage'
import { RegistrarComplaintsPage } from './pages/registrar/RegistrarComplaintsPage'
import { RegistrarGraduationPage } from './pages/registrar/RegistrarGraduationPage'
import { RegistrarOverviewPage } from './pages/registrar/RegistrarOverviewPage'
import { RegistrarTabooPage } from './pages/registrar/RegistrarTabooPage'
import { RegistrarScanPage } from './pages/registrar/RegistrarScanPage'
import { InstructorLayout } from './components/InstructorLayout'
import { InstructorClassesPage } from './pages/instructor/InstructorClassesPage'
import { InstructorWaitlistPage } from './pages/instructor/InstructorWaitlistPage'
import { InstructorGradingPage } from './pages/instructor/InstructorGradingPage'
import { InstructorReviewsPage } from './pages/instructor/InstructorReviewsPage'
import { InstructorComplaintsPage } from './pages/instructor/InstructorComplaintsPage'
import { InstructorProfilePage } from './pages/instructor/InstructorProfilePage'
import { InstructorAIPage } from './pages/instructor/InstructorAIPage'
import { StudentLayout } from './components/StudentLayout'
import { StudentHomePage } from './pages/student/StudentHomePage'
import { StudentProfilePage } from './pages/student/StudentProfilePage'
import { StudentEnrollPage } from './pages/student/StudentEnrollPage'
import { StudentReviewsPage } from './pages/student/StudentReviewsPage'
import { StudentComplaintsPage } from './pages/student/StudentComplaintsPage'
import { StudentGraduationPage } from './pages/student/StudentGraduationPage'
import { StudentApplyPage } from './pages/student/StudentApplyPage'
import { StudentStudyGroupsPage } from './pages/student/StudentStudyGroupsPage'
import { StudentAIPage } from './pages/student/StudentAIPage'
import { VisitorDirectoryPage } from './pages/visitor/VisitorDirectoryPage'
import { VisitorApplyStudentPage } from './pages/visitor/VisitorApplyStudentPage'
import { VisitorApplyInstructorPage } from './pages/visitor/VisitorApplyInstructorPage'
import { VisitorAIPage } from './pages/visitor/VisitorAIPage'
import { AccountPage } from './pages/AccountPage'

function RegistrarGate({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole allow={['registrar']}>{children}</RequireRole>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/first-login" element={<FirstLoginPage />} />
          <Route element={<ShellLayout />}>
            <Route index element={<PublicDashboard />} />
            <Route
              path="account"
              element={
                <RequireAuth>
                  <AccountPage />
                </RequireAuth>
              }
            />
            <Route path="login" element={<LoginPage />} />
            <Route path="apply/student" element={<VisitorApplyStudentPage />} />
            <Route path="apply/instructor" element={<VisitorApplyInstructorPage />} />
            <Route path="class-locations" element={<PublicClassLocationsPage />} />
            <Route path="ai" element={<VisitorAIPage />} />

            <Route
              path="registrar"
              element={
                <RegistrarGate>
                  <RegistrarLayout />
                </RegistrarGate>
              }
            >
              <Route index element={<RegistrarHome />} />
              <Route path="semesters" element={<RegistrarSemestersPage />} />
              <Route path="classes" element={<RegistrarClassesPage />} />
              <Route path="applications" element={<RegistrarApplicationsPage />} />
              <Route path="students" element={<RegistrarStudentsPage />} />
              <Route path="students/:id" element={<RegistrarStudentDetailPage />} />
              <Route path="instructors" element={<RegistrarInstructorsPage />} />
              <Route path="instructors/:id" element={<RegistrarInstructorDetailPage />} />
              <Route path="complaints" element={<RegistrarComplaintsPage />} />
              <Route path="graduation" element={<RegistrarGraduationPage />} />
              <Route path="overview" element={<RegistrarOverviewPage />} />
              <Route path="taboo" element={<RegistrarTabooPage />} />
              <Route path="scan" element={<RegistrarScanPage />} />
            </Route>

            <Route
              path="instructor"
              element={
                <RequireAuth>
                  <RequireRole allow={['instructor']}>
                    <InstructorLayout />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<InstructorClassesPage />} />
              <Route path="waitlist" element={<InstructorWaitlistPage />} />
              <Route path="grading" element={<InstructorGradingPage />} />
              <Route path="reviews" element={<InstructorReviewsPage />} />
              <Route path="complaints" element={<InstructorComplaintsPage />} />
              <Route path="profile" element={<InstructorProfilePage />} />
              <Route path="ai" element={<InstructorAIPage />} />
            </Route>
            <Route
              path="student"
              element={
                <RequireAuth>
                  <RequireRole allow={['student']}>
                    <StudentLayout />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<StudentHomePage />} />
              <Route path="profile" element={<StudentProfilePage />} />
              <Route path="enroll" element={<StudentEnrollPage />} />
              <Route path="reviews" element={<StudentReviewsPage />} />
              <Route path="complaints" element={<StudentComplaintsPage />} />
              <Route path="graduation" element={<StudentGraduationPage />} />
              <Route path="apply" element={<StudentApplyPage />} />
              <Route path="study-groups" element={<StudentStudyGroupsPage />} />
              <Route path="ai" element={<StudentAIPage />} />
            </Route>
            <Route
              path="visitor"
              element={
                <RequireAuth>
                  <RequireRole allow={['visitor']}>
                    <VisitorDirectoryPage />
                  </RequireRole>
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

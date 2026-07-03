import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { EventsPage } from "@/pages/Events";
import { EventFormPage } from "@/pages/EventForm";
import { ClientsPage } from "@/pages/Clients";
import { ClientDetailPage } from "@/pages/ClientDetail";
import { CategoriesPage } from "@/pages/Categories";
import { ClubsPage } from "@/pages/Clubs";
import { CalendarPage } from "@/pages/Calendar";
import { ReportPage } from "@/pages/Report";
import { SettingsPage } from "@/pages/Settings";
import { SettingsGooglePage } from "@/pages/SettingsGoogle";
import { SyncQueuePage } from "@/pages/SyncQueue";
import { DebugPage } from "@/pages/Debug";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:id/edit" element={<EventFormPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="clubs" element={<ClubsPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="google" replace />} />
          <Route path="google" element={<SettingsGooglePage />} />
          <Route path="queue" element={<SyncQueuePage />} />
          <Route path="debug" element={<DebugPage />} />
        </Route>
        {/* Back-compat for old top-level routes / bookmarks */}
        <Route path="sync" element={<Navigate to="/settings/queue" replace />} />
        <Route path="debug" element={<Navigate to="/settings/debug" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import MatchesPage from './pages/MatchesPage';
import TournamentPage from './pages/TournamentPage';
import StatsPage from './pages/StatsPage';
import MyBetsPage from './pages/MyBetsPage';
import BonusPage from './pages/BonusPage';
import LeaderboardPage from './pages/LeaderboardPage';
import LeaguesPage from './pages/LeaguesPage';
import MessagesPage from './pages/MessagesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/afventer" element={<PendingPage />} />
        <Route path="/" element={<ProtectedRoute><MatchesPage /></ProtectedRoute>} />
        <Route path="/mine-tips" element={<ProtectedRoute><MyBetsPage /></ProtectedRoute>} />
        <Route path="/bonus" element={<ProtectedRoute><BonusPage /></ProtectedRoute>} />
        <Route path="/turnering" element={<ProtectedRoute><TournamentPage /></ProtectedRoute>} />
        <Route path="/statistik" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
        <Route path="/stilling" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/ligaer" element={<ProtectedRoute><LeaguesPage /></ProtectedRoute>} />
        <Route path="/beskeder" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/profil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute require="matchAdmin"><AdminPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

import { useEffect } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { useRoute } from './lib/router';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';

export default function App() {
  const route = useRoute();

  // Landing anchors handle their own scrolling; app routes should start at the top.
  useEffect(() => {
    if (route !== '/') window.scrollTo({ top: 0 });
  }, [route]);

  return (
    <div className="min-h-screen">
      <Header />

      <main>
        {route === '/' && <Home />}
        {route === '/login' && <AuthPage mode="login" />}
        {route === '/signup' && <AuthPage mode="signup" />}
        {route === '/dashboard' && <Dashboard />}
      </main>

      {route !== '/login' && route !== '/signup' && <Footer />}
    </div>
  );
}

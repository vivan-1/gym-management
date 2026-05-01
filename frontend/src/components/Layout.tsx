import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationPanel } from './NotificationPanel';

export function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [notificationOpen, setNotificationOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '240px',
        backgroundColor: '#1a1a2e',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
      }}>
        <div style={{ padding: '0 20px', marginBottom: '30px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Gym Manager</h2>
          {admin && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#aaa' }}>
              {admin.email}
            </p>
          )}
        </div>

        <nav style={{ flex: 1 }}>
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/members" label="Members" />
          <NavItem to="/members/new" label="Register Member" />
          <NavItem to="/settings" label="Settings" />
        </nav>

        <div style={{ padding: '0 20px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: 'transparent',
              border: '1px solid #555',
              color: '#fff',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <header style={{
          height: '56px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 24px',
        }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setNotificationOpen(!notificationOpen)}
              title="Notifications"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                position: 'relative',
              }}
              aria-label="Notifications"
              aria-expanded={notificationOpen}
            >
              🔔
            </button>
            <NotificationPanel
              isOpen={notificationOpen}
              onClose={() => setNotificationOpen(false)}
            />
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '24px', backgroundColor: '#f5f5f5' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/members'}
      style={({ isActive }) => ({
        display: 'block',
        padding: '12px 20px',
        color: isActive ? '#fff' : '#bbb',
        backgroundColor: isActive ? '#16213e' : 'transparent',
        textDecoration: 'none',
        fontSize: '14px',
        borderLeft: isActive ? '3px solid #4fc3f7' : '3px solid transparent',
      })}
    >
      {label}
    </NavLink>
  );
}

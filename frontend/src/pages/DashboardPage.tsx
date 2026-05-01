import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary, DashboardSummary } from '../api/dashboard';

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchSummary() {
      try {
        const data = await getDashboardSummary();
        setSummary(data);
      } catch (err: unknown) {
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading dashboard...</div>;
  }

  if (error || !summary) {
    return <div style={{ padding: '20px', color: '#d32f2f' }}>{error || 'Failed to load data'}</div>;
  }

  const statusCards = [
    { label: 'Total Members', value: summary.totalMembers, color: '#1976d2', navigateTo: null },
    { label: 'Active Memberships', value: summary.membershipCounts.active, color: '#388e3c', navigateTo: '/members?membershipStatus=active' },
    { label: 'Expiring Soon', value: summary.membershipCounts.expiringSoon, color: '#f57c00', navigateTo: '/members?membershipStatus=expiring_soon' },
    { label: 'Expired', value: summary.membershipCounts.expired, color: '#d32f2f', navigateTo: '/members?membershipStatus=expired' },
    { label: 'Payments Collected', value: `₹${summary.paymentSummary.totalCollected.toFixed(2)}`, color: '#2e7d32', navigateTo: null },
    { label: 'Overdue Payments', value: summary.paymentSummary.overdueCount, color: '#c62828', navigateTo: '/members?paymentStatus=overdue' },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 600 }}>Dashboard</h1>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {statusCards.map((card) => (
          <div
            key={card.label}
            onClick={() => card.navigateTo && navigate(card.navigateTo)}
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '20px',
              borderLeft: `4px solid ${card.color}`,
              cursor: card.navigateTo ? 'pointer' : 'default',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              transition: 'box-shadow 0.2s',
            }}
            role={card.navigateTo ? 'button' : undefined}
            tabIndex={card.navigateTo ? 0 : undefined}
            onKeyDown={(e) => {
              if (card.navigateTo && (e.key === 'Enter' || e.key === ' ')) {
                navigate(card.navigateTo);
              }
            }}
          >
            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Notifications */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Recent Notifications</h2>
        {summary.recentNotifications.length === 0 ? (
          <p style={{ color: '#666', margin: 0 }}>No recent notifications.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {summary.recentNotifications.map((notification) => (
              <div
                key={notification.id}
                style={{
                  padding: '12px',
                  borderRadius: '4px',
                  backgroundColor: '#f9f9f9',
                  borderLeft: '3px solid #1976d2',
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>{notification.title}</div>
                <div style={{ fontSize: '13px', color: '#555' }}>{notification.message}</div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {new Date(notification.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { getNotifications, InAppNotification, PaginatedNotifications } from '../api/notifications';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications(1);
    }
  }, [isOpen]);

  async function fetchNotifications(pageNum: number) {
    setLoading(true);
    setError(null);
    try {
      const result: PaginatedNotifications = await getNotifications(pageNum, 10);
      if (pageNum === 1) {
        setNotifications(result.data);
      } else {
        setNotifications((prev) => [...prev, ...result.data]);
      }
      setPage(pageNum);
      setTotalPages(result.totalPages);
    } catch {
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    if (page < totalPages) {
      fetchNotifications(page + 1);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99,
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: 'absolute',
          top: '48px',
          right: '0',
          width: '360px',
          maxHeight: '480px',
          overflowY: 'auto',
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 100,
          border: '1px solid #e0e0e0',
        }}
        role="dialog"
        aria-label="Notifications"
      >
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 600,
          fontSize: '16px',
        }}>
          Notifications
        </div>

        {error && (
          <div style={{ padding: '12px 16px', color: '#d32f2f', fontSize: '13px' }}>{error}</div>
        )}

        {notifications.length === 0 && !loading && !error && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#666' }}>
            No notifications yet.
          </div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: n.isRead ? '#fff' : '#f5f9ff',
            }}
          >
            <div style={{ fontWeight: 500, fontSize: '13px', marginBottom: '4px' }}>{n.title}</div>
            <div style={{ fontSize: '12px', color: '#555' }}>{n.message}</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ padding: '12px 16px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
            Loading...
          </div>
        )}

        {page < totalPages && !loading && (
          <div style={{ padding: '12px 16px', textAlign: 'center' }}>
            <button
              onClick={loadMore}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </>
  );
}

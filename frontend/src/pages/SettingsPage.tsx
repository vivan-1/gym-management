import { useEffect, useState } from 'react';
import { getExpiryWindow, updateExpiryWindow } from '../api/notifications';

export function SettingsPage() {
  const [expiryDays, setExpiryDays] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchExpiryWindow() {
      try {
        const days = await getExpiryWindow();
        setExpiryDays(days);
        setInputValue(String(days));
      } catch {
        setError('Failed to load expiry window setting');
      } finally {
        setLoading(false);
      }
    }
    fetchExpiryWindow();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const days = parseInt(inputValue, 10);
    if (isNaN(days) || days < 1 || !Number.isInteger(days)) {
      setError('Please enter a positive integer');
      return;
    }

    setSaving(true);
    try {
      await updateExpiryWindow(days);
      setExpiryDays(days);
      setSuccess('Expiry window updated successfully!');
    } catch {
      setError('Failed to update expiry window');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading settings...</div>;
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 600 }}>Settings</h1>

      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>Expiry Window</h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#666' }}>
          Number of days before membership expiry to trigger "Expiring Soon" notifications.
          Current value: <strong>{expiryDays} days</strong>
        </p>

        {error && (
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#fdecea',
            borderRadius: '4px',
            color: '#d32f2f',
            marginBottom: '12px',
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: '10px 12px',
            backgroundColor: '#e8f5e9',
            borderRadius: '4px',
            color: '#2e7d32',
            marginBottom: '12px',
            fontSize: '13px',
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            min="1"
            step="1"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            style={{
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              width: '100px',
            }}
            aria-label="Expiry window in days"
          />
          <span style={{ fontSize: '14px', color: '#666' }}>days</span>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 20px',
              backgroundColor: saving ? '#999' : '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

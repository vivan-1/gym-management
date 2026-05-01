import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMemberById, MemberDetail, Payment } from '../api/members';
import { renewMembership, createMembership, updateMembership } from '../api/memberships';
import { recordPayment } from '../api/payments';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Renew state
  const [renewDuration, setRenewDuration] = useState<number>(1);
  const [renewing, setRenewing] = useState(false);
  const [renewMessage, setRenewMessage] = useState<string | null>(null);

  // Create membership state
  const [createStartDate, setCreateStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [createDuration, setCreateDuration] = useState<number>(1);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  // Edit membership state
  const [editing, setEditing] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);

  // Payment state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online_transfer'>('cash');
  const [recording, setRecording] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchMember();
  }, [id]);

  async function fetchMember() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemberById(id!);
      setMember(data);
    } catch {
      setError('Failed to load member details');
    } finally {
      setLoading(false);
    }
  }

  async function handleRenew() {
    if (!member?.membership) return;
    setRenewing(true);
    setRenewMessage(null);
    try {
      await renewMembership(member.membership.id, { duration: renewDuration as 1 | 3 | 6 | 12 });
      setRenewMessage('Membership renewed successfully!');
      await fetchMember();
    } catch {
      setRenewMessage('Failed to renew membership');
    } finally {
      setRenewing(false);
    }
  }

  async function handleCreateMembership(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setCreating(true);
    setCreateMessage(null);
    try {
      await createMembership({
        memberId: member.id,
        startDate: createStartDate,
        duration: createDuration as 1 | 3 | 6 | 12,
      });
      setCreateMessage('Membership created successfully!');
      await fetchMember();
    } catch {
      setCreateMessage('Failed to create membership');
    } finally {
      setCreating(false);
    }
  }

  function startEditing() {
    if (!member?.membership) return;
    setEditStartDate(member.membership.startDate.split('T')[0]);
    setEditEndDate(member.membership.endDate.split('T')[0]);
    setEditStatus(member.membership.status);
    setEditing(true);
    setEditMessage(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!member?.membership) return;
    setSaving(true);
    setEditMessage(null);
    try {
      await updateMembership(member.membership.id, {
        startDate: editStartDate,
        endDate: editEndDate,
        status: editStatus,
      });
      setEditMessage('Membership updated successfully!');
      setEditing(false);
      await fetchMember();
    } catch {
      setEditMessage('Failed to update membership');
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!member?.membership) return;
    setRecording(true);
    setPaymentMessage(null);
    try {
      await recordPayment({
        amount: parseFloat(paymentAmount),
        paymentDate,
        paymentMethod,
        membershipId: member.membership.id,
        memberId: member.id,
      });
      setPaymentMessage('Payment recorded successfully!');
      setPaymentAmount('');
      await fetchMember();
    } catch {
      setPaymentMessage('Failed to record payment');
    } finally {
      setRecording(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading member details...</div>;
  }

  if (error || !member) {
    return <div style={{ padding: '20px', color: '#d32f2f' }}>{error || 'Member not found'}</div>;
  }

  const remainingDays = member.membership
    ? Math.max(0, Math.ceil((new Date(member.membership.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const sectionStyle = {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  };

  const labelStyle = {
    fontSize: '12px',
    color: '#666',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  };

  const valueStyle = {
    fontSize: '14px',
    fontWeight: 500 as const,
    marginBottom: '12px',
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 600 }}>Member Profile</h1>

      {/* Member Details */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Personal Information</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={labelStyle}>Full Name</div>
            <div style={valueStyle}>{member.fullName}</div>
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <div style={valueStyle}>{member.email}</div>
          </div>
          <div>
            <div style={labelStyle}>Phone</div>
            <div style={valueStyle}>{member.phone}</div>
          </div>
          <div>
            <div style={labelStyle}>Date of Birth</div>
            <div style={valueStyle}>{new Date(member.dateOfBirth).toLocaleDateString()}</div>
          </div>
          <div>
            <div style={labelStyle}>Gender</div>
            <div style={{ ...valueStyle, textTransform: 'capitalize' }}>{member.gender}</div>
          </div>
          <div>
            <div style={labelStyle}>Address</div>
            <div style={valueStyle}>{member.address}</div>
          </div>
          <div>
            <div style={labelStyle}>Member ID</div>
            <div style={valueStyle}>{member.memberId}</div>
          </div>
        </div>
      </div>

      {/* Membership */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Current Membership</h2>
        {member.membership ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', flex: 1 }}>
                <div>
                  <div style={labelStyle}>Status</div>
                  <div style={{ ...valueStyle, textTransform: 'capitalize' }}>
                    {member.membership.status.replace('_', ' ')}
                  </div>
                </div>
                <div>
                  <div style={labelStyle}>Start Date</div>
                  <div style={valueStyle}>{new Date(member.membership.startDate).toLocaleDateString()}</div>
                </div>
                <div>
                  <div style={labelStyle}>End Date</div>
                  <div style={valueStyle}>{new Date(member.membership.endDate).toLocaleDateString()}</div>
                </div>
                <div>
                  <div style={labelStyle}>Remaining Days</div>
                  <div style={valueStyle}>{remainingDays}</div>
                </div>
              </div>
              {!editing && (
                <button
                  onClick={startEditing}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: '#fff',
                    color: '#1976d2',
                    border: '1px solid #1976d2',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✏️ Edit
                </button>
              )}
            </div>

            {/* Edit Membership Form */}
            {editing && (
              <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '16px', marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Edit Membership</h3>
                <form onSubmit={handleSaveEdit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Start Date</label>
                    <input
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      required
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>End Date</label>
                    <input
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      required
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                    >
                      <option value="active">Active</option>
                      <option value="expiring_soon">Expiring Soon</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: saving ? '#999' : '#1976d2',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setEditMessage(null); }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#fff',
                      color: '#666',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    Cancel
                  </button>
                </form>
                {editMessage && (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: editMessage.includes('success') ? '#388e3c' : '#d32f2f' }}>
                    {editMessage}
                  </div>
                )}
              </div>
            )}

            {/* Renew Membership */}
            <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '16px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>Renew Membership</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <select
                  value={renewDuration}
                  onChange={(e) => setRenewDuration(Number(e.target.value))}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  aria-label="Renewal duration"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                </select>
                <button
                  onClick={handleRenew}
                  disabled={renewing}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: renewing ? '#999' : '#388e3c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: renewing ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {renewing ? 'Renewing...' : 'Renew'}
                </button>
                {renewMessage && (
                  <span style={{ fontSize: '13px', color: renewMessage.includes('success') ? '#388e3c' : '#d32f2f' }}>
                    {renewMessage}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div>
            <p style={{ color: '#666', margin: '0 0 16px' }}>No active membership. Create one to get started.</p>
            <form onSubmit={handleCreateMembership} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Start Date</label>
                <input
                  type="date"
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                  required
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Duration</label>
                <select
                  value={createDuration}
                  onChange={(e) => setCreateDuration(Number(e.target.value))}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
                  aria-label="Membership duration"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '8px 16px',
                  backgroundColor: creating ? '#999' : '#1976d2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {creating ? 'Creating...' : 'Create Membership'}
              </button>
            </form>
            {createMessage && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: createMessage.includes('success') ? '#388e3c' : '#d32f2f' }}>
                {createMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div style={sectionStyle}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Payment History</h2>
        {member.payments && member.payments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Amount</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Method</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {member.payments.map((payment: Payment) => (
                <tr key={payment.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', fontSize: '13px' }}>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td style={{ padding: '8px 12px', fontSize: '13px' }}>₹{payment.amount.toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', fontSize: '13px', textTransform: 'capitalize' }}>{payment.paymentMethod.replace('_', ' ')}</td>
                  <td style={{ padding: '8px 12px', fontSize: '13px', textTransform: 'capitalize' }}>{payment.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666', margin: 0 }}>No payments recorded.</p>
        )}
      </div>

      {/* Record Payment */}
      {member.membership && (
        <div style={sectionStyle}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600 }}>Record Payment</h2>
          <form onSubmit={handleRecordPayment} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
                style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', width: '120px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card' | 'online_transfer')}
                style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online_transfer">Online Transfer</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={recording}
              style={{
                padding: '8px 16px',
                backgroundColor: recording ? '#999' : '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: recording ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              {recording ? 'Recording...' : 'Record Payment'}
            </button>
          </form>
          {paymentMessage && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: paymentMessage.includes('success') ? '#388e3c' : '#d32f2f' }}>
              {paymentMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getMembers, MemberListItem, PaginatedMembers } from '../api/members';

export function MembersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [membershipStatus, setMembershipStatus] = useState(searchParams.get('membershipStatus') || '');
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get('paymentStatus') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const limit = 10;

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, string | number> = { page, limit };
      if (search.trim()) filters.search = search.trim();
      if (membershipStatus) filters.membershipStatus = membershipStatus;
      if (paymentStatus) filters.paymentStatus = paymentStatus;

      const result: PaginatedMembers = await getMembers(filters);
      setMembers(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [search, membershipStatus, paymentStatus, page]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (membershipStatus) params.membershipStatus = membershipStatus;
    if (paymentStatus) params.paymentStatus = paymentStatus;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, membershipStatus, paymentStatus, page, setSearchParams]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleMembershipStatusChange(value: string) {
    setMembershipStatus(value);
    setPage(1);
  }

  function handlePaymentStatusChange(value: string) {
    setPaymentStatus(value);
    setPage(1);
  }

  const statusBadgeStyle = (status: string | null) => {
    const colors: Record<string, { bg: string; text: string }> = {
      active: { bg: '#e8f5e9', text: '#2e7d32' },
      expiring_soon: { bg: '#fff3e0', text: '#e65100' },
      expired: { bg: '#ffebee', text: '#c62828' },
      paid: { bg: '#e8f5e9', text: '#2e7d32' },
      pending: { bg: '#fff8e1', text: '#f57f17' },
      overdue: { bg: '#ffebee', text: '#c62828' },
    };
    const c = colors[status || ''] || { bg: '#f5f5f5', text: '#666' };
    return {
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600 as const,
      backgroundColor: c.bg,
      color: c.text,
      textTransform: 'capitalize' as const,
    };
  };

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Members</h1>
        <button
          onClick={() => navigate('/members/new')}
          style={{
            padding: '10px 16px',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          + Register Member
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by name, email, or member ID..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          style={{ ...inputStyle, flex: '1', minWidth: '200px' }}
          aria-label="Search members"
        />
        <select
          value={membershipStatus}
          onChange={(e) => handleMembershipStatusChange(e.target.value)}
          style={inputStyle}
          aria-label="Filter by membership status"
        >
          <option value="">All Membership Status</option>
          <option value="active">Active</option>
          <option value="expiring_soon">Expiring Soon</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => handlePaymentStatusChange(e.target.value)}
          style={inputStyle}
          aria-label="Filter by payment status"
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
      }}>
        {error && (
          <div style={{ padding: '16px', color: '#d32f2f' }}>{error}</div>
        )}

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>Loading...</div>
        ) : members.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>No members found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Membership Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#666', textTransform: 'uppercase' }}>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  onClick={() => navigate(`/members/${member.id}`)}
                  style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>{member.fullName}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#555' }}>{member.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={statusBadgeStyle(member.membershipStatus)}>
                      {member.membershipStatus ? member.membershipStatus.replace('_', ' ') : 'None'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={statusBadgeStyle(member.paymentStatus)}>
                      {member.paymentStatus || 'None'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderTop: '1px solid #e0e0e0',
          }}>
            <span style={{ fontSize: '13px', color: '#666' }}>
              Showing {members.length} of {total} members
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: page <= 1 ? '#f5f5f5' : '#fff',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                Previous
              </button>
              <span style={{ padding: '6px 12px', fontSize: '13px', color: '#666' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: page >= totalPages ? '#f5f5f5' : '#fff',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

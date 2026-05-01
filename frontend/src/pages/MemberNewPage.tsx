import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { registerMember, MemberRegistrationInput } from '../api/members';

const memberRegistrationSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: z.string().min(1, 'Phone number is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(['male', 'female', 'other'], { required_error: 'Gender is required' }),
  address: z.string().min(1, 'Address is required'),
});

interface FormErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  general?: string;
}

export function MemberNewPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<MemberRegistrationInput>({
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: 'male',
    address: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(): FormErrors {
    const result = memberRegistrationSchema.safeParse(formData);
    if (result.success) return {};
    const errs: FormErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FormErrors;
      if (!errs[field]) {
        errs[field] = issue.message;
      }
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const member = await registerMember(formData);
      navigate(`/members/${member.id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosErr.response?.status === 409) {
        setErrors({ email: 'This email is already registered' });
      } else if (axiosErr.response?.data?.message) {
        setErrors({ general: axiosErr.response.data.message });
      } else {
        setErrors({ general: 'Failed to register member. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(field: keyof MemberRegistrationInput, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  };

  const errorInputStyle = {
    ...inputStyle,
    borderColor: '#d32f2f',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: 500 as const,
    color: '#333',
  };

  const errorTextStyle = {
    color: '#d32f2f',
    fontSize: '12px',
    marginTop: '4px',
  };

  return (
    <div>
      <h1 style={{ margin: '0 0 24px', fontSize: '24px', fontWeight: 600 }}>Register New Member</h1>

      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '600px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {errors.general && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fdecea',
            borderRadius: '4px',
            color: '#d32f2f',
            marginBottom: '16px',
            fontSize: '13px',
          }}>
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="fullName">Full Name *</label>
            <input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
              style={errors.fullName ? errorInputStyle : inputStyle}
            />
            {errors.fullName && <div style={errorTextStyle}>{errors.fullName}</div>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="email">Email *</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              style={errors.email ? errorInputStyle : inputStyle}
            />
            {errors.email && <div style={errorTextStyle}>{errors.email}</div>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="phone">Phone *</label>
            <input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              style={errors.phone ? errorInputStyle : inputStyle}
            />
            {errors.phone && <div style={errorTextStyle}>{errors.phone}</div>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="dateOfBirth">Date of Birth *</label>
            <input
              id="dateOfBirth"
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) => handleChange('dateOfBirth', e.target.value)}
              style={errors.dateOfBirth ? errorInputStyle : inputStyle}
            />
            {errors.dateOfBirth && <div style={errorTextStyle}>{errors.dateOfBirth}</div>}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle} htmlFor="gender">Gender *</label>
            <select
              id="gender"
              value={formData.gender}
              onChange={(e) => handleChange('gender', e.target.value)}
              style={errors.gender ? errorInputStyle : inputStyle}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {errors.gender && <div style={errorTextStyle}>{errors.gender}</div>}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle} htmlFor="address">Address *</label>
            <textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              rows={3}
              style={errors.address ? errorInputStyle : inputStyle}
            />
            {errors.address && <div style={errorTextStyle}>{errors.address}</div>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '12px 24px',
              backgroundColor: submitting ? '#999' : '#1976d2',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Registering...' : 'Register Member'}
          </button>
        </form>
      </div>
    </div>
  );
}

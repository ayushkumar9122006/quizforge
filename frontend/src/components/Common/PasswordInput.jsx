import { useState } from 'react'

/**
 * Reusable Password Input with visibility toggle
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Enter password',
  required = false,
  autoFocus = false,
  onKeyDown,
  className = 'inp',
  id,
  style = {},
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className={className}
        id={id}
        style={{
          width: '100%',
          paddingRight: 40,
          boxSizing: 'border-box',
          ...style
        }}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(prev => !prev)}
        style={{
          position: 'absolute',
          right: 10,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          transition: 'color 0.15s ease',
          zIndex: 2
        }}
        title={showPassword ? 'Hide password' : 'Show password'}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {showPassword ? (
          // Eye Off icon (open eye with slash or clear eye-off SVG)
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // Eye Open icon
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  )
}

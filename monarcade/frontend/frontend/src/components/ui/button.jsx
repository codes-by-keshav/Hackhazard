import React from 'react';

export const Button = ({ 
  children, 
  className = '', 
  onClick, 
  disabled = false,
  type = 'button'
}) => {
  return (
    <button
      type={type}
      className={`px-2 py-2 rounded-full font-medium transition-colors ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

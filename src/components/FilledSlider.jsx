import React from 'react';

const FilledSlider = ({ min = 0, max = 100, step = 1, value = 0, disabled = false, onChange, className = '' }) => {
  const num = Number(value) || 0;
  const pct = max > min ? Math.min(100, Math.max(0, ((num - min) / (max - min)) * 100)) : 0;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={num}
      disabled={disabled}
      onChange={onChange}
      className={`nitro-slider w-full ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      style={{
        background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.10) ${pct}%, rgba(255,255,255,0.10) 100%)`,
      }}
    />
  );
};

export default FilledSlider;

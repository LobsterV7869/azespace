import React from 'react';

export function Section({ title, description, children }) {
  return (
    <div className="bg-[#23272a] border border-[#2c2f33] rounded-xl p-6 shadow-md mb-6">
      <h3 className="text-xl font-bold text-gray-200 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-6">{description}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`${
          checked ? 'bg-[#5865F2]' : 'bg-gray-600'
        } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none`}
      >
        <span
          className={`${
            checked ? 'translate-x-5' : 'translate-x-0'
          } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
      </button>
    </div>
  );
}

export function NumberInput({ label, description, value, min = 0, max = 1000, onChange }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150 space-y-2 md:space-y-0">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full md:w-32 px-3 py-1.5 bg-[#23272a] text-white border border-gray-700 rounded-md focus:border-[#5865F2] focus:outline-none text-sm font-medium"
      />
    </div>
  );
}

export function TextInput({ label, description, value, placeholder = '', onChange }) {
  return (
    <div className="flex flex-col p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150 space-y-2">
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
      </div>
      <input
        type="text"
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-[#23272a] text-white border border-gray-700 rounded-md focus:border-[#5865F2] focus:outline-none text-sm"
      />
    </div>
  );
}

export function ChannelSelect({ label, description, value, channels = [], onChange }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150 space-y-2 md:space-y-0">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
      </div>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full md:w-64 px-3 py-1.5 bg-[#23272a] text-white border border-gray-700 rounded-md focus:border-[#5865F2] focus:outline-none text-sm"
      >
        <option value="">Select a Channel</option>
        {channels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.type === 4 ? `📁 ${ch.name}` : `# ${ch.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RoleSelect({ label, description, value = [], roles = [], onChange, multi = false }) {
  const handleSingleChange = (val) => {
    onChange(val ? [val] : []);
  };

  const handleMultiToggle = (roleId) => {
    if (value.includes(roleId)) {
      onChange(value.filter((id) => id !== roleId));
    } else {
      onChange([...value, roleId]);
    }
  };

  if (multi) {
    return (
      <div className="flex flex-col p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150 space-y-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-200">{label}</span>
          {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto bg-[#23272a] p-3 rounded-md border border-gray-700">
          {roles.filter(r => r.name !== '@everyone').map((role) => {
            const isSelected = value.includes(role.id);
            return (
              <label
                key={role.id}
                className={`flex items-center space-x-3 p-2 rounded cursor-pointer transition ${
                  isSelected ? 'bg-[#5865F2]/20 border border-[#5865F2]' : 'hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleMultiToggle(role.id)}
                  className="rounded border-gray-600 bg-[#2c2f33] text-[#5865F2] focus:ring-[#5865F2]"
                />
                <span className="text-xs font-semibold" style={{ color: role.color ? `#${role.color.toString(16)}` : '#ffffff' }}>
                  {role.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  const selectedValue = value[0] || '';

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-[#2c2f33]/50 rounded-lg hover:bg-[#2c2f33] transition duration-150 space-y-2 md:space-y-0">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        {description && <span className="text-xs text-gray-400 mt-0.5">{description}</span>}
      </div>
      <select
        value={selectedValue}
        onChange={(e) => handleSingleChange(e.target.value)}
        className="w-full md:w-64 px-3 py-1.5 bg-[#23272a] text-white border border-gray-700 rounded-md focus:border-[#5865F2] focus:outline-none text-sm"
      >
        <option value="">Select a Role</option>
        {roles.filter(r => r.name !== '@everyone').map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
    </div>
  );
}

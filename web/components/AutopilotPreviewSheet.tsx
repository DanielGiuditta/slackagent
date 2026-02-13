'use client';

import { useState, type CSSProperties } from 'react';
import { useStore } from '@/lib/store';
import type { Autopilot } from '@/lib/types';

interface Props {
  draft: Omit<Autopilot, 'id'>;
  mode?: 'create' | 'edit';
  autopilotId?: string;
  onClose: () => void;
}

export function AutopilotPreviewSheet({ draft, mode = 'create', autopilotId, onClose }: Props) {
  const [model, setModel] = useState<Omit<Autopilot, 'id'>>(draft);
  const [saving, setSaving] = useState(false);
  const channels = useStore((s) => s.channels);
  const createAutopilot = useStore((s) => s.createAutopilot);
  const updateAutopilot = useStore((s) => s.updateAutopilot);
  const setActiveView = useStore((s) => s.setActiveView);
  const setAutopilotEditorId = useStore((s) => s.setAutopilotEditorId);

  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'edit' && autopilotId) {
        updateAutopilot(autopilotId, model);
      } else {
        const created = createAutopilot(model);
        // Creating from composer should surface the new module in App Home immediately.
        setActiveView('app_home');
        // Open the newly created module so it is visible and confirmed.
        setAutopilotEditorId(created.id);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      style={{ background: 'rgba(0,0,0,0.2)', pointerEvents: 'none' }}
    >
      <div
        style={{
          width: '420px',
          height: '100%',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          padding: 'var(--s4)',
          overflowY: 'auto',
          pointerEvents: 'auto',
        }}
      >
        <h3 style={{ fontSize: 'var(--font-large)', fontWeight: 700 }}>
          {mode === 'edit' ? 'Edit Autopilot' : 'Create Autopilot'}
        </h3>

        <label style={labelStyle}>Name</label>
        <input
          value={model.name}
          onChange={(e) => setModel({ ...model, name: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>Cadence</label>
        <input
          value={model.cadenceText}
          onChange={(e) => setModel({ ...model, cadenceText: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>Destination</label>
        <div className="flex gap-2" style={{ marginBottom: 'var(--s2)' }}>
          <button
            onClick={() => setModel({ ...model, destinationType: 'dm', destinationId: 'dm-agent' })}
            style={{
              ...chipStyle,
              background: model.destinationType === 'dm' ? 'var(--sidebar-active)' : 'var(--surface)',
              color: model.destinationType === 'dm' ? '#fff' : 'var(--text)',
            }}
          >
            DM Workspace Agent
          </button>
          <button
            onClick={() => setModel({ ...model, destinationType: 'channel' })}
            style={{
              ...chipStyle,
              background: model.destinationType === 'channel' ? 'var(--sidebar-active)' : 'var(--surface)',
              color: model.destinationType === 'channel' ? '#fff' : 'var(--text)',
            }}
          >
            #channel
          </button>
        </div>
        {model.destinationType === 'channel' && (
          <select
            value={model.destinationId}
            onChange={(e) =>
              setModel({
                ...model,
                destinationId: e.target.value,
              })
            }
            style={inputStyle}
          >
            {channels
              .filter((channel) => channel.type !== 'dm')
              .map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
          </select>
        )}

        <label style={labelStyle}>Output</label>
        <div className="flex gap-2">
          {(['threadRuns', 'canvasPrimary'] as const).map((modeOption) => (
            <button
              key={modeOption}
              onClick={() => setModel({ ...model, outputMode: modeOption })}
              style={{
                ...chipStyle,
                background: model.outputMode === modeOption ? 'var(--sidebar-active)' : 'var(--surface)',
                color: model.outputMode === modeOption ? '#fff' : 'var(--text)',
              }}
            >
              {modeOption === 'threadRuns' ? 'Thread runs' : 'Canvas primary'}
            </button>
          ))}
        </div>

        <div className="flex gap-2" style={{ marginTop: 'var(--s4)' }}>
          <button onClick={onClose} style={buttonSecondary}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={buttonPrimary}>
            {mode === 'edit' ? 'Save changes' : 'Create Autopilot'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginTop: 'var(--s3)',
  marginBottom: 'var(--s1)',
  color: 'var(--muted)',
  fontSize: 'var(--font-small)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px',
  fontSize: 'var(--font-small)',
  background: 'var(--bg)',
};

const chipStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '12px',
  cursor: 'pointer',
};

const buttonPrimary: CSSProperties = {
  border: '1px solid var(--success)',
  background: 'var(--success)',
  color: '#fff',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: 'var(--font-small)',
  cursor: 'pointer',
};

const buttonSecondary: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: 'var(--font-small)',
  cursor: 'pointer',
};

import { useEffect, useRef, useState } from 'react';
import { useGame, useStore } from '../../store';
import { formatTickDate } from '../../sim/util';

export function Chat() {
  const { state, me } = useGame();
  const send = useStore((s) => s.send);
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const count = state?.chat.length ?? 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);
  if (!state || !me) return null;
  const visible = state.chat.filter((m) => !m.to || m.to === me.id || m.from === me.id);
  const others = Object.values(state.players).filter((p) => p.id !== me.id);
  const submit = () => { if (text.trim()) { void send({ type: 'chat', text, to: to || undefined }); setText(''); } };
  return (
    <div className="panel-content chat">
      <h2>Chat</h2>
      <div className="chat-log">
        {visible.length === 0 && <div className="muted small">Say hello. Private messages are only seen by the recipient (and the host's machine).</div>}
        {visible.map((m) => {
          const pc = state.players[m.from]?.country;
          return (
            <div key={m.id} className={`chat-msg ${m.from === me.id ? 'mine' : ''} ${m.to ? 'whisper' : ''}`}>
              <span className="chat-meta">{m.name}{pc ? ` (${state.countries[pc]?.name})` : ''}{m.to ? ` → ${state.players[m.to]?.name ?? '?'}` : ''} · {formatTickDate(state, m.tick)}</span>
              <span>{m.text}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="row">
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Everyone</option>
          {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="grow" value={text} maxLength={400} placeholder="Message…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="primary" onClick={submit}>Send</button>
      </div>
    </div>
  );
}

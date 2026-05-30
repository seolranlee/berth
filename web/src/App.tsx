import { useEffect, useMemo, useState } from 'react';
import type { Session, TerminalInfo } from '@shared';
import { Anchor, Check, Copy, Play, Search, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [terminal, setTerminal] = useState('warp');
  const [query, setQuery] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listSessions(), api.listTerminals()])
      .then(([s, t]) => {
        setSessions(s);
        setTerminals(t);
        const firstAvail = t.find((x) => x.available);
        if (firstAvail) setTerminal(firstAvail.id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function togglePin(sessionId: string, pinned: boolean) {
    // 낙관적 업데이트
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, pinned } : s)),
    );
    try {
      await (pinned ? api.pin(sessionId) : api.unpin(sessionId));
    } catch {
      // 실패 시 롤백
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, pinned: !pinned } : s)),
      );
    }
  }

  const pinnedCount = useMemo(() => sessions.filter((s) => s.pinned).length, [sessions]);

  const visible = useMemo(() => {
    let list = sessions;
    if (pinnedOnly) list = list.filter((s) => s.pinned);
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((s) =>
        [s.title, s.project, s.gitBranch, s.lastPrompt].some(
          (f) => f && f.toLowerCase().includes(q),
        ),
      );
    }
    // 핀 먼저, 그룹 내 기존(최근) 순서 유지
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [sessions, query, pinnedOnly]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center gap-2">
        <Anchor className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">berth</h1>
        <span className="text-sm text-muted-foreground">
          {loading ? '불러오는 중…' : `세션 ${sessions.length}개`}
        </span>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 / 프로젝트 / 브랜치 검색…"
            className="pl-8"
          />
        </div>
        <Button
          variant={pinnedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPinnedOnly((v) => !v)}
          title="즐겨찾기만 보기"
        >
          <Star className={cn(pinnedOnly && 'fill-current')} />
          즐겨찾기{pinnedCount ? ` ${pinnedCount}` : ''}
        </Button>
        <select
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
        >
          {terminals.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.available}>
              {t.available ? t.name : `${t.name} (미설치)`}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">에러: {error}</p>}

      <ul className="space-y-2">
        {visible.map((s) => (
          <SessionCard
            key={s.sessionId}
            session={s}
            terminal={terminal}
            onTogglePin={togglePin}
          />
        ))}
      </ul>
      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {pinnedOnly ? '즐겨찾기한 세션이 없어요' : '결과 없음'}
        </p>
      )}
    </div>
  );
}

type LaunchState = 'idle' | 'launching' | 'done' | 'error';

function SessionCard({
  session,
  terminal,
  onTogglePin,
}: {
  session: Session;
  terminal: string;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [launchState, setLaunchState] = useState<LaunchState>('idle');

  const when = (session.updatedAt || '').slice(0, 16).replace('T', ' ');
  const loc = [session.project, session.gitBranch].filter(Boolean).join(' · ');

  async function copy() {
    await navigator.clipboard.writeText(session.resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function launch() {
    setLaunchState('launching');
    try {
      await api.launch(session.sessionId, terminal);
      setLaunchState('done');
    } catch {
      setLaunchState('error');
    }
    setTimeout(() => setLaunchState('idle'), 1500);
  }

  const launchLabel =
    launchState === 'launching'
      ? '실행 중…'
      : launchState === 'done'
        ? '실행됨'
        : launchState === 'error'
          ? '실패'
          : '실행';

  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-3.5 text-card-foreground transition-colors hover:bg-accent/40',
        session.pinned && 'border-l-2 border-l-yellow-500',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{session.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {when} · {loc || '?'} · {session.userTurns} turns
          </div>
          {session.lastPrompt && (
            <div className="mt-1.5 truncate text-xs text-muted-foreground/80">
              ⤷ {session.lastPrompt}
            </div>
          )}
        </div>
        <button
          onClick={() => onTogglePin(session.sessionId, !session.pinned)}
          title={session.pinned ? '즐겨찾기 해제' : '즐겨찾기'}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Star className={cn('size-4', session.pinned && 'fill-yellow-500 text-yellow-500')} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={launch} disabled={launchState === 'launching'}>
          <Play /> {launchLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? '복사됨' : '복사'}
        </Button>
        <code className="ml-auto max-w-[45%] truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {session.resumeCommand}
        </code>
      </div>
    </li>
  );
}

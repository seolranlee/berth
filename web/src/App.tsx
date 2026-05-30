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
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const [s, t] = await Promise.all([api.listSessions(), api.listTerminals()]);
        if (cancelled) return;
        setSessions(s);
        setTerminals(t);
        const firstAvail = t.find((x) => x.available);
        if (firstAvail) setTerminal(firstAvail.id);
        setLoading(false);

        // 한글 제목이 없는 세션이 있으면 백그라운드 생성 트리거 + 폴링으로 갱신
        if (s.some((x) => !x.koreanTitle)) {
          setGenerating(true);
          api.generateTitles().catch(() => {});
          let polls = 0;
          timer = setInterval(async () => {
            polls += 1;
            try {
              const fresh = await api.listSessions();
              if (cancelled) return;
              setSessions(fresh);
              if (fresh.every((x) => x.koreanTitle) || polls >= 40) {
                setGenerating(false);
                if (timer) clearInterval(timer);
              }
            } catch {
              /* 일시 오류는 무시하고 다음 폴링 */
            }
          }, 3000);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  async function togglePin(sessionId: string, pinned: boolean) {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, pinned } : s)),
    );
    try {
      await (pinned ? api.pin(sessionId) : api.unpin(sessionId));
    } catch {
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, pinned: !pinned } : s)),
      );
    }
  }

  const pinnedCount = useMemo(() => sessions.filter((s) => s.pinned).length, [sessions]);
  const missingTitles = useMemo(
    () => sessions.filter((s) => !s.koreanTitle).length,
    [sessions],
  );

  const visible = useMemo(() => {
    let list = sessions;
    if (pinnedOnly) list = list.filter((s) => s.pinned);
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((s) =>
        [s.koreanTitle, s.title, s.project, s.gitBranch, s.lastPrompt].some(
          (f) => f && f.toLowerCase().includes(q),
        ),
      );
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [sessions, query, pinnedOnly]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center gap-2">
        <Anchor className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">berth</h1>
        <span className="text-sm text-muted-foreground">
          {loading ? '불러오는 중…' : `세션 ${sessions.length}개`}
          {generating && ` · 한글 제목 생성 중 (${missingTitles})`}
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
  const mainTitle = session.koreanTitle ?? session.title;
  const subTitle = session.koreanTitle ? session.title : null; // 한글 있으면 영어를 서브로

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
          <div className="font-medium">{mainTitle}</div>
          {subTitle && (
            <div className="truncate text-xs text-muted-foreground/70">{subTitle}</div>
          )}
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

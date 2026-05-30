import { useEffect, useMemo, useState } from 'react';
import type { Session, TerminalInfo } from '@shared';
import { Anchor, Check, Copy, Info, Play, Search, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// idle·비노이즈인데 한글 제목이 없는 세션만 "생성 대상".
// 노이즈(빈/trivial) 제외 이유: 일부 환경(claude --no-session-persistence 미적용)에서
// 제목 생성 호출이 빈 세션 파일을 만들어, 그게 또 생성 대상이 되는 무한 증식 루프 발생.
const needsTitle = (s: Session) => !s.active && !s.noise && !s.koreanTitle;
const REFRESH_MS = 10_000; // 세션/진행중 상태를 지속 주기 갱신 → 배지 실시간 반영

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [terminal, setTerminal] = useState('warp');
  const [query, setQuery] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [hideNoise, setHideNoise] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lastTrigger = 0;

    // idle인데 제목 없는 세션이 있으면 생성 트리거 (30초 디바운스 + 서버도 중복 방지)
    function maybeGenerate(list: Session[]) {
      if (list.some(needsTitle) && Date.now() - lastTrigger > 30_000) {
        lastTrigger = Date.now();
        api.generateTitles().catch(() => {});
      }
    }

    // 초기 로드 (실패 시에만 에러 노출)
    (async () => {
      try {
        const [t, s] = await Promise.all([api.listTerminals(), api.listSessions()]);
        if (cancelled) return;
        setTerminals(t);
        const firstAvail = t.find((x) => x.available);
        if (firstAvail) setTerminal(firstAvail.id);
        setSessions(s);
        maybeGenerate(s);
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    // 지속 갱신: active 플래그·신규 세션·생성된 제목을 계속 반영 (폴링 오류는 무시)
    const timer = setInterval(async () => {
      try {
        const fresh = await api.listSessions();
        if (cancelled) return;
        setSessions(fresh);
        maybeGenerate(fresh);
      } catch {
        /* 일시 오류는 무시하고 다음 주기에 재시도 */
      }
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
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
  const missingTitles = useMemo(() => sessions.filter(needsTitle).length, [sessions]);
  const selectedSupportsTab = useMemo(
    () => terminals.find((t) => t.id === terminal)?.supportsTab ?? false,
    [terminals, terminal],
  );
  // 핀·진행중이 아닌 노이즈 세션 수 (기본 숨김 대상)
  const noiseCount = useMemo(
    () => sessions.filter((s) => s.noise && !s.pinned && !s.active).length,
    [sessions],
  );

  const visible = useMemo(() => {
    let list = sessions;
    // 노이즈 세션 제거 (핀·진행중은 노이즈여도 항상 표시)
    if (hideNoise) list = list.filter((s) => !s.noise || s.pinned || s.active);
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
  }, [sessions, query, pinnedOnly, hideNoise]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center gap-2">
        <Anchor className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">berth</h1>
        <span className="text-sm text-muted-foreground">
          {loading ? '불러오는 중…' : `세션 ${visible.length}개`}
          {!loading && missingTitles > 0 && ` · 한글 제목 생성 중 (${missingTitles})`}
        </span>
      </header>

      <div className="mb-4 flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          실행 시 빈 터미널 창이 함께 뜬다면 터미널의 <b>창 복원</b> 기능 때문이에요. 세션을{' '}
          <code className="rounded bg-background px-1 py-0.5">/exit</code>로 닫거나 "창 복원" 설정을
          끄면 사라집니다.
        </span>
      </div>

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
        {noiseCount > 0 && (
          <Button
            variant={hideNoise ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideNoise((v) => !v)}
            title="빈/resume/clear 등 노이즈 세션 제거·표시 토글"
          >
            노이즈 세션 제거 {noiseCount}
          </Button>
        )}
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
            supportsTab={selectedSupportsTab}
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

type LaunchMode = 'window' | 'tab';

function SessionCard({
  session,
  terminal,
  supportsTab,
  onTogglePin,
}: {
  session: Session;
  terminal: string;
  supportsTab: boolean;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<LaunchMode | null>(null);
  const [flash, setFlash] = useState<{ mode: LaunchMode; ok: boolean } | null>(null);

  const when = (session.updatedAt || '').slice(0, 16).replace('T', ' ');
  const loc = [session.project, session.gitBranch].filter(Boolean).join(' · ');
  const mainTitle = session.koreanTitle ?? session.title;
  const subTitle = session.koreanTitle ? session.title : null; // 한글 있으면 영어를 서브로

  async function copy() {
    await navigator.clipboard.writeText(session.resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function launch(mode: LaunchMode) {
    setBusy(mode);
    setFlash(null);
    try {
      await api.launch(session.sessionId, terminal, mode);
      setFlash({ mode, ok: true });
    } catch {
      setFlash({ mode, ok: false });
    } finally {
      setBusy(null);
      setTimeout(() => setFlash(null), 1500);
    }
  }

  // 모드별 버튼 라벨 (실행중/실행됨/실패/기본)
  function label(mode: LaunchMode, base: string): string {
    if (busy === mode) return '실행 중…';
    if (flash?.mode === mode) return flash.ok ? '실행됨' : '실패';
    return base;
  }

  const disabled = session.active || busy !== null;

  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-3.5 text-card-foreground transition-colors hover:bg-accent/40',
        session.pinned && 'border-l-2 border-l-yellow-500',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{mainTitle}</span>
            {session.active && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                <span className="size-1.5 animate-pulse rounded-full bg-green-500" />
                진행중
              </span>
            )}
          </div>
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
        {session.active ? (
          <Button size="sm" disabled title="이미 실행 중인 세션이라 새로 실행할 수 없어요">
            <Play /> 진행 중
          </Button>
        ) : supportsTab ? (
          <>
            <Button size="sm" onClick={() => launch('tab')} disabled={disabled}>
              <Play /> {label('tab', '새 탭')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => launch('window')}
              disabled={disabled}
            >
              {label('window', '새 창')}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => launch('window')} disabled={disabled}>
            <Play /> {label('window', '실행')}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? '복사됨' : '복사'}
        </Button>
        <code className="ml-auto max-w-[38%] truncate rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {session.resumeCommand}
        </code>
      </div>
    </li>
  );
}

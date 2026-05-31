import { useEffect, useMemo, useState } from 'react';
import type { Session, TerminalInfo } from '@shared';
import { Anchor, Check, Copy, Info, Play, Search, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// idle·비노이즈인데 한글 제목이 없는 세션만 "생성 대상".
// 노이즈(빈/trivial) 제외 이유: 일부 환경(claude --no-session-persistence 미적용)에서
// 제목 생성 호출이 빈 세션 파일을 만들어, 그게 또 생성 대상이 되는 무한 증식 루프 발생.
const needsTitle = (s: Session) => !s.active && !s.noise && !s.koreanTitle;
const REFRESH_MS = 10_000; // 세션/진행중 상태를 지속 주기 갱신 → 배지 실시간 반영

// jsonl 타임스탬프는 UTC ISO 8601(…Z). 브라우저 로컬 시간(예: KST)으로 변환해 "YYYY-MM-DD HH:MM" 표시.
function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [terminal, setTerminal] = useState('warp');
  const [query, setQuery] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [hideNoise, setHideNoise] = useState(true);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
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

  // 세션 삭제 (소프트 — 서버가 휴지통으로 이동). 성공 시 목록에서 제거.
  async function deleteSession(sessionId: string) {
    await api.deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
  }

  // 노이즈 세션 일괄 삭제 후 목록 갱신
  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      await api.deleteNoise();
      setSessions(await api.listSessions());
    } catch {
      /* 실패는 무시 — 다음 폴링에서 보정 */
    } finally {
      setBulkDeleting(false);
      setConfirmingBulkDelete(false);
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
  const activeCount = useMemo(() => sessions.filter((s) => s.active).length, [sessions]);

  const visible = useMemo(() => {
    let list = sessions;
    // 노이즈 세션 제거 (핀·진행중은 노이즈여도 항상 표시)
    if (hideNoise) list = list.filter((s) => !s.noise || s.pinned || s.active);
    if (pinnedOnly) list = list.filter((s) => s.pinned);
    if (activeOnly) list = list.filter((s) => s.active);
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((s) =>
        [s.koreanTitle, s.title, s.project, s.gitBranch, s.lastPrompt].some(
          (f) => f && f.toLowerCase().includes(q),
        ),
      );
    }
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [sessions, query, pinnedOnly, activeOnly, hideNoise]);

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

      {/* Row 1 · 검색 + 실행 터미널 */}
      <div className="mb-2.5 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 / 프로젝트 / 브랜치 검색…"
            className="pl-8"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>실행 터미널</span>
          <select
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring"
          >
            {terminals.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.available}>
                {t.available ? t.name : `${t.name} (미설치)`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2 · 필터 chip */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={pinnedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPinnedOnly((v) => !v)}
          title="즐겨찾기만 보기"
        >
          <Star className={cn(pinnedOnly && 'fill-current')} />
          즐겨찾기{pinnedCount ? ` ${pinnedCount}` : ''}
        </Button>
        <Button
          variant={activeOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveOnly((v) => !v)}
          title="진행 중인 세션만 보기"
        >
          <span
            className={cn('size-1.5 rounded-full bg-green-500', activeOnly && 'animate-pulse')}
          />
          진행중{activeCount ? ` ${activeCount}` : ''}
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
        {noiseCount > 0 &&
          (confirmingBulkDelete ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              {noiseCount}개 휴지통으로?
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmingBulkDelete(false)}
                disabled={bulkDeleting}
              >
                취소
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? '삭제 중…' : '삭제'}
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingBulkDelete(true)}
              title="노이즈 세션을 모두 휴지통으로 이동"
              className="text-muted-foreground"
            >
              <Trash2 /> 노이즈 세션 일괄 삭제
              <NoiseInfo />
            </Button>
          ))}
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
            onDelete={deleteSession}
          />
        ))}
      </ul>
      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {pinnedOnly
            ? '즐겨찾기한 세션이 없어요'
            : activeOnly
              ? '진행 중인 세션이 없어요'
              : '결과 없음'}
        </p>
      )}
    </div>
  );
}

// 노이즈 세션 판단 기준을 (i) 호버 툴팁으로 설명 (scanner.ts의 computeNoise와 동일 기준)
function NoiseInfo() {
  return (
    <span className="group relative inline-flex items-center">
      <Info className="size-3.5 cursor-help text-muted-foreground/70 transition-colors hover:text-foreground" />
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 w-72 rounded-md border bg-background p-2.5 text-left text-xs leading-relaxed font-normal whitespace-normal text-muted-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100"
      >
        <span className="mb-1 block font-medium text-foreground">노이즈 세션 판단 기준</span>
        대화가 거의 없는 세션이에요. 아래 중 하나면 노이즈로 봅니다:
        <span className="mt-1 block">• 사용자 발화가 0턴인 빈 세션</span>
        <span className="block">
          • 1턴 이하이면서 resume·clear·exit·continue·계속·cd .. 같은 trivial 입력
        </span>
        <span className="block">• 슬래시(/) 명령이거나 3자 이하의 매우 짧은 입력</span>
        <span className="mt-1 block">
          단, AI 요약 제목이 생성된 세션은 실제 작업으로 보고 제외해요.
        </span>
      </span>
    </span>
  );
}

type LaunchMode = 'window' | 'tab';

function SessionCard({
  session,
  terminal,
  supportsTab,
  onTogglePin,
  onDelete,
}: {
  session: Session;
  terminal: string;
  supportsTab: boolean;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<LaunchMode | null>(null);
  const [flash, setFlash] = useState<{ mode: LaunchMode; ok: boolean } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const when = formatWhen(session.updatedAt);
  const loc = [session.project, session.gitBranch].filter(Boolean).join(' · ');
  const mainTitle = session.koreanTitle ?? session.title;
  const subTitle = session.koreanTitle ? session.title : null; // 한글 있으면 영어를 서브로

  async function copy() {
    await navigator.clipboard.writeText(session.resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await onDelete(session.sessionId); // 성공 시 부모가 목록에서 제거 → 카드 언마운트
    } catch {
      setDeleting(false);
      setDeleteFailed(true);
      setTimeout(() => setDeleteFailed(false), 1500);
    }
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
            <div className="truncate text-sm text-muted-foreground/70">{subTitle}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {when} · {loc || '?'} · {session.userTurns} turns
          </div>
          {session.lastPrompt && (
            <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80">
              ⤷ {session.lastPrompt}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => onTogglePin(session.sessionId, !session.pinned)}
            title={session.pinned ? '즐겨찾기 해제' : '즐겨찾기'}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Star className={cn('size-4', session.pinned && 'fill-yellow-500 text-yellow-500')} />
          </button>
          {!session.active && (
            <button
              onClick={() => setConfirmingDelete(true)}
              title="세션 삭제 (휴지통으로 이동)"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>
      {confirmingDelete ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {deleteFailed ? '삭제 실패 — 다시 시도해 주세요' : '휴지통으로 이동할까요? (복구 가능)'}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmingDelete(false)}
            disabled={deleting}
          >
            취소
          </Button>
          <Button size="sm" variant="destructive" onClick={doDelete} disabled={deleting}>
            {deleting ? '삭제 중…' : '삭제'}
          </Button>
        </div>
      ) : (
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
      )}
    </li>
  );
}

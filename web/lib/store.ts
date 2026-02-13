import { create } from 'zustand';
import type {
  AgentCommand,
  Autopilot,
  Canvas,
  Channel,
  DeliverableArtifactLink,
  Message,
  OutputFormat,
  Run,
  RunStatus,
  ToolToggles,
  TypingState,
  UserProfile,
} from './types';

type ViewMode = 'channel' | 'runs' | 'app_home';

interface SlackStore {
  /* ─── State ─── */
  channels: Channel[];
  users: Record<string, UserProfile>;
  activeChannelId: string;
  messages: Message[];
  runs: Record<string, Run>;
  autopilots: Record<string, Autopilot>;
  canvases: Record<string, Canvas>;
  runsIndex: Array<Pick<Run, 'id' | 'title' | 'status' | 'progressPct' | 'latestUpdate' | 'createdAt'>>;
  activeThreadRootId: string | null;
  selectedRunId: string | null;
  runsPanelOpen: boolean;
  appHomeOpen: boolean;
  activeView: ViewMode;
  canvasRunId: string | null;
  autopilotEditorId: string | null;
  typing: TypingState | null;
  devPanelOpen: boolean;

  /* ─── Actions ─── */
  setChannels: (channels: Channel[]) => void;
  getUserProfile: (userId: string) => UserProfile;
  setActiveChannel: (id: string) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  upsertRun: (run: Run) => void;
  upsertAutopilot: (autopilot: Autopilot) => void;
  setRunsIndex: (items: SlackStore['runsIndex']) => void;
  openThread: (rootId: string) => void;
  closeThread: () => void;
  openRunThread: (runId: string) => void;
  setSelectedRunId: (id: string | null) => void;
  setRunsPanelOpen: (open: boolean) => void;
  setAppHomeOpen: (open: boolean) => void;
  setActiveView: (view: ViewMode) => void;
  openRunCanvas: (runId: string) => void;
  closeRunCanvas: () => void;
  setAutopilotEditorId: (id: string | null) => void;
  setTyping: (state: TypingState | null) => void;
  toggleDevPanel: () => void;
  createMessage: (params: { channelId: string; userId: string; text: string; parentId?: string; isBot?: boolean }) => Message;
  createDeliverableMessage: (params: {
    channelId: string;
    threadRootId: string;
    runId: string;
    body: string;
    title?: string;
    artifactLinks?: DeliverableArtifactLink[];
  }) => Message;
  createRunFromCommand: (command: AgentCommand, opts?: { continueRunId?: string; continueRootId?: string }) => Run;
  reconcileRunFromServer: (optimisticRunId: string, serverRun: Run) => Run;
  discardRun: (runId: string) => void;
  appendRunThreadUpdate: (runId: string, text: string, opts?: { asApprovalBlock?: boolean }) => void;
  decideRunApproval: (runId: string, decision: 'approve' | 'reject') => void;
  controlRun: (runId: string, action: 'pause' | 'stop' | 'resume') => void;
  createAutopilot: (draft: Omit<Autopilot, 'id'>) => Autopilot;
  updateAutopilot: (id: string, patch: Partial<Autopilot>) => void;
  runAutopilotNow: (id: string) => Run | undefined;
  getRunByRootMessage: (rootMessageId: string) => Run | undefined;
  getRunsByStatus: (status?: RunStatus) => Run[];
}

const now = Date.now();
const DEFAULT_AVATAR_SRC = '/avatars/default-avatar.svg';
const TERMINAL_RUN_STATUSES = new Set<RunStatus>(['completed', 'failed', 'stopped']);

function shouldIgnoreStaleRunUpdate(current: Run, incoming: Run) {
  // WS and HTTP race each other; ignore older status regressions like running -> queued.
  if (current.id !== incoming.id || current.createdAt !== incoming.createdAt) return false;
  if (TERMINAL_RUN_STATUSES.has(current.status) && !TERMINAL_RUN_STATUSES.has(incoming.status)) return true;
  if (current.status === 'running' && incoming.status === 'queued') return true;
  if (current.progressPct > incoming.progressPct && incoming.status === 'queued') return true;
  return false;
}

const seedUsers: Record<string, UserProfile> = {
  you: { id: 'you', displayName: 'You', role: 'Staff Product Manager', avatarUrl: '/avatars/you.png', isBot: false },
  'workspace-agent': {
    id: 'workspace-agent',
    displayName: 'Agent',
    role: 'AI Teammate',
    avatarUrl: '/avatars/workspace-agent.png',
    isBot: true,
  },
  'ops-bot': { id: 'ops-bot', displayName: 'OpsBot', role: 'Reliability Bot', avatarUrl: '/avatars/ops-bot.png', isBot: true },
  'maya-chen': { id: 'maya-chen', displayName: 'Maya Chen', role: 'VP Product', avatarUrl: '/avatars/maya-chen.png', isBot: false },
  'leo-martin': { id: 'leo-martin', displayName: 'Leo Martin', role: 'Head of Engineering', avatarUrl: '/avatars/leo-martin.png', isBot: false },
  'nina-kapoor': { id: 'nina-kapoor', displayName: 'Nina Kapoor', role: 'Senior Product Manager', avatarUrl: '/avatars/nina-kapoor.png', isBot: false },
  'alex-park': { id: 'alex-park', displayName: 'Alex Park', role: 'Staff Backend Engineer', avatarUrl: '/avatars/alex-park.png', isBot: false },
  'priya-iyer': { id: 'priya-iyer', displayName: 'Priya Iyer', role: 'Engineering Manager', avatarUrl: '/avatars/priya-iyer.png', isBot: false },
  'jordan-lee': { id: 'jordan-lee', displayName: 'Jordan Lee', role: 'Data Analyst', avatarUrl: '/avatars/jordan-lee.png', isBot: false },
  'emma-ross': { id: 'emma-ross', displayName: 'Emma Ross', role: 'Chief Risk Officer', avatarUrl: '/avatars/emma-ross.png', isBot: false },
  'hannah-yu': { id: 'hannah-yu', displayName: 'Hannah Yu', role: 'Customer Success Lead', avatarUrl: '/avatars/hannah-yu.png', isBot: false },
};

const USER_ALIASES: Record<string, string> = {
  alice: 'maya-chen',
  bob: 'alex-park',
  charlie: 'nina-kapoor',
  'lana-kim': 'nina-kapoor',
  'riley-ng': 'hannah-yu',
  'morgan-bell': 'hannah-yu',
  'samir-patel': 'alex-park',
  'chloe-wu': 'nina-kapoor',
  'victor-hale': 'leo-martin',
  'sofia-reed': 'maya-chen',
  'mateo-cruz': 'alex-park',
  'jules-bennett': 'hannah-yu',
  'marco-silva': 'priya-iyer',
  'olivia-ford': 'emma-ross',
  'ethan-shaw': 'alex-park',
  'grace-lin': 'hannah-yu',
  'noah-walker': 'jordan-lee',
  'tessa-cho': 'priya-iyer',
  'ben-owens': 'jordan-lee',
  'avery-johnson': 'maya-chen',
  'farah-siddiqui': 'emma-ross',
  'diego-alvarez': 'priya-iyer',
  'isabel-mora': 'hannah-yu',
  'kevin-okafor': 'jordan-lee',
  'owen-price': 'emma-ross',
  'rachel-brooks': 'maya-chen',
  'liam-cole': 'alex-park',
  'mina-das': 'maya-chen',
  'zoe-keller': 'priya-iyer',
  'daniel-kim': 'nina-kapoor',
};

const seedChannels: Channel[] = [
  { id: 'general', name: 'general', type: 'channel' },
  { id: 'announcements', name: 'announcements', type: 'channel' },
  { id: 'eng', name: 'eng', type: 'channel' },
  { id: 'eng-platform', name: 'eng-platform', type: 'channel' },
  { id: 'eng-risk', name: 'eng-risk', type: 'channel' },
  { id: 'product-payments', name: 'product-payments', type: 'channel' },
  { id: 'design-systems', name: 'design-systems', type: 'channel' },
  { id: 'support-escalations', name: 'support-escalations', type: 'channel' },
  { id: 'sales-enterprise', name: 'sales-enterprise', type: 'channel' },
  { id: 'fraud-watch', name: 'fraud-watch', type: 'channel' },
  { id: 'treasury-ops', name: 'treasury-ops', type: 'channel' },
  { id: 'customer-onboarding', name: 'customer-onboarding', type: 'channel' },
  { id: 'data-insights', name: 'data-insights', type: 'channel' },
  { id: 'legal-regulatory', name: 'legal-regulatory', type: 'channel' },
  { id: 'incident-response', name: 'incident-response', type: 'channel' },
  { id: 'customer-voice', name: 'customer-voice', type: 'channel' },
  { id: 'release-train', name: 'release-train', type: 'channel' },
  { id: 'ops-compliance', name: 'ops-compliance', type: 'channel' },
  { id: 'finops', name: 'finops', type: 'channel' },
  { id: 'leadership-staff', name: 'leadership-staff', type: 'channel' },
  { id: 'dm-agent', name: 'Agent', type: 'dm', isAgent: true },
  { id: 'dm-alex', name: 'Alex Park', type: 'dm' },
  { id: 'dm-priya', name: 'Priya Iyer', type: 'dm' },
  { id: 'dm-jordan', name: 'Jordan Lee', type: 'dm' },
  { id: 'dm-jules', name: 'Jules Bennett', type: 'dm' },
  { id: 'dm-emma', name: 'Emma Ross', type: 'dm' },
  { id: 'dm-farah', name: 'Farah Siddiqui', type: 'dm' },
  { id: 'dm-diego', name: 'Diego Alvarez', type: 'dm' },
  { id: 'dm-isabel', name: 'Isabel Mora', type: 'dm' },
  { id: 'dm-kevin', name: 'Kevin Okafor', type: 'dm' },
  { id: 'dm-maya', name: 'Maya Chen', type: 'dm' },
  { id: 'dm-hannah', name: 'Hannah Yu', type: 'dm' },
];

type SeedDraft = Omit<Message, 'id' | 'ts' | 'kind' | 'isBot'> & {
  id?: string;
  minutesAgo: number;
  kind?: Message['kind'];
  isBot?: boolean;
  title?: string;
  body?: string;
  artifactLinks?: Message['artifactLinks'];
};

const INTERSPERSE_USER_POOL = [
  'you',
  'maya-chen',
  'leo-martin',
  'nina-kapoor',
  'alex-park',
  'priya-iyer',
  'jordan-lee',
  'emma-ross',
  'hannah-yu',
];

function chooseInterspersedUser(lastUserId: string | undefined, preferredUserId: string, seed: string): string {
  if (!lastUserId || preferredUserId !== lastUserId) return preferredUserId;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const offset = hash % INTERSPERSE_USER_POOL.length;
  for (let i = 0; i < INTERSPERSE_USER_POOL.length; i++) {
    const candidate = INTERSPERSE_USER_POOL[(offset + i) % INTERSPERSE_USER_POOL.length];
    if (candidate !== lastUserId) return candidate;
  }
  return preferredUserId;
}

function buildSeedMessages(): Message[] {
  const rows: Message[] = [];
  let autoId = 1;

  const push = (draft: SeedDraft) => {
    const canonicalUserId = USER_ALIASES[draft.userId] || draft.userId;
    rows.push({
      id: draft.id ?? `seed-msg-${autoId++}`,
      channelId: draft.channelId,
      containerId: draft.containerId,
      userId: canonicalUserId,
      text: draft.text,
      title: draft.title,
      body: draft.body,
      artifactLinks: draft.artifactLinks,
      ts: now - draft.minutesAgo * 60_000,
      isBot: draft.isBot ?? false,
      parentId: draft.parentId,
      threadRootId: draft.threadRootId,
      kind: draft.kind ?? 'message',
      runId: draft.runId,
    });
  };

  const addScript = (channelId: string, startMinutesAgo: number, step: number, entries: Array<[string, string]>) => {
    entries.forEach(([userId, text], idx) => {
      push({ channelId, userId, text, minutesAgo: startMinutesAgo - idx * step });
    });
  };

  addScript('general', 690, 5, [
    ['maya-chen', 'Welcome new folks from Ridgeway Bank migration team. Intro thread is open.'],
    ['avery-johnson', 'Reminder: customer trust is our product. Keep response times tight this week.'],
    ['leo-martin', 'Engineering hiring update: 2 backend offers accepted, start dates next month.'],
    ['nina-kapoor', 'Posting weekly priorities in canvas: go/weekly-priorities'],
    ['sofia-reed', 'Finance close timeline is unchanged. Expense cutoff is Friday 2pm PT.'],
    ['hannah-yu', 'CSAT rolled up to 95.1 this morning, thanks support + product.'],
    ['marco-silva', 'Lunch and learn tomorrow: payment disputes 101 in Conf Room B.'],
    ['you', 'Shipping note for card controls in #product-payments by EOD.'],
  ]);

  addScript('announcements', 660, 7, [
    ['ops-bot', ':rocket: API edge deploy window tonight at 22:30 PT.'],
    ['ops-bot', ':white_check_mark: Database failover drill completed in 11m.'],
    ['avery-johnson', 'Q2 kickoff recording is up: go/q2-kickoff'],
    ['ops-bot', ':warning: Pager rotation updated for fraud services.'],
    ['victor-hale', 'Security training due Friday. Please complete module 4.'],
    ['ops-bot', ':information_source: SSO maintenance next Tuesday 6:00-6:20am PT.'],
    ['maya-chen', 'Roadmap review moved to Thursday to include enterprise feedback.'],
    ['ops-bot', ':white_check_mark: SOC2 evidence export completed.'],
  ]);

  addScript('eng-platform', 640, 4, [
    ['alex-park', 'Kafka consumer lag normalized after replay. Dashboard: go/lag-live'],
    ['samir-patel', 'Merged idempotency patch for payout-webhooks into main.'],
    ['ethan-shaw', 'UI bundle dropped 11% after route-level split on account settings.'],
    ['mateo-cruz', 'Staging deploy green. Waiting on canary in us-west-2.'],
    ['tessa-cho', 'Added additional WAF rule for suspicious BIN probe traffic.'],
    ['priya-iyer', 'Please prioritize flaky test cleanup before next release train.'],
    ['ben-owens', 'Need final schema for dispute reason taxonomy today.'],
    ['leo-martin', 'Cost note: keep an eye on Redis memory growth from event dedupe.'],
  ]);

  addScript('eng-risk', 620, 4, [
    ['emma-ross', 'Fraud false positive rate climbed to 2.4% overnight.'],
    ['ben-owens', 'Model v12 threshold proposal is in doc: fraud-threshold-v12.md'],
    ['alex-park', 'Backfill for merchant category labels started, ETA 40m.'],
    ['jordan-lee', 'Chargeback ratio by cohort updated in Looker: go/cb-ratio'],
    ['tessa-cho', 'Flagged two suspicious merchant signups; compliance notified.'],
    ['priya-iyer', 'Let us freeze non-critical releases until risk hotfix lands.'],
    ['samir-patel', 'Added timeout guard to risk score API fallback path.'],
    ['you', 'Can we compare decline reason distribution pre/post threshold shift?'],
  ]);

  addScript('product-payments', 600, 5, [
    ['nina-kapoor', 'Card controls milestone B is now code complete.'],
    ['chloe-wu', 'Uploaded spend-limit interaction flows in Figma: go/card-controls-v4'],
    ['ben-owens', 'Policy engine needs one more enum for temporary lock reason.'],
    ['you', 'Drafting release note text now, will share for legal review.'],
    ['hannah-yu', 'Top customer ask this week: instant card freeze from mobile web.'],
    ['jordan-lee', 'Activation funnel improved from 61% to 67% in beta cohort.'],
    ['maya-chen', 'Please capture experiment learnings in the launch brief.'],
    ['leo-martin', 'Backend supports lock/unlock; waiting for final client validation.'],
  ]);

  addScript('design-systems', 580, 5, [
    ['lana-kim', 'Published token update for status badges, including warning contrast fix.'],
    ['chloe-wu', 'Accessibility pass done on settings forms. 2 focus bugs left.'],
    ['ethan-shaw', 'Can we lock spacing scale before sprint planning?'],
    ['nina-kapoor', 'Need updated icon for disputed transaction state by Thursday.'],
    ['lana-kim', 'Uploaded handoff deck: go/ds-handoff-feb11'],
    ['you', 'Looks good. Can we include hover + disabled states in spec?'],
    ['chloe-wu', 'Done, added all states and mobile tap behavior details.'],
    ['victor-hale', 'Thanks team, this unblocks enterprise onboarding polish.'],
  ]);

  addScript('support-escalations', 560, 4, [
    ['riley-ng', 'Escalation: Northbank cannot export transactions > 10k rows.'],
    ['morgan-bell', 'Shared HAR + logs in file: northbank-export-0211.zip'],
    ['grace-lin', 'Tagging eng-platform, this is now Sev2 for enterprise.'],
    ['alex-park', 'Reproduced. Query timeout on one shard, patch in review.'],
    ['hannah-yu', 'Customer call in 40m, need ETA and workaround language.'],
    ['priya-iyer', 'Workaround: split date range by week until fix ships.'],
    ['morgan-bell', 'Posted workaround macro in Zendesk and linked to ticket #84219.'],
    ['riley-ng', 'Thanks all, account team acknowledged and unblocked reporting.'],
  ]);

  addScript('sales-enterprise', 540, 5, [
    ['jules-bennett', 'Redwood Bank requested revised pricing with fraud add-on bundled.'],
    ['noah-walker', 'Updated quote in Salesforce, pending legal clause review.'],
    ['maya-chen', 'Product commitment: custom limits API by end of quarter.'],
    ['olivia-ford', 'MSA redlines returned; key issue is data residency wording.'],
    ['jules-bennett', 'Need quick architecture one-pager before Friday exec call.'],
    ['victor-hale', 'I will record a short walkthrough for their CTO.'],
    ['you', 'I can draft decision log from the deal desk notes.'],
    ['hannah-yu', 'CS can support onboarding in two waves if contract closes by 2/28.'],
  ]);

  addScript('fraud-watch', 526, 4, [
    ['farah-siddiqui', 'Spike alert: card testing attempts up 18% on prepaid BINs since 03:00 UTC.'],
    ['kevin-okafor', 'Model v13 detects most probes, but merchant cold-start cohorts are noisy.'],
    ['emma-ross', 'Set temporary review threshold tighter for high-velocity merchants only.'],
    ['alex-park', 'Can ship rule update behind flag in 20 minutes.'],
    ['jordan-lee', 'Pulling false-positive impact by segment now.'],
    ['you', 'Please include premium account impact before we lock thresholds.'],
    ['farah-siddiqui', 'Will post rollback criteria and owner list in thread.'],
    ['tessa-cho', 'Adding IP reputation feed to triage panel for overnight follow-up.'],
  ]);

  addScript('treasury-ops', 512, 4, [
    ['diego-alvarez', 'Daily cash position reconciled. EU corridor settlement delayed 27 minutes.'],
    ['rachel-brooks', 'Variance within tolerance, no impact to partner payouts.'],
    ['sofia-reed', 'Please annotate delay reason in board treasury note.'],
    ['mateo-cruz', 'Queue depth normalized after worker scale-up in eu-central-1.'],
    ['you', 'Can we add a short SLA trend chart for this week?'],
    ['diego-alvarez', 'Yes, posting trend + percentile table before 11:00.'],
    ['jordan-lee', 'Built chart draft in Looker: go/treasury-sla-weekly'],
    ['leo-martin', 'Thanks all. Keep today in watch mode until final settlement confirms.'],
  ]);

  addScript('customer-onboarding', 498, 4, [
    ['isabel-mora', 'Northstream Fintech kickoff complete. Security questionnaire due Monday.'],
    ['liam-cole', 'Shared reference architecture and webhook retry strategy with their CTO.'],
    ['hannah-yu', 'Customer requested a dedicated launch checklist by vertical.'],
    ['you', 'I can tailor a version for lending + cards by EOD.'],
    ['mina-das', 'Partnership intro with sponsor bank is confirmed for Thursday.'],
    ['isabel-mora', 'Need one owner for sandbox account provisioning handoff.'],
    ['alex-park', 'I can take provisioning and post status in thread.'],
    ['grace-lin', 'Support readiness doc updated with onboarding escalation path.'],
  ]);

  addScript('data-insights', 486, 4, [
    ['jordan-lee', 'Published weekly dashboard bundle: growth, disputes, and payout latency.'],
    ['kevin-okafor', 'Model precision improved from 91.4% to 93.0% after retraining.'],
    ['ben-owens', 'Can we add reason-code drift by merchant cohort?'],
    ['you', 'Also include confidence bands for the weekly leadership snapshot.'],
    ['jordan-lee', 'On it. Shipping V2 before noon PT.'],
    ['maya-chen', 'Please highlight the one metric most tied to churn risk.'],
    ['rachel-brooks', 'Finance wants margin-at-risk view aligned to same cohorts.'],
    ['kevin-okafor', 'I will wire margin feature export to analytics by tomorrow.'],
  ]);

  addScript('legal-regulatory', 474, 4, [
    ['olivia-ford', 'Reg E response template refreshed for card freeze and dispute timelines.'],
    ['owen-price', 'New regulator questionnaire asks for model governance evidence chain.'],
    ['emma-ross', 'Risk committee review scheduled Friday. Need draft narrative by Thursday.'],
    ['you', 'I can draft narrative with control owners and exception handling flow.'],
    ['marco-silva', 'SOC2 control mapping doc now includes policy IDs for each workflow.'],
    ['tessa-cho', 'Security evidence packet updated with quarterly access review artifacts.'],
    ['olivia-ford', 'Thanks - please keep customer-facing language plain and non-technical.'],
    ['owen-price', 'Will redline final response set once narrative draft lands.'],
  ]);

  addScript('incident-response', 462, 3, [
    ['ops-bot', ':rotating_light: Sev2 opened: delayed webhook delivery for subset of enterprise merchants.'],
    ['mateo-cruz', 'Incident bridge live. Suspected queue saturation after retry storm.'],
    ['alex-park', 'Applying backpressure patch and increasing worker concurrency.'],
    ['priya-iyer', 'Comms cadence every 15 min please. Customer-facing update by :20.'],
    ['grace-lin', 'Support macro posted and TAMs notified with current workaround.'],
    ['you', 'Please include confidence level on ETA in next stakeholder update.'],
    ['ops-bot', ':white_check_mark: Mitigation applied. Backlog draining, monitoring for 30 minutes.'],
    ['mateo-cruz', 'Will publish post-incident notes and action items in thread.'],
  ]);

  addScript('customer-voice', 450, 4, [
    ['hannah-yu', 'CAB notes: enterprise admins want proactive anomaly alerts in-app.'],
    ['chloe-wu', 'Design can mock alert digest surfaces in admin dashboard this sprint.'],
    ['nina-kapoor', 'Product supports this. Need scope estimate from platform + risk.'],
    ['you', 'I will draft proposal with phased rollout and measurable outcomes.'],
    ['jules-bennett', 'Prospect feedback aligns - alerts are top objection reducer in late-stage deals.'],
    ['mina-das', 'Partner bank also asked for better weekly risk transparency.'],
    ['emma-ross', 'Risk can define severity taxonomy to keep alerts actionable.'],
    ['daniel-kim', 'Marketing can convert this into launch narrative and customer proof points.'],
  ]);

  addScript('release-train', 438, 3, [
    ['priya-iyer', 'Release train 24.7 cut today at 15:00 PT. Freeze starts 14:00.'],
    ['zoe-keller', 'Regression suite 92% complete, no blockers yet.'],
    ['ethan-shaw', 'Frontend smoke tests green on staging across account settings flows.'],
    ['alex-park', 'Backend canary checks passing, waiting on fraud rule migration final step.'],
    ['farah-siddiqui', 'Fraud playbook updated for rollout monitoring windows.'],
    ['you', 'Please tag owners for any known risks in the release checklist.'],
    ['zoe-keller', 'Added risk register with severity + rollback owner per component.'],
    ['ops-bot', ':rocket: Release train 24.7 approved for staged deployment.'],
  ]);

  addScript('general', 376, 4, [
    ['avery-johnson', 'Quick reminder: customer-facing reliability language should stay concrete and measurable.'],
    ['maya-chen', 'Please keep weekly updates decision-oriented and concise.'],
    ['you', 'I will post the midday cross-functional digest at 12:30 PT.'],
    ['grace-lin', 'Support coverage expanded for east coast enterprise queue this week.'],
  ]);

  addScript('announcements', 370, 4, [
    ['ops-bot', ':white_check_mark: Incident response drill closed with all actions assigned.'],
    ['ops-bot', ':information_source: Product analytics ETL maintenance tonight at 21:00 PT.'],
    ['victor-hale', 'Engineering all-hands deck is live in go/eng-allhands-feb.'],
    ['ops-bot', ':warning: Elevated retry traffic observed on payment webhooks (monitoring only).'],
  ]);

  addScript('eng', 364, 4, [
    ['leo-martin', 'Please prioritize bug debt tied to enterprise rollout readiness.'],
    ['ethan-shaw', 'Taking ownership of account settings cleanup and test coverage.'],
    ['alex-park', 'I will post service dependency map updates by EOD.'],
    ['priya-iyer', 'Thanks - keep risks visible in #release-train.'],
  ]);

  addScript('eng-platform', 358, 4, [
    ['samir-patel', 'Replay tooling now supports selective retry by account segment.'],
    ['mateo-cruz', 'Canary health green after queue shard rebalance.'],
    ['tessa-cho', 'Security review passed for the new webhook validation path.'],
    ['you', 'Please add a short runbook note for overnight on-call.'],
  ]);

  addScript('eng-risk', 352, 4, [
    ['emma-ross', 'Risk review asks for clearer trigger conditions in model rollback policy.'],
    ['kevin-okafor', 'I can publish threshold drift summary daily while tune is active.'],
    ['ben-owens', 'Added owner fields to fraud policy checklist.'],
    ['you', 'Great - include customer communication trigger points too.'],
  ]);

  addScript('product-payments', 346, 4, [
    ['nina-kapoor', 'Card controls release notes now in final legal review.'],
    ['chloe-wu', 'UX copy pass complete for lock, unlock, and dispute helper states.'],
    ['hannah-yu', 'Top customer ask remains faster card re-enable confirmation.'],
    ['you', 'I will sync with eng on confidence message timing.'],
  ]);

  addScript('design-systems', 340, 4, [
    ['lana-kim', 'Typography token pass merged for compact financial tables.'],
    ['ethan-shaw', 'Component docs now include keyboard interactions per control.'],
    ['chloe-wu', 'I added final states for empty/error dashboard cards.'],
    ['you', 'Perfect - this helps onboarding quality a lot.'],
  ]);

  addScript('support-escalations', 334, 4, [
    ['riley-ng', 'Escalation closed: Northbank export issue resolved in production.'],
    ['morgan-bell', 'Customer confirmed all pending reports generated successfully.'],
    ['grace-lin', 'Logging this as playbook candidate for similar shard timeout cases.'],
    ['you', 'Please add summary to weekly incident digest.'],
  ]);

  addScript('sales-enterprise', 328, 4, [
    ['jules-bennett', 'Redwood call went well; next step is legal clause alignment.'],
    ['noah-walker', 'RevOps model updated with new term-length scenarios.'],
    ['mina-das', 'Partner side asks for onboarding confidence timeline.'],
    ['you', 'I will send one-pager with dependencies and owners.'],
  ]);

  addScript('fraud-watch', 322, 4, [
    ['farah-siddiqui', 'Overnight monitoring showed lower probe success after threshold tune.'],
    ['jordan-lee', 'False positives held within expected range across enterprise cohort.'],
    ['emma-ross', 'Keep mitigation in place until tomorrow morning checkpoint.'],
    ['you', 'Documenting decision log for audit trail now.'],
  ]);

  addScript('treasury-ops', 316, 4, [
    ['diego-alvarez', 'Settlement completion back within standard latency bands.'],
    ['rachel-brooks', 'Variance summary published in finance packet.'],
    ['mateo-cruz', 'Queue worker cap can now auto-adjust on corridor spikes.'],
    ['you', 'Great - keep this in next ops review agenda.'],
  ]);

  addScript('customer-onboarding', 310, 4, [
    ['isabel-mora', 'Onboarding checklist v2 shipped for lending and card programs.'],
    ['liam-cole', 'Shared implementation architecture snippets with new enterprise prospects.'],
    ['hannah-yu', 'First-time-value milestone definitions now approved by CS leadership.'],
    ['you', 'I will align KPI tracking with support onboarding handoff.'],
  ]);

  addScript('data-insights', 304, 4, [
    ['jordan-lee', 'Published drift monitor with segment filters and confidence intervals.'],
    ['kevin-okafor', 'Model retrain cadence proposal posted for peer review.'],
    ['ben-owens', 'Need one metric that maps directly to customer trust outcomes.'],
    ['you', 'Let us use dispute prevention rate and confidence bounds.'],
  ]);

  addScript('legal-regulatory', 298, 4, [
    ['olivia-ford', 'Regulator response draft now includes plain-language control explanations.'],
    ['owen-price', 'Need final sign-off on evidence references by tomorrow noon.'],
    ['marco-silva', 'Mapped remaining control evidence IDs in tracker.'],
    ['you', 'I will close the loop with risk and support owners today.'],
  ]);

  addScript('incident-response', 292, 4, [
    ['ops-bot', ':white_check_mark: Incident 2026-02-11 marked resolved after validation window.'],
    ['mateo-cruz', 'Root cause + mitigation draft posted for postmortem edits.'],
    ['zoe-keller', 'Regression test suite updated with retry storm scenario coverage.'],
    ['you', 'Please include customer comms timeline in final postmortem.'],
  ]);

  addScript('customer-voice', 286, 4, [
    ['hannah-yu', 'Two strategic accounts asked for proactive payout delay notifications.'],
    ['nina-kapoor', 'This aligns with roadmap candidate for trust center improvements.'],
    ['daniel-kim', 'Can convert into launch narrative + customer proof points.'],
    ['you', 'I will package requirements for next planning cycle.'],
  ]);

  addScript('release-train', 280, 4, [
    ['priya-iyer', 'Release train freeze complete, only approved fixes allowed.'],
    ['alex-park', 'Hotfix validation green on staging + canary.'],
    ['zoe-keller', 'Final regression pass at 98%, one non-blocking UI issue logged.'],
    ['ops-bot', ':rocket: Deployment stage 2 started for enterprise cohort.'],
  ]);

  addScript('general', 272, 4, [
    ['maya-chen', 'Thanks everyone for tight execution this week. Please keep updates outcome-focused.'],
    ['you', 'Posting consolidated action tracker after leadership check-in.'],
    ['victor-hale', 'Engineering reliability metrics look materially better week over week.'],
    ['hannah-yu', 'Customer sentiment improved after clearer incident communication cadence.'],
  ]);

  addScript('eng-platform', 268, 4, [
    ['alex-park', 'Replay backlog fully drained and automated guardrails remain stable.'],
    ['samir-patel', 'Will clean up temporary feature flags after release validation window closes.'],
    ['mateo-cruz', 'On-call handoff notes now include queue saturation early-warning indicators.'],
    ['you', 'Great. Please archive decisions in the platform runbook for auditability.'],
  ]);

  addScript('product-payments', 264, 4, [
    ['nina-kapoor', 'Launch checklist now includes risk communication and support script sign-off.'],
    ['chloe-wu', 'Final UI polish shipped for card controls history timeline and state badges.'],
    ['ben-owens', 'Fraud rule dependency documented in rollout appendix.'],
    ['you', 'Perfect - this is ready for Friday launch readiness review.'],
  ]);

  addScript('support-escalations', 260, 4, [
    ['grace-lin', 'Escalation queue under threshold with no enterprise blockers currently open.'],
    ['morgan-bell', 'Added reusable troubleshooting snippets for webhook retry issues.'],
    ['riley-ng', 'Will run support drills for new teammates tomorrow morning.'],
    ['you', 'Please capture drill outcomes in #customer-onboarding for visibility.'],
  ]);

  addScript('sales-enterprise', 256, 4, [
    ['jules-bennett', 'Two late-stage deals ask for stronger trust and reliability proof points.'],
    ['daniel-kim', 'Marketing can package this into a concise enterprise assurance sheet.'],
    ['noah-walker', 'RevOps can attach margin-safe concession ranges for account teams.'],
    ['you', 'I will align messaging with risk/compliance language before publish.'],
  ]);

  addScript('fraud-watch', 252, 4, [
    ['kevin-okafor', 'False-positive drift remains within guardrail after overnight retrain checks.'],
    ['farah-siddiqui', 'Ops confirms no customer-impacting spike from current threshold set.'],
    ['emma-ross', 'Keep current controls through tomorrow then reassess with full cohort data.'],
    ['you', 'I will prep recommendation memo with confidence levels and tradeoffs.'],
  ]);

  addScript('incident-response', 248, 4, [
    ['ops-bot', ':information_source: Post-incident action tracker refreshed with due dates and owners.'],
    ['priya-iyer', 'Please keep owners accountable and call out any slip risk 24h early.'],
    ['zoe-keller', 'Regression checklist now includes queue pressure simulation path.'],
    ['you', 'Thanks - this closes the immediate reliability feedback loop.'],
  ]);

  addScript('ops-compliance', 244, 4, [
    ['marco-silva', 'Control evidence backlog is now below 10 open items.'],
    ['olivia-ford', 'Legal review complete on regulator narrative framing.'],
    ['owen-price', 'Audit binder links validated; no broken references found.'],
    ['you', 'Great progress. Let us close remaining items by tomorrow noon.'],
  ]);

  addScript('finops', 240, 4, [
    ['sofia-reed', 'Run-rate forecast now within plan after capacity optimization updates.'],
    ['rachel-brooks', 'Controller review signed off with one observation on reporting granularity.'],
    ['leo-martin', 'Engineering can sustain cost controls without slowing roadmap milestones.'],
    ['you', 'I will include margin impact snapshot in next exec digest.'],
  ]);

  addScript('leadership-staff', 236, 4, [
    ['avery-johnson', 'Momentum is strong. Keep decisions documented and customer impact explicit.'],
    ['maya-chen', 'Roadmap confidence improved after this week reliability and risk updates.'],
    ['victor-hale', 'Engineering asks to preserve focus and avoid unplanned scope add-ons.'],
    ['you', 'Aligned - I will publish final priorities + owners for next week.'],
  ]);

  addScript('dm-agent', 232, 4, [
    ['you', 'Summarize key wins and unresolved risks from today across channels.'],
    ['workspace-agent', 'Queued: drafting concise digest with owners, deadlines, and confidence levels.'],
    ['you', 'Also include what leadership needs to decide tomorrow morning.'],
    ['workspace-agent', 'Will include a short decision brief and recommended path.'],
  ]);

  addScript('dm-farah', 228, 4, [
    ['you', 'Can you share tonight monitoring owner schedule before handoff?'],
    ['farah-siddiqui', 'Yes, posting full rotation with escalation triggers in 10 minutes.'],
    ['you', 'Perfect - include fallback owner for 02:00-04:00 UTC window.'],
    ['farah-siddiqui', 'Added. Team is covered end to end now.'],
  ]);

  addScript('dm-diego', 224, 4, [
    ['you', 'Any remaining risk on settlement variance before board deck freeze?'],
    ['diego-alvarez', 'Low risk. Last corridor check cleared and controls behaved as expected.'],
    ['you', 'Great, I will mark this green in exec pack.'],
    ['diego-alvarez', 'Thanks - appreciate the quick turnaround.'],
  ]);

  addScript('dm-kevin', 220, 4, [
    ['you', 'Please send one-line interpretation guidance for support teams on model confidence bands.'],
    ['kevin-okafor', 'Done: high confidence suggests stronger automated triage confidence, not certainty.'],
    ['you', 'Perfect - adding that exact line to enablement notes.'],
    ['kevin-okafor', 'Great, that should reduce overinterpretation in live escalations.'],
  ]);

  addScript('ops-compliance', 520, 4, [
    ['marco-silva', 'SOC2 evidence collection at 78%. Biggest gap is access reviews.'],
    ['olivia-ford', 'Need security sign-off on vendor risk packet by EOD tomorrow.'],
    ['tessa-cho', 'Pushing least-privilege updates for support tools this afternoon.'],
    ['mateo-cruz', 'Audit logs retention now 400 days in prod + backup.'],
    ['emma-ross', 'Risk committee asks for monthly control trend snapshots.'],
    ['grace-lin', 'Support runbook has outdated escalation contacts, fixing now.'],
    ['you', 'Can someone attach evidence links directly in the tracker row?'],
    ['marco-silva', 'Done, updated owner + evidence URL fields in compliance tracker.'],
  ]);

  addScript('finops', 500, 5, [
    ['sofia-reed', 'Cloud spend forecast is 6% over plan due to analytics workloads.'],
    ['leo-martin', 'We can move two Spark jobs to reserved capacity this sprint.'],
    ['jordan-lee', 'Prepared breakdown by service and customer tier: go/cloud-finops'],
    ['mateo-cruz', 'Auto-scaling guardrail merged for read replicas overnight.'],
    ['victor-hale', 'Please keep margin impact visible in leadership packet.'],
    ['nina-kapoor', 'Payments team can delay one non-critical experiment to save compute.'],
    ['you', 'Attaching budget delta sheet: q2-infra-delta.xlsx'],
    ['sofia-reed', 'Great. Updated board packet with revised run-rate assumptions.'],
  ]);

  addScript('leadership-staff', 480, 6, [
    ['avery-johnson', 'Top priority this month: reliability for enterprise reporting.'],
    ['maya-chen', 'Roadmap tradeoff proposal posted. Looking for feedback by noon.'],
    ['victor-hale', 'On-call burden is trending down after incident automation work.'],
    ['emma-ross', 'Need a stronger narrative on risk controls for board prep.'],
    ['sofia-reed', 'Revenue pacing remains healthy. Two large renewals this quarter.'],
    ['leo-martin', 'Requesting approval for one additional SRE headcount.'],
    ['hannah-yu', 'Churn risk list updated with mitigation owners and dates.'],
    ['you', 'Drafting monthly exec memo and action tracker now.'],
  ]);

  addScript('dm-agent', 460, 6, [
    ['workspace-agent', 'Morning. I can draft status updates, summaries, and follow-up lists.'],
    ['you', 'Please summarize open blockers from #eng-platform and #support-escalations.'],
    ['workspace-agent', 'On it. I will post concise blockers and owners in thread.'],
    ['you', 'Also prep a one-paragraph update for leadership sync at 2pm.'],
    ['workspace-agent', 'Queued. I will include risk level and ETA confidence.'],
  ]);

  addScript('dm-alex', 450, 5, [
    ['alex-park', 'Can you review this migration checklist before I post in channel?'],
    ['you', 'Yes. Share the latest version and I will tighten wording.'],
    ['alex-park', 'File attached: payout-migration-checklist-v3.docx'],
    ['you', 'Looks solid. Add rollback owner on step 6 and we are good.'],
    ['alex-park', 'Done, posting now in #eng-platform.'],
  ]);

  addScript('dm-priya', 440, 5, [
    ['priya-iyer', 'Need your input on launch comms for card controls.'],
    ['you', 'Happy to help. What tone do we want for enterprise accounts?'],
    ['priya-iyer', 'Practical and risk-aware. No hype language, clear rollout window.'],
    ['you', 'Perfect, I will draft copy with staged availability notes.'],
    ['priya-iyer', 'Thanks, send by 11:30 so legal can review.'],
  ]);

  addScript('dm-jordan', 430, 5, [
    ['jordan-lee', 'Data question: do we include weekends in dispute SLA chart?'],
    ['you', 'For exec view no, for ops view yes. Keep both in appendix.'],
    ['jordan-lee', 'Copy that. I will update dashboard labels for clarity.'],
    ['you', 'Can you include merchant segment split too?'],
    ['jordan-lee', 'Yep, adding SMB vs enterprise now.'],
  ]);

  addScript('dm-jules', 420, 5, [
    ['jules-bennett', 'Need talk track for Redwood objection on compliance timelines.'],
    ['you', 'We can position SOC2 evidence automation and monthly control snapshots.'],
    ['jules-bennett', 'Great. Can you draft bullets before my 3pm call?'],
    ['you', 'Sending in 15 with proof points and customer references.'],
    ['jules-bennett', 'Amazing, thank you.'],
  ]);

  addScript('dm-emma', 410, 5, [
    ['emma-ross', 'Can we tighten language around fraud model drift in board memo?'],
    ['you', 'Yes, I will reframe as monitored variance with active mitigations.'],
    ['emma-ross', 'Perfect, avoid suggesting loss exposure changed materially.'],
    ['you', 'Agreed. I will include confidence interval and mitigation timeline.'],
    ['emma-ross', 'Thanks, that works.'],
  ]);

  addScript('dm-farah', 404, 4, [
    ['farah-siddiqui', 'Can we align messaging for the fraud threshold tune before standup?'],
    ['you', 'Yes. Let us frame it as temporary protection with monitored customer impact.'],
    ['farah-siddiqui', 'Perfect. I will post rationale and rollback criteria in #fraud-watch.'],
    ['you', 'Great - include owner on overnight monitoring as well.'],
    ['farah-siddiqui', 'Will do.'],
  ]);

  addScript('dm-diego', 398, 4, [
    ['diego-alvarez', 'Need your eyes on treasury KPI wording for board update.'],
    ['you', 'Share the draft and I will tighten it for non-technical readers.'],
    ['diego-alvarez', 'Sent. Focus is settlement reliability and variance controls.'],
    ['you', 'Looks good. I suggested one line on mitigation confidence bands.'],
    ['diego-alvarez', 'Excellent, integrating now.'],
  ]);

  addScript('dm-isabel', 392, 4, [
    ['isabel-mora', 'Northstream asked for implementation timeline by milestone and dependency.'],
    ['you', 'I can help structure this as week-by-week with owner mapping.'],
    ['isabel-mora', 'Thank you. Need version 1 by this afternoon for sponsor review.'],
    ['you', 'I will send a draft in 30 minutes.'],
    ['isabel-mora', 'Amazing.'],
  ]);

  addScript('dm-kevin', 386, 4, [
    ['kevin-okafor', 'Quick check: should model confidence be surfaced in support dashboard?'],
    ['you', 'Yes, but bucketed bands only. Avoid overfitting interpretation at case level.'],
    ['kevin-okafor', 'Makes sense. I will expose high/med/low with short explainer text.'],
    ['you', 'Perfect, that is customer-safe and actionable.'],
    ['kevin-okafor', 'Shipping in next analytics deploy.'],
  ]);

  addScript('dm-maya', 400, 5, [
    ['maya-chen', 'Need a concise readout from this week customer advisory board.'],
    ['you', 'I have notes. Main theme is transparent controls and faster reconciliation.'],
    ['maya-chen', 'Please send 5 bullets and 3 actions by lunch.'],
    ['you', 'Will do. Adding owner suggestions as well.'],
    ['maya-chen', 'Great, appreciate it.'],
  ]);

  addScript('dm-hannah', 390, 5, [
    ['hannah-yu', 'Can we align on renewal risk messaging for Northbank?'],
    ['you', 'Yes. Suggest confidence plus specific remediation milestones.'],
    ['hannah-yu', 'Love that. Need one sentence for exec sponsor email too.'],
    ['you', 'Drafting now and will include next checkpoint date.'],
    ['hannah-yu', 'Perfect.'],
  ]);

  const threadRoots: Array<{ id: string; channelId: string; userId: string; text: string; minutesAgo: number; replies: Array<[string, string]> }> = [
    {
      id: 'thread-general-risk-deck',
      channelId: 'general',
      userId: 'maya-chen',
      text: 'Who can own final review of the risk update deck before all-hands?',
      minutesAgo: 300,
      replies: [
        ['emma-ross', 'I can take first pass before 1pm PT.'],
        ['victor-hale', 'I will add engineering reliability metrics slides.'],
        ['you', 'I will consolidate comments and publish final PDF.'],
      ],
    },
    {
      id: 'thread-engp-circuit-breaker',
      channelId: 'eng-platform',
      userId: 'samir-patel',
      text: 'Should we keep the new circuit-breaker defaults at 4 retries for payouts?',
      minutesAgo: 296,
      replies: [
        ['alex-park', 'I recommend 3 retries, 4 adds tail latency under load.'],
        ['priya-iyer', 'Agree with 3. Let us monitor error budget for 48h.'],
        ['mateo-cruz', 'I can wire alert thresholds for both values.'],
      ],
    },
    {
      id: 'thread-prodp-card-controls',
      channelId: 'product-payments',
      userId: 'nina-kapoor',
      text: 'Decision needed: should temporary card lock expire automatically at 24h?',
      minutesAgo: 292,
      replies: [
        ['hannah-yu', 'Customers asked for manual unlock control, no auto-expiry by default.'],
        ['chloe-wu', 'UX supports both, but default manual is clearer.'],
        ['you', 'Lets default manual unlock and add optional timed lock in phase two.'],
      ],
    },
    {
      id: 'thread-design-kyp',
      channelId: 'design-systems',
      userId: 'lana-kim',
      text: 'Can we approve the KYC failure component copy set today?',
      minutesAgo: 288,
      replies: [
        ['olivia-ford', 'Legal prefers "verification needed" over "failure".'],
        ['ethan-shaw', 'No code impact either way, copy update only.'],
        ['you', 'Approve legal wording. Shipping with next UI patch.'],
      ],
    },
    {
      id: 'thread-support-chargeback-macro',
      channelId: 'support-escalations',
      userId: 'riley-ng',
      text: 'Need sign-off on new chargeback response macro for premium accounts.',
      minutesAgo: 284,
      replies: [
        ['grace-lin', 'Looks good, added one note on provisional credit expectations.'],
        ['emma-ross', 'Please include reporting timeline for dispute evidence uploads.'],
        ['you', 'Approved with those edits. Ready for Zendesk publish.'],
      ],
    },
    {
      id: 'thread-sales-redwood-pricing',
      channelId: 'sales-enterprise',
      userId: 'jules-bennett',
      text: 'Do we hold firm on implementation fee for Redwood or trade for term length?',
      minutesAgo: 280,
      replies: [
        ['sofia-reed', 'Trade only if term extends to 36 months.'],
        ['maya-chen', 'I support that. Keep add-on margin protected.'],
        ['you', 'I will update the negotiation guardrails doc now.'],
      ],
    },
    {
      id: 'thread-ops-soc2-evidence',
      channelId: 'ops-compliance',
      userId: 'marco-silva',
      text: 'Need owner assignment for remaining SOC2 evidence controls C-17 and C-21.',
      minutesAgo: 276,
      replies: [
        ['tessa-cho', 'I can take C-17 access recertification artifacts.'],
        ['grace-lin', 'Support can own C-21 incident review logs.'],
        ['you', 'Perfect, I will update tracker + due dates.'],
      ],
    },
    {
      id: 'thread-finops-cloud-budgets',
      channelId: 'finops',
      userId: 'sofia-reed',
      text: 'Can we commit to a 4% cloud spend reduction by end of quarter?',
      minutesAgo: 272,
      replies: [
        ['leo-martin', 'Yes with reserved capacity + deprecating old ETL jobs.'],
        ['mateo-cruz', 'SRE can handle cleanup this sprint and next.'],
        ['you', 'I will track savings weekly in the exec dashboard.'],
      ],
    },
    {
      id: 'thread-fraud-watch-threshold',
      channelId: 'fraud-watch',
      userId: 'farah-siddiqui',
      text: 'Approve temporary threshold shift for card-testing surge through tomorrow?',
      minutesAgo: 264,
      replies: [
        ['emma-ross', 'Approve with hourly monitoring and explicit rollback conditions.'],
        ['kevin-okafor', 'I can monitor precision/recall deltas and post every hour.'],
        ['you', 'Approved with customer impact checks in parallel.'],
      ],
    },
    {
      id: 'thread-treasury-ops-sla',
      channelId: 'treasury-ops',
      userId: 'diego-alvarez',
      text: 'Do we commit to a 99.8% same-day settlement SLA for enterprise by Q3?',
      minutesAgo: 260,
      replies: [
        ['rachel-brooks', 'Finance supports if we track exception cost separately.'],
        ['mateo-cruz', 'Infra can support with one more queue shard and alert tuning.'],
        ['you', 'Lets commit with phased rollout and explicit guardrails.'],
      ],
    },
    {
      id: 'thread-customer-onboarding-template',
      channelId: 'customer-onboarding',
      userId: 'isabel-mora',
      text: 'Should we standardize onboarding templates by vertical this quarter?',
      minutesAgo: 256,
      replies: [
        ['liam-cole', 'Yes, starting with lending + card issuing covers 70% of pipeline.'],
        ['hannah-yu', 'CS strongly supports, this will reduce handoff confusion.'],
        ['you', 'Approved. I will draft template matrix with owners and due dates.'],
      ],
    },
    {
      id: 'thread-incident-postmortem',
      channelId: 'incident-response',
      userId: 'mateo-cruz',
      text: 'For the webhook delay incident, do we require postmortem publication in 24h?',
      minutesAgo: 252,
      replies: [
        ['priya-iyer', 'Yes, with owner list and completion dates for all action items.'],
        ['zoe-keller', 'QA can add regression coverage for retry-storm scenarios.'],
        ['you', 'Confirmed. Publish draft by tomorrow 10:00 with clear remediation plan.'],
      ],
    },
    {
      id: 'thread-data-insights-kpi',
      channelId: 'data-insights',
      userId: 'jordan-lee',
      text: 'Which KPI should ground weekly trust reporting: prevention rate or decline precision?',
      minutesAgo: 248,
      replies: [
        ['emma-ross', 'Use prevention rate as headline, precision as supporting diagnostic metric.'],
        ['kevin-okafor', 'Agree. We should include confidence interval and cohort splits.'],
        ['you', 'Lets standardize that format for leadership updates.'],
      ],
    },
    {
      id: 'thread-customer-voice-alerts',
      channelId: 'customer-voice',
      userId: 'hannah-yu',
      text: 'Do we prioritize proactive risk alerts ahead of dashboard customization?',
      minutesAgo: 244,
      replies: [
        ['nina-kapoor', 'Yes, alerts have clearer ROI for enterprise retention this quarter.'],
        ['chloe-wu', 'UX can ship alerts first without blocking future customization patterns.'],
        ['you', 'Aligned. I will create phased plan with measurable outcomes.'],
      ],
    },
    {
      id: 'thread-release-train-risk-signoff',
      channelId: 'release-train',
      userId: 'priya-iyer',
      text: 'Any objections to shipping fraud threshold tune in release train 24.7?',
      minutesAgo: 240,
      replies: [
        ['farah-siddiqui', 'No objection with rollback trigger at 1.2x baseline false positives.'],
        ['tessa-cho', 'Security review is complete and no new blockers were found.'],
        ['you', 'Approved with monitoring owner rotation explicitly listed.'],
      ],
    },
    {
      id: 'thread-legal-regulatory-mapping',
      channelId: 'legal-regulatory',
      userId: 'olivia-ford',
      text: 'Should we map each regulator question directly to one control owner in tracker?',
      minutesAgo: 236,
      replies: [
        ['owen-price', 'Yes, single owner per question prevents diffused accountability.'],
        ['marco-silva', 'I can complete mapping today and attach evidence IDs inline.'],
        ['you', 'Great - this will simplify final audit package review.'],
      ],
    },
    {
      id: 'thread-support-escalations-playbook',
      channelId: 'support-escalations',
      userId: 'grace-lin',
      text: 'Can we formalize Northbank incident workaround into v2 support playbook?',
      minutesAgo: 232,
      replies: [
        ['morgan-bell', 'Yes, draft is ready with exact customer-safe language.'],
        ['riley-ng', 'Include escalation matrix and ETA confidence template.'],
        ['you', 'Approved. Publish v2 and share in next support sync.'],
      ],
    },
    {
      id: 'thread-fraud-watch-monitoring',
      channelId: 'fraud-watch',
      userId: 'farah-siddiqui',
      text: 'Should we keep hourly monitoring updates in-channel until threshold rollback decision?',
      minutesAgo: 228,
      replies: [
        ['emma-ross', 'Yes, hourly in-channel updates keep audit trail and decision context clear.'],
        ['kevin-okafor', 'I can post precision/recall deltas plus merchant impact summary each hour.'],
        ['you', 'Approved. Keep format consistent and include owner + next checkpoint time.'],
      ],
    },
    {
      id: 'thread-treasury-ops-dashboard',
      channelId: 'treasury-ops',
      userId: 'diego-alvarez',
      text: 'Do we add settlement variance and confidence band tiles to treasury dashboard v2?',
      minutesAgo: 224,
      replies: [
        ['rachel-brooks', 'Yes, this helps finance compare expected vs realized volatility.'],
        ['jordan-lee', 'I can publish updated tiles today and include 7-day trend context.'],
        ['you', 'Looks good. Ship v2 and include interpretation notes for leadership readers.'],
      ],
    },
    {
      id: 'thread-customer-onboarding-readiness',
      channelId: 'customer-onboarding',
      userId: 'isabel-mora',
      text: 'Should we require support simulation sign-off before enterprise go-live handoff?',
      minutesAgo: 220,
      replies: [
        ['grace-lin', 'Yes, simulation catches escalation gaps before customer launch week.'],
        ['liam-cole', 'Implementation is aligned; we can add this as a formal gate.'],
        ['you', 'Approved. Add gate to checklist template with owner + due date fields.'],
      ],
    },
    {
      id: 'thread-general-weekly-digest',
      channelId: 'general',
      userId: 'you',
      text: 'For weekly digest, do we keep one section each for reliability, risk, and customer outcomes?',
      minutesAgo: 216,
      replies: [
        ['maya-chen', 'Yes, that format maps cleanly to leadership decision flow.'],
        ['victor-hale', 'Please include one sentence on engineering confidence and known risks.'],
        ['hannah-yu', 'Add customer sentiment signal too so impact stays visible.'],
      ],
    },
    {
      id: 'thread-leadership-q2-hiring',
      channelId: 'leadership-staff',
      userId: 'avery-johnson',
      text: 'Final call: approve one extra SRE and one support QA hire for Q2?',
      minutesAgo: 268,
      replies: [
        ['victor-hale', 'Strong yes for SRE, reliability work is compounding.'],
        ['grace-lin', 'Support QA hire will reduce escalation loops.'],
        ['you', 'Documenting approval and opening requisitions today.'],
      ],
    },
  ];

  threadRoots.forEach((thread) => {
    push({
      id: thread.id,
      channelId: thread.channelId,
      userId: thread.userId,
      text: thread.text,
      minutesAgo: thread.minutesAgo,
    });
    thread.replies.forEach(([userId, text], idx) => {
      push({
        channelId: thread.channelId,
        userId,
        text,
        parentId: thread.id,
        minutesAgo: thread.minutesAgo - (idx + 1) * 2,
      });
    });
  });

  const runMessages: SeedDraft[] = [
    {
      id: 'msg-run-risk-brief',
      channelId: 'ops-compliance',
      userId: 'workspace-agent',
      text: 'Run started: Prepare SOC2 evidence readiness brief',
      minutesAgo: 120,
      isBot: true,
      kind: 'run_card',
      runId: 'run-risk-brief',
    },
    {
      channelId: 'ops-compliance',
      userId: 'workspace-agent',
      text: 'Step 1/4 complete: scanned evidence tracker and identified missing controls.',
      minutesAgo: 118,
      isBot: true,
      parentId: 'msg-run-risk-brief',
      runId: 'run-risk-brief',
    },
    {
      channelId: 'ops-compliance',
      userId: 'workspace-agent',
      text: 'Proposed action: notify control owners and post deadlines in #leadership-staff.',
      minutesAgo: 116,
      isBot: true,
      parentId: 'msg-run-risk-brief',
      runId: 'run-risk-brief',
    },
    {
      id: 'msg-run-support-handover',
      channelId: 'support-escalations',
      userId: 'workspace-agent',
      text: 'Run started: Build enterprise escalation handover',
      minutesAgo: 114,
      isBot: true,
      kind: 'run_card',
      runId: 'run-support-handover',
    },
    {
      channelId: 'support-escalations',
      userId: 'workspace-agent',
      text: 'Step 1/3 complete: grouped open escalations by severity and account ARR.',
      minutesAgo: 112,
      isBot: true,
      parentId: 'msg-run-support-handover',
      runId: 'run-support-handover',
    },
    {
      channelId: 'support-escalations',
      userId: 'workspace-agent',
      text: 'Step 2/3 in progress: drafting customer-ready update snippets per case.',
      minutesAgo: 110,
      isBot: true,
      parentId: 'msg-run-support-handover',
      runId: 'run-support-handover',
    },
    {
      id: 'msg-run-leadership-kpi',
      channelId: 'leadership-staff',
      userId: 'workspace-agent',
      text: 'Run started: Compile weekly KPI board packet',
      minutesAgo: 108,
      isBot: true,
      kind: 'run_card',
      runId: 'run-leadership-kpi',
    },
    {
      channelId: 'leadership-staff',
      userId: 'workspace-agent',
      text: 'Step 1/4 complete: gathered metrics from finance, support, and risk dashboards.',
      minutesAgo: 106,
      isBot: true,
      parentId: 'msg-run-leadership-kpi',
      runId: 'run-leadership-kpi',
    },
    {
      channelId: 'leadership-staff',
      userId: 'workspace-agent',
      text: 'Paused awaiting updated churn assumptions from finance.',
      minutesAgo: 104,
      isBot: true,
      parentId: 'msg-run-leadership-kpi',
      runId: 'run-leadership-kpi',
    },
    {
      id: 'msg-run-sales-recap',
      channelId: 'sales-enterprise',
      userId: 'workspace-agent',
      text: 'Run completed: Enterprise renewal risk recap',
      minutesAgo: 102,
      isBot: true,
      kind: 'run_card',
      runId: 'run-sales-recap',
    },
    {
      channelId: 'sales-enterprise',
      userId: 'workspace-agent',
      text: 'Step 1/3 complete: reviewed open renewal opportunities and sponsor notes.',
      minutesAgo: 100,
      isBot: true,
      parentId: 'msg-run-sales-recap',
      runId: 'run-sales-recap',
    },
    {
      channelId: 'sales-enterprise',
      userId: 'workspace-agent',
      text: 'Step 3/3 complete: posted recap with owners, risks, and next meetings.',
      minutesAgo: 98,
      isBot: true,
      parentId: 'msg-run-sales-recap',
      runId: 'run-sales-recap',
    },
    {
      channelId: 'sales-enterprise',
      userId: 'workspace-agent',
      text: '**Enterprise renewal risk recap**\n\n- Top risk accounts flagged with owner + date\n- Concession guardrails proposed for legal and finance review',
      minutesAgo: 97,
      isBot: true,
      kind: 'deliverable',
      runId: 'run-sales-recap',
      title: 'Deliverable',
      body: '**Enterprise renewal risk recap**\n\n- Top risk accounts flagged with owner + date\n- Concession guardrails proposed for legal and finance review',
    },
    {
      id: 'msg-run-dm-renewal',
      channelId: 'dm-jules',
      userId: 'workspace-agent',
      text: 'Run completed: Draft Redwood negotiation prep',
      minutesAgo: 96,
      isBot: true,
      kind: 'run_card',
      runId: 'run-dm-renewal',
    },
    {
      channelId: 'dm-jules',
      userId: 'workspace-agent',
      text: 'Step 2/3 complete: mapped concessions against margin and term scenarios.',
      minutesAgo: 94,
      isBot: true,
      parentId: 'msg-run-dm-renewal',
      runId: 'run-dm-renewal',
    },
    {
      channelId: 'dm-jules',
      userId: 'workspace-agent',
      text: '**Draft Redwood negotiation prep**\n\n- Talk track prepared for pricing objections\n- Three concession scenarios documented with margin impact',
      minutesAgo: 93,
      isBot: true,
      kind: 'deliverable',
      runId: 'run-dm-renewal',
      title: 'Deliverable',
      body: '**Draft Redwood negotiation prep**\n\n- Talk track prepared for pricing objections\n- Three concession scenarios documented with margin impact',
    },
  ];

  runMessages.forEach(push);

  const autopilotHistoryMessages: SeedDraft[] = [
    {
      id: 'msg-run-autopilot-meeting-prep-prev',
      channelId: 'dm-agent',
      userId: 'workspace-agent',
      text: 'Run completed: Daily meeting prep',
      minutesAgo: 82,
      isBot: true,
      kind: 'run_card',
      runId: 'run-autopilot-meeting-prep-prev',
      autopilotId: 'autopilot-daily-meeting-prep',
    },
    {
      channelId: 'dm-agent',
      userId: 'workspace-agent',
      text: '**Daily meeting prep**\n\n- 3 blockers in #eng-platform\n- 2 approvals pending in #product-payments\n- Suggested agenda posted for your 10:00 AM sync',
      minutesAgo: 81,
      isBot: true,
      kind: 'deliverable',
      threadRootId: 'msg-run-autopilot-meeting-prep-prev',
      runId: 'run-autopilot-meeting-prep-prev',
      title: 'Deliverable',
      body: '**Daily meeting prep**\n\n- 3 blockers in #eng-platform\n- 2 approvals pending in #product-payments\n- Suggested agenda posted for your 10:00 AM sync',
      autopilotId: 'autopilot-daily-meeting-prep',
    },
  ];
  autopilotHistoryMessages.forEach(push);
  const sorted = rows.sort((a, b) => a.ts - b.ts);
  const lastUserByChannel = new Map<string, string>();
  return sorted.map((message, idx) => {
    const lastUser = lastUserByChannel.get(message.channelId);
    // Keep bot identity stable and preserve thread reply intent.
    if (message.isBot || message.parentId) {
      lastUserByChannel.set(message.channelId, message.userId);
      return message;
    }
    const nextUserId = chooseInterspersedUser(
      lastUser,
      message.userId,
      `${message.channelId}-${message.id}-${idx}`
    );
    const updated = nextUserId === message.userId ? message : { ...message, userId: nextUserId };
    lastUserByChannel.set(updated.channelId, updated.userId);
    return updated;
  });
}

const seedMessages: Message[] = buildSeedMessages();
assertSeedMessageIntegrity(seedUsers, seedChannels, seedMessages);

const seedRuns: Record<string, Run> = {
  'run-risk-brief': {
    id: 'run-risk-brief',
    title: 'Prepare SOC2 evidence readiness brief',
    createdAt: now - 120 * 60_000,
    createdBy: 'you',
    container: { type: 'channel', id: 'ops-compliance' },
    rootMessageId: 'msg-run-risk-brief',
    threadId: 'msg-run-risk-brief',
    status: 'needs_approval',
    stepCurrent: 2,
    stepTotal: 4,
    progressPct: 50,
    latestUpdate: 'Waiting approval to notify owners and post firm due dates.',
    artifacts: [
      { id: 'risk-a1', type: 'doc', title: 'SOC2 readiness summary' },
      { id: 'risk-a2', type: 'canvas', title: 'Control owner matrix' },
    ],
    approval: {
      required: true,
      reason: 'This run will assign owners and post accountability updates cross-team.',
      pending: true,
    },
    scope: {
      channel: true,
      thread: false,
      messages: ['thread-ops-soc2-evidence'],
      files: ['soc2-evidence-tracker.xlsx'],
      people: ['Marco Silva', 'Tessa Cho', 'Grace Lin'],
    },
    tools: { drive: true, calendar: false, codebase: false },
    outputFormat: 'checklist',
    requireApproval: true,
  },
  'run-support-handover': {
    id: 'run-support-handover',
    title: 'Build enterprise escalation handover',
    createdAt: now - 114 * 60_000,
    createdBy: 'you',
    container: { type: 'channel', id: 'support-escalations' },
    rootMessageId: 'msg-run-support-handover',
    threadId: 'msg-run-support-handover',
    status: 'running',
    stepCurrent: 2,
    stepTotal: 3,
    progressPct: 66,
    latestUpdate: 'Drafting customer-safe updates with owners and ETAs.',
    artifacts: [
      { id: 'support-a1', type: 'doc', title: 'Escalation handover draft' },
      { id: 'support-a2', type: 'link', title: 'Zendesk queue snapshot' },
    ],
    scope: {
      channel: true,
      thread: true,
      messages: ['thread-support-chargeback-macro'],
      files: ['northbank-export-0211.zip'],
      people: ['Riley Ng', 'Grace Lin', 'Hannah Yu'],
    },
    tools: { drive: true, calendar: false, codebase: false },
    outputFormat: 'brief',
    requireApproval: false,
  },
  'run-leadership-kpi': {
    id: 'run-leadership-kpi',
    title: 'Compile weekly KPI board packet',
    createdAt: now - 108 * 60_000,
    createdBy: 'you',
    container: { type: 'channel', id: 'leadership-staff' },
    rootMessageId: 'msg-run-leadership-kpi',
    threadId: 'msg-run-leadership-kpi',
    status: 'paused',
    stepCurrent: 2,
    stepTotal: 4,
    progressPct: 50,
    latestUpdate: 'Paused pending final finance churn assumptions.',
    artifacts: [
      { id: 'lead-a1', type: 'doc', title: 'Weekly KPI packet draft' },
      { id: 'lead-a2', type: 'canvas', title: 'Exec action tracker' },
    ],
    scope: {
      channel: true,
      thread: false,
      messages: ['thread-leadership-q2-hiring'],
      files: ['q2-infra-delta.xlsx'],
      people: ['Avery Johnson', 'Sofia Reed', 'Victor Hale'],
    },
    tools: { drive: true, calendar: true, codebase: false },
    outputFormat: 'doc',
    requireApproval: false,
  },
  'run-sales-recap': {
    id: 'run-sales-recap',
    title: 'Enterprise renewal risk recap',
    createdAt: now - 102 * 60_000,
    createdBy: 'you',
    container: { type: 'channel', id: 'sales-enterprise' },
    rootMessageId: 'msg-run-sales-recap',
    threadId: 'msg-run-sales-recap',
    status: 'completed',
    stepCurrent: 3,
    stepTotal: 3,
    progressPct: 100,
    latestUpdate: 'Done. Posted renewal risks, concessions, and owner follow-ups.',
    artifacts: [
      { id: 'sales-a1', type: 'doc', title: 'Renewal risk brief' },
      { id: 'sales-a2', type: 'pr', title: 'Deal guardrails update' },
    ],
    scope: {
      channel: true,
      thread: false,
      messages: ['thread-sales-redwood-pricing'],
      files: ['renewal-forecast-q2.csv'],
      people: ['Jules Bennett', 'Noah Walker', 'Maya Chen'],
    },
    tools: { drive: true, calendar: true, codebase: false },
    outputFormat: 'checklist',
    requireApproval: false,
  },
  'run-dm-renewal': {
    id: 'run-dm-renewal',
    title: 'Draft Redwood negotiation prep',
    createdAt: now - 96 * 60_000,
    createdBy: 'you',
    container: { type: 'dm', id: 'dm-jules' },
    rootMessageId: 'msg-run-dm-renewal',
    threadId: 'msg-run-dm-renewal',
    status: 'completed',
    stepCurrent: 3,
    stepTotal: 3,
    progressPct: 100,
    latestUpdate: 'Done. Shared talk track and concession ranges for 3 scenarios.',
    artifacts: [
      { id: 'dm-a1', type: 'doc', title: 'Redwood call prep' },
      { id: 'dm-a2', type: 'link', title: 'Deal desk notes' },
    ],
    scope: {
      channel: false,
      thread: true,
      messages: ['thread-sales-redwood-pricing'],
      files: ['redwood-objections.md'],
      people: ['Jules Bennett', 'Sofia Reed'],
    },
    tools: { drive: true, calendar: false, codebase: false },
    outputFormat: 'brief',
    requireApproval: false,
  },
  'run-autopilot-meeting-prep-prev': {
    id: 'run-autopilot-meeting-prep-prev',
    title: 'Daily meeting prep',
    createdAt: now - 82 * 60_000,
    createdBy: 'workspace-agent',
    container: { type: 'dm', id: 'dm-agent' },
    rootMessageId: 'msg-run-autopilot-meeting-prep-prev',
    threadId: 'msg-run-autopilot-meeting-prep-prev',
    status: 'completed',
    stepCurrent: 3,
    stepTotal: 3,
    progressPct: 100,
    latestUpdate: 'Done. Posted a concise meeting prep deliverable in thread.',
    artifacts: [{ id: 'auto-prev-a1', type: 'doc', title: 'Daily meeting prep - Feb 11' }],
    autopilotId: 'autopilot-daily-meeting-prep',
    scope: {
      channel: true,
      thread: true,
      messages: ['thread-engp-circuit-breaker', 'thread-prodp-card-controls'],
      files: ['daily-standup-notes.md'],
      people: ['Priya Iyer', 'Nina Kapoor'],
    },
    tools: { drive: false, calendar: true, codebase: false },
    outputFormat: 'brief',
    requireApproval: false,
  },
};

const seedAutopilots: Record<string, Autopilot> = {
  'autopilot-daily-meeting-prep': {
    id: 'autopilot-daily-meeting-prep',
    name: 'Daily meeting prep',
    cadenceText: 'Weekdays at 8:00 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: now - 82 * 60_000,
  },
  'autopilot-daily-focus-brief': {
    id: 'autopilot-daily-focus-brief',
    name: 'Daily focus brief',
    cadenceText: 'Daily at 9:30 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: now - 26 * 60_000,
  },
  'autopilot-industry-trends': {
    id: 'autopilot-industry-trends',
    name: 'Industry trends',
    cadenceText: 'Weekdays at 11:00 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'canvasPrimary',
    canvasId: 'canvas-industry-trends',
    isPaused: false,
    lastRunAt: now - 40 * 60_000,
  },
  'autopilot-team-metrics-dashboard': {
    id: 'autopilot-team-metrics-dashboard',
    name: 'Team metrics dashboard',
    cadenceText: 'Daily at 4:00 PM PT',
    destinationType: 'channel',
    destinationId: 'eng',
    outputMode: 'canvasPrimary',
    canvasId: 'canvas-team-metrics-dashboard',
    isPaused: false,
    lastRunAt: now - 55 * 60_000,
  },
  'autopilot-decision-driver': {
    id: 'autopilot-decision-driver',
    name: 'Decision Driver',
    cadenceText: 'Weekdays at 10:15 AM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: now - 61 * 60_000,
  },
  'autopilot-loop-closer': {
    id: 'autopilot-loop-closer',
    name: 'Loop Closer',
    cadenceText: 'Weekdays at 1:00 PM PT',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: now - 14 * 60_000,
  },
  'autopilot-early-warning': {
    id: 'autopilot-early-warning',
    name: 'Early Warning',
    cadenceText: 'Every 2 hours',
    destinationType: 'dm',
    destinationId: 'dm-agent',
    outputMode: 'threadRuns',
    isPaused: false,
    lastRunAt: now - 60_000,
  },
};

const requiredDemoAutopilots: Record<string, Autopilot> = {
  'autopilot-decision-driver': seedAutopilots['autopilot-decision-driver'],
  'autopilot-loop-closer': seedAutopilots['autopilot-loop-closer'],
  'autopilot-early-warning': seedAutopilots['autopilot-early-warning'],
};

function ensureRequiredDemoAutopilots(autopilots: Record<string, Autopilot>) {
  return { ...requiredDemoAutopilots, ...autopilots };
}

const seedCanvases: Record<string, Canvas> = {
  'canvas-industry-trends': {
    id: 'canvas-industry-trends',
    title: 'Industry trends',
    body: '## Industry trends\n\n- AI assistants are being embedded deeper into daily workflow tools.\n- Teams are prioritizing transparent approvals and low-noise proactive updates.\n- Adoption grows fastest when agent output is threaded into existing team rituals.',
    lastUpdatedAt: now - 40 * 60_000,
  },
  'canvas-team-metrics-dashboard': {
    id: 'canvas-team-metrics-dashboard',
    title: 'Team metrics dashboard',
    body: '## Team metrics dashboard\n\n- Build pass rate: 98.4%\n- Median review time: 5.1h\n- Open Sev2 incidents: 1 (stable)\n- Weekly delivery confidence: High',
    lastUpdatedAt: now - 55 * 60_000,
  },
};

const seededRunsIndex = Object.values(seedRuns)
  .sort((a, b) => b.createdAt - a.createdAt)
  .map(({ id, title, status, progressPct, latestUpdate, createdAt }) => ({
    id,
    title,
    status,
    progressPct,
    latestUpdate,
    createdAt,
  }));

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTitle(input: string) {
  const cleaned = input
    .trim()
    .replace(/^\/agent\s*/i, '')
    .replace(/^\/autopilot\s*/i, '')
    .replace(/@workspaceagent|@workspace-agent|@agent/gi, '')
    .trim();
  if (!cleaned) return 'Agent task';
  const short = cleaned.length > 64 ? `${cleaned.slice(0, 61)}...` : cleaned;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function inferNextUpdate(stepCurrent: number, stepTotal: number, outputFormat: OutputFormat) {
  return `Step ${stepCurrent}/${stepTotal}: preparing ${outputFormat} output and artifacts.`;
}

function isSimpleSummaryTask(text: string, outputFormat: OutputFormat) {
  if (outputFormat === 'pr') return false;
  const normalized = text.toLowerCase().trim();
  const summaryIntent =
    /\b(summarize|summarise|summary|recap|brief|tl;dr|digest)\b/.test(normalized) ||
    normalized.startsWith('summarize') ||
    normalized.startsWith('summary');
  const complexIntent = /\b(compare|deep|analy[sz]e|investigate|multi-step|plan)\b/.test(normalized);
  return summaryIntent && !complexIntent;
}

function buildDeliverableBody(run: Run) {
  const scopePeople = (run.scope?.people || []).slice(0, 3).join(', ');
  const focus = run.requestedText || run.title;
  return [
    `**${run.title}**`,
    '',
    `- Scope focus: ${focus}`,
    `- Status: ready for follow-up in this thread`,
    scopePeople ? `- Stakeholders: ${scopePeople}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDeliverableArtifactLinks(run: Run): DeliverableArtifactLink[] {
  const links = run.artifacts.map((artifact) => ({
    label: `Open ${artifact.type}: ${artifact.title}`,
    targetId: artifact.type === 'canvas' ? run.id : undefined,
    url: artifact.url,
  }));
  return links;
}

function buildAutopilotDeliverableBody(autopilot: Autopilot) {
  if (autopilot.name.toLowerCase().includes('meeting prep')) {
    return `**${autopilot.name}**\n\n- Priority threads to review before standup\n- Top blockers with suggested owners\n- 3 talking points to drive decisions`;
  }
  if (autopilot.name.toLowerCase().includes('focus brief')) {
    return `**${autopilot.name}**\n\n- Top priorities for today\n- Risks likely to slip if unattended\n- Suggested follow-ups to unblock teammates`;
  }
  if (autopilot.name.toLowerCase().includes('industry trends')) {
    return `**${autopilot.name}**\n\n- Market movement: increasing demand for AI workflow copilots\n- Competitor signal: teams consolidate tooling to reduce context switching\n- Recommended response: ship low-noise, approval-first automations`;
  }
  if (autopilot.name.toLowerCase().includes('metrics')) {
    return `**${autopilot.name}**\n\n- Build pass rate steady above target\n- Open Sev2 incidents unchanged from yesterday\n- Review cycle time improving week over week`;
  }
  return `**${autopilot.name}**\n\n- Completed this scheduled run\n- Posted outputs and next actions in this thread`;
}

function buildAutopilotCanvasBody(autopilot: Autopilot, deliverableBody: string) {
  return `## ${autopilot.name}\n\nUpdated ${new Date().toLocaleString()}\n\n${deliverableBody}`;
}

interface AutopilotDeliverableDraft {
  title: string;
  body: string;
  receipts: string[];
  artifactLinks?: DeliverableArtifactLink[];
}

function withReceiptsSection(body: string, receipts: string[]) {
  const unique = Array.from(new Set(receipts.filter(Boolean)));
  if (unique.length === 0) return body;
  return `${body}\n\n### Receipts\n${unique.map((receipt) => `- ${receipt}`).join('\n')}`;
}

function findMessageByText(
  messages: Message[],
  opts: { channelId?: string; userId?: string; textIncludes: string }
) {
  const needle = opts.textIncludes.toLowerCase();
  const candidates = messages
    .filter((message) => {
      if (opts.channelId && message.channelId !== opts.channelId) return false;
      if (opts.userId && message.userId !== opts.userId) return false;
      return (message.text || '').toLowerCase().includes(needle);
    })
    .sort((a, b) => b.ts - a.ts);
  return candidates[0];
}

function buildDecisionDriverDeliverable(state: Pick<SlackStore, 'messages'>): AutopilotDeliverableDraft {
  const threadId = 'thread-engp-circuit-breaker';
  const replayMsg = findMessageByText(state.messages, {
    channelId: 'eng-platform',
    textIncludes: 'Replay tooling now supports selective retry by account segment',
  });
  const canaryMsg = findMessageByText(state.messages, {
    channelId: 'eng-platform',
    textIncludes: 'Canary health green after queue shard rebalance',
  });
  const title = 'Decision Driver';
  const body = [
    '### Decision',
    'Default payout circuit-breaker retries to **3** today.',
    '',
    '### Action items',
    '- Confirm monitoring owner for threshold checks.',
    '- Lock rollback trigger before next release gate.',
    '',
    '### Follow-up',
    '- Run checkpoints at +24h and +48h on tail latency and error budget.',
    '',
    '### Draft message to post in #eng-platform',
    '`@Alex Park @Priya Iyer @Mateo Cruz defaulting retries to 3 today. Please confirm threshold owner + rollback trigger in-thread before release gate.`',
  ].join('\n');
  return { title, body, receipts: [] };
}

function buildLoopCloserDeliverable(state: Pick<SlackStore, 'messages'>): AutopilotDeliverableDraft {
  const priyaPending = findMessageByText(state.messages, {
    channelId: 'dm-priya',
    userId: 'you',
    textIncludes: 'I will draft copy with staged availability notes',
  });
  const julesPending = findMessageByText(state.messages, {
    channelId: 'dm-jules',
    userId: 'you',
    textIncludes: 'Sending in 15 with proof points and customer references',
  });
  const isabelPending = findMessageByText(state.messages, {
    channelId: 'dm-isabel',
    userId: 'you',
    textIncludes: 'I will send a draft in 30 minutes',
  });
  const quietRiskMsg = findMessageByText(state.messages, {
    channelId: 'incident-response',
    textIncludes: 'Please include customer comms timeline in final postmortem',
  });
  const title = 'Loop Closer';
  const body = [
    '### Priority follow-ups',
    '### 1) dm-priya',
    '- **Draft reply:** `Sharing launch copy now with staged availability language so legal can review on time.`',
    '',
    '### 2) dm-jules',
    '- **Draft reply:** `Sending Redwood talk track now with proof points and concession guardrails for the call.`',
    '',
    '### 3) dm-isabel',
    '- **Draft reply:** `Draft timeline attached with milestones, dependencies, and owners for sponsor review.`',
    '',
    '### Follow-up',
    '- Confirm all three threads are closed before end of day.',
    quietRiskMsg ? '- Ensure postmortem comms timeline is included in incident follow-through.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { title, body, receipts: [] };
}

function buildEarlyWarningDeliverable(state: Pick<SlackStore, 'messages'>): AutopilotDeliverableDraft {
  const announcementsMsg = findMessageByText(state.messages, {
    channelId: 'announcements',
    textIncludes: 'Elevated retry traffic observed on payment webhooks',
  });
  const incidentSignal = findMessageByText(state.messages, {
    channelId: 'incident-response',
    textIncludes: 'Sev2 opened: delayed webhook delivery',
  });
  const engSignal = findMessageByText(state.messages, {
    channelId: 'eng-platform',
    textIncludes: 'queue saturation early-warning indicators',
  });
  const supportSignal = findMessageByText(state.messages, {
    channelId: 'support-escalations',
    textIncludes: 'webhook retry issues',
  });
  const title = 'Early Warning';
  const body = [
    '### Risk signal',
    '- Webhook retry pressure appears to be rising again across ops signals.',
    '',
    '### Immediate checks',
    '- Validate queue depth by shard.',
    '- Compare retry-storm indicators vs baseline.',
    '- Confirm canary latency remains within guardrails.',
    '',
    '### Follow-up',
    '- If elevated for 2 hours, open Sev2 and assign incident owner.',
    '',
    '### Draft messages',
    '- **#incident-response:** `Quick validation ask: retry traffic appears elevated again. Who owns next 2h checkpoint and queue-depth snapshot?`',
    '- **#support-escalations:** `Heads-up: possible retry pressure returning. Please prepare customer-safe macro and ETA language.`',
  ].join('\n');
  return { title, body, receipts: [] };
}

function buildAutopilotDeliverableDraft(
  autopilot: Autopilot,
  state: Pick<SlackStore, 'messages'>
): AutopilotDeliverableDraft {
  if (autopilot.id === 'autopilot-decision-driver') {
    return buildDecisionDriverDeliverable(state);
  }
  if (autopilot.id === 'autopilot-loop-closer') {
    return buildLoopCloserDeliverable(state);
  }
  if (autopilot.id === 'autopilot-early-warning') {
    return buildEarlyWarningDeliverable(state);
  }
  return {
    title: 'Deliverable',
    body: buildAutopilotDeliverableBody(autopilot),
    receipts: [],
  };
}

function fallbackProfile(userId: string): UserProfile {
  const cleaned = userId.replace(/[-_]+/g, ' ').trim();
  const displayName = cleaned
    ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Unknown User';
  return {
    id: userId,
    displayName,
    role: 'Teammate',
    avatarUrl: DEFAULT_AVATAR_SRC,
    isBot: /bot|agent/i.test(userId),
  };
}

function assertSeedMessageIntegrity(
  users: Record<string, UserProfile>,
  channels: Channel[],
  messages: Message[]
) {
  const userIds = new Set(Object.keys(users));
  const channelIds = new Set(channels.map((channel) => channel.id));
  const missingUsers = new Set<string>();
  const usersMissingAvatar = new Set<string>();
  const missingChannels = new Set<string>();

  for (const message of messages) {
    if (!channelIds.has(message.channelId)) {
      missingChannels.add(message.channelId);
    }

    const profile = users[message.userId];
    if (!profile) {
      missingUsers.add(message.userId);
      continue;
    }

    if (!profile.avatarUrl || profile.avatarUrl.trim().length === 0) {
      usersMissingAvatar.add(message.userId);
    }
  }

  if (missingUsers.size > 0 || usersMissingAvatar.size > 0 || missingChannels.size > 0) {
    const lines = [
      'Seed data integrity check failed.',
      missingUsers.size > 0 ? `Missing seed user profiles: ${Array.from(missingUsers).sort().join(', ')}` : '',
      usersMissingAvatar.size > 0
        ? `Seed senders missing avatarUrl: ${Array.from(usersMissingAvatar).sort().join(', ')}`
        : '',
      missingChannels.size > 0 ? `Messages reference unknown channels: ${Array.from(missingChannels).sort().join(', ')}` : '',
    ].filter(Boolean);
    throw new Error(lines.join('\n'));
  }

  const allUsersMissingAvatar = Array.from(userIds).filter((userId) => {
    const avatar = users[userId]?.avatarUrl;
    return !avatar || avatar.trim().length === 0;
  });
  if (allUsersMissingAvatar.length > 0) {
    throw new Error(`Seed users missing avatarUrl: ${allUsersMissingAvatar.sort().join(', ')}`);
  }
}

function normalizeUserId(userId: string): string {
  const normalized = userId.trim().toLowerCase();
  if (normalized === 'agent' || normalized === '@agent' || normalized === 'workspace agent') {
    return 'workspace-agent';
  }
  if (USER_ALIASES[normalized]) return USER_ALIASES[normalized];
  return userId;
}

export const useStore = create<SlackStore>((set, get) => ({
  channels: seedChannels,
  users: seedUsers,
  activeChannelId: 'general',
  messages: seedMessages,
  runs: seedRuns,
  autopilots: ensureRequiredDemoAutopilots(seedAutopilots),
  canvases: seedCanvases,
  runsIndex: seededRunsIndex,
  activeThreadRootId: null,
  selectedRunId: null,
  runsPanelOpen: false,
  appHomeOpen: false,
  activeView: 'channel',
  canvasRunId: null,
  autopilotEditorId: null,
  typing: null,
  devPanelOpen: false,

  setChannels: (channels) => set((s) => ({ channels: channels.length > 0 ? channels : s.channels })),
  getUserProfile: (userId) => {
    const users = get().users;
    const normalizedUserId = normalizeUserId(userId);
    if (users[normalizedUserId]) return users[normalizedUserId];
    if (users[userId]) return users[userId];
    const byDisplayName = Object.values(users).find(
      (profile) => profile.displayName.toLowerCase() === userId.trim().toLowerCase()
    );
    return byDisplayName ?? fallbackProfile(userId);
  },
  setActiveChannel: (id) =>
    set({ activeChannelId: id, activeThreadRootId: null, canvasRunId: null, activeView: 'channel' }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set((s) => ({ messages: messages.length > 0 ? messages : s.messages })),
  upsertRun: (run) =>
    set((s) => {
      const existing = s.runs[run.id];
      if (existing && shouldIgnoreStaleRunUpdate(existing, run)) {
        return {};
      }
      const runs = { ...s.runs, [run.id]: run };
      const rows = Object.values(runs)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ id, title, status, progressPct, latestUpdate, createdAt }) => ({
          id,
          title,
          status,
          progressPct,
          latestUpdate,
          createdAt,
        }));
      return { runs, runsIndex: rows };
    }),
  upsertAutopilot: (autopilot) =>
    set((s) => ({ autopilots: ensureRequiredDemoAutopilots({ ...s.autopilots, [autopilot.id]: autopilot }) })),
  setRunsIndex: (runsIndex) => set({ runsIndex }),
  openThread: (rootId) => set({ activeThreadRootId: rootId }),
  closeThread: () => set({ activeThreadRootId: null }),
  openRunThread: (runId) =>
    set((s) => {
      const run = s.runs[runId];
      if (!run) return {};
      return {
        activeChannelId: run.container.id,
        activeThreadRootId: run.rootMessageId,
        selectedRunId: run.id,
        activeView: 'channel' as ViewMode,
      };
    }),
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setRunsPanelOpen: (runsPanelOpen) => set({ runsPanelOpen }),
  setAppHomeOpen: (appHomeOpen) => set({ appHomeOpen }),
  setActiveView: (activeView) => set({ activeView }),
  openRunCanvas: (canvasRunId) => set({ canvasRunId }),
  closeRunCanvas: () => set({ canvasRunId: null }),
  setAutopilotEditorId: (autopilotEditorId) => set({ autopilotEditorId }),
  setTyping: (typing) => set({ typing }),
  toggleDevPanel: () => set((s) => ({ devPanelOpen: !s.devPanelOpen })),
  createMessage: ({ channelId, userId, text, parentId, isBot = false }) => {
    const message: Message = {
      id: makeId('msg'),
      channelId,
      userId,
      text,
      parentId,
      ts: Date.now(),
      isBot,
      kind: 'message',
    };
    set((s) => ({ messages: [...s.messages, message] }));
    return message;
  },
  createDeliverableMessage: ({ channelId, threadRootId, runId, body, title = 'Deliverable', artifactLinks = [] }) => {
    const message: Message = {
      id: makeId('msg'),
      channelId,
      containerId: channelId,
      threadRootId,
      userId: 'workspace-agent',
      text: body,
      title,
      body,
      artifactLinks,
      ts: Date.now(),
      isBot: true,
      kind: 'deliverable',
      runId,
    };
    set((s) => ({ messages: [...s.messages, message] }));
    return message;
  },
  createRunFromCommand: (command, opts) => {
    const conciseMode = isSimpleSummaryTask(command.text, command.outputFormat);
    const continueRun = opts?.continueRunId ? get().runs[opts.continueRunId] : undefined;
    if (continueRun && opts?.continueRootId) {
      const totalSteps = continueRun.stepTotal ?? 3;
      const currentStep = continueRun.stepCurrent ?? 0;
      const outputFormat = continueRun.outputFormat ?? 'brief';
      const requireApproval = Boolean(continueRun.requireApproval);
      const nextStep = Math.min(currentStep + 1, totalSteps);
      const status: RunStatus = requireApproval && nextStep >= 2 ? 'needs_approval' : 'running';
      const updatedRun: Run = {
        ...continueRun,
        status,
        stepCurrent: nextStep,
        progressPct: Math.round((nextStep / totalSteps) * 100),
        latestUpdate:
          status === 'needs_approval'
            ? 'Waiting approval for proposed action in thread.'
            : inferNextUpdate(nextStep, totalSteps, outputFormat),
        approval: requireApproval
          ? {
              required: true,
              reason: continueRun.approval?.reason ?? 'Proposed action modifies external systems.',
              pending: status === 'needs_approval',
            }
          : continueRun.approval,
      };
      set((s) => ({
        runs: { ...s.runs, [updatedRun.id]: updatedRun },
        runsIndex: Object.values({ ...s.runs, [updatedRun.id]: updatedRun })
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id, title, status: runStatus, progressPct, latestUpdate, createdAt }) => ({
            id,
            title,
            status: runStatus,
            progressPct,
            latestUpdate,
            createdAt,
          })),
      }));
      if (!conciseMode || status === 'needs_approval') {
        get().createMessage({
          channelId: continueRun.container.id,
          parentId: continueRun.rootMessageId,
          userId: 'workspace-agent',
          isBot: true,
          text:
            status === 'needs_approval'
              ? `Proposed action: ${command.text}`
              : inferNextUpdate(nextStep, totalSteps, outputFormat),
        });
      }
      return updatedRun;
    }

    const runId = makeId('run');
    const rootMessageId = makeId('msg-run');
    const requiresApproval = command.requireApproval;
    const stepTotal = requiresApproval ? 4 : conciseMode ? 2 : 3;
    const stepCurrent = requiresApproval ? 2 : 1;
    const status: RunStatus = requiresApproval ? 'needs_approval' : 'running';
    const run: Run = {
      id: runId,
      title: normalizeTitle(command.text),
      requestedText: command.text.trim(),
      createdAt: Date.now(),
      createdBy: 'you',
      container: command.container,
      rootMessageId,
      threadId: rootMessageId,
      status,
      stepCurrent,
      stepTotal,
      progressPct: Math.round((stepCurrent / stepTotal) * 100),
      latestUpdate: requiresApproval
        ? 'Waiting approval for a proposed action in thread.'
        : conciseMode
          ? 'Preparing summary deliverable...'
          : inferNextUpdate(stepCurrent, stepTotal, command.outputFormat),
      artifacts: [
        { id: makeId('artifact'), type: 'doc', title: 'Working notes' },
        { id: makeId('artifact'), type: 'pr', title: 'Draft PR link' },
        { id: makeId('artifact'), type: 'canvas', title: 'Plan canvas' },
      ],
      approval: requiresApproval
        ? {
            required: true,
            reason: 'This action may post updates or change external documents.',
            pending: true,
          }
        : { required: false, pending: false },
      scope: command.scope,
      tools: command.tools,
      outputFormat: command.outputFormat,
      requireApproval: command.requireApproval,
    };

    const rootMessage: Message = {
      id: rootMessageId,
      channelId: command.container.id,
      userId: 'workspace-agent',
      text: `Run started: ${run.title}`,
      ts: Date.now(),
      isBot: true,
      kind: 'run_card',
      runId,
    };

    const startUpdate: Message | null = conciseMode
      ? null
      : {
          id: makeId('msg'),
          channelId: command.container.id,
          userId: 'workspace-agent',
          text: `Step 1/${stepTotal}: gathering context from selected messages and files.`,
          ts: Date.now(),
          isBot: true,
          parentId: rootMessageId,
          kind: 'message',
          runId,
        };

    const approvalUpdate: Message | null = requiresApproval
      ? {
          id: makeId('msg'),
          channelId: command.container.id,
          userId: 'workspace-agent',
          text: `Proposed action: ${command.text}`,
          ts: Date.now(),
          isBot: true,
          parentId: rootMessageId,
          kind: 'message',
          runId,
        }
      : null;

    set((s) => {
      const runs = { ...s.runs, [runId]: run };
      return {
        runs,
        runsIndex: Object.values(runs)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id, title, status: runStatus, progressPct, latestUpdate, createdAt }) => ({
            id,
            title,
            status: runStatus,
            progressPct,
            latestUpdate,
            createdAt,
          })),
        messages: [...s.messages, rootMessage, ...(startUpdate ? [startUpdate] : []), ...(approvalUpdate ? [approvalUpdate] : [])],
      };
    });

    return run;
  },
  reconcileRunFromServer: (optimisticRunId, serverRun) => {
    const state = get();
    const optimistic = state.runs[optimisticRunId];
    if (!optimistic) {
      get().upsertRun(serverRun);
      return serverRun;
    }

    const optimisticRootId = optimistic.rootMessageId;
    set((s) => {
      const nextRuns = { ...s.runs };
      delete nextRuns[optimisticRunId];
      nextRuns[serverRun.id] = serverRun;

      const strippedMessages = s.messages.filter((message) => {
        if (message.id === optimisticRootId) return false;
        if (message.parentId === optimisticRootId) return false;
        if (message.runId === optimisticRunId) return false;
        return true;
      });

      const hasServerRootMessage = strippedMessages.some((message) => message.id === serverRun.rootMessageId);
      const serverRootMessage: Message | null = hasServerRootMessage
        ? null
        : {
            id: serverRun.rootMessageId,
            channelId: serverRun.container.id,
            userId: 'workspace-agent',
            text: serverRun.title,
            ts: Date.now(),
            isBot: true,
            kind: 'run_card',
            runId: serverRun.id,
          };

      const runsIndex = Object.values(nextRuns)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ id, title, status, progressPct, latestUpdate, createdAt }) => ({
          id,
          title,
          status,
          progressPct,
          latestUpdate,
          createdAt,
        }));

      const nextSelectedRunId = s.selectedRunId === optimisticRunId ? serverRun.id : s.selectedRunId;
      const nextActiveThreadRootId =
        s.activeThreadRootId === optimisticRootId ? serverRun.rootMessageId : s.activeThreadRootId;

      return {
        runs: nextRuns,
        runsIndex,
        selectedRunId: nextSelectedRunId,
        activeThreadRootId: nextActiveThreadRootId,
        messages: serverRootMessage ? [...strippedMessages, serverRootMessage] : strippedMessages,
      };
    });
    return serverRun;
  },
  discardRun: (runId) =>
    set((s) => {
      const run = s.runs[runId];
      if (!run) return {};
      const nextRuns = { ...s.runs };
      delete nextRuns[runId];
      const runsIndex = Object.values(nextRuns)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ id, title, status, progressPct, latestUpdate, createdAt }) => ({
          id,
          title,
          status,
          progressPct,
          latestUpdate,
          createdAt,
        }));
      return {
        runs: nextRuns,
        runsIndex,
        messages: s.messages.filter(
          (message) =>
            message.id !== run.rootMessageId && message.parentId !== run.rootMessageId && message.runId !== runId
        ),
        selectedRunId: s.selectedRunId === runId ? null : s.selectedRunId,
        activeThreadRootId: s.activeThreadRootId === run.rootMessageId ? null : s.activeThreadRootId,
      };
    }),
  appendRunThreadUpdate: (runId, text, opts) =>
    set((s) => {
      const run = s.runs[runId];
      if (!run) return {};
      const nextMessage: Message = {
        id: makeId('msg'),
        channelId: run.container.id,
        userId: 'workspace-agent',
        text: opts?.asApprovalBlock ? `Proposed action: ${text}` : text,
        ts: Date.now(),
        isBot: true,
        parentId: run.rootMessageId,
        kind: 'message',
        runId,
      };
      return { messages: [...s.messages, nextMessage] };
    }),
  decideRunApproval: (runId, decision) =>
    set((s) => {
      const run = s.runs[runId];
      if (!run || !run.approval) return {};
      const approved = decision === 'approve';
      const totalSteps = run.stepTotal ?? 3;
      const currentStep = run.stepCurrent ?? 0;
      const outputFormat = run.outputFormat ?? 'brief';
      const nextStep = approved ? Math.min(currentStep + 1, totalSteps) : currentStep;
      const status: RunStatus = approved ? (nextStep >= totalSteps ? 'completed' : 'running') : 'stopped';
      const nextRun: Run = {
        ...run,
        status,
        stepCurrent: nextStep,
        progressPct: approved ? Math.round((nextStep / totalSteps) * 100) : run.progressPct,
        latestUpdate: approved
          ? nextStep >= totalSteps
            ? 'Done. Approved action applied and summary posted.'
            : inferNextUpdate(nextStep, totalSteps, outputFormat)
          : 'Approval rejected. Run stopped safely.',
        approval: {
          ...run.approval,
          pending: false,
        },
      };
      const decisionMsg: Message = {
        id: makeId('msg'),
        channelId: run.container.id,
        userId: 'workspace-agent',
        text: approved
          ? 'Approval received. Continuing execution with the proposed action.'
          : 'Approval rejected. I stopped this run without taking the risky action.',
        ts: Date.now(),
        isBot: true,
        parentId: run.rootMessageId,
        kind: 'message',
        runId,
      };
      const completionMsg: Message | null =
        approved && nextStep >= totalSteps
          ? {
              id: makeId('msg'),
              channelId: run.container.id,
              userId: 'workspace-agent',
              text: 'Step complete: posted final deliverable and linked artifacts.',
              ts: Date.now(),
              isBot: true,
              parentId: run.rootMessageId,
              kind: 'message',
              runId,
            }
          : null;
      const deliverableMsg: Message | null =
        approved && nextStep >= totalSteps
          ? {
              id: makeId('msg'),
              channelId: run.container.id,
              containerId: run.container.id,
              threadRootId: run.rootMessageId,
              userId: 'workspace-agent',
              text: buildDeliverableBody(nextRun),
              title: 'Deliverable',
              body: buildDeliverableBody(nextRun),
              artifactLinks: buildDeliverableArtifactLinks(nextRun),
              ts: Date.now(),
              isBot: true,
              kind: 'deliverable',
              runId,
            }
          : null;
      const runs = { ...s.runs, [runId]: nextRun };
      return {
        runs,
        runsIndex: Object.values(runs)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id, title, status: runStatus, progressPct, latestUpdate, createdAt }) => ({
            id,
            title,
            status: runStatus,
            progressPct,
            latestUpdate,
            createdAt,
          })),
        messages: [...s.messages, decisionMsg, ...(completionMsg ? [completionMsg] : []), ...(deliverableMsg ? [deliverableMsg] : [])],
      };
    }),
  controlRun: (runId, action) =>
    set((s) => {
      const run = s.runs[runId];
      if (!run) return {};
      const status: RunStatus = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'stopped';
      const nextRun: Run = {
        ...run,
        status,
        latestUpdate:
          action === 'pause'
            ? 'Paused. Resume to continue.'
            : action === 'resume'
              ? 'Resumed. Continuing execution.'
              : 'Stopped by user.',
      };
      const notice: Message = {
        id: makeId('msg'),
        channelId: run.container.id,
        userId: 'workspace-agent',
        text: action === 'pause' ? 'Run paused.' : action === 'resume' ? 'Run resumed.' : 'Run stopped.',
        ts: Date.now(),
        isBot: true,
        parentId: run.rootMessageId,
        kind: 'message',
        runId,
      };
      const runs = { ...s.runs, [runId]: nextRun };
      return {
        runs,
        runsIndex: Object.values(runs)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id, title, status: runStatus, progressPct, latestUpdate, createdAt }) => ({
            id,
            title,
            status: runStatus,
            progressPct,
            latestUpdate,
            createdAt,
          })),
        messages: [...s.messages, notice],
      };
    }),
  createAutopilot: (draft) => {
    const id = makeId('autopilot');
    const canvasId = draft.outputMode === 'canvasPrimary' ? makeId('canvas') : undefined;
    const autopilot: Autopilot = {
      ...draft,
      id,
      canvasId,
    };
    set((s) => ({
      autopilots: { ...s.autopilots, [autopilot.id]: autopilot },
      canvases: canvasId
        ? {
            ...s.canvases,
            [canvasId]: {
              id: canvasId,
              title: autopilot.name,
              body: `## ${autopilot.name}\n\nCanvas will populate after the first run.`,
              lastUpdatedAt: Date.now(),
            },
          }
        : s.canvases,
    }));
    return autopilot;
  },
  updateAutopilot: (id, patch) =>
    set((s) => {
      const current = s.autopilots[id];
      if (!current) return {};
      const maybeCanvasId =
        (current.canvasId || patch.canvasId) ??
        (current.outputMode === 'canvasPrimary' || patch.outputMode === 'canvasPrimary' ? makeId('canvas') : undefined);
      const next = { ...current, ...patch, canvasId: maybeCanvasId };
      return {
        autopilots: { ...s.autopilots, [id]: next },
        canvases:
          next.outputMode === 'canvasPrimary' && next.canvasId && !s.canvases[next.canvasId]
            ? {
                ...s.canvases,
                [next.canvasId]: {
                  id: next.canvasId,
                  title: next.name,
                  body: `## ${next.name}\n\nCanvas will populate after the first run.`,
                  lastUpdatedAt: Date.now(),
                },
              }
            : s.canvases,
      };
    }),
  runAutopilotNow: (id) => {
    const state = get();
    const autopilot = state.autopilots[id] || requiredDemoAutopilots[id];
    if (!autopilot) return undefined;
    const runId = makeId('run');
    const runMessageId = makeId('msg-run');
    const deliveredAt = Date.now();
    const deliverableDraft = buildAutopilotDeliverableDraft(autopilot, state);
    const deliverableBody = deliverableDraft.body;
    const container = { type: autopilot.destinationType, id: autopilot.destinationId } as const;
    const finalRun: Run = {
      id: runId,
      title: autopilot.name,
      requestedText: undefined,
      createdAt: deliveredAt,
      createdBy: 'workspace-agent',
      container,
      rootMessageId: runMessageId,
      threadId: runMessageId,
      status: 'completed',
      stepCurrent: 3,
      stepTotal: 3,
      progressPct: 100,
      latestUpdate: 'Done. Deliverable posted in thread.',
      artifacts:
        autopilot.outputMode === 'canvasPrimary' && autopilot.canvasId
          ? [{ id: makeId('artifact'), type: 'canvas', title: 'Open Canvas' }]
          : [{ id: makeId('artifact'), type: 'doc', title: 'Run deliverable' }],
      autopilotId: id,
      scope: { channel: true, thread: true, messages: [], files: [], people: [] },
      tools: { drive: false, calendar: false, codebase: true },
      outputFormat: 'brief',
      requireApproval: false,
    };
    set((s) => {
      const runs = { ...s.runs, [runId]: finalRun };
      const currentAutopilot = s.autopilots[id] || requiredDemoAutopilots[id];
      if (!currentAutopilot) return {};
      const runCardMessage: Message = {
        id: runMessageId,
        channelId: currentAutopilot.destinationId,
        userId: 'workspace-agent',
        text: `Run completed: ${currentAutopilot.name}`,
        ts: deliveredAt,
        isBot: true,
        kind: 'run_card',
        runId,
        autopilotId: currentAutopilot.id,
      };
      const deliverableMessage: Message = {
        id: makeId('msg'),
        channelId: currentAutopilot.destinationId,
        containerId: currentAutopilot.destinationId,
        threadRootId: runMessageId,
        userId: 'workspace-agent',
        text: deliverableBody,
        title: deliverableDraft.title,
        body: deliverableBody,
        artifactLinks: [
          ...(currentAutopilot.outputMode === 'canvasPrimary' && currentAutopilot.canvasId
            ? [{ label: 'Open Canvas', targetId: currentAutopilot.canvasId }]
            : []),
          ...(deliverableDraft.artifactLinks || []),
        ],
        ts: deliveredAt + 1,
        isBot: true,
        kind: 'deliverable',
        runId,
        autopilotId: currentAutopilot.id,
      };
      return {
        runs,
        runsIndex: Object.values(runs)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id: rowId, title, status, progressPct, latestUpdate, createdAt }) => ({
            id: rowId,
            title,
            status,
            progressPct,
            latestUpdate,
            createdAt,
          })),
        autopilots: {
          ...s.autopilots,
          [id]: {
            ...currentAutopilot,
            lastRunAt: deliveredAt,
          },
        },
        canvases:
          currentAutopilot.outputMode === 'canvasPrimary' && currentAutopilot.canvasId
            ? {
                ...s.canvases,
                [currentAutopilot.canvasId]: {
                  id: currentAutopilot.canvasId,
                  title: currentAutopilot.name,
                  body: buildAutopilotCanvasBody(currentAutopilot, deliverableBody),
                  lastUpdatedAt: deliveredAt,
                },
              }
            : s.canvases,
        messages: [...s.messages, runCardMessage, deliverableMessage],
      };
    });
    return finalRun;
  },
  getRunByRootMessage: (rootMessageId) => {
    const runs = get().runs;
    return Object.values(runs).find((run) => run.rootMessageId === rootMessageId);
  },
  getRunsByStatus: (status) => {
    const runs = Object.values(get().runs).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    return status ? runs.filter((run) => run.status === status) : runs;
  },
}));

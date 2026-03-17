"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type GameState = "start" | "explore" | "dialog" | "result";
type Direction = "up" | "right" | "down" | "left";
type CareerPath = "university" | "vocational" | "employment";

type Status = {
  study: number;
  stress: number;
  money: number;
  liberal: number;
  science: number;
};

type Choice = {
  id: string;
  label: string;
  effect: Partial<Status>;
  setCareerPath?: CareerPath;
};

type GameEvent = {
  id: string;
  title: string;
  description: string;
  choices: Choice[];
};

type LogEntry = {
  year: number;
  eventTitle: string;
  choiceLabel: string;
  effect: Partial<Status>;
  careerAfterChoice: CareerPath;
};

type Npc = {
  id: string;
  name: string;
  pos: { x: number; y: number };
  sprite: string;
  direction: Direction;
};

type SaveData = {
  year: number;
  yearPhase: number;
  status: Status;
  careerPath: CareerPath | null;
  logs: LogEntry[];
  playerPos: { x: number; y: number };
  direction: Direction;
  reincarnationCount: number;
  carryBonus: Partial<Status>;
};

type RebirthPayload = {
  bonus: Partial<Status>;
  reincarnationCount: number;
};

const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const VIEW_WIDTH = 13;
const VIEW_HEIGHT = 10;
const TILE_SIZE = 32;
const FRAME_SIZE = 32;
const EVENTS_PER_YEAR = 4;
const SAVE_KEY = "career-map-prototype-v1";
const RESULT_KEY = "career-map-result-v1";
const REBIRTH_KEY = "career-map-rebirth-v1";
const START_POS = { x: 10, y: 7 };
const PLAYER_SPRITE_PATH = "/images/player-clean.png";
const SCHOOL_BACKGROUND_PATH = "/images/school.png";
const MYSTIC_BACKGROUND_PATH = "/images/mystic-room.png";
const NPCS: Npc[] = [
  {
    id: "advisor",
    name: "進路アドバイザー",
    pos: { x: 16, y: 7 },
    sprite: "/images/npc1-clean.png",
    direction: "down",
  },
  {
    id: "science",
    name: "理系先輩",
    pos: { x: 6, y: 3 },
    sprite: "/images/npc2-clean.png",
    direction: "down",
  },
  {
    id: "liberal",
    name: "文系先輩",
    pos: { x: 12, y: 11 },
    sprite: "/images/npc3-clean.png",
    direction: "down",
  },
  {
    id: "career",
    name: "就職メンター",
    pos: { x: 18, y: 2 },
    sprite: "/images/npc4-clean.png",
    direction: "down",
  },
];

const INITIAL_STATUS: Status = {
  study: 50,
  stress: 50,
  money: 1000,
  liberal: 0,
  science: 0,
};

const DIRECTION_ROW: Record<Direction, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};
const PHASE_LABELS = ["第1会話", "第2会話", "第3会話", "第4会話"] as const;

// 3列 x 4行のフォールバックスプライト（/public/images/player.png が読めない時に使用）
const FALLBACK_SPRITE_SHEET = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128">
  <rect width="96" height="128" fill="#0f172a"/>
  <g>
    <rect x="0" y="0" width="32" height="32" fill="#334155"/><rect x="32" y="0" width="32" height="32" fill="#475569"/><rect x="64" y="0" width="32" height="32" fill="#334155"/>
    <rect x="0" y="32" width="32" height="32" fill="#0ea5e9"/><rect x="32" y="32" width="32" height="32" fill="#38bdf8"/><rect x="64" y="32" width="32" height="32" fill="#0ea5e9"/>
    <rect x="0" y="64" width="32" height="32" fill="#22c55e"/><rect x="32" y="64" width="32" height="32" fill="#4ade80"/><rect x="64" y="64" width="32" height="32" fill="#22c55e"/>
    <rect x="0" y="96" width="32" height="32" fill="#f59e0b"/><rect x="32" y="96" width="32" height="32" fill="#fbbf24"/><rect x="64" y="96" width="32" height="32" fill="#f59e0b"/>
  </g>
  <g fill="#020617" opacity="0.9">
    <circle cx="16" cy="16" r="7"/><circle cx="48" cy="16" r="7"/><circle cx="80" cy="16" r="7"/>
    <circle cx="16" cy="48" r="7"/><circle cx="48" cy="48" r="7"/><circle cx="80" cy="48" r="7"/>
    <circle cx="16" cy="80" r="7"/><circle cx="48" cy="80" r="7"/><circle cx="80" cy="80" r="7"/>
    <circle cx="16" cy="112" r="7"/><circle cx="48" cy="112" r="7"/><circle cx="80" cy="112" r="7"/>
  </g>
</svg>
`)}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const keyToDirection = (key: string): Direction | null => {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowRight") return "right";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  return null;
};

const applyStatusDelta = (base: Status, delta: Partial<Status>): Status => ({
  study: clamp(base.study + (delta.study ?? 0), 0, 100),
  stress: clamp(base.stress + (delta.stress ?? 0), 0, 100),
  money: Math.max(0, base.money + (delta.money ?? 0)),
  liberal: clamp(base.liberal + (delta.liberal ?? 0), 0, 100),
  science: clamp(base.science + (delta.science ?? 0), 0, 100),
});

const decideCareerPath = (status: Status): CareerPath => {
  // 単純閾値ではなく重み付きで進路を判定し、理系一択になりにくくする
  const universityScore =
    status.study * 1.35 +
    (100 - status.stress) * 0.45 +
    (status.liberal + status.science) * 0.2;
  const vocationalScore =
    (status.science + status.liberal) * 0.8 +
    Math.max(status.science, status.liberal) * 0.7 +
    status.study * 0.25;
  const employmentScore =
    (status.money / 20) * 1.1 +
    (100 - status.study) * 0.85 +
    status.stress * 0.45 +
    status.liberal * 0.25;

  if (status.study >= 82 && status.stress <= 70) return "university";
  if (status.money >= 2600 && status.study < 70) return "employment";
  if (Math.max(status.science, status.liberal) >= 78 && status.study < 85) {
    return "vocational";
  }

  const ranking = [
    { path: "university" as const, score: universityScore },
    { path: "vocational" as const, score: vocationalScore },
    { path: "employment" as const, score: employmentScore },
  ].sort((a, b) => b.score - a.score);

  // 上位が僅差なら、現在の強みで最終決定
  if (ranking[0].score - ranking[1].score < 8) {
    if (status.money > 2000) return "employment";
    if (status.study >= 70) return "university";
    return status.liberal >= status.science ? "vocational" : ranking[0].path;
  }

  return ranking[0].path;
};

const buildNpcEvent = (
  year: number,
  status: Status,
  currentPath: CareerPath | null,
  phase: number
): GameEvent => {
  const term = PHASE_LABELS[phase] ?? `第${phase + 1}会話`;
  const suggested = currentPath ?? decideCareerPath(status);
  const suggestedText =
    suggested === "university"
      ? "探究を深めるルート"
      : suggested === "vocational"
        ? "実践スキル特化ルート"
        : "就職直行ルート";

  const yearEvents: Record<number, GameEvent[]> = {
    1: [
      {
        id: "hs1-0",
        title: `高校1年(${term}): 入学とクラスで出会い`,
        description:
          "入学直後。勉強が得意な子、明るい子、マイペースな子と出会う最初の会話。",
        choices: [
          { id: "hs1-0-a", label: "勉強が得意な子に話しかける", effect: { study: 6, science: 4, stress: 1 } },
          { id: "hs1-0-b", label: "明るい子グループに入る", effect: { liberal: 7, stress: -2, money: -50 } },
          { id: "hs1-0-c", label: "マイペースな子と静かに過ごす", effect: { stress: -4, study: 2, liberal: 3 } },
        ],
      },
      {
        id: "hs1-1",
        title: `高校1年(${term}): 放課後の使い方`,
        description:
          "放課後をどう使うかで、学力と人間関係の土台ができ始める。",
        choices: [
          { id: "hs1-1-a", label: "勉強会に参加する", effect: { study: 7, stress: 2, science: 2 } },
          { id: "hs1-1-b", label: "部活・寄り道で交流する", effect: { liberal: 6, stress: -1, money: -100 } },
          { id: "hs1-1-c", label: "早めに帰って家で過ごす", effect: { money: 180, stress: -1, study: 2 } },
        ],
      },
      {
        id: "hs1-2",
        title: `高校1年(${term}): 文化祭準備`,
        description:
          "準備期間で、協調性を取るか役割徹底を取るか、性格が出る局面。",
        choices: [
          { id: "hs1-2-a", label: "みんなで準備を進める", effect: { liberal: 8, stress: 2, study: 1 } },
          { id: "hs1-2-b", label: "担当役割を完璧にこなす", effect: { study: 6, science: 4, stress: 1 } },
          { id: "hs1-2-c", label: "無理せず調整役に回る", effect: { stress: -3, money: 100, liberal: 2 } },
        ],
      },
      {
        id: "hs1-3",
        title: `高校1年(${term}): 文化祭当日`,
        description:
          "友達、気になる人、クラス運営。誰を優先するかで印象が変わる。",
        choices: [
          { id: "hs1-3-a", label: "友達と回って交流を広げる", effect: { liberal: 7, stress: -2 } },
          { id: "hs1-3-b", label: "気になる人と少し話す", effect: { liberal: 8, study: 2, stress: -1 } },
          { id: "hs1-3-c", label: "クラス優先で裏方を動く", effect: { study: 4, science: 3, stress: 2 } },
        ],
      },
    ],
    2: [
      {
        id: "hs2-0",
        title: `高校2年(${term}): 文理選択`,
        description:
          "ここでの判断が進路の大きな分岐になる。",
        choices: [
          { id: "hs2-0-a", label: "興味で決める", effect: { science: 8, liberal: 4, study: 3 } },
          { id: "hs2-0-b", label: "得意で決める", effect: { study: 7, science: 5, liberal: 2 } },
          { id: "hs2-0-c", label: "周囲の影響で決める", effect: { stress: 4, money: 120, study: -1, liberal: 2 } },
        ],
      },
      {
        id: "hs2-1",
        title: `高校2年(${term}): 人間関係の変化`,
        description:
          "よく話す相手が固定され始める時期。距離感の選択が関係性に効く。",
        choices: [
          { id: "hs2-1-a", label: "気になる人に話しかける", effect: { liberal: 6, stress: -2, study: 2 } },
          { id: "hs2-1-b", label: "あえて距離を置く", effect: { study: 3, stress: 4, money: 160 } },
          { id: "hs2-1-c", label: "今まで通りの距離感で過ごす", effect: { stress: -1, liberal: 3, science: 2 } },
        ],
      },
      {
        id: "hs2-2",
        title: `高校2年(${term}): 模試と振り返り`,
        description:
          "結果を受けて弱点補強するか、得意を伸ばすかを選ぶ。",
        choices: [
          { id: "hs2-2-a", label: "弱点分析して対策する", effect: { study: 8, stress: 2 } },
          { id: "hs2-2-b", label: "得意科目を伸ばす", effect: { science: 6, liberal: 5, stress: 1 } },
          { id: "hs2-2-c", label: "流れに任せて様子を見る", effect: { stress: -2, money: 120, study: -2 } },
        ],
      },
      {
        id: "hs2-3",
        title: `高校2年(${term}): 将来情報の収集`,
        description:
          "進学・職業の情報をどれだけ取りに行くかで3年生の動きやすさが変わる。",
        choices: [
          { id: "hs2-3-a", label: "学校説明会に参加する", effect: { study: 5, liberal: 4, stress: 1 } },
          { id: "hs2-3-b", label: "先輩に個別相談する", effect: { science: 4, liberal: 4, stress: -1 } },
          { id: "hs2-3-c", label: "特に動かず日常を優先する", effect: { money: 180, study: -2, stress: 2 } },
        ],
      },
    ],
    3: [
      {
        id: "hs3-0",
        title: `高校3年(${term}): 三者面談`,
        description:
          "進路調査前の本番。自分で主張するか、周囲に合わせるか。",
        choices: [
          { id: "hs3-0-a", label: "自分の意見をはっきり言う", effect: { study: 8, liberal: 3, stress: 1 } },
          { id: "hs3-0-b", label: "親の意向を優先する", effect: { study: 4, stress: 5, money: 200 } },
          { id: "hs3-0-c", label: "迷ったまま提出する", effect: { stress: 7, study: -2, money: 120 } },
        ],
      },
      {
        id: "hs3-1",
        title: `高校3年(${term}): 受験計画`,
        description:
          "ここで生活リズムと学習配分を決める。",
        choices: [
          { id: "hs3-1-a", label: "逆算スケジュールを組む", effect: { study: 9, stress: 2 } },
          { id: "hs3-1-b", label: "安全志向で計画を組む", effect: { study: 5, stress: 1, money: 100 } },
          { id: "hs3-1-c", label: "息抜きを優先して様子を見る", effect: { stress: -3, money: -80, study: -3, liberal: 2 } },
        ],
      },
      {
        id: "hs3-2",
        title: `高校3年(${term}): 受験前の関係性`,
        description:
          "応援し合うか、距離を取るか、伝えるかでメンタルが変わる。",
        choices: [
          { id: "hs3-2-a", label: "応援し合って進む", effect: { study: 6, stress: -4, liberal: 3 } },
          { id: "hs3-2-b", label: "距離を置いて集中する", effect: { study: 4, stress: 4, science: 2 } },
          { id: "hs3-2-c", label: "気持ちを伝えて区切る", effect: { liberal: 9, stress: 2, study: 1 } },
        ],
      },
      {
        id: "hs3-3",
        title: `高校3年(${term}): 本番前の調整`,
        description:
          "最後の調整。ルーティン化か、短時間集中か、休息重視か。",
        choices: [
          { id: "hs3-3-a", label: "ルーティンを徹底する", effect: { study: 7, stress: -1 } },
          { id: "hs3-3-b", label: "短時間集中で詰める", effect: { science: 5, study: 4, stress: 1 } },
          { id: "hs3-3-c", label: "休息を優先して整える", effect: { stress: -5, study: 2 } },
        ],
      },
    ],
    4: [
      {
        id: "uni1-0",
        title: `大学1年(${term}): サークル選択`,
        description:
          "大学最初の人間関係。どんな場に所属するかを選ぶ。",
        choices: [
          { id: "uni1-0-a", label: "活動的なサークルに入る", effect: { liberal: 7, stress: -1, money: -100 } },
          { id: "uni1-0-b", label: "研究会に参加する", effect: { science: 6, study: 6, stress: 1 } },
          { id: "uni1-0-c", label: "まだ所属せず様子を見る", effect: { stress: -2, money: 120 } },
        ],
      },
      {
        id: "uni1-1",
        title: `大学1年(${term}): バイト開始`,
        description:
          "時間とお金のバランスをどう取るかを決める。",
        choices: [
          { id: "uni1-1-a", label: "接客バイトで経験を積む", effect: { money: 520, liberal: 5, stress: 3 } },
          { id: "uni1-1-b", label: "塾講師で学習も活かす", effect: { money: 480, study: 5, stress: 2 } },
          { id: "uni1-1-c", label: "バイトせず学業優先", effect: { study: 5, stress: -1, money: -120 } },
        ],
      },
      {
        id: "uni1-2",
        title: `大学1年(${term}): 履修計画`,
        description:
          "難しい授業に挑むか、バランス重視でいくか。",
        choices: [
          { id: "uni1-2-a", label: "難しめの授業に挑戦", effect: { study: 8, science: 4, stress: 3 } },
          { id: "uni1-2-b", label: "バランス重視で履修", effect: { study: 5, liberal: 4, stress: 1 } },
          { id: "uni1-2-c", label: "余裕重視で組む", effect: { stress: -2, liberal: 2, money: 80 } },
        ],
      },
      {
        id: "uni1-3",
        title: `大学1年(${term}): 新しいつながり`,
        description:
          "新しいコミュニティに入るか、少人数を深めるか、自分時間を作るか。",
        choices: [
          { id: "uni1-3-a", label: "新コミュニティに参加する", effect: { liberal: 7, stress: -1 } },
          { id: "uni1-3-b", label: "少人数の関係を深める", effect: { study: 4, liberal: 4, stress: -2 } },
          { id: "uni1-3-c", label: "一人時間を優先する", effect: { stress: -4, science: 3, study: 2 } },
        ],
      },
    ],
    5: [
      {
        id: "uni2-0",
        title: `大学2年(${term}): 専門選択`,
        description: `今の傾向は「${suggestedText}」。ここで軸を決める。`,
        choices: [
          { id: "uni2-0-a", label: "研究寄りに専門を絞る", effect: { study: 8, science: 5, stress: 3 }, setCareerPath: "university" },
          { id: "uni2-0-b", label: "実装・制作寄りに進む", effect: { money: 280, science: 4, liberal: 5, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni2-0-c", label: "就活を見据えた分野に寄せる", effect: { money: 420, study: 2, stress: 2 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni2-1",
        title: `大学2年(${term}): 実践の場を選ぶ`,
        description:
          "研究室、制作チーム、長期インターン。どの現場にコミットするか。",
        choices: [
          { id: "uni2-1-a", label: "研究室で探究を深める", effect: { study: 7, science: 4, stress: 3 }, setCareerPath: "university" },
          { id: "uni2-1-b", label: "制作プロジェクトで成果物を作る", effect: { liberal: 4, science: 4, money: 260, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni2-1-c", label: "長期インターンに挑戦する", effect: { money: 380, liberal: 3, stress: 3 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni2-2",
        title: `大学2年(${term}): 中間見直し`,
        description:
          "方向性を強めるために、説明会・資格・業界研究のどれを進めるか。",
        choices: [
          { id: "uni2-2-a", label: "大学院・研究説明会に参加", effect: { study: 7, stress: 1 }, setCareerPath: "university" },
          { id: "uni2-2-b", label: "資格とポートフォリオを整える", effect: { science: 4, liberal: 5, money: 120 }, setCareerPath: "vocational" },
          { id: "uni2-2-c", label: "OB訪問と業界研究を進める", effect: { money: 240, liberal: 4, stress: 1 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni2-3",
        title: `大学2年(${term}): 成果の可視化`,
        description:
          "成果をどの形で残すか。学会発表・作品公開・選考実践。",
        choices: [
          { id: "uni2-3-a", label: "学会/研究会で発表する", effect: { study: 8, science: 4, stress: 3 }, setCareerPath: "university" },
          { id: "uni2-3-b", label: "作品を公開して評価を得る", effect: { liberal: 5, science: 3, money: 180, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni2-3-c", label: "面接練習で実戦を積む", effect: { money: 260, study: 3, stress: 2 }, setCareerPath: "employment" },
        ],
      },
    ],
    6: [
      {
        id: "uni3-0",
        title: `大学3年(${term}): 就活開始`,
        description:
          "進路を絞るか、広く見るか。最初の戦略を決める。",
        choices: [
          { id: "uni3-0-a", label: "研究/進学軸で準備する", effect: { study: 7, stress: 3, money: 120 }, setCareerPath: "university" },
          { id: "uni3-0-b", label: "実務ポジション中心で受ける", effect: { liberal: 4, science: 4, money: 220, stress: 3 }, setCareerPath: "vocational" },
          { id: "uni3-0-c", label: "企業就職を本命で進める", effect: { money: 360, study: 2, stress: 2 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni3-1",
        title: `大学3年(${term}): 書類と成果物`,
        description:
          "ES、研究計画、ポートフォリオ。見せ方を磨く段階。",
        choices: [
          { id: "uni3-1-a", label: "研究計画書を磨く", effect: { study: 8, science: 3, stress: 2 }, setCareerPath: "university" },
          { id: "uni3-1-b", label: "ポートフォリオを作り込む", effect: { liberal: 5, science: 4, money: 180, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni3-1-c", label: "ES・面接対策を徹底する", effect: { money: 220, study: 4, stress: 2 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni3-2",
        title: `大学3年(${term}): 面接・選考の連続`,
        description:
          "連戦のなかで、体力配分と改善サイクルを回せるか。",
        choices: [
          { id: "uni3-2-a", label: "少数精鋭で深く受ける", effect: { study: 6, stress: 4, money: 160 }, setCareerPath: "university" },
          { id: "uni3-2-b", label: "場数を踏んで比較する", effect: { liberal: 6, stress: 5, money: 220 }, setCareerPath: "vocational" },
          { id: "uni3-2-c", label: "休息を取りつつ継続する", effect: { stress: -5, study: 3, money: 100 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni3-3",
        title: `大学3年(${term}): 方針の再確定`,
        description:
          "内定、院試、専門就業。最終学年に向けて一本化する。",
        choices: [
          { id: "uni3-3-a", label: "院試・研究継続を本命にする", effect: { study: 8, science: 4, stress: 3 }, setCareerPath: "university" },
          { id: "uni3-3-b", label: "専門職採用を本命にする", effect: { liberal: 4, science: 5, money: 240, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni3-3-c", label: "企業就職を本命にする", effect: { money: 360, study: 3, stress: 2 }, setCareerPath: "employment" },
        ],
      },
    ],
    7: [
      {
        id: "uni4-0",
        title: `大学4年(${term}): 最終方針の比較`,
        description:
          "就職・挑戦・別ルートを比較し、納得できる判断軸を作る。",
        choices: [
          { id: "uni4-0-a", label: "研究継続の条件を整理する", effect: { study: 7, stress: 2, money: 80 }, setCareerPath: "university" },
          { id: "uni4-0-b", label: "専門職での成長環境を比較する", effect: { science: 4, liberal: 4, money: 180, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni4-0-c", label: "待遇と働き方で就職先を絞る", effect: { money: 320, study: 2, stress: 2 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni4-1",
        title: `大学4年(${term}): 最終準備`,
        description:
          "提出物、最終面談、卒業制作。最後の積み上げフェーズ。",
        choices: [
          { id: "uni4-1-a", label: "研究成果を論文化する", effect: { study: 8, science: 3, stress: 3 }, setCareerPath: "university" },
          { id: "uni4-1-b", label: "制作物を磨いて公開する", effect: { liberal: 5, science: 3, money: 180, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni4-1-c", label: "実務準備と研修学習を進める", effect: { money: 260, study: 4, stress: 2 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni4-2",
        title: `大学4年(${term}): 決断直前`,
        description:
          "最後に何を優先するかで、卒業後のスタート位置が変わる。",
        choices: [
          { id: "uni4-2-a", label: "探究を優先して進学準備", effect: { study: 9, stress: 3 }, setCareerPath: "university" },
          { id: "uni4-2-b", label: "実践経験を優先して現場へ", effect: { science: 4, liberal: 5, money: 220, stress: 2 }, setCareerPath: "vocational" },
          { id: "uni4-2-c", label: "安定を優先して就職準備", effect: { money: 340, study: 2, stress: 1 }, setCareerPath: "employment" },
        ],
      },
      {
        id: "uni4-3",
        title: `大学4年(${term}): 最終決定`,
        description:
          "7年間の積み重ねをもとに、卒業後の道を決める最終会話。",
        choices: [
          { id: "uni4-3-a", label: "研究を続ける道を選ぶ", effect: { study: 10, science: 6, stress: 4 }, setCareerPath: "university" },
          { id: "uni4-3-b", label: "専門を武器に現場へ出る", effect: { liberal: 7, science: 5, money: 260, stress: 3 }, setCareerPath: "vocational" },
          { id: "uni4-3-c", label: "企業就職でキャリアを始める", effect: { money: 760, study: 3, stress: 2 }, setCareerPath: "employment" },
        ],
      },
    ],
  };

  const safePhase = clamp(phase, 0, EVENTS_PER_YEAR - 1);
  const selectedEvents = yearEvents[year] ?? yearEvents[7];
  return selectedEvents[safePhase] ?? selectedEvents[0];
};

const buildYearGateChoices = (year: number): Choice[] => {
  const lockPath = year >= 5;

  return [
    {
      id: `gate-academic-${year}`,
      label: "蒼の扉: 探究を深める",
      effect: { study: 6, science: 5, stress: 2 },
      setCareerPath: lockPath ? "university" : undefined,
    },
    {
      id: `gate-social-${year}`,
      label: "紫の扉: 人とのつながりを広げる",
      effect: { liberal: 7, stress: -4, money: 120 },
      setCareerPath: lockPath ? "vocational" : undefined,
    },
    {
      id: `gate-practical-${year}`,
      label: "金の扉: 実践で未来をつかむ",
      effect: { money: 520, stress: 2, study: -2 },
      setCareerPath: lockPath ? "employment" : undefined,
    },
  ];
};

const formatCareerPath = (path: CareerPath | null): string => {
  if (!path) return "未決定";
  if (path === "university") return "大学院進学";
  if (path === "vocational") return "専門特化";
  return "就職直行";
};

const formatEffect = (effect: Partial<Status>) => {
  const labels: Array<keyof Status> = [
    "study",
    "stress",
    "money",
    "liberal",
    "science",
  ];

  return labels
    .filter((k) => (effect[k] ?? 0) !== 0)
    .map((k) => {
      const value = effect[k] as number;
      const jp =
        k === "study"
          ? "学力"
          : k === "stress"
            ? "ストレス"
            : k === "money"
              ? "所持金"
              : k === "liberal"
                ? "文系"
                : "理系";
      const sign = value >= 0 ? "+" : "";
      return `${jp}${sign}${value}`;
    })
    .join(" / ");
};

export default function Home() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [gameState, setGameState] = useState<GameState>("start");
  const [hasSaveData, setHasSaveData] = useState(false);
  const [year, setYear] = useState(1);
  const [yearPhase, setYearPhase] = useState(0);
  const [status, setStatus] = useState<Status>(INITIAL_STATUS);
  const [careerPath, setCareerPath] = useState<CareerPath | null>(null);
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [playerPos, setPlayerPos] = useState(START_POS);
  const [direction, setDirection] = useState<Direction>("down");
  const [heldDirection, setHeldDirection] = useState<Direction | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [frame, setFrame] = useState(0);
  const [systemMessage, setSystemMessage] = useState(
    "矢印キー or 画面ボタンで移動。NPCの隣で Enter or 会話ボタンでイベント開始。"
  );
  const [reincarnationCount, setReincarnationCount] = useState(0);
  const [carryBonus, setCarryBonus] = useState<Partial<Status>>({});
  const [yearGateOpen, setYearGateOpen] = useState(false);
  const [yearGateLabel, setYearGateLabel] = useState<number | null>(null);
  const [playerSheetMeta, setPlayerSheetMeta] = useState({
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    insetX: 0,
    insetY: 0,
    imageWidth: FRAME_SIZE * 3,
    imageHeight: FRAME_SIZE * 4,
    url: FALLBACK_SPRITE_SHEET,
  });

  const derivedCareerPath = useMemo(
    () => careerPath ?? decideCareerPath(status),
    [careerPath, status]
  );

  const playerScale = useMemo(
    () => 20 / Math.max(playerSheetMeta.frameWidth, 1),
    [playerSheetMeta.frameWidth]
  );
  const playerDrawWidth = Math.round(playerSheetMeta.frameWidth * playerScale);
  const playerDrawHeight = Math.round(playerSheetMeta.frameHeight * playerScale);
  const yearGateChoices = useMemo(
    () => buildYearGateChoices(yearGateLabel ?? year),
    [year, yearGateLabel]
  );
  const cameraX = useMemo(
    () =>
      clamp(
        playerPos.x - Math.floor(VIEW_WIDTH / 2),
        0,
        Math.max(0, MAP_WIDTH - VIEW_WIDTH)
      ),
    [playerPos.x]
  );
  const cameraY = useMemo(
    () =>
      clamp(
        playerPos.y - Math.floor(VIEW_HEIGHT / 2),
        0,
        Math.max(0, MAP_HEIGHT - VIEW_HEIGHT)
      ),
    [playerPos.y]
  );

  const getSpriteStyle = (spriteUrl: string, spriteDirection: Direction, spriteFrame: number) => ({
    width: `${playerDrawWidth}px`,
    height: `${playerDrawHeight}px`,
    // 透明ピクセルの下にフォールバック画像が見えるのを防ぐため、重ね描画しない
    backgroundImage: `url(${spriteUrl})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${playerSheetMeta.imageWidth * playerScale}px ${
      playerSheetMeta.imageHeight * playerScale
    }px`,
    backgroundPosition: `-${
      (playerSheetMeta.insetX + spriteFrame * playerSheetMeta.frameWidth) * playerScale
    }px -${
      (playerSheetMeta.insetY + DIRECTION_ROW[spriteDirection] * playerSheetMeta.frameHeight) *
      playerScale
    }px`,
    imageRendering: "pixelated" as const,
  });

  const startDialogWithAdjacentNpc = () => {
    if (gameState !== "explore" || yearGateOpen) return;

    const adjacentNpc = NPCS.find(
      (npc) =>
        Math.abs(playerPos.x - npc.pos.x) + Math.abs(playerPos.y - npc.pos.y) === 1
    );

    if (!adjacentNpc) {
      setSystemMessage("NPCの隣まで移動して Enter または会話ボタンを押してください。");
      return;
    }

    const eventData = buildNpcEvent(year, status, careerPath, yearPhase);
    setCurrentEvent(eventData);
    setGameState("dialog");
    setHeldDirection(null);
    setSystemMessage(`${adjacentNpc.name}との会話が始まった。選択肢をクリックして進行。`);
  };

  const startMoveByInput = (nextDirection: Direction) => {
    if (gameState !== "explore" || yearGateOpen) return;
    setHeldDirection(nextDirection);
    setDirection(nextDirection);
  };

  const stopMoveByInput = () => {
    setHeldDirection(null);
  };

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      // 画像全体を 3列 x 4行として等分し、固定インセットに依存しないスライスにする
      const frameWidth = img.width / 3;
      const frameHeight = img.height / 4;

      setPlayerSheetMeta({
        frameWidth: Math.max(1, frameWidth),
        frameHeight: Math.max(1, frameHeight),
        insetX: 0,
        insetY: 0,
        imageWidth: img.width,
        imageHeight: img.height,
        url: PLAYER_SPRITE_PATH,
      });
    };
    img.onerror = () => {
      setPlayerSheetMeta({
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
        insetX: 0,
        insetY: 0,
        imageWidth: FRAME_SIZE * 3,
        imageHeight: FRAME_SIZE * 4,
        url: FALLBACK_SPRITE_SHEET,
      });
    };
    img.src = PLAYER_SPRITE_PATH;
  }, []);

  useEffect(() => {
    try {
      const rebirthRaw = localStorage.getItem(REBIRTH_KEY);
      const rebirthData = rebirthRaw
        ? (JSON.parse(rebirthRaw) as RebirthPayload)
        : null;
      if (rebirthData) localStorage.removeItem(REBIRTH_KEY);

      const raw = localStorage.getItem(SAVE_KEY);
      setHasSaveData(Boolean(raw));
      if (!raw) {
        if (rebirthData) {
          const restartedStatus = applyStatusDelta(INITIAL_STATUS, rebirthData.bonus);
          setStatus(restartedStatus);
          setCarryBonus(rebirthData.bonus);
          setReincarnationCount(rebirthData.reincarnationCount);
          setSystemMessage("転生完了。ボーナスを得て新しい7年間が始まる。");
        }
        setGameState("start");
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as SaveData;
      setYear(clamp(parsed.year, 1, 7));
      setYearPhase(clamp(parsed.yearPhase ?? 0, 0, EVENTS_PER_YEAR - 1));
      setStatus(parsed.status);
      setCareerPath(parsed.careerPath);
      setLogs(parsed.logs ?? []);
      setPlayerPos(parsed.playerPos ?? START_POS);
      setDirection(parsed.direction ?? "down");
      setReincarnationCount(parsed.reincarnationCount ?? 0);
      setCarryBonus(parsed.carryBonus ?? {});
      setGameState("start");
      setCurrentEvent(null);
    } catch {
      setSystemMessage("セーブデータの読み込みに失敗したため、新規開始します。");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || gameState === "result" || gameState === "start") return;

    const payload: SaveData = {
      year,
      yearPhase,
      status,
      careerPath,
      logs,
      playerPos,
      direction,
      reincarnationCount,
      carryBonus,
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }, [
    careerPath,
    carryBonus,
    direction,
    gameState,
    hydrated,
    logs,
    playerPos,
    reincarnationCount,
    status,
    year,
    yearPhase,
  ]);

  const startPlay = () => {
    setGameState("explore");
    setCurrentEvent(null);
    setYearGateOpen(false);
    setYearGateLabel(null);
    setHeldDirection(null);
    setSystemMessage("探索開始。NPCの隣で会話して物語を進めよう。");
  };

  const startFromBeginning = () => {
    const restartedStatus = applyStatusDelta(INITIAL_STATUS, carryBonus);
    setYear(1);
    setYearPhase(0);
    setStatus(restartedStatus);
    setCareerPath(null);
    setLogs([]);
    setPlayerPos(START_POS);
    setDirection("down");
    setCurrentEvent(null);
    setYearGateOpen(false);
    setYearGateLabel(null);
    setHeldDirection(null);
    localStorage.removeItem(SAVE_KEY);
    setHasSaveData(false);
    setGameState("explore");
    setSystemMessage("新しい物語を開始。NPCの隣で会話して進めよう。");
  };

  // キー入力: 方向キーで移動、EnterでNPC会話
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (yearGateOpen) return;

      if (event.key === "Enter" && gameState === "explore") {
        event.preventDefault();
        const adjacentNpc = NPCS.find(
          (npc) =>
            Math.abs(playerPos.x - npc.pos.x) + Math.abs(playerPos.y - npc.pos.y) ===
            1
        );

        if (!adjacentNpc) {
          setSystemMessage("NPCの隣まで移動して Enter または会話ボタンを押してください。");
          return;
        }

        const eventData = buildNpcEvent(year, status, careerPath, yearPhase);
        setCurrentEvent(eventData);
        setGameState("dialog");
        setHeldDirection(null);
        setSystemMessage(
          `${adjacentNpc.name}との会話が始まった。選択肢をクリックして進行。`
        );
        return;
      }

      const nextDirection = keyToDirection(event.key);
      if (!nextDirection || gameState !== "explore") return;

      event.preventDefault();
      setHeldDirection(nextDirection);
      setDirection(nextDirection);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const released = keyToDirection(event.key);
      if (!released) return;
      setHeldDirection((prev) => (prev === released ? null : prev));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [careerPath, gameState, playerPos, status, year, yearGateOpen, yearPhase]);

  // 押しっぱなし時の連続移動
  useEffect(() => {
    if (gameState !== "explore" || !heldDirection || yearGateOpen) return;

    const step = () => {
      setPlayerPos((prev) => {
        const next = { ...prev };

        if (heldDirection === "up") next.y -= 1;
        if (heldDirection === "right") next.x += 1;
        if (heldDirection === "down") next.y += 1;
        if (heldDirection === "left") next.x -= 1;

        next.x = clamp(next.x, 0, MAP_WIDTH - 1);
        next.y = clamp(next.y, 0, MAP_HEIGHT - 1);

        if (next.x === prev.x && next.y === prev.y) return prev;
        if (NPCS.some((npc) => npc.pos.x === next.x && npc.pos.y === next.y)) {
          return prev;
        }
        return next;
      });
    };

    step();
    const interval = window.setInterval(step, 120);
    return () => window.clearInterval(interval);
  }, [gameState, heldDirection, yearGateOpen]);

  useEffect(() => {
    setIsMoving(gameState === "explore" && heldDirection !== null && !yearGateOpen);
    if (heldDirection === null) setFrame(0);
  }, [gameState, heldDirection, yearGateOpen]);

  // 移動中のみ 0.15秒ごとにフレーム切替
  useEffect(() => {
    if (!isMoving) return;
    const interval = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % 3);
    }, 150);
    return () => window.clearInterval(interval);
  }, [isMoving]);

  const processChoice = (choice: Choice) => {
    if (!currentEvent) return;

    const nextStatus = applyStatusDelta(status, choice.effect);
    const nextCareer =
      choice.setCareerPath ?? careerPath ?? decideCareerPath(nextStatus);
    const nextLogs: LogEntry[] = [
      ...logs,
      {
        year,
        eventTitle: currentEvent.title,
        choiceLabel: choice.label,
        effect: choice.effect,
        careerAfterChoice: nextCareer,
      },
    ];
    const nextPhase = yearPhase + 1;
    const completesYear = nextPhase >= EVENTS_PER_YEAR;
    const nextYear = completesYear ? year + 1 : year;

    setStatus(nextStatus);
    setCareerPath(nextCareer);
    setLogs(nextLogs);

    if (completesYear && nextYear > 7) {
      localStorage.setItem(
        RESULT_KEY,
        JSON.stringify({
          status: nextStatus,
          careerPath: nextCareer,
          logs: nextLogs,
          reincarnationCount,
        })
      );
      localStorage.removeItem(SAVE_KEY);
      router.push("/result");
      return;
    }

    setYear(nextYear);
    setYearPhase(completesYear ? 0 : nextPhase);
    setCurrentEvent(null);
    setGameState("explore");
    setHeldDirection(null);
    if (completesYear) {
      setYearGateOpen(true);
      setYearGateLabel(nextYear);
      setSystemMessage(`Year ${nextYear}: 進路の部屋が開いた。`);
    } else {
      const nextLabel = PHASE_LABELS[nextPhase] ?? `第${nextPhase + 1}会話`;
      setSystemMessage(
        `Year ${year} ${nextLabel}へ。引き続きNPCと会話して1年を進めよう。`
      );
    }
  };

  const processYearGateChoice = (choice: Choice) => {
    const targetYear = yearGateLabel ?? year;
    const nextStatus = applyStatusDelta(status, choice.effect);
    const nextCareer =
      choice.setCareerPath ?? careerPath ?? decideCareerPath(nextStatus);

    setStatus(nextStatus);
    setCareerPath(nextCareer);
    setLogs((prev) => [
      ...prev,
      {
        year: targetYear,
        eventTitle: `Year ${targetYear} 進路の部屋`,
        choiceLabel: choice.label,
        effect: choice.effect,
        careerAfterChoice: nextCareer,
      },
    ]);

    setYearGateOpen(false);
    setYearGateLabel(null);
    setSystemMessage(
      `Year ${targetYear}: 進路の部屋で「${choice.label}」を選んだ。`
    );
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 to-emerald-100 text-slate-800">
        <p className="text-sm text-slate-700">ロード中...</p>
      </main>
    );
  }

  if (gameState === "start") {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 via-sky-50 to-emerald-100 px-4 py-6 text-slate-800"
        style={{ fontFamily: "Yu Gothic UI, Segoe UI, sans-serif" }}
      >
        <div className="w-full max-w-2xl rounded-2xl border border-sky-200 bg-white/90 p-5 shadow-xl md:p-8">
          <p className="text-xs text-indigo-700 md:text-sm">シミュレーション × ノベル × マップ移動</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
            7年間進路シミュレーション
          </h1>
          <p className="mt-3 text-sm text-slate-700 md:text-base">
            高校1年から大学4年までの選択を重ね、進路と職業を決めよう。
          </p>
          <p className="mt-2 text-xs text-slate-600 md:text-sm">
            操作: 矢印キーまたは画面ボタンで移動 / Enterまたは会話ボタンでイベント開始
          </p>

          <div className="mt-5 flex flex-col gap-2 md:flex-row">
            <button
              onClick={startPlay}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300 md:text-base"
            >
              {hasSaveData ? "つづきから始める" : "ゲームを始める"}
            </button>
            {hasSaveData && (
              <button
                onClick={startFromBeginning}
                className="rounded-lg border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-50 md:text-base"
              >
                最初から始める
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-amber-50 via-sky-50 to-emerald-100 px-3 py-4 text-slate-800 md:px-6 md:py-6"
      style={{ fontFamily: "Yu Gothic UI, Segoe UI, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="rounded-xl border border-sky-200 bg-white/75 p-3 shadow-sm md:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm md:text-base">
            <span className="rounded bg-cyan-200 px-2 py-1 font-semibold text-cyan-900">
              Year {year} / 7
            </span>
            <span className="rounded bg-indigo-200 px-2 py-1 font-semibold text-indigo-900">
              進路: {formatCareerPath(derivedCareerPath)}
            </span>
            <span className="rounded bg-amber-100 px-2 py-1 text-amber-900">
              転生回数: {reincarnationCount}
            </span>
            <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-900">
              {PHASE_LABELS[yearPhase] ?? `第${yearPhase + 1}会話`}
            </span>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2 md:grid-cols-5 md:text-sm">
            <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1">
              学力: {status.study}
            </div>
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1">
              ストレス: {status.stress}
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1">
              所持金: ¥{status.money}
            </div>
            <div className="rounded border border-fuchsia-200 bg-fuchsia-50 px-2 py-1">
              文系: {status.liberal}
            </div>
            <div className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1">
              理系: {status.science}
            </div>
          </div>

          {Object.keys(carryBonus).length > 0 && (
            <p className="mt-2 text-xs text-emerald-700 md:text-sm">
              転生ボーナス適用中: {formatEffect(carryBonus)}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-sky-200 bg-white/75 p-3 shadow-sm md:p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-600 md:text-sm">
            <p>マップ移動: 矢印キー or 画面ボタン / 会話開始: Enter or 会話ボタン</p>
            <p>
              表示範囲: X {cameraX}〜{cameraX + VIEW_WIDTH - 1} / Y {cameraY}〜
              {cameraY + VIEW_HEIGHT - 1}
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <div
              className="relative mx-auto overflow-hidden rounded-lg border border-sky-300 shadow-sm"
              style={{
                width: `${VIEW_WIDTH * TILE_SIZE}px`,
                height: `${VIEW_HEIGHT * TILE_SIZE}px`,
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(rgba(255,255,255,0.22), rgba(255,255,255,0.28)), url(${SCHOOL_BACKGROUND_PATH})`,
                  backgroundSize: `${MAP_WIDTH * TILE_SIZE}px ${MAP_HEIGHT * TILE_SIZE}px`,
                  backgroundPosition: `-${cameraX * TILE_SIZE}px -${cameraY * TILE_SIZE}px`,
                }}
              />

              <div
                className="relative z-10 grid"
                style={{
                  gridTemplateColumns: `repeat(${VIEW_WIDTH}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(${VIEW_HEIGHT}, ${TILE_SIZE}px)`,
                }}
              >
                {Array.from({ length: VIEW_HEIGHT }).map((_, vy) =>
                  Array.from({ length: VIEW_WIDTH }).map((__, vx) => {
                    const x = cameraX + vx;
                    const y = cameraY + vy;
                    const isPlayer = playerPos.x === x && playerPos.y === y;
                    const npcOnTile = NPCS.find(
                      (npc) => npc.pos.x === x && npc.pos.y === y
                    );
                    return (
                      <div
                        key={`${x}-${y}`}
                        className="relative"
                        style={{ width: `${TILE_SIZE}px`, height: `${TILE_SIZE}px` }}
                      >
                        {npcOnTile && (
                          <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm"
                            style={{
                              ...getSpriteStyle(
                                npcOnTile.sprite,
                                npcOnTile.direction,
                                1
                              ),
                              boxShadow: "0 0 0 1px rgba(253,224,71,0.45)",
                            }}
                          />
                        )}

                        {isPlayer && (
                          <div
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm"
                            style={{
                              ...getSpriteStyle(playerSheetMeta.url, direction, frame),
                              boxShadow: "0 0 0 1px rgba(148,163,184,0.35)",
                            }}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>

          <div className="mt-3 flex items-end justify-center gap-3 md:hidden">
            <div className="grid grid-cols-3 grid-rows-3 gap-1">
              <div />
              <button
                className="h-11 w-11 rounded-md border border-sky-300 bg-sky-100 text-lg font-bold text-sky-900 active:bg-sky-200"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startMoveByInput("up");
                }}
                onPointerUp={stopMoveByInput}
                onPointerCancel={stopMoveByInput}
                onPointerLeave={stopMoveByInput}
              >
                ↑
              </button>
              <div />
              <button
                className="h-11 w-11 rounded-md border border-sky-300 bg-sky-100 text-lg font-bold text-sky-900 active:bg-sky-200"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startMoveByInput("left");
                }}
                onPointerUp={stopMoveByInput}
                onPointerCancel={stopMoveByInput}
                onPointerLeave={stopMoveByInput}
              >
                ←
              </button>
              <div className="h-11 w-11 rounded-md border border-sky-100 bg-sky-50/70" />
              <button
                className="h-11 w-11 rounded-md border border-sky-300 bg-sky-100 text-lg font-bold text-sky-900 active:bg-sky-200"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startMoveByInput("right");
                }}
                onPointerUp={stopMoveByInput}
                onPointerCancel={stopMoveByInput}
                onPointerLeave={stopMoveByInput}
              >
                →
              </button>
              <div />
              <button
                className="h-11 w-11 rounded-md border border-sky-300 bg-sky-100 text-lg font-bold text-sky-900 active:bg-sky-200"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startMoveByInput("down");
                }}
                onPointerUp={stopMoveByInput}
                onPointerCancel={stopMoveByInput}
                onPointerLeave={stopMoveByInput}
              >
                ↓
              </button>
              <div />
            </div>

            <button
              className="h-11 rounded-md border border-fuchsia-300 bg-fuchsia-100 px-4 text-sm font-semibold text-fuchsia-900 active:bg-fuchsia-200"
              style={{ touchAction: "none" }}
              onClick={startDialogWithAdjacentNpc}
              disabled={gameState !== "explore" || yearGateOpen}
            >
              会話
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-white/75 p-3 shadow-sm md:p-4">
          {gameState === "explore" && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold md:text-base">探索フェーズ</h2>
              <p className="text-xs text-slate-700 md:text-sm">{systemMessage}</p>
              <p className="text-xs text-slate-500 md:text-sm">
                1年は4会話で進行。年替わりで進路の部屋が開きます。
              </p>
            </div>
          )}

          {gameState === "dialog" && currentEvent && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold md:text-lg">{currentEvent.title}</h2>
              <p className="text-sm text-slate-700">{currentEvent.description}</p>
              <div className="grid gap-2">
                {currentEvent.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => processChoice(choice)}
                    className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm transition hover:border-cyan-400 hover:bg-cyan-50"
                  >
                    <div className="font-semibold">{choice.label}</div>
                    <div className="text-xs text-slate-600">
                      変化: {formatEffect(choice.effect)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </section>
        {yearGateOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{
              backgroundImage: `url(${MYSTIC_BACKGROUND_PATH})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-slate-900/58 backdrop-blur-[1px]" />
            <div className="relative flex min-h-screen items-center justify-center px-4 py-6">
              <div className="w-full max-w-3xl rounded-2xl border border-fuchsia-200 bg-white/93 p-4 text-center shadow-2xl md:p-6">
                <p className="text-xl font-bold text-slate-900 md:text-2xl">
                  Year {yearGateLabel} 進路の部屋が開いた
                </p>
                <p className="mt-2 text-sm text-slate-700 md:text-base">
                  この年の選択が、未来の職業をさらに形づくる。
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {yearGateChoices.map((choice) => (
                    <button
                      key={choice.id}
                      onClick={() => processYearGateChoice(choice)}
                      className="rounded-lg border border-fuchsia-200 bg-white px-3 py-3 text-left text-sm text-slate-900 transition hover:bg-fuchsia-50"
                    >
                      <div className="font-semibold">{choice.label}</div>
                      <div className="mt-1 text-xs text-fuchsia-700">
                        変化: {formatEffect(choice.effect)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

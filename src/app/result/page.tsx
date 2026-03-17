"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

type CareerPath = "university" | "vocational" | "employment";

type Status = {
  study: number;
  stress: number;
  money: number;
  liberal: number;
  science: number;
};

type LogEntry = {
  year: number;
  eventTitle: string;
  choiceLabel: string;
  effect: Partial<Status>;
  careerAfterChoice: CareerPath;
};

type ResultPayload = {
  status: Status;
  careerPath: CareerPath;
  logs: LogEntry[];
  reincarnationCount: number;
};

type RebirthPayload = {
  bonus: Partial<Status>;
  reincarnationCount: number;
};

const RESULT_KEY = "career-map-result-v1";
const REBIRTH_KEY = "career-map-rebirth-v1";
const SAVE_KEY = "career-map-prototype-v1";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatCareerPath = (path: CareerPath): string => {
  if (path === "university") return "大学院進学";
  if (path === "vocational") return "専門特化";
  return "就職直行";
};

const decideOccupation = (status: Status): string => {
  if (status.science >= 75) return "エンジニア";
  if (status.liberal >= 75) return "マーケター";
  if (status.study >= 82) return "研究者";
  if (status.money >= 2200) return "ビジネス";

  const weighted = [
    { job: "エンジニア", value: status.science },
    { job: "マーケター", value: status.liberal },
    { job: "研究者", value: status.study },
    { job: "ビジネス", value: Math.round(status.money / 15) },
  ].sort((a, b) => b.value - a.value);

  return weighted[0].job;
};

const CAREER_DETAILS: Record<CareerPath, { learn: string[]; need: string[] }> = {
  university: {
    learn: ["研究設計", "論理的思考", "専門理論", "データ解析"],
    need: ["継続的な学習習慣", "課題設定力", "メンタル管理", "指導教員との連携"],
  },
  vocational: {
    learn: ["実務スキル", "制作/開発プロセス", "現場コミュニケーション", "ポートフォリオ構築"],
    need: ["アウトプット量", "振り返り習慣", "トレンド把握", "実践経験"],
  },
  employment: {
    learn: ["業界研究", "面接/ES対策", "ビジネスマナー", "チーム協働"],
    need: ["期限管理", "自己分析", "比較検討力", "体調管理"],
  },
};

const OCCUPATION_DETAILS: Record<string, { learn: string[]; need: string[] }> = {
  エンジニア: {
    learn: ["アルゴリズム", "設計", "実装", "テスト"],
    need: ["論理性", "問題分解力", "継続的改善", "基礎数学"],
  },
  マーケター: {
    learn: ["市場分析", "企画設計", "コミュニケーション", "検証運用"],
    need: ["観察力", "言語化力", "仮説思考", "共感力"],
  },
  研究者: {
    learn: ["先行研究調査", "実験計画", "論文読解/執筆", "統計"],
    need: ["探究心", "粘り強さ", "再現性意識", "批判的思考"],
  },
  ビジネス: {
    learn: ["財務感覚", "提案力", "交渉", "事業設計"],
    need: ["意思決定力", "数値感覚", "責任感", "対人調整力"],
  },
};

const RIASEC_TRAITS: Record<
  "R" | "I" | "A" | "S" | "E" | "C",
  { title: string; detail: string }
> = {
  R: {
    title: "実践派",
    detail: "手を動かして形にするのが得意。技術や現場感覚で価値を出すタイプ。",
  },
  I: {
    title: "探究派",
    detail: "理論や原因を掘るのが得意。学習と検証を積み上げて成長するタイプ。",
  },
  A: {
    title: "表現派",
    detail: "発想力と言語化が強み。企画・編集・伝達で力を発揮するタイプ。",
  },
  S: {
    title: "支援派",
    detail: "人の気持ちを汲み取り、協力関係を作るのが得意なタイプ。",
  },
  E: {
    title: "推進派",
    detail: "目標達成に向けて周囲を動かすのが得意。実行力と交渉力が強み。",
  },
  C: {
    title: "安定運用派",
    detail: "計画・管理・再現性を重視。仕組み化して成果を安定させるタイプ。",
  },
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

const buildRebirthBonus = (status: Status, path: CareerPath): Partial<Status> => {
  const bonus: Partial<Status> = {};

  if (status.science >= 70) bonus.science = (bonus.science ?? 0) + 5;
  if (status.liberal >= 70) bonus.liberal = (bonus.liberal ?? 0) + 5;
  if (status.stress >= 70) bonus.stress = (bonus.stress ?? 0) - 5;
  if (status.money <= 900) bonus.money = (bonus.money ?? 0) + 500;

  // 進路ボーナス
  if (path === "university") {
    bonus.study = (bonus.study ?? 0) + 5;
  } else if (path === "vocational") {
    bonus.science = (bonus.science ?? 0) + 3;
    bonus.liberal = (bonus.liberal ?? 0) + 3;
  } else {
    bonus.money = (bonus.money ?? 0) + 300;
  }

  return bonus;
};

export default function ResultPage() {
  const router = useRouter();
  const [activeLogTab, setActiveLogTab] = useState<"all" | number>("all");
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const payload = useMemo(() => {
    if (!hydrated) return null;
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ResultPayload;
    } catch {
      return null;
    }
  }, [hydrated]);

  const riasec = useMemo(() => {
    if (!payload) return null;

    const score = {
      R: payload.status.science,
      I: payload.status.study,
      A: payload.status.liberal,
      S: 100 - payload.status.stress,
      E: payload.status.money,
      C: payload.status.study + (100 - payload.status.stress),
    };

    const normalized = {
      R: clamp(score.R, 0, 100),
      I: clamp(score.I, 0, 100),
      A: clamp(score.A, 0, 100),
      S: clamp(score.S, 0, 100),
      E: clamp(score.E / 30, 0, 100),
      C: clamp(score.C / 2, 0, 100),
    };

    const top2 = Object.entries(score)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    return { score, normalized, top2 };
  }, [payload]);

  const occupation = useMemo(
    () => (payload ? decideOccupation(payload.status) : ""),
    [payload]
  );

  const personality = useMemo(() => {
    if (!riasec) return null;
    const first = riasec.top2[0][0] as keyof typeof RIASEC_TRAITS;
    const second = riasec.top2[1][0] as keyof typeof RIASEC_TRAITS;
    const firstTrait = RIASEC_TRAITS[first];
    const secondTrait = RIASEC_TRAITS[second];

    return {
      typeName: `${first}${second}タイプ`,
      summary: `${firstTrait.title} × ${secondTrait.title}`,
      detail: `${firstTrait.detail} ${secondTrait.detail}`,
    };
  }, [riasec]);

  const yearTabs = useMemo(() => {
    if (!payload) return [];
    return Array.from(new Set(payload.logs.map((log) => log.year))).sort(
      (a, b) => a - b
    );
  }, [payload]);

  const visibleLogs = useMemo(() => {
    if (!payload) return [];
    if (activeLogTab === "all") return payload.logs;
    return payload.logs.filter((entry) => entry.year === activeLogTab);
  }, [activeLogTab, payload]);

  const radar = useMemo(() => {
    if (!riasec) return null;

    const labels = ["R", "I", "A", "S", "E", "C"] as const;
    const center = 150;
    const radius = 110;

    const axisPoints = labels.map((label, idx) => {
      const angle = -Math.PI / 2 + (idx * Math.PI * 2) / labels.length;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      return { label, angle, x, y };
    });

    const polygon = axisPoints
      .map((p) => {
        const value = riasec.normalized[p.label] / 100;
        const x = center + Math.cos(p.angle) * radius * value;
        const y = center + Math.sin(p.angle) * radius * value;
        return `${x},${y}`;
      })
      .join(" ");

    const rings = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) =>
      axisPoints
        .map((p) => `${center + Math.cos(p.angle) * radius * ratio},${center + Math.sin(p.angle) * radius * ratio}`)
        .join(" ")
    );

    return { labels, center, axisPoints, polygon, rings };
  }, [riasec]);

  const handleReincarnate = () => {
    if (!payload) {
      router.push("/");
      return;
    }

    const bonus = buildRebirthBonus(payload.status, payload.careerPath);
    const rebirthData: RebirthPayload = {
      bonus,
      reincarnationCount: payload.reincarnationCount + 1,
    };

    localStorage.setItem(REBIRTH_KEY, JSON.stringify(rebirthData));
    localStorage.removeItem(RESULT_KEY);
    localStorage.removeItem(SAVE_KEY);
    router.push("/");
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 to-emerald-100 text-slate-800">
        <p className="text-sm text-slate-700">ロード中...</p>
      </main>
    );
  }

  if (!payload || !riasec || !radar) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 to-emerald-100 px-4 text-slate-800">
        <div className="w-full max-w-lg rounded-xl border border-sky-200 bg-white/80 p-4 text-center shadow-sm">
          <p className="text-sm">結果データが見つかりません。</p>
          <button
            onClick={() => router.push("/")}
            className="mt-3 rounded-md bg-cyan-200 px-4 py-2 text-sm font-semibold text-cyan-900"
          >
            トップに戻る
          </button>
        </div>
      </main>
    );
  }

  const pathDetail = CAREER_DETAILS[payload.careerPath];
  const occupationDetail = OCCUPATION_DETAILS[occupation] ?? {
    learn: ["基礎知識", "実践経験", "振り返り"],
    need: ["継続力", "自己理解", "改善意識"],
  };

  return (
    <main
      className="min-h-screen bg-gradient-to-b from-amber-50 via-sky-50 to-emerald-100 px-3 py-4 text-slate-800 md:px-6 md:py-6"
      style={{ fontFamily: "Yu Gothic UI, Segoe UI, sans-serif" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <section className="rounded-xl border border-sky-200 bg-white/80 p-4 shadow-sm">
          <h1 className="text-lg font-bold md:text-xl">エンディング結果</h1>
          <p className="mt-1 text-xs text-slate-600 md:text-sm">
            あなたの7年間の選択から導かれた進路・職業・RAISECプロファイル
          </p>

          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
              進路: {formatCareerPath(payload.careerPath)}
            </div>
            <div className="rounded border border-cyan-200 bg-cyan-50 p-2">
              職業: {occupation}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-white/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold md:text-base">RAISEC 六角形グラフ</h2>
          <p className="mt-1 text-xs text-slate-600">
            グラフは0〜100換算で可視化（Eは所持金/30、Cは(学力+安定性)/2）。
          </p>

          <div className="mt-3 flex flex-col items-center gap-3 lg:flex-row lg:items-start lg:justify-between">
            <svg viewBox="0 0 300 300" className="h-72 w-72">
              {radar.rings.map((ring, idx) => (
                <polygon
                  key={`ring-${idx}`}
                  points={ring}
                  fill="none"
                  stroke="rgba(71,85,105,0.25)"
                  strokeWidth="1"
                />
              ))}

              {radar.axisPoints.map((p) => (
                <line
                  key={`axis-${p.label}`}
                  x1={radar.center}
                  y1={radar.center}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(71,85,105,0.4)"
                  strokeWidth="1"
                />
              ))}

              <polygon
                points={radar.polygon}
                fill="rgba(14,165,233,0.28)"
                stroke="rgba(2,132,199,0.9)"
                strokeWidth="2"
              />

              {radar.axisPoints.map((p) => {
                const lx = radar.center + Math.cos(p.angle) * 128;
                const ly = radar.center + Math.sin(p.angle) * 128;
                return (
                  <text
                    key={`label-${p.label}`}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fill="#1e293b"
                  >
                    {p.label}
                  </text>
                );
              })}
            </svg>

            <div className="w-full max-w-sm space-y-2 text-sm">
              <div className="rounded border border-slate-200 bg-slate-50 p-2">
                R={riasec.score.R} / I={riasec.score.I} / A={riasec.score.A}
                <br />
                S={riasec.score.S} / E={riasec.score.E} / C={riasec.score.C}
              </div>
              <div className="rounded border border-fuchsia-200 bg-fuchsia-50 p-2">
                上位2要素: {riasec.top2[0][0]}({riasec.top2[0][1]}), {riasec.top2[1][0]}(
                {riasec.top2[1][1]})
              </div>
            </div>
          </div>

          {personality && (
            <div className="mt-3 rounded border border-violet-200 bg-violet-50 p-3 text-sm">
              <div className="font-semibold">
                あなたの傾向: {personality.typeName}（{personality.summary}）
              </div>
              <div className="mt-1 text-slate-700">{personality.detail}</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-sky-200 bg-white/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold md:text-base">進路・職業の詳細</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded border border-indigo-200 bg-indigo-50 p-3 text-sm">
              <div className="font-semibold">進路で学ぶこと</div>
              <div className="mt-1">{pathDetail.learn.join(" / ")}</div>
              <div className="mt-2 font-semibold">必要なこと</div>
              <div className="mt-1">{pathDetail.need.join(" / ")}</div>
            </div>
            <div className="rounded border border-cyan-200 bg-cyan-50 p-3 text-sm">
              <div className="font-semibold">職種で学ぶこと</div>
              <div className="mt-1">{occupationDetail.learn.join(" / ")}</div>
              <div className="mt-2 font-semibold">必要なこと</div>
              <div className="mt-1">{occupationDetail.need.join(" / ")}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-sky-200 bg-white/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold md:text-base">選択ログ</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs md:text-sm">
            <button
              onClick={() => setActiveLogTab("all")}
              className={`rounded-full px-3 py-1 transition ${
                activeLogTab === "all"
                  ? "bg-sky-300 text-sky-950"
                  : "bg-sky-100 text-sky-900 hover:bg-sky-200"
              }`}
            >
              全年
            </button>
            {yearTabs.map((yearTab) => (
              <button
                key={`tab-${yearTab}`}
                onClick={() => setActiveLogTab(yearTab)}
                className={`rounded-full px-3 py-1 transition ${
                  activeLogTab === yearTab
                    ? "bg-indigo-300 text-indigo-950"
                    : "bg-indigo-100 text-indigo-900 hover:bg-indigo-200"
                }`}
              >
                Year {yearTab}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto text-xs md:text-sm">
            {visibleLogs.map((entry, index) => (
              <div
                key={`${entry.eventTitle}-${index}`}
                className="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <div>
                  Year {entry.year}: {entry.eventTitle}
                </div>
                <div>選択: {entry.choiceLabel}</div>
                <div>効果: {formatEffect(entry.effect)}</div>
                <div>進路傾向: {formatCareerPath(entry.careerAfterChoice)}</div>
              </div>
            ))}
            {visibleLogs.length === 0 && (
              <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-600">
                この年のログはまだありません。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-emerald-800 md:text-base">転生システム</h2>
          <p className="mt-1 text-xs text-emerald-900 md:text-sm">
            現在の結果に応じたボーナスを引き継いで、新しい7年間を開始します。
          </p>
          <button
            onClick={handleReincarnate}
            className="mt-3 rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
          >
            転生してもう一度プレイする
          </button>
        </section>
      </div>
    </main>
  );
}

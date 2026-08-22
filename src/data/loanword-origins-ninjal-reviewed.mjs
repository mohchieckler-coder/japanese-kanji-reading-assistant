// Independently reviewed, high-frequency terms selected from the National
// Institute for Japanese Language and Linguistics (NINJAL) "loanword
// paraphrase" list. This is intentionally a selective runtime layer rather
// than a copy of the source table: wasei-eigo, ambiguous homographs, proper
// names, and entries already covered by the pinned JMdict layer are omitted.

export const NINJAL_LOANWORD_SOURCE = Object.freeze({
  id: "ninjal-gairaigo-1-4",
  publisher: "National Institute for Japanese Language and Linguistics (NINJAL)",
  title: "提案した語の一覧（第1回～第4回 総集編）",
  url: "https://www2.ninjal.ac.jp/gairaigo/Teian1_4/iikaego.html",
  sourceUpdatedAt: "2006-03-13",
  reviewedAt: "2026-08-22",
  evidence: "katakana spelling, source form, and explicitly named non-English donor language"
});

const SOURCE_EVIDENCE = Object.freeze({ sourceId: NINJAL_LOANWORD_SOURCE.id });

function reviewed(id, language, origin, surfaces) {
  return Object.freeze([
    `ninjal-${id}`,
    language,
    origin,
    Object.freeze([...surfaces]),
    SOURCE_EVIDENCE
  ]);
}

export const NINJAL_REVIEWED_LOANWORD_DEFINITIONS = Object.freeze([
  reviewed("en-accountability", "en", "accountability", ["アカウンタビリティー"]),
  reviewed("en-accessibility", "en", "accessibility", ["アクセシビリティー"]),
  reviewed("en-agenda", "en", "agenda", ["アジェンダ"]),
  reviewed("en-assessment", "en", "assessment", ["アセスメント"]),
  reviewed("en-initiative", "en", "initiative", ["イニシアチブ"]),
  reviewed("en-incubation", "en", "incubation", ["インキュベーション"]),
  reviewed("en-incentive", "en", "incentive", ["インセンティブ"]),
  reviewed("en-internship", "en", "internship", ["インターンシップ"]),
  reviewed("en-interactive", "en", "interactive", ["インタラクティブ"]),
  reviewed("en-impact", "en", "impact", ["インパクト"]),
  reviewed("en-informed-consent", "en", "informed consent", ["インフォームドコンセント"]),
  reviewed("en-empowerment", "en", "empowerment", ["エンパワーメント"]),
  reviewed("en-enforcement", "en", "enforcement", ["エンフォースメント"]),
  reviewed("en-ownership", "en", "ownership", ["オーナーシップ"]),
  reviewed("en-observer", "en", "observer", ["オブザーバー"]),
  reviewed("en-on-demand", "en", "on demand", ["オンデマンド"]),
  reviewed("en-governance", "en", "governance", ["ガバナンス"]),
  reviewed("en-capital-gain", "en", "capital gain", ["キャピタルゲイン"]),
  reviewed("en-grand-design", "en", "grand design", ["グランドデザイン"]),
  reviewed("en-globalization", "en", "globalization", ["グローバリゼーション"]),
  reviewed("en-commitment", "en", "commitment", ["コミットメント"]),
  reviewed("fr-communique", "fr", "communiqué", ["コミュニケ"]),
  reviewed("en-consensus", "en", "consensus", ["コンセンサス"]),
  reviewed("en-consortium", "en", "consortium", ["コンソーシアム"]),
  reviewed("en-compliance", "en", "compliance", ["コンプライアンス"]),
  reviewed("en-surveillance", "en", "surveillance", ["サーベイランス"]),
  reviewed("en-think-tank", "en", "think tank", ["シンクタンク"]),
  reviewed("en-screening", "en", "screening", ["スクリーニング"]),
  reviewed("en-stereotype", "en", "stereotype", ["ステレオタイプ"]),
  reviewed("en-safeguard", "en", "safeguard", ["セーフガード"]),
  reviewed("en-safety-net", "en", "safety net", ["セーフティーネット"]),
  reviewed("en-second-opinion", "en", "second opinion", ["セカンドオピニオン"]),
  reviewed("en-soft-landing", "en", "soft landing", ["ソフトランディング"]),
  reviewed("en-time-lag", "en", "time lag", ["タイムラグ"]),
  reviewed("en-task-force", "en", "task force", ["タスクフォース"]),
  reviewed("en-dumping", "en", "dumping", ["ダンピング"]),
  reviewed("en-digital-divide", "en", "digital divide", ["デジタルデバイド"]),
  reviewed("en-deposit", "en", "deposit", ["デポジット"]),
  reviewed("en-doctrine", "en", "doctrine", ["ドクトリン"]),
  reviewed("en-donor", "en", "donor", ["ドナー"]),
  reviewed("de-trauma", "de", "Trauma", ["トラウマ"]),
  reviewed("en-traceability", "en", "traceability", ["トレーサビリティー"]),
  reviewed("en-nanotechnology", "en", "nanotechnology", ["ナノテクノロジー"]),
  reviewed("en-neglect", "en", "neglect", ["ネグレクト"]),
  reviewed("en-normalization", "en", "normalization", ["ノーマライゼーション"]),
  reviewed("en-partnership", "en", "partnership", ["パートナーシップ"]),
  reviewed("en-harmonization", "en", "harmonization", ["ハーモナイゼーション"]),
  reviewed("en-biotechnology", "en", "biotechnology", ["バイオテクノロジー"]),
  reviewed("en-biomass", "en", "biomass", ["バイオマス"]),
  reviewed("en-hazard-map", "en", "hazard map", ["ハザードマップ"]),
  reviewed("en-public-comment", "en", "public comment", ["パブリックコメント"]),
  reviewed("en-barrier-free", "en", "barrier-free", ["バリアフリー"]),
  reviewed("en-heat-island", "en", "heat island", ["ヒートアイランド"]),
  reviewed("en-follow-up", "en", "follow-up", ["フォローアップ"]),
  reviewed("en-priority", "en", "priority", ["プライオリティー"]),
  reviewed("en-breakthrough", "en", "breakthrough", ["ブレークスルー"]),
  reviewed("en-presence", "en", "presence", ["プレゼンス"]),
  reviewed("en-presentation", "en", "presentation", ["プレゼンテーション"]),
  reviewed("en-prototype", "en", "prototype", ["プロトタイプ"]),
  reviewed("en-portfolio", "en", "portfolio", ["ポートフォリオ"]),
  reviewed("en-potential", "en", "potential", ["ポテンシャル"]),
  reviewed("en-bottleneck", "en", "bottleneck", ["ボトルネック"]),
  reviewed("en-mental-health", "en", "mental health", ["メンタルヘルス"]),
  reviewed("en-monitoring", "en", "monitoring", ["モニタリング"]),
  reviewed("en-mobility", "en", "mobility", ["モビリティー"]),
  reviewed("en-moratorium", "en", "moratorium", ["モラトリアム"]),
  reviewed("en-moral-hazard", "en", "moral hazard", ["モラルハザード"]),
  reviewed("en-universal-design", "en", "universal design", ["ユニバーサルデザイン"]),
  reviewed("en-life-cycle", "en", "life cycle", ["ライフサイクル"]),
  reviewed("en-lead-time", "en", "lead time", ["リードタイム"]),
  reviewed("en-literacy", "en", "literacy", ["リテラシー"]),
  reviewed("en-renewal", "en", "renewal", ["リニューアル"]),
  reviewed("en-reuse", "en", "reuse", ["リユース"]),
  reviewed("en-recipient", "en", "recipient", ["レシピエント"]),
  reviewed("en-zero-emission", "en", "zero-emission", ["ゼロエミッション"]),
  reviewed("en-working-group", "en", "working group", ["ワーキンググループ"]),
  reviewed("en-workshop", "en", "workshop", ["ワークショップ"]),
  reviewed("en-one-stop", "en", "one-stop", ["ワンストップ"])
]);

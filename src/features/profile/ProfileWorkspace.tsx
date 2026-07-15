import type { Learner, ProfileDimension } from "../../shared/types";

const starterDimensions: ProfileDimension[] = [
  {
    label: "单词水平",
    level: "等待学习记录",
    confidence: "待建立",
    evidence: "完成翻译和单词确认后建立",
  },
  {
    label: "阅读水平",
    level: "等待首次摸底",
    confidence: "待建立",
    evidence: "需要至少一次翻译与主旨回答",
  },
  {
    label: "学习意愿",
    level: "由目标与行为共同判断",
    confidence: "待建立",
    evidence: "不会仅根据 AI 印象贴标签",
  },
  {
    label: "难度偏好",
    level: "自适应",
    confidence: "待建立",
    evidence: "根据主动调难度和完成情况更新",
  },
];

export function ProfileWorkspace({ learner }: { learner: Learner }) {
  return (
    <section className="workspace">
      <header className="profile-hero">
        <span className="profile-avatar">{learner.avatar}</span>
        <div>
          <span className="eyebrow">AI English Portrait</span>
          <h1>{learner.name} 的英语画像</h1>
          <p>画像中的每个判断都会保留证据、可信度和更新时间，并允许学习者修正。</p>
        </div>
        <button className="secondary-button">开始首次摸底</button>
      </header>

      <div className="profile-grid">
        {starterDimensions.map((dimension) => (
          <article key={dimension.label} className="profile-card">
            <span>{dimension.label}</span>
            <strong>{dimension.level}</strong>
            <p>{dimension.evidence}</p>
            <small>可信度：{dimension.confidence}</small>
          </article>
        ))}
      </div>

      <article className="profile-note">
        <strong>画像更新原则</strong>
        <p>
          AI 可以提出判断，但只有明确目标、摸底题、翻译作答、阅读作答和复习行为才能成为画像证据。不同学习者之间不会共享这些证据。
        </p>
      </article>
    </section>
  );
}

import { useEffect, useState } from "react";
import { loadLearningProfile } from "../../services/storage/learnerRepository";
import { refreshLearningProfile } from "../../services/learning/profileUpdater";
import type { Learner } from "../../shared/types";

const waiting = ["单词水平", "阅读水平", "翻译特点", "难度偏好"];

export function ProfileWorkspace({ learner }: { learner: Learner }) {
  const [profile, setProfile] = useState(() => loadLearningProfile(learner.id));
  const [message, setMessage] = useState(profile ? "画像会在翻译、复习和阅读完成后自动刷新。" : "完成一次有效学习后，AI 会根据真实证据建立画像。");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const next = loadLearningProfile(learner.id);
    setProfile(next);
    setMessage(next ? "画像会在翻译、复习和阅读完成后自动刷新。" : "完成一次有效学习后，AI 会根据真实证据建立画像。");
  }, [learner.id]);
  async function refresh() { setLoading(true); setMessage("正在根据已有学习记录更新画像…"); try { const next = await refreshLearningProfile(learner); setProfile(next); setMessage("画像已按当前学习记录更新。"); } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法更新画像"); } finally { setLoading(false); } }
  const dimensions = profile?.dimensions ?? waiting.map((label) => ({ label, level: "等待建立", confidence: "待建立" as const, evidence: "完成翻译、复习或阅读作答后自动生成", updatedAt: undefined }));
  return <section className="workspace profile-workspace"><header className="profile-hero"><span className="profile-avatar">{learner.avatar}</span><div><span className="eyebrow">AI English Portrait</span><h1>{learner.name} 的英语画像</h1><p>不是一次性测评。每次真实学习行为都会补充证据，画像自动更新。</p></div><button className="secondary-button" disabled={loading} onClick={() => void refresh()}>{loading ? "更新中…" : "立即更新"}</button></header><p className="profile-status">{message}</p><div className="profile-grid">{dimensions.map((dimension) => <article key={dimension.label} className="profile-card"><span>{dimension.label}</span><strong>{dimension.level}</strong><p>{dimension.evidence}</p><small>可信度：{dimension.confidence}{dimension.updatedAt ? ` · 更新于 ${new Date(dimension.updatedAt).toLocaleDateString()}` : ""}</small></article>)}</div>{profile?.summary && <article className="profile-note"><strong>当前学习建议</strong><p>{profile.summary}</p></article>}</section>;
}

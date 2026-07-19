import { useEffect, useState, type MouseEvent } from "react";
import { aiGateway } from "../../services/ai/aiGateway";
import { buildLearningSnapshot, saveReadingAttempt, upsertVocabularyCandidates } from "../../services/storage/learnerRepository";
import { refreshLearningProfile } from "../../services/learning/profileUpdater";
import type { Learner, QuickTranslationResult, ReadingEvaluation, ReadingMaterial } from "../../shared/types";

const readingTopics = ["AI 新闻", "国际新闻", "国内新闻", "日常英语"];

type Lookup = { text: string; translation: string; x: number; y: number; loading: boolean };

export function ReadingWorkspace({ learner }: { learner: Learner }) {
  const [topic, setTopic] = useState("科技与生活");
  const [material, setMaterial] = useState<ReadingMaterial | null>(null);
  const [translationAnswer, setTranslationAnswer] = useState("");
  const [mainIdeaAnswer, setMainIdeaAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<ReadingEvaluation | null>(null);
  const [message, setMessage] = useState("AI 会结合你的画像与待复习词生成下一篇材料。");
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    setMaterial(null);
    setEvaluation(null);
    setTranslationAnswer("");
    setMainIdeaAnswer("");
    setLookup(null);
    setMessage("AI 会结合你的画像与待复习词生成下一篇材料。");
  }, [learner.id]);

  async function generateReading() {
    setLoading(true); setEvaluation(null); setMessage("正在生成适合当前学习者的阅读材料…");
    try {
      const result = await aiGateway.execute<Omit<ReadingMaterial, "id" | "learnerId" | "topic" | "focus" | "createdAt">>({ task: "generate-reading", learnerId: learner.id, payload: { topic, focus: "profile", learnerContext: learner, snapshot: buildLearningSnapshot(learner.id) } });
      setMaterial({ ...result, id: crypto.randomUUID(), learnerId: learner.id, topic, focus: "profile", createdAt: new Date().toISOString() });
      setTranslationAnswer(""); setMainIdeaAnswer(""); setMessage("材料已生成。先写出中文理解，再概括作者想表达什么。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法生成阅读材料"); }
    finally { setLoading(false); }
  }

  async function evaluateReading() {
    if (!material) return;
    setLoading(true); setMessage("正在根据原文和你的答案给出反馈…");
    try {
      const result = await aiGateway.execute<ReadingEvaluation>({ task: "evaluate-reading", learnerId: learner.id, payload: { passage: material.passage, translationAnswer, mainIdeaAnswer } });
      setEvaluation(result);
      saveReadingAttempt({ id: crypto.randomUUID(), learnerId: learner.id, materialId: material.id, passage: material.passage, translationAnswer, mainIdeaAnswer, feedback: result.summary, evaluation: result, createdAt: new Date().toISOString() });
      upsertVocabularyCandidates(learner.id, result.vocabulary.map((candidate) => ({ ...candidate, sourceType: "reading" })));
      void refreshLearningProfile(learner).catch(() => undefined);
      setMessage("评价已保存，薄弱词已加入待学习队列，画像将自动更新。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法评价本次作答"); }
    finally { setLoading(false); }
  }

  async function lookupSelection(event: MouseEvent<HTMLElement>) {
    const selected = window.getSelection()?.toString().trim() ?? "";
    if (!selected || selected.length > 160) return;
    setLookup({ text: selected, translation: "正在查询释义…", x: event.clientX, y: event.clientY, loading: true });
    try {
      const result = await aiGateway.execute<QuickTranslationResult>({
        task: "quick-translate",
        learnerId: learner.id,
        payload: { text: selected },
      });
      setLookup((current) => current?.text === selected ? { ...current, translation: result.translation, loading: false } : current);
    } catch (error) {
      setLookup((current) => current?.text === selected ? { ...current, translation: error instanceof Error ? error.message : "暂时无法查询释义", loading: false } : current);
    }
  }

  function addLookupToVocabulary() {
    if (!lookup || lookup.loading) return;
    upsertVocabularyCandidates(learner.id, [{
      term: lookup.text,
      meaningInContext: lookup.translation,
      sourceSentence: material?.passage ?? "阅读材料",
      reason: "阅读时手动查询",
      sourceType: "reading",
    }]);
    setLookup((current) => current ? { ...current, translation: `${current.translation} · 已加入单词本` } : current);
  }

  return <section className="workspace reading-workspace">
    <header className="workspace-header"><div><span className="eyebrow">Reading Lab</span><h1>阅读理解</h1><p>从读懂主旨、中心句和逻辑开始。评价只看你的真实作答，不会提前透露答案。</p></div></header>
    <div className="reading-setup"><div className="reading-topic-picker"><span>阅读主题</span><div>{readingTopics.map((item) => <button key={item} type="button" className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</button>)}</div></div><button className="primary-button" disabled={loading} onClick={() => void generateReading()}>{loading ? "生成中…" : "AI 生成材料"}</button></div>
    {!material ? <div className="reading-stage"><span className="reading-mark">R</span><h2>{learner.name} 的下一篇阅读</h2><p>{message}</p></div> : <div className="reading-session"><article className="reading-passage"><span>{material.level} · {material.title}</span><p onMouseUp={(event) => void lookupSelection(event)}>{material.passage}</p><small>{material.instructions}</small></article><div className="reading-answer"><label>你的中文理解<textarea value={translationAnswer} onChange={(event) => setTranslationAnswer(event.target.value)} placeholder="不必逐字翻译，先尽力讲清内容。" /></label><label>作者主要想表达什么？<textarea value={mainIdeaAnswer} onChange={(event) => setMainIdeaAnswer(event.target.value)} placeholder="用自己的话概括主旨和关键逻辑。" /></label><button className="primary-button" disabled={loading || !translationAnswer.trim() || !mainIdeaAnswer.trim()} onClick={() => void evaluateReading()}>{loading ? "评价中…" : "提交并获得评价"}</button></div>{evaluation && <article className="reading-feedback"><strong>{evaluation.summary}</strong><div>{evaluation.dimensions.map((item) => <section key={item.label}><b>{item.label} · {item.score}</b><p>{item.feedback}</p><small>证据：{item.evidence}</small></section>)}</div><p>下一步：{evaluation.nextStep}</p></article>}<small className="reading-message">{message}</small></div>}
    {lookup && <aside className="reading-lookup" style={{ left: lookup.x, top: lookup.y }}><button aria-label="关闭查词" onClick={() => setLookup(null)}>×</button><strong>{lookup.text}</strong><p>{lookup.translation}</p><button className="secondary-button" disabled={lookup.loading || lookup.translation.includes("已加入单词本")} onClick={addLookupToVocabulary}>加入单词本</button></aside>}
  </section>;
}

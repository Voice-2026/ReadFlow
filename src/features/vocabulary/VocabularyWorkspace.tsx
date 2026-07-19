import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  getReviewVocabulary,
  loadVocabulary,
  reviewVocabularyItem,
  upsertVocabularyCandidates,
} from "../../services/storage/learnerRepository";
import { refreshLearningProfile } from "../../services/learning/profileUpdater";
import type { Learner, VocabularyItem } from "../../shared/types";

type Filter = "all" | "due" | "forgotten" | "known";

const stateLabels = { known: "已掌握", fuzzy: "待学习", unknown: "易忘" };

export function VocabularyWorkspace({ learner }: { learner: Learner }) {
  const [items, setItems] = useState(() => loadVocabulary(learner.id));
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState(false);
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [sourceSentence, setSourceSentence] = useState("");
  const due = useMemo(() => getReviewVocabulary(learner.id), [items, learner.id]);
  const filtered = useMemo(() => {
    if (filter === "due") return due;
    if (filter === "forgotten") return items.filter((item) => item.state === "unknown" || item.forgottenCount > 0);
    if (filter === "known") return items.filter((item) => item.state === "known");
    return items;
  }, [due, filter, items]);
  const current = due[0];

  useEffect(() => {
    setItems(loadVocabulary(learner.id));
    setFilter("all");
    setReviewing(false);
  }, [learner.id]);

  function reload(next = loadVocabulary(learner.id)) {
    setItems([...next]);
  }

  function review(result: "known" | "fuzzy" | "unknown") {
    if (!current) return;
    reload(reviewVocabularyItem(learner.id, current.id, result));
    void refreshLearningProfile(learner).catch(() => undefined);
  }

  function addManually(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTerm = term.trim();
    const nextMeaning = meaning.trim();
    if (!nextTerm || !nextMeaning) return;
    reload(upsertVocabularyCandidates(learner.id, [{
      term: nextTerm,
      meaningInContext: nextMeaning,
      sourceSentence: sourceSentence.trim() || "手动添加",
      reason: "学习者手动添加",
      sourceType: "manual",
    }]));
    setTerm("");
    setMeaning("");
    setSourceSentence("");
  }

  return (
    <section className="workspace vocabulary-workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Vocabulary Memory</span>
          <h1>智能单词本</h1>
          <p>翻译、划词理解和阅读训练会自动收集值得学习的词与短句；你决定自己是否掌握。</p>
        </div>
        <button className="primary-button" onClick={() => setReviewing(true)} disabled={due.length === 0}>
          {due.length > 0 ? `开始复习 ${due.length}` : "暂无待复习"}
        </button>
      </header>

      <div className="vocabulary-summary">
        <span>待学习 <strong>{items.filter((item) => item.state === "fuzzy").length}</strong></span>
        <span>今日复习 <strong>{due.length}</strong></span>
        <span>易忘 <strong>{items.filter((item) => item.forgottenCount > 0).length}</strong></span>
        <span>已掌握 <strong>{items.filter((item) => item.state === "known").length}</strong></span>
      </div>

      <form className="vocabulary-add-form" onSubmit={addManually}>
        <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="单词或短句" />
        <input value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="中文释义" />
        <input value={sourceSentence} onChange={(event) => setSourceSentence(event.target.value)} placeholder="来源句（可选）" />
        <button className="secondary-button" type="submit" disabled={!term.trim() || !meaning.trim()}>添加到单词本</button>
      </form>

      <div className="filter-row">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部 {items.length}</button>
        <button className={filter === "due" ? "active" : ""} onClick={() => setFilter("due")}>今日复习 {due.length}</button>
        <button className={filter === "forgotten" ? "active" : ""} onClick={() => setFilter("forgotten")}>易忘</button>
        <button className={filter === "known" ? "active" : ""} onClick={() => setFilter("known")}>已掌握</button>
      </div>

      {reviewing && current ? (
        <section className="review-card">
          <span className="eyebrow">今日复习</span>
          <strong>{current.term}</strong>
          <p>{current.meaningInContext}</p>
          <small>{current.sourceSentence}</small>
          <div className="review-actions">
            <button onClick={() => review("unknown")}>忘了</button>
            <button onClick={() => review("fuzzy")}>模糊</button>
            <button className="primary-button" onClick={() => review("known")}>认识</button>
          </div>
          <button className="text-button" onClick={() => setReviewing(false)}>稍后再复习</button>
        </section>
      ) : items.length === 0 ? (
        <div className="large-empty-state">
          <span>W</span><h2>还没有待学习内容</h2>
          <p>完成一次快捷翻译、划词理解或阅读训练后，重点单词和短句会自动出现在这里。</p>
        </div>
      ) : (
        <div className="vocabulary-list">
          {filtered.map((item) => <VocabularyRow key={item.id} item={item} />)}
        </div>
      )}
    </section>
  );
}

function VocabularyRow({ item }: { item: VocabularyItem }) {
  return <article className="vocabulary-row">
    <div><strong>{item.term}</strong><p>{item.meaningInContext}</p><small>{item.sourceSentence}</small></div>
    <aside><span>{item.kind === "phrase" ? "短句" : "单词"}</span><b>{stateLabels[item.state]}</b><small>遇见 {item.seenCount} 次{item.forgottenCount ? ` · 忘记 ${item.forgottenCount} 次` : ""}</small></aside>
  </article>;
}

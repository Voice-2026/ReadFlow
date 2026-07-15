import { loadVocabulary } from "../../services/storage/learnerRepository";
import type { Learner } from "../../shared/types";

const stateLabels = {
  known: "认识",
  fuzzy: "模糊",
  unknown: "不认识",
};

export function VocabularyWorkspace({ learner }: { learner: Learner }) {
  const items = loadVocabulary(learner.id);

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Vocabulary Memory</span>
          <h1>智能单词本</h1>
          <p>AI 推荐候选，{learner.name} 自己确认认识、模糊或不认识。</p>
        </div>
        <button className="secondary-button">开始复习</button>
      </header>

      <div className="filter-row">
        <button className="active">全部 {items.length}</button>
        <button>待复习</button>
        <button>反复遗忘</button>
        <button>已掌握</button>
      </div>

      {items.length === 0 ? (
        <div className="large-empty-state">
          <span>W</span>
          <h2>还没有单词记录</h2>
          <p>完成一次 AI 翻译或阅读理解后，可以把重点词加入当前学习者的单词本。</p>
        </div>
      ) : (
        <div className="vocabulary-list">
          {items.map((item) => (
            <article key={item.id}>
              <strong>{item.term}</strong>
              <p>{item.meaningInContext}</p>
              <small>{item.sourceSentence}</small>
              <span>{stateLabels[item.state]}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

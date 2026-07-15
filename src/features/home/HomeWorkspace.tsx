import { loadVocabulary } from "../../services/storage/learnerRepository";
import type { Learner } from "../../shared/types";

type HomeWorkspaceProps = {
  learner: Learner;
  onNavigate: (workspace: "translation" | "vocabulary" | "reading") => void;
};

export function HomeWorkspace({ learner, onNavigate }: HomeWorkspaceProps) {
  const vocabulary = loadVocabulary(learner.id);
  const fuzzyCount = vocabulary.filter((item) => item.state !== "known").length;

  return (
    <section className="workspace home-workspace">
      <div className="hero-card">
        <div>
          <span className="eyebrow">Today · {learner.name}</span>
          <h1>从一段英文开始，AI 会记住你的真实进步。</h1>
          <p>
            翻译、单词和阅读理解属于同一个学习闭环。当前是产品骨架，接入模型后会根据画像生成今天的任务。
          </p>
        </div>
        <button className="primary-button" onClick={() => onNavigate("translation")}>
          开始一次翻译
        </button>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>待复习词汇</span>
          <strong>{fuzzyCount}</strong>
          <small>只统计当前学习者</small>
        </article>
        <article className="metric-card">
          <span>阅读画像</span>
          <strong>待建立</strong>
          <small>完成首次 AI 摸底后生成</small>
        </article>
        <article className="metric-card accent-card">
          <span>学习目标</span>
          <strong>{learner.goals[0] ?? "尚未设置"}</strong>
          <small>后续可以在画像中修正</small>
        </article>
      </div>

      <div className="feature-grid">
        <button className="feature-card" onClick={() => onNavigate("translation")}>
          <span className="feature-icon">译</span>
          <strong>快捷 AI 翻译</strong>
          <small>选中文字、粘贴内容或拖入文件</small>
        </button>
        <button className="feature-card" onClick={() => onNavigate("vocabulary")}>
          <span className="feature-icon">词</span>
          <strong>智能单词本</strong>
          <small>从真实上下文判断认识、模糊或不认识</small>
        </button>
        <button className="feature-card" onClick={() => onNavigate("reading")}>
          <span className="feature-icon">读</span>
          <strong>阅读理解</strong>
          <small>翻译材料，再说明作者主要表达什么</small>
        </button>
      </div>
    </section>
  );
}

import { useState } from "react";
import { aiGateway } from "../../services/ai/aiGateway";
import type { Learner } from "../../shared/types";

export function ReadingWorkspace({ learner }: { learner: Learner }) {
  const [topic, setTopic] = useState("科技与生活");
  const [message, setMessage] = useState("AI 会结合画像和薄弱词生成材料");

  async function generateReading() {
    try {
      await aiGateway.execute({
        task: "generate-reading",
        learnerId: learner.id,
        payload: { topic },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "暂时无法生成阅读材料");
    }
  }

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Reading Lab</span>
          <h1>阅读理解</h1>
          <p>先翻译，再说出作者主要表达什么；AI 会根据证据评价，而不是只对标准答案。</p>
        </div>
      </header>

      <div className="reading-setup">
        <label>
          主题
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option>科技与生活</option>
            <option>产品与设计</option>
            <option>日常故事</option>
            <option>工作英语</option>
          </select>
        </label>
        <label>
          训练重点
          <select defaultValue="profile">
            <option value="profile">由 AI 画像决定</option>
            <option value="logic">逻辑词与中心句</option>
            <option value="sentence">长句结构</option>
            <option value="vocabulary">薄弱词复现</option>
          </select>
        </label>
        <button className="primary-button" onClick={() => void generateReading()}>
          AI 生成材料
        </button>
      </div>

      <div className="reading-stage">
        <span className="reading-mark">R</span>
        <h2>{learner.name} 的下一篇阅读</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

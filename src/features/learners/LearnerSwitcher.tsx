import { useState } from "react";
import type { Learner } from "../../shared/types";

type LearnerSwitcherProps = {
  learners: Learner[];
  activeLearnerId: string;
  onSwitch: (learnerId: string) => void;
  onCreate: (name: string) => void;
};

export function LearnerSwitcher({
  learners,
  activeLearnerId,
  onSwitch,
  onCreate,
}: LearnerSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function submitNewLearner(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name);
    setName("");
    setCreating(false);
  }

  return (
    <div className="learner-switcher">
      <label htmlFor="learner-select">切换学习者</label>
      <div className="learner-switch-row">
        <select
          id="learner-select"
          value={activeLearnerId}
          onChange={(event) => onSwitch(event.target.value)}
        >
          {learners.map((learner) => (
            <option key={learner.id} value={learner.id}>
              {learner.name}
            </option>
          ))}
        </select>
        <button className="icon-button" onClick={() => setCreating((value) => !value)}>
          +
        </button>
      </div>
      {creating && (
        <form className="new-learner-form" onSubmit={submitNewLearner}>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="学习者昵称"
          />
          <button type="submit">创建</button>
        </form>
      )}
    </div>
  );
}

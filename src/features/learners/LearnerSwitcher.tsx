import { CaretDown, Check, Plus, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Learner } from "../../shared/types";

type LearnerSwitcherProps = {
  learners: Learner[];
  activeLearnerId: string;
  onSwitch: (learnerId: string) => void;
  onCreate: (name: string, goal?: string) => void;
};

export function LearnerSwitcher({
  learners,
  activeLearnerId,
  onSwitch,
  onCreate,
}: LearnerSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);
  const activeLearner =
    learners.find((learner) => learner.id === activeLearnerId) ?? learners[0];

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (creating) setCreating(false);
      else setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [creating]);

  function selectLearner(learnerId: string) {
    onSwitch(learnerId);
    setOpen(false);
  }

  function beginCreate() {
    setOpen(false);
    setName("");
    setGoal("");
    setCreating(true);
  }

  function submitNewLearner(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), goal.trim() || undefined);
    setCreating(false);
  }

  return (
    <div ref={switcherRef} className={`learner-switcher ${open ? "open" : ""}`}>
      <span className="learner-switcher-label">切换学习者</span>
      <button
        type="button"
        className="active-learner-card"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <LearnerAvatar learner={activeLearner} active />
        <span className="active-learner-copy">
          <strong>{activeLearner.name}</strong>
          <small>{learnerGoal(activeLearner)}</small>
        </span>
        <CaretDown className="learner-caret" size={16} weight="bold" aria-hidden />
      </button>

      {open && (
        <div className="learner-popover" role="dialog" aria-label="选择学习者">
          <div className="learner-list" role="listbox" aria-label="本机学习者">
            {learners.map((learner) => {
              const active = learner.id === activeLearnerId;
              return (
                <button
                  key={learner.id}
                  type="button"
                  className={`learner-option ${active ? "active" : ""}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => selectLearner(learner.id)}
                >
                  <LearnerAvatar learner={learner} active={active} />
                  <span>
                    <strong>{learner.name}</strong>
                    <small>{learnerGoal(learner)}</small>
                  </span>
                  {active && <Check size={18} weight="bold" aria-hidden />}
                </button>
              );
            })}
          </div>
          <button type="button" className="create-learner-entry" onClick={beginCreate}>
            <span><Plus size={17} weight="bold" aria-hidden /></span>
            新增学习者
          </button>
        </div>
      )}

      {creating && (
        <div className="learner-modal-backdrop" role="presentation" onMouseDown={() => setCreating(false)}>
          <section
            className="learner-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-learner-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span className="learner-dialog-eyebrow">LOCAL LEARNER</span>
                <h2 id="create-learner-title">新增学习者</h2>
                <p>每位学习者都有独立的画像、单词本和学习记录。</p>
              </div>
              <button type="button" aria-label="关闭新增学习者" onClick={() => setCreating(false)}>
                <X size={20} weight="bold" aria-hidden />
              </button>
            </header>

            <form onSubmit={submitNewLearner}>
              <div className="learner-create-preview">
                <span>{name.trim().slice(0, 1) || "新"}</span>
                <div>
                  <strong>{name.trim() || "新学习者"}</strong>
                  <small>{goal.trim() || "稍后也可以完善学习目标"}</small>
                </div>
              </div>

              <label>
                学习者昵称
                <input
                  autoFocus
                  value={name}
                  maxLength={24}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：Leo"
                />
              </label>
              <label>
                初始学习目标 <small>选填</small>
                <input
                  value={goal}
                  maxLength={60}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="例如：优先提升英文阅读理解"
                />
              </label>

              <footer>
                <button type="button" className="secondary-button" onClick={() => setCreating(false)}>
                  取消
                </button>
                <button type="submit" className="primary-button" disabled={!name.trim()}>
                  创建并切换
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function LearnerAvatar({ learner, active }: { learner: Learner; active: boolean }) {
  return (
    <span className={`learner-avatar ${active ? "active" : ""}`} aria-hidden>
      {learner.avatar || learner.name.slice(0, 1) || "学"}
    </span>
  );
}

function learnerGoal(learner: Learner): string {
  return learner.goals[0] || "等待建立学习目标";
}

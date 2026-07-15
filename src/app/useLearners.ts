import { useMemo, useState } from "react";
import type { Learner } from "../shared/types";
import {
  createLearner,
  loadActiveLearnerId,
  loadLearners,
  saveActiveLearnerId,
  saveLearners,
} from "../services/storage/learnerRepository";

export function useLearners() {
  const [learners, setLearners] = useState<Learner[]>(() => loadLearners());
  const [activeLearnerId, setActiveLearnerId] = useState<string>(() => {
    const storedId = loadActiveLearnerId();
    const initialLearners = loadLearners();
    return initialLearners.some((learner) => learner.id === storedId)
      ? storedId!
      : initialLearners[0].id;
  });

  const activeLearner = useMemo(
    () => learners.find((learner) => learner.id === activeLearnerId) ?? learners[0],
    [activeLearnerId, learners],
  );

  function switchLearner(learnerId: string) {
    if (!learners.some((learner) => learner.id === learnerId)) return;
    saveActiveLearnerId(learnerId);
    setActiveLearnerId(learnerId);
  }

  function addLearner(name: string) {
    const learner = createLearner(name);
    const nextLearners = [...learners, learner];
    saveLearners(nextLearners);
    saveActiveLearnerId(learner.id);
    setLearners(nextLearners);
    setActiveLearnerId(learner.id);
  }

  return {
    learners,
    activeLearner,
    activeLearnerId,
    switchLearner,
    addLearner,
  };
}

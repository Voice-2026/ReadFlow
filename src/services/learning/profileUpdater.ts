import { aiGateway } from "../ai/aiGateway";
import {
  buildLearningSnapshot,
  saveLearningProfile,
} from "../storage/learnerRepository";
import type { Learner, LearningProfile } from "../../shared/types";

export async function refreshLearningProfile(learner: Learner): Promise<LearningProfile> {
  const snapshot = buildLearningSnapshot(learner.id);
  const profile = await aiGateway.execute<LearningProfile>({
    task: "update-profile",
    learnerId: learner.id,
    payload: {
      learnerContext: { name: learner.name, goals: learner.goals, interests: learner.interests },
      snapshot,
    },
  });
  const normalized: LearningProfile = {
    ...profile,
    learnerId: learner.id,
    updatedAt: profile.updatedAt || new Date().toISOString(),
  };
  saveLearningProfile(normalized);
  return normalized;
}

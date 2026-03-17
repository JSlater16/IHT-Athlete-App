const { buildPhaseTimeline } = require("./phasePlan");
const { standardProgramVariant } = require("./programVariant");
const { parseRehabProfile } = require("./rehabProfile");

function serializeLift(lift) {
  return {
    id: lift.id,
    athleteId: lift.athleteId,
    date: lift.date,
    blockLabel: lift.blockLabel,
    exerciseName: lift.exerciseName,
    sets: lift.sets,
    reps: lift.reps,
    weight: lift.weight,
    notes: lift.notes,
    completed: lift.completed,
    createdAt: lift.createdAt,
    updatedAt: lift.updatedAt
  };
}

function serializeAthleteProfile(profile) {
  const phaseTimeline = buildPhaseTimeline(profile);
  return {
    id: profile.id,
    name: profile.user.name,
    email: profile.user.email,
    phase: profile.phase,
    phaseStartedAt: profile.phaseStartedAt,
    phaseTimeline,
    programmingDays: profile.programmingDays,
    trainingModel: profile.trainingModel,
    programVariant: profile.programVariant || standardProgramVariant,
    rehabProfile: parseRehabProfile(profile.rehabProfile),
    coachNotes: profile.coachNotes,
    updatedAt: profile.updatedAt
  };
}

function serializeRehabNote(note) {
  return {
    id: note.id,
    note: note.note,
    createdAt: note.createdAt
  };
}

function serializeStaffUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt
  };
}

module.exports = {
  serializeAthleteProfile,
  serializeLift,
  serializeRehabNote,
  serializeStaffUser
};

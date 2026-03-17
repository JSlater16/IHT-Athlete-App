const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function startOfWeek(dateInput = new Date()) {
  const date = new Date(dateInput);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function addDays(dateInput, days) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date;
}

async function main() {
  const athleteAndCoachPassword = await bcrypt.hash("password123", 10);
  const ownerPassword = await bcrypt.hash("changeme123", 10);
  const week = startOfWeek();

  await prisma.rehabNote.deleteMany();
  await prisma.lift.deleteMany();
  await prisma.athleteProfile.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: "Head Coach",
      email: "owner@gym.com",
      password: ownerPassword,
      role: "OWNER"
    }
  });

  await prisma.user.create({
    data: {
      name: "Coach David",
      email: "coach@liftlab.com",
      password: athleteAndCoachPassword,
      role: "COACH"
    }
  });

  const athletes = await Promise.all(
    [
      {
        name: "Mia Carter",
        email: "mia@liftlab.com",
        phase: "Power",
        phaseStartedAt: addDays(week, -7),
        programmingDays: 3,
        trainingModel: "10-Week",
        programVariant: "Standard",
        rehabProfile: { inhibitedMuscles: [] },
        coachNotes: "Stay explosive through the concentric phase and keep landings quiet."
      },
      {
        name: "Jordan Lee",
        email: "jordan@liftlab.com",
        phase: "Prep",
        phaseStartedAt: week,
        programmingDays: 4,
        trainingModel: "10-Week",
        programVariant: "Standard",
        rehabProfile: { inhibitedMuscles: [] },
        coachNotes: "We are building weekly volume. Keep tempo controlled and own every rep."
      },
      {
        name: "Ava Thompson",
        email: "ava@liftlab.com",
        phase: "Rehab",
        phaseStartedAt: addDays(week, -14),
        programmingDays: 3,
        trainingModel: "10-Week",
        programVariant: "Standard",
        rehabProfile: {
          inhibitedMuscles: [
            {
              id: "quad-tendon-left",
              name: "Quad Tendon",
              pain: true,
              painScale: 3,
              primary: true,
              left: true,
              right: false
            }
          ]
        },
        coachNotes: "Progress load only if knee response stays calm the next morning."
      }
    ].map((athlete) =>
      prisma.user.create({
        data: {
          name: athlete.name,
          email: athlete.email,
          password: athleteAndCoachPassword,
          role: "ATHLETE",
          athleteProfile: {
            create: {
              phase: athlete.phase,
              phaseStartedAt: athlete.phaseStartedAt,
              rehabProfile: JSON.stringify(athlete.rehabProfile),
              programmingDays: athlete.programmingDays,
              trainingModel: athlete.trainingModel,
              programVariant: athlete.programVariant,
              coachNotes: athlete.coachNotes
            }
          }
        },
        include: {
          athleteProfile: true
        }
      })
    )
  );

  const liftTemplates = [
    [
      { offset: 0, exerciseName: "Trap Bar Deadlift", sets: 4, reps: 5, weight: "225 lb", notes: "Fast concentric. Reset every rep." },
      { offset: 2, exerciseName: "Rear Foot Elevated Split Squat", sets: 3, reps: 8, weight: "45 lb DBs", notes: "Stay tall through the torso." },
      { offset: 4, exerciseName: "Box Jump", sets: 4, reps: 4, weight: "Bodyweight", notes: "Stick every landing." }
    ],
    [
      { offset: 1, exerciseName: "Back Squat", sets: 5, reps: 4, weight: "245 lb", notes: "Own the bottom position." },
      { offset: 3, exerciseName: "Bench Press", sets: 4, reps: 6, weight: "165 lb", notes: "Smooth bar path and controlled eccentric." },
      { offset: 5, exerciseName: "Chin-Up", sets: 4, reps: 8, weight: "Bodyweight", notes: "Full hang each rep." }
    ],
    [
      { offset: 0, exerciseName: "Tempo Goblet Squat", sets: 3, reps: 10, weight: "55 lb", notes: "Three-second lower, no pain spike." },
      { offset: 2, exerciseName: "Single-Leg RDL", sets: 3, reps: 8, weight: "35 lb", notes: "Own balance through the mid-foot." },
      { offset: 4, exerciseName: "Bike Flush", sets: 1, reps: 20, weight: "minutes", notes: "Easy recovery pace." }
    ]
  ];

  for (let index = 0; index < athletes.length; index += 1) {
    const athleteProfileId = athletes[index].athleteProfile.id;
    const lifts = liftTemplates[index].map((lift) => ({
      athleteId: athleteProfileId,
      date: addDays(week, lift.offset),
      exerciseName: lift.exerciseName,
      sets: lift.sets,
      reps: lift.reps,
      weight: lift.weight,
      notes: lift.notes,
      completed: false
    }));

    await prisma.lift.createMany({ data: lifts });

    await prisma.rehabNote.create({
      data: {
        athleteId: athleteProfileId,
        note:
          index === 2
            ? "Quad tendon is responding well. No swelling after the last progression."
            : "No active rehab note this week. Continue standard soft tissue routine."
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

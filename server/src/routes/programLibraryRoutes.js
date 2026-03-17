const express = require("express");
const {
  readProgramLibrary,
  summarizeProgramLibrary,
  validateProgramLibrary,
  writeProgramLibrary
} = require("../utils/programLibrary");

const router = express.Router();

router.get("/", async (_req, res, next) => {
  try {
    const library = await readProgramLibrary();
    return res.json({
      library,
      summary: summarizeProgramLibrary(library)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const library = req.body?.library;
    const validationError = validateProgramLibrary(library);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    await writeProgramLibrary(library);

    return res.status(201).json({
      library,
      summary: summarizeProgramLibrary(library)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

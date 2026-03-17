import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { formatDateTime } from "../../utils/date";

function createEmptyAthleteForm() {
  return {
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phase: "Prep",
    trainingModel: "10-Week",
    programmingDays: 3,
    programVariant: "Standard"
  };
}

export default function CoachRosterPage() {
  const { token } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyAthleteForm());
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  useEffect(() => {
    loadRoster();
  }, [token]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadRoster() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/athletes", { token });
      setAthletes(data.athletes);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredAthletes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return athletes;
    }

    return athletes.filter((athlete) => {
      return athlete.name.toLowerCase().includes(query) || athlete.phase.toLowerCase().includes(query);
    });
  }, [athletes, search]);

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateForm(createEmptyAthleteForm());
    setCreateError("");
    setCreateSubmitting(false);
  }

  async function handleCreateAthlete(event) {
    event.preventDefault();
    setCreateError("");

    if (!createForm.name.trim()) {
      setCreateError("Athlete name is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      setCreateError("Enter a valid athlete email.");
      return;
    }

    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setCreateError("Passwords do not match.");
      return;
    }

    setCreateSubmitting(true);

    try {
      await apiRequest("/api/athletes", {
        method: "POST",
        token,
        body: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phase: createForm.phase,
          trainingModel: createForm.trainingModel,
          programmingDays: Number(createForm.programmingDays),
          programVariant: createForm.programVariant
        }
      });
      closeCreateModal();
      await loadRoster();
      setToast("Athlete created.");
    } catch (submitError) {
      setCreateError(submitError.message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeleteAthlete(athlete) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${athlete.name}? Th
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const demoAccounts = [
  { role: "Owner", email: "owner@gym.com", password: "changeme123" },
  { role: "Coach", email: "coach@liftlab.com", password: "password123" },
  { role: "Athlete", email: "mia@liftlab.com", password: "password123" },
  { role: "Athlete", email: "jordan@liftlab.com", password: "password123" }
];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user } = useAuth();
  const [email, setEmail] = useState("coach@liftlab.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    const fallbackPath = user.role === "COACH" || user.role === "OWNER" ? "/dashboard" : "/athlete/home";
    navigate(location.state?.from || fallbackPath, { replace: true });
  }, [location.state, navigate, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="glass-panel">
          <div className="brand-lockup">
            <img className="brand-logo-panel" src="/iht-logo.png" alt="IHT Performance logo" />
            <div>
              <p className="eyebrow">IHT Performance</p>
              <h1 className="login-title">Athlete programming that feels premium on both sides.</h1>
            </div>
          </div>
          <p className="login-copy">
            Coaches get a powerful desktop control center. Athletes get a mobile-first training app
            with a polished iPhone-like experience branded for IHT.
          </p>
        </div>
      </section>

      <section className="login-panel glass-panel">
        <div className="card-header">
          <div>
            <p className="eyebrow">IHT Access</p>
            <h2>Welcome back</h2>
          </div>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="demo-grid">
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              className="demo-card"
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
            >
              <span className="demo-role">{account.role}</span>
              <strong>{account.email}</strong>
              <span>Password: {account.password}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LOGIN_CONTENT = {
  coach: {
    eyebrow: "Coach Access",
    title: "IHT Coach Portal",
    copy: "Private access for IHT coaches and leadership to manage roster, programming, rehab, and athlete oversight.",
    panelEyebrow: "IHT Coach Login",
    panelTitle: "Welcome back",
    panelCopy: "Sign in to open the IHT dashboard.",
    badge: "Staff only",
    footnoteEyebrow: "Private Access",
    footnoteCopy: "For IHT coaches and owners only.",
    emailPlaceholder: "coach@ihtperformance.com",
    passwordPlaceholder: "Enter your password",
    allowedRoles: ["COACH", "OWNER"]
  },
  athlete: {
    eyebrow: "Athlete Access",
    title: "IHT Athlete App",
    copy: "Private access for IHT athletes to view assigned training, track sessions, and stay locked into the week.",
    panelEyebrow: "IHT Athlete Login",
    panelTitle: "Welcome back",
    panelCopy: "Sign in to open your training app.",
    badge: "Athletes only",
    footnoteEyebrow: "Private Access",
    footnoteCopy: "For active IHT athletes only.",
    emailPlaceholder: "athlete@ihtperformance.com",
    passwordPlaceholder: "Enter your password",
    allowedRoles: ["ATHLETE"]
  }
};

export default function LoginPage({ audience = "coach" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const content = LOGIN_CONTENT[audience] || LOGIN_CONTENT.coach;

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
      await login(email.trim(), password, content.allowedRoles);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`login-page login-page-${audience}`}>
      {audience === "athlete" ? (
        <section className="login-athlete-card glass-panel">
          <div className="login-hero-content">
            <div className="brand-lockup">
              <img className="brand-logo-panel" src="/iht-logo.png" alt="IHT Performance logo" />
              <div>
                <p className="eyebrow">{content.eyebrow}</p>
                <h1 className="login-title">{content.title}</h1>
              </div>
            </div>

            <p className="login-copy">{content.copy}</p>
          </div>

          <div className="login-panel-shell login-panel-shell-athlete">
            <div className="card-header login-panel-header">
              <div>
                <p className="eyebrow">{content.panelEyebrow}</p>
                <h2>{content.panelTitle}</h2>
                <p className="login-panel-copy">{content.panelCopy}</p>
              </div>
              <div className="login-panel-badge">{content.badge}</div>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder={content.emailPlaceholder}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder={content.passwordPlaceholder}
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}

              <button className="primary-button login-submit" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="login-footnote">
              <span className="login-footnote-line" />
              <p className="eyebrow">{content.footnoteEyebrow}</p>
              <p>{content.footnoteCopy}</p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="login-hero">
            <div className="glass-panel">
              <div className="login-hero-content">
                <div className="brand-lockup">
                  <img className="brand-logo-panel" src="/iht-logo.png" alt="IHT Performance logo" />
                  <div>
                    <p className="eyebrow">{content.eyebrow}</p>
                    <h1 className="login-title">{content.title}</h1>
                  </div>
                </div>

                <p className="login-copy">{content.copy}</p>
              </div>

              <article className="login-brand-panel">
                <p className="eyebrow">IHT Standard</p>
                <strong>Programming, rehab, and accountability under one roof.</strong>
                <p>
                  Purpose-built for IHT workflows, athlete oversight, and the details your staff tracks every day.
                </p>
              </article>
            </div>
          </section>

          <section className="login-panel glass-panel">
            <div className="login-panel-shell">
              <div className="card-header login-panel-header">
                <div>
                  <p className="eyebrow">{content.panelEyebrow}</p>
                  <h2>{content.panelTitle}</h2>
                  <p className="login-panel-copy">{content.panelCopy}</p>
                </div>
                <div className="login-panel-badge">{content.badge}</div>
              </div>

              <form className="form-grid" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    placeholder={content.emailPlaceholder}
                  />
                </label>

                <label className="field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    placeholder={content.passwordPlaceholder}
                  />
                </label>

                {error ? <p className="form-error">{error}</p> : null}

                <button className="primary-button login-submit" type="submit" disabled={loading}>
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <div className="login-footnote">
                <span className="login-footnote-line" />
                <p className="eyebrow">{content.footnoteEyebrow}</p>
                <p>{content.footnoteCopy}</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

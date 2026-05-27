import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export const Login = () => {
  const navigate = useNavigate();

  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  const API_URL = import.meta.env.VITE_BACKEND_URL;

  const handleSubmit = async(e)=>{
    e.preventDefault();
    setError("");

    try{
      setLoading(true);

      const res = await fetch(`${API_URL}/api/login`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          email,
          password
        })
      });

      const data=await res.json();

      if(!res.ok){
        setError(data.msg || "Login failed");
        return;
      }

      localStorage.setItem(
        "token",
        data.access_token
      );

      navigate("/");

    }catch(err){
      console.error(err);
      setError("Server error");
    }
    finally{
      setLoading(false);
    }
  };



  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />

          <button style={styles.button} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p style={styles.footer}>
          No account?{" "}
          <Link to="/register" style={styles.link}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};

// reutilizas el mismo styles del register
const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "radial-gradient(circle at top, #1b1f2a, #0b0f17)",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "40px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.05)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  title: { color: "white", fontSize: "28px", margin: 0 },
  subtitle: { color: "#9aa4b2", marginBottom: "20px" },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  input: {
    padding: "12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#0f172a",
    color: "white",
  },
  button: {
    padding: "12px",
    borderRadius: "10px",
    background: "linear-gradient(135deg,#4f46e5,#06b6d4)",
    color: "white",
    border: "none",
    cursor: "pointer",
  },
  footer: { marginTop: "16px", color: "#9aa4b2", textAlign: "center" },
  link: { color: "#38bdf8" },
  error: { color: "#f87171", marginBottom: "10px" },
};
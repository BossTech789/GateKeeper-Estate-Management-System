"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SecurityRegisterPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    inviteId: "",
    name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/security/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Registration failed.");

      router.push("/security/login?registered=1");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-container">
      <form onSubmit={handleSubmit} className="auth-card">
        <h1>Security Registration</h1>
        <p>Enter the invitation code provided by your estate administrator.</p>

        <input
          name="inviteId"
          placeholder="Invitation code"
          value={form.inviteId}
          onChange={handleChange}
          required
        />

        <input
          name="name"
          placeholder="Full name"
          value={form.name}
          onChange={handleChange}
          required
        />

        <input
          name="email"
          type="email"
          placeholder="Invited email address"
          value={form.email}
          onChange={handleChange}
          required
        />

        <input
          name="password"
          type="password"
          placeholder="Create password (8+ characters)"
          value={form.password}
          onChange={handleChange}
          minLength={8}
          required
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Registering..." : "Register as Security"}
        </button>
      </form>
    </main>
  );
}
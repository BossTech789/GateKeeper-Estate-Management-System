
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function AdminLeviesPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [residents, setResidents] = useState([]);
  const [levies, setLevies] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingLevyId, setUpdatingLevyId] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [scope, setScope] = useState("estate");
  const [residentId, setResidentId] = useState("");

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);

  const formatDate = (value) => {
    if (!value) return "Not specified";

    if (typeof value === "string") {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleDateString("en-NG", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
    }

    if (typeof value.toDate === "function") {
      return value.toDate().toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }

    return "Not specified";
  };

  const refreshLevies = useCallback(async () => {
    const snapshot = await getDocs(collection(db, "levies"));

    const levyList = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    levyList.sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;
      return dateB - dateA;
    });

    setLevies(levyList);
  }, []);

  const loadAdminData = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      router.replace("/login");
      return;
    }

    const profileRef = doc(db, "users", currentUser.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (
      !profileSnapshot.exists() ||
      profileSnapshot.data().role !== "admin" ||
      profileSnapshot.data().active !== true
    ) {
      router.replace("/dashboard");
      return;
    }

    const residentsQuery = query(
      collection(db, "users"),
      where("role", "==", "resident"),
      where("active", "==", true)
    );

    const residentSnapshot = await getDocs(residentsQuery);

    const residentList = residentSnapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    setResidents(residentList);

    await refreshLevies();
  }, [router, refreshLevies]);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      setAuthReady(true);

      if (!user) {
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");

      try {
        await loadAdminData();
      } catch (err) {
        console.error("Error loading admin levies:", err);

        if (mounted) {
          setError(
            "Unable to load levies. Check your connection and Firebase permissions."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router, loadAdminData]);

  const handleCreateLevy = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const currentUser = auth.currentUser;
    const amountDue = Number(amount);

    if (!currentUser) {
      setError("Your session has expired. Please log in again.");
      router.replace("/login");
      return;
    }

    if (
      !title.trim() ||
      !amount ||
      !Number.isFinite(amountDue) ||
      amountDue <= 0 ||
      !dueDate
    ) {
      setError("Enter a title, a valid amount, and a due date.");
      return;
    }

    if (scope !== "estate" && scope !== "resident") {
      setError("Select a valid levy scope.");
      return;
    }

    if (scope === "resident" && !residentId) {
      setError("Please select a resident.");
      return;
    }

    const selectedResidents =
      scope === "estate"
        ? residents
        : residents.filter((resident) => resident.id === residentId);

    if (selectedResidents.length === 0) {
      setError("No eligible active residents were found.");
      return;
    }

    setSaving(true);

    let levyCreated = false;

    try {
      // Create the main levy document first.
      const levyRef = await addDoc(collection(db, "levies"), {
        title: title.trim(),
        description: description.trim(),
        amount: amountDue,
        dueDate,
        scope,
        status: "Unpaid",
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        ...(scope === "resident"
          ? {
              residentId: selectedResidents[0].id,
              residentName:
                selectedResidents[0].name ||
                selectedResidents[0].fullName ||
                selectedResidents[0].email ||
                "Resident",
            }
          : {}),
      });

      levyCreated = true;

      // Create an individual payment record for every selected resident.
      // Firestore allows a maximum of 500 writes per batch.
      // Use 450 to leave room below that limit.
      const chunkSize = 450;

      for (
        let index = 0;
        index < selectedResidents.length;
        index += chunkSize
      ) {
        const batch = writeBatch(db);
        const residentChunk = selectedResidents.slice(
          index,
          index + chunkSize
        );

        residentChunk.forEach((resident) => {
          const residentName =
            resident.name ||
            resident.fullName ||
            resident.email ||
            "Resident";

          // One predictable document ID per levy/resident pair.
          const paymentRef = doc(
            db,
            "levyPayments",
            `${levyRef.id}_${resident.id}`
          );

          batch.set(paymentRef, {
            levyId: levyRef.id,
            levyTitle: title.trim(),
            residentId: resident.id,
            residentName,
            unit: resident.address || resident.unit || "",
            amountDue,
            amountPaid: 0,
            balance: amountDue,
            status: "Unpaid",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }

      setSuccess(
        `Levy created successfully. ${selectedResidents.length} individual payment record(s) generated.`
      );

      setTitle("");
      setDescription("");
      setAmount("");
      setDueDate("");
      setScope("estate");
      setResidentId("");

      await refreshLevies();
    } catch (err) {
      console.error("Error creating levy:", err);

      if (levyCreated) {
        setError(
          "The main levy was created, but generating all resident payment records failed. Check Firestore and retry only after checking which payment records already exist."
        );
      } else {
        setError("Unable to create the levy. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (levyId, newStatus) => {
    setError("");
    setSuccess("");
    setUpdatingLevyId(levyId);

    try {
      await updateDoc(doc(db, "levies", levyId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      setLevies((currentLevies) =>
        currentLevies.map((levy) =>
          levy.id === levyId
            ? { ...levy, status: newStatus }
            : levy
        )
      );

      setSuccess(
        "Main levy status updated. Individual resident payment statuses are managed separately."
      );
    } catch (err) {
      console.error("Error updating levy status:", err);
      setError("Unable to update the levy status.");
    } finally {
      setUpdatingLevyId("");
    }
  };

  if (!authReady || loading) {
    return (
      <main className="levy-page">
        <div className="levy-loading">Loading levy management...</div>
      </main>
    );
  }

  return (
    <main className="levy-page">
      <header className="levy-header">
        <div>
          <p className="levy-eyebrow">GATEKEEPER ESTATE MANAGEMENT</p>
          <h1>Levy Management</h1>
          <p className="levy-subtitle">
            Create estate levies and manage resident payment records.
          </p>
        </div>

        <Link href="/admin" className="levy-back-link">
          ← Admin Dashboard
        </Link>
      </header>

      {error && (
        <div className="levy-alert levy-alert-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="levy-alert levy-alert-success" role="status">
          {success}
        </div>
      )}

      <section className="levy-summary">
        <div className="levy-summary-card">
          <span>Active Residents</span>
          <strong>{residents.length}</strong>
        </div>

        <div className="levy-summary-card">
          <span>Total Levies</span>
          <strong>{levies.length}</strong>
        </div>

        <div className="levy-summary-card">
          <span>Estate Levies</span>
          <strong>
            {levies.filter((levy) => levy.scope === "estate").length}
          </strong>
        </div>
      </section>

      <section className="levy-panel">
        <div className="levy-panel-heading">
          <div>
            <p className="levy-eyebrow">NEW CHARGE</p>
            <h2>Create a Levy</h2>
          </div>
        </div>

        <form onSubmit={handleCreateLevy} className="levy-form">
          <div className="levy-form-grid">
            <div className="levy-field">
              <label htmlFor="levy-title">Levy Title</label>
              <input
                id="levy-title"
                type="text"
                placeholder="e.g. Security Levy"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <div className="levy-field">
              <label htmlFor="levy-amount">Amount (₦)</label>
              <input
                id="levy-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="20000"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>

            <div className="levy-field">
              <label htmlFor="levy-due-date">Due Date</label>
              <input
                id="levy-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </div>

            <div className="levy-field">
              <label htmlFor="levy-scope">Levy Applies To</label>
              <select
                id="levy-scope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setResidentId("");
                }}
              >
                <option value="estate">All Active Residents</option>
                <option value="resident">One Resident</option>
              </select>
            </div>

            {scope === "resident" && (
              <div className="levy-field levy-field-full">
                <label htmlFor="levy-resident">Select Resident</label>
                <select
                  id="levy-resident"
                  value={residentId}
                  onChange={(event) => setResidentId(event.target.value)}
                  required
                >
                  <option value="">Choose a resident</option>

                  {residents.map((resident) => (
                    <option key={resident.id} value={resident.id}>
                      {resident.name ||
                        resident.fullName ||
                        resident.email ||
                        resident.id}
                      {resident.address || resident.unit
                        ? ` — ${resident.address || resident.unit}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="levy-field levy-field-full">
              <label htmlFor="levy-description">Description</label>
              <textarea
                id="levy-description"
                rows={4}
                placeholder="Explain what this levy covers..."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="levy-form-note">
            {scope === "estate"
              ? `This creates one payment record for each of the ${residents.length} active residents.`
              : "This creates a payment record for the selected resident."}
          </div>

          <button
            type="submit"
            className="levy-primary-button"
            disabled={saving}
          >
            {saving ? "Creating Levy..." : "Create Levy"}
          </button>
        </form>
      </section>

      <section className="levy-panel">
        <div className="levy-panel-heading">
          <div>
            <p className="levy-eyebrow">RECORDS</p>
            <h2>Created Levies</h2>
          </div>

          <button
            type="button"
            className="levy-secondary-button"
            onClick={async () => {
              setError("");
              setSuccess("");

              try {
                await refreshLevies();
                setSuccess("Levy list refreshed.");
              } catch (err) {
                console.error("Error refreshing levies:", err);
                setError("Unable to refresh the levy list.");
              }
            }}
          >
            Refresh
          </button>
        </div>

        {levies.length === 0 ? (
          <div className="levy-empty">
            <h3>No levies yet</h3>
            <p>Create your first levy using the form above.</p>
          </div>
        ) : (
          <div className="levy-list">
            {levies.map((levy) => (
              <article className="levy-card" key={levy.id}>
                <div className="levy-card-top">
                  <div className="levy-card-title">
                    <h3>{levy.title || "Untitled Levy"}</h3>
                    <p>{levy.description || "No description provided."}</p>
                  </div>

                  <span
                    className={`levy-status levy-status-${(
                      levy.status || "Unpaid"
                    )
                      .toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {levy.status || "Unpaid"}
                  </span>
                </div>

                <div className="levy-card-details">
                  <div>
                    <span>Amount</span>
                    <strong>{formatMoney(levy.amount)}</strong>
                  </div>

                  <div>
                    <span>Due Date</span>
                    <strong>{formatDate(levy.dueDate)}</strong>
                  </div>

                  <div>
                    <span>Applies To</span>
                    <strong>
                      {levy.scope === "estate"
                        ? "All Residents"
                        : levy.residentName || "One Resident"}
                    </strong>
                  </div>

                  <div>
                    <span>Created</span>
                    <strong>
                      {levy.createdAt
                        ? formatDate(levy.createdAt)
                        : "Just created"}
                    </strong>
                  </div>
                </div>

                <div className="levy-card-footer">
                  <label htmlFor={`status-${levy.id}`}>
                    Main levy status
                  </label>

                  <select
                    id={`status-${levy.id}`}
                    value={levy.status || "Unpaid"}
                    disabled={updatingLevyId === levy.id}
                    onChange={(event) =>
                      handleStatusUpdate(levy.id, event.target.value)
                    }
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                  </select>

                  {updatingLevyId === levy.id && (
                    <span className="levy-updating">Updating...</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .levy-page {
          min-height: 100vh;
          padding: 40px;
          background: #f7f2eb;
          color: #35251c;
        }

        .levy-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 30px;
        }

        .levy-eyebrow {
          margin: 0 0 8px;
          color: #997454;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .levy-header h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 38px);
          line-height: 1.2;
          letter-spacing: -1px;
        }

        .levy-subtitle {
          margin: 10px 0 0;
          color: #806d5d;
          line-height: 1.6;
        }

        .levy-back-link {
          flex-shrink: 0;
          padding: 12px 16px;
          border: 1px solid #dfcdbb;
          border-radius: 10px;
          color: #60432f;
          background: #fffaf4;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
        }

        .levy-back-link:hover,
        .levy-secondary-button:hover {
          background: #eee1d2;
        }

        .levy-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .levy-summary-card {
          padding: 22px;
          border: 1px solid #e8d9c9;
          border-radius: 14px;
          background: #fffaf5;
        }

        .levy-summary-card span {
          display: block;
          margin-bottom: 12px;
          color: #8b7561;
          font-size: 13px;
        }

        .levy-summary-card strong {
          font-size: 29px;
          color: #513824;
        }

        .levy-panel {
          margin-bottom: 26px;
          padding: 28px;
          border: 1px solid #e7d8c7;
          border-radius: 16px;
          background: #fffdf9;
          box-shadow: 0 5px 20px rgb(65 43 26 / 4%);
        }

        .levy-panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }

        .levy-panel-heading h2 {
          margin: 0;
          font-size: 23px;
          letter-spacing: -0.5px;
        }

        .levy-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }

        .levy-field {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .levy-field-full {
          grid-column: 1 / -1;
        }

        .levy-field label,
        .levy-card-footer label {
          color: #604a38;
          font-size: 13px;
          font-weight: 700;
        }

        .levy-field input,
        .levy-field select,
        .levy-field textarea,
        .levy-card-footer select {
          width: 100%;
          min-width: 0;
          padding: 13px 14px;
          border: 1px solid #e0cfbc;
          border-radius: 9px;
          outline: none;
          background: #fffaf5;
          color: #35251c;
          font: inherit;
          font-size: 14px;
        }

        .levy-field input:focus,
        .levy-field select:focus,
        .levy-field textarea:focus,
        .levy-card-footer select:focus {
          border-color: #916744;
          box-shadow: 0 0 0 3px rgb(145 103 68 / 12%);
        }

        .levy-field textarea {
          resize: vertical;
        }

        .levy-form-note {
          margin: 20px 0;
          padding: 13px 15px;
          border-radius: 8px;
          background: #f5ebdf;
          color: #74573e;
          font-size: 13px;
          line-height: 1.6;
        }

        .levy-primary-button,
        .levy-secondary-button {
          padding: 12px 18px;
          border: 0;
          border-radius: 9px;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }

        .levy-primary-button {
          background: #68462e;
          color: #fffaf5;
        }

        .levy-primary-button:hover {
          background: #513521;
        }

        .levy-primary-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .levy-secondary-button {
          border: 1px solid #dfcdbb;
          background: #fffaf4;
          color: #60432f;
        }

        .levy-alert {
          margin-bottom: 20px;
          padding: 14px 16px;
          border: 1px solid;
          border-radius: 10px;
          font-size: 14px;
          line-height: 1.6;
        }

        .levy-alert-error {
          border-color: #e8b8b0;
          background: #fff0ed;
          color: #8d3327;
        }

        .levy-alert-success {
          border-color: #b9d9bf;
          background: #eff9f0;
          color: #28633a;
        }

        .levy-list {
          display: grid;
          gap: 16px;
        }

        .levy-card {
          padding: 22px;
          border: 1px solid #eadccf;
          border-radius: 12px;
          background: #fffaf5;
        }

        .levy-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .levy-card-title h3 {
          margin: 0;
          font-size: 19px;
          color: #4b3322;
        }

        .levy-card-title p {
          margin: 8px 0 0;
          color: #897461;
          font-size: 13px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .levy-status {
          flex-shrink: 0;
          padding: 6px 11px;
          border-radius: 20px;
          background: #f4e8d8;
          color: #77532f;
          font-size: 11px;
          font-weight: 800;
        }

        .levy-status-paid {
          background: #e2f3e4;
          color: #28633a;
        }

        .levy-status-partial {
          background: #fff0d5;
          color: #8a5b12;
        }

        .levy-status-unpaid {
          background: #f9e6e1;
          color: #923d30;
        }

        .levy-card-details {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
          margin-top: 24px;
          padding: 18px 0;
          border-top: 1px solid #ecdfd2;
          border-bottom: 1px solid #ecdfd2;
        }

        .levy-card-details span {
          display: block;
          margin-bottom: 8px;
          color: #957f6b;
          font-size: 11px;
        }

        .levy-card-details strong {
          display: block;
          color: #533c2a;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .levy-card-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 18px;
        }

        .levy-card-footer select {
          width: auto;
          min-width: 130px;
          padding: 9px 12px;
        }

        .levy-updating {
          color: #8b7561;
          font-size: 12px;
        }

        .levy-empty {
          padding: 36px 16px;
          border: 1px dashed #dfcbb7;
          border-radius: 12px;
          text-align: center;
        }

        .levy-empty h3 {
          margin: 0 0 8px;
          color: #513824;
        }

        .levy-empty p {
          margin: 0;
          color: #897461;
          font-size: 14px;
        }

        .levy-loading {
          padding: 80px 20px;
          text-align: center;
          color: #74573e;
        }

        @media (max-width: 800px) {
          .levy-page {
            padding: 24px 16px;
          }

          .levy-header {
            flex-direction: column;
          }

          .levy-summary {
            grid-template-columns: 1fr;
          }

          .levy-card-details {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .levy-panel {
            padding: 20px;
          }
        }

        @media (max-width: 520px) {
          .levy-form-grid {
            grid-template-columns: 1fr;
          }

          .levy-field-full {
            grid-column: auto;
          }

          .levy-card-top {
            flex-direction: column;
          }

          .levy-card-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .levy-card-footer select {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

export default function LevyPaymentsPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [levies, setLevies] = useState([]);
  const [payments, setPayments] = useState([]);
  const [selectedLevyId, setSelectedLevyId] = useState("");

  const [paymentInputs, setPaymentInputs] = useState({});

  const money = (amount) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);

  const loadPayments = useCallback(async (levyId) => {
    if (!levyId) {
      setPayments([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const paymentsQuery = query(
        collection(db, "levyPayments"),
        where("levyId", "==", levyId)
      );

      const snapshot = await getDocs(paymentsQuery);

      const records = snapshot.docs.map((paymentDoc) => {
        const data = paymentDoc.data();

        return {
          id: paymentDoc.id,
          ...data,
          amountDue: Number(data.amountDue) || 0,
          amountPaid: Number(data.amountPaid) || 0,
        };
      });

      records.sort((a, b) =>
        String(a.residentName || "").localeCompare(
          String(b.residentName || "")
        )
      );

      setPayments(records);

      const inputs = {};
      records.forEach((payment) => {
        inputs[payment.id] = String(payment.amountPaid);
      });
      setPaymentInputs(inputs);
    } catch (err) {
      console.error("Load payments error:", err);
      setError("Unable to load payments. Check your Firestore rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdminData = useCallback(async (user) => {
    if (!user) {
      router.replace("/login");
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnapshot = await getDoc(userRef);

      if (
        !userSnapshot.exists() ||
        userSnapshot.data().role !== "admin" ||
        userSnapshot.data().active !== true
      ) {
        router.replace("/dashboard");
        return;
      }

      const levySnapshot = await getDocs(collection(db, "levies"));

      const levyRecords = levySnapshot.docs
        .map((levyDoc) => ({
          id: levyDoc.id,
          ...levyDoc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

      setLevies(levyRecords);

      const initialLevyId = levyRecords[0]?.id || "";
      setSelectedLevyId(initialLevyId);

      await loadPayments(initialLevyId);
    } catch (err) {
      console.error("Load admin payments page error:", err);
      setError("Unable to load levy information.");
      setLoading(false);
    } finally {
      setAuthReady(true);
    }
  }, [loadPayments, router]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadAdminData(user);
      } else {
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [loadAdminData, router]);

  const handleLevyChange = async (event) => {
    const levyId = event.target.value;
    setSelectedLevyId(levyId);
    await loadPayments(levyId);
  };

  const handleRecordPayment = async (payment) => {
    setError("");
    setSuccess("");

    const enteredAmount = Number(paymentInputs[payment.id]);

    if (
      paymentInputs[payment.id] === "" ||
      !Number.isFinite(enteredAmount) ||
      enteredAmount < 0
    ) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (enteredAmount > payment.amountDue) {
      setError("The total amount paid cannot exceed the levy amount due.");
      return;
    }

    const amountPaid = Math.round(enteredAmount * 100) / 100;
    const balance = Math.round((payment.amountDue - amountPaid) * 100) / 100;

    let status = "Unpaid";
    if (amountPaid >= payment.amountDue) {
      status = "Paid";
    } else if (amountPaid > 0) {
      status = "Partial";
    }

    setSavingId(payment.id);

    try {
      await updateDoc(doc(db, "levyPayments", payment.id), {
        amountPaid,
        balance,
        status,
        updatedAt: serverTimestamp(),
      });

      setPayments((current) =>
        current.map((item) =>
          item.id === payment.id
            ? { ...item, amountPaid, balance, status }
            : item
        )
      );

      setSuccess(`Payment updated for ${payment.residentName || "resident"}.`);
    } catch (err) {
      console.error("Save payment error:", err);
      setError("Unable to save payment. Check your Firestore rules.");
    } finally {
      setSavingId("");
    }
  };

  if (!authReady || loading && !levies.length) {
    return (
      <main className="page">
        <p className="message">Loading levy payments...</p>
        <style jsx>{`
          .page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f7f1e8;
            color: #4e3425;
            font-family: Arial, sans-serif;
          }
        `}</style>
      </main>
    );
  }

  const totalDue = payments.reduce((sum, item) => sum + item.amountDue, 0);
  const totalPaid = payments.reduce((sum, item) => sum + item.amountPaid, 0);
  const totalBalance = Math.max(0, totalDue - totalPaid);

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div>
            <p className="eyebrow">GATEKEEPER ESTATE MANAGEMENT</p>
            <h1>Levy Payments</h1>
            <p className="subtitle">
              Track each resident&apos;s payments and outstanding balances.
            </p>
          </div>

          <Link href="/admin/levies" className="backButton">
            ← Back to Levies
          </Link>
        </header>

        {error && <div className="alert error">{error}</div>}
        {success && <div className="alert success">{success}</div>}

        <section className="panel selectorPanel">
          <label htmlFor="levySelect">Select a levy</label>
          <select
            id="levySelect"
            value={selectedLevyId}
            onChange={handleLevyChange}
          >
            {levies.length === 0 && <option value="">No levies available</option>}
            {levies.map((levy) => (
              <option key={levy.id} value={levy.id}>
                {levy.title || "Untitled levy"}
              </option>
            ))}
          </select>
        </section>

        {selectedLevyId && (
          <>
            <section className="summary">
              <article className="summaryCard">
                <span>Total Due</span>
                <strong>{money(totalDue)}</strong>
              </article>
              <article className="summaryCard">
                <span>Total Collected</span>
                <strong>{money(totalPaid)}</strong>
              </article>
              <article className="summaryCard">
                <span>Outstanding</span>
                <strong>{money(totalBalance)}</strong>
              </article>
            </section>

            <section className="panel">
              <div className="sectionHeading">
                <div>
                  <h2>Resident payment records</h2>
                  <p>Enter the total amount received from each resident.</p>
                </div>
                <span className="count">{payments.length} residents</span>
              </div>

              {loading ? (
                <p className="message">Loading payment records...</p>
              ) : payments.length === 0 ? (
                <div className="empty">
                  <h3>No payment records found</h3>
                  <p>
                    This levy may have been created before individual payment
                    records were added. New levies should create these records
                    automatically.
                  </p>
                </div>
              ) : (
                <div className="tableWrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Resident</th>
                        <th>Unit</th>
                        <th>Amount Due</th>
                        <th>Total Paid (₦)</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const amountPaid = Number(
                          paymentInputs[payment.id] ?? payment.amountPaid
                        );
                        const validAmount =
                          Number.isFinite(amountPaid) && amountPaid >= 0;
                        const previewBalance = validAmount
                          ? Math.max(0, payment.amountDue - amountPaid)
                          : payment.amountDue;

                        return (
                          <tr key={payment.id}>
                            <td>
                              <strong>{payment.residentName || "Resident"}</strong>
                            </td>
                            <td>{payment.unit || "—"}</td>
                            <td>{money(payment.amountDue)}</td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={payment.amountDue}
                                step="0.01"
                                value={paymentInputs[payment.id] ?? ""}
                                onChange={(event) =>
                                  setPaymentInputs((current) => ({
                                    ...current,
                                    [payment.id]: event.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>{money(previewBalance)}</td>
                            <td>
                              <span
                                className={`status ${
                                  payment.status?.toLowerCase() || "unpaid"
                                }`}
                              >
                                {payment.status || "Unpaid"}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={() => handleRecordPayment(payment)}
                                disabled={savingId === payment.id}
                              >
                                {savingId === payment.id ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f7f1e8;
          color: #3e2b20;
          padding: 38px 20px 60px;
          font-family: Arial, sans-serif;
        }
        .container {
          max-width: 1250px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 30px;
          flex-wrap: wrap;
        }
        .eyebrow {
          color: #967052;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
        }
        h1 {
          margin: 8px 0;
          font-size: clamp(30px, 4vw, 42px);
        }
        .subtitle,
        .sectionHeading p {
          color: #887565;
          font-size: 14px;
        }
        .backButton,
        button {
          background: #70472e;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 16px;
          text-decoration: none;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .panel {
          background: #fffdf9;
          border: 1px solid #e8dccd;
          border-radius: 14px;
          padding: 24px;
          margin-bottom: 22px;
          box-shadow: 0 8px 25px #563b2010;
        }
        .selectorPanel {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        label {
          font-weight: 700;
        }
        select,
        input {
          border: 1px solid #d8c6b4;
          border-radius: 8px;
          padding: 11px;
          background: #fff;
          color: #3e2b20;
          font: inherit;
        }
        select {
          min-width: 260px;
          max-width: 100%;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 22px;
        }
        .summaryCard {
          padding: 22px;
          background: #70472e;
          color: #fffaf4;
          border-radius: 13px;
        }
        .summaryCard span {
          display: block;
          opacity: 0.8;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .summaryCard strong {
          font-size: clamp(19px, 2.5vw, 28px);
          overflow-wrap: anywhere;
        }
        .sectionHeading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }
        h2 {
          margin: 0;
          font-size: 21px;
        }
        .count {
          border-radius: 20px;
          padding: 8px 12px;
          background: #f0e4d7;
          color: #70472e;
          font-size: 12px;
          font-weight: 700;
        }
        .tableWrapper {
          overflow-x: auto;
        }
        table {
          width: 100%;
          min-width: 900px;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 15px 12px;
          border-bottom: 1px solid #eee4d9;
          text-align: left;
          font-size: 13px;
          white-space: nowrap;
        }
        th {
          color: #8b735f;
          background: #faf5ee;
        }
        td input {
          width: 120px;
        }
        .status {
          display: inline-block;
          border-radius: 20px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 800;
          background: #eee3d7;
          color: #70472e;
        }
        .status.paid {
          background: #dcefe0;
          color: #23643a;
        }
        .status.partial {
          background: #fff0cb;
          color: #855a00;
        }
        .status.unpaid {
          background: #f6dddd;
          color: #9b3030;
        }
        .alert {
          padding: 13px 16px;
          border-radius: 9px;
          margin-bottom: 18px;
          font-size: 14px;
        }
        .error {
          background: #f8dfdf;
          color: #922d2d;
        }
        .success {
          background: #dcefe0;
          color: #23643a;
        }
        .empty,
        .message {
          text-align: center;
          padding: 35px 15px;
          color: #887565;
        }
        @media (max-width: 700px) {
          .page {
            padding: 24px 12px 40px;
          }
          .panel {
            padding: 17px;
          }
          .summary {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .selectorPanel {
            align-items: stretch;
            flex-direction: column;
          }
          select {
            width: 100%;
            min-width: 0;
          }
        }
      `}</style>
    </main>
  );
}


"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

export default function FirebaseTestPage() {
  const [status, setStatus] = useState("Checking Firebase...");

  useEffect(() => {
    try {
      if (auth && db) {
        setStatus("Firebase connected successfully!");
      } else {
        setStatus("Firebase connection could not be verified.");
      }
    } catch (error) {
      setStatus(`Connection error: ${error.message}`);
    }
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="rounded-xl bg-white p-8 shadow-md text-center">
        <h1 className="text-2xl font-bold mb-4">
          GateKeeper
        </h1>

        <p>{status}</p>
      </div>
    </main>
  );
}
